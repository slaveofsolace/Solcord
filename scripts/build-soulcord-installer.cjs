// SPDX-License-Identifier: Apache-2.0

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {spawnSync} = require("child_process");
const asar = require("@electron/asar");

const [artifactInput, outputInput, sourceCommit] = process.argv.slice(2);
if (!artifactInput || !outputInput || !/^[0-9a-f]{40}$/.test(sourceCommit ?? "")) {
    throw new Error("Usage: bun scripts/build-soulcord-installer.cjs <betterdiscord.asar> <new-output-directory> <40-char-source-commit>");
}

const repo = path.resolve(__dirname, "..");
const artifact = path.resolve(artifactInput);
const output = path.resolve(outputInput);
if (artifact !== path.join(repo, "dist", "soulcord.asar")) throw new Error("The installer accepts only the repository's authoritative dist/soulcord.asar.");
if (fs.existsSync(output)) throw new Error("The installer output directory must not already exist.");
if (output === repo || output.startsWith(`${repo}${path.sep}`)) throw new Error("Installer artifacts must be generated outside the source checkout.");

const hashFile = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const gitText = args => {
    const result = spawnSync("git", args, {cwd: repo, encoding: "utf8", windowsHide: true});
    if (result.status !== 0) throw new Error("The installer builder could not verify Git provenance.");
    return result.stdout.trim();
};
const head = gitText(["rev-parse", "HEAD"]).toLowerCase();
if (head !== sourceCommit || gitText(["status", "--porcelain=v1", "--untracked-files=all"])) throw new Error("The installer requires the exact clean source commit supplied on the command line.");
const dist = path.join(repo, "dist");
if (fs.existsSync(dist)) {
    const stat = fs.lstatSync(dist);
    if (!stat.isDirectory() || stat.isSymbolicLink() || path.dirname(dist) !== repo) throw new Error("The SoulCord dist path is unsafe.");
    // dist is ignored generated output. Recreate it from the already-verified
    // clean commit so mutually forged ASAR/manifest files cannot be relabeled.
    fs.rmSync(dist, {recursive: true});
}
const freshBuild = spawnSync(process.execPath, ["run", "dist"], {cwd: repo, stdio: "inherit", windowsHide: true});
if (freshBuild.status !== 0) throw new Error(`Fresh SoulCord production build failed with status ${freshBuild.status}.`);
if (!fs.existsSync(artifact) || !fs.lstatSync(artifact).isFile() || fs.lstatSync(artifact).isSymbolicLink()) throw new Error("The freshly built SoulCord ASAR is missing or linked.");
const sourceBuildManifest = path.join(repo, "dist", "soulcord-build-manifest.json");
if (!fs.existsSync(sourceBuildManifest) || !fs.lstatSync(sourceBuildManifest).isFile() || fs.lstatSync(sourceBuildManifest).isSymbolicLink() || fs.statSync(sourceBuildManifest).size > 256 * 1024) throw new Error("The authoritative SoulCord build manifest is missing or unsafe.");
const postBuild = JSON.parse(fs.readFileSync(sourceBuildManifest, "utf8"));
const artifactHash = hashFile(artifact);
const artifactBytes = fs.statSync(artifact).size;
if (postBuild?.schemaVersion !== 1
    || postBuild?.kind !== "soulcord-post-build-manifest"
    || postBuild?.build?.product !== "SoulCord"
    || !["production", "release"].includes(postBuild?.build?.mode)
    || postBuild?.build?.source?.clean !== true
    || postBuild?.build?.source?.commit !== sourceCommit
    || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(postBuild?.build?.version ?? "")
    || postBuild?.artifacts?.asar?.file !== "soulcord.asar"
    || postBuild?.artifacts?.asar?.sha256 !== artifactHash
    || postBuild?.artifacts?.asar?.bytes !== artifactBytes) throw new Error("The ASAR is not bound to the requested clean production source commit.");
const embeddedProvenance = JSON.parse(asar.extractFile(artifact, "build-provenance.json").toString("utf8"));
if (JSON.stringify(embeddedProvenance) !== JSON.stringify(postBuild.build)) throw new Error("The ASAR's embedded provenance does not match the authoritative build manifest.");
const sourceBuildManifestHash = hashFile(sourceBuildManifest);
fs.mkdirSync(output, {recursive: true});

const project = path.join(repo, "installer", "SoulCord.Installer", "SoulCord.Installer.csproj");
const publish = spawnSync("dotnet", [
    "publish", project,
    "-c", "Release",
    "-r", "win-x64",
    "--self-contained", "true",
    "-p:PublishSingleFile=true",
    "-p:IncludeNativeLibrariesForSelfExtract=true",
    "-p:PublishTrimmed=false",
    "-o", output
], {stdio: "inherit", windowsHide: true});
if (publish.status !== 0) throw new Error(`dotnet publish failed with status ${publish.status}.`);
if (gitText(["rev-parse", "HEAD"]).toLowerCase() !== sourceCommit || gitText(["status", "--porcelain=v1", "--untracked-files=all"])) throw new Error("The source changed while the installer was being built.");
if (hashFile(artifact) !== artifactHash || hashFile(sourceBuildManifest) !== sourceBuildManifestHash) throw new Error("Fresh build output changed while the installer was being built.");

const bundledArtifact = path.join(output, "soulcord.asar");
fs.copyFileSync(artifact, bundledArtifact, fs.constants.COPYFILE_EXCL);
const bundledBuildManifest = path.join(output, "soulcord-build-manifest.json");
fs.copyFileSync(sourceBuildManifest, bundledBuildManifest, fs.constants.COPYFILE_EXCL);
if (hashFile(bundledArtifact) !== artifactHash || hashFile(bundledBuildManifest) !== sourceBuildManifestHash) throw new Error("The staged installer payload differs from the fresh build.");
const manifest = {
    version: postBuild.build.version,
    sourceCommit,
    artifactSha256: hashFile(bundledArtifact),
    artifactFile: "soulcord.asar",
    buildManifestSha256: hashFile(bundledBuildManifest),
    schemaVersion: 5,
    supportedDiscord: "Stable/PTB/Canary; exact installed target shown at runtime",
    releaseNotes: "Unsigned SoulCord V2 release candidate. Explicit install, verify, repair/update, rollback/uninstall, and launch only. Windows may display an unknown-publisher warning."
};
fs.writeFileSync(path.join(output, "soulcord-installer-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {encoding: "utf8", flag: "wx"});

const executable = path.join(output, "SoulCordInstaller.exe");
const selfTest = spawnSync(executable, ["--self-test"], {stdio: "inherit", cwd: output, windowsHide: true});
if (selfTest.status !== 0) throw new Error(`Installer lifecycle self-test failed with status ${selfTest.status}.`);

const files = fs.readdirSync(output, {withFileTypes: true}).filter(entry => entry.isFile()).map(entry => entry.name).sort();
const sums = files.map(name => `${hashFile(path.join(output, name))}  ${name}`).join("\n");
fs.writeFileSync(path.join(output, "SHA256SUMS.txt"), `${sums}\n`, {encoding: "utf8", flag: "wx"});
console.log(JSON.stringify({output, sourceCommit, artifactSha256: manifest.artifactSha256, installerSha256: hashFile(executable), selfTest: "PASS"}, null, 2));
