// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

export type SoulCordBuildMode = "development" | "diagnostic" | "production" | "release" | "watch";

export interface SoulCordBuildProvenance {
    schemaVersion: 1;
    kind: "soulcord-build-provenance";
    product: "SoulCord";
    version: string;
    mode: SoulCordBuildMode;
    buildLabel: string;
    buildTimestamp: string;
    modules: string[];
    source: {
        commit: string;
        branch: string;
        clean: boolean;
        digest: string;
        statusDigest: string;
    };
    inputs: {
        lockfile: {file: "bun.lock"; sha256: string;};
        toolchain: {
            bunVersion: string;
            bunExecutableSha256: string;
            packageJsonSha256: string;
            buildScriptSha256: string;
            packScriptSha256: string;
        };
    };
}

export interface SoulCordPostBuildManifest {
    schemaVersion: 1;
    kind: "soulcord-post-build-manifest";
    build: SoulCordBuildProvenance;
    packagedAt: string;
    artifacts: {
        asar: ArtifactDigest;
        packageMetadata: ArtifactDigest;
        checksums: ArtifactDigest;
        embeddedBuildProvenance: ArtifactDigest;
    };
}

interface ArtifactDigest {
    file: string;
    sha256: string;
    bytes: number;
}

interface CaptureOptions {
    version: string;
    mode: SoulCordBuildMode;
    modules: string[];
    buildTimestamp?: string;
    /** `null` is reserved for deterministic tests that must ignore the host environment. */
    sourceDateEpoch?: string | null;
    bunExecutable?: string;
    bunVersion?: string;
}

interface PostBuildArtifacts {
    asar: string;
    packageMetadata: string;
    checksums: string;
    embeddedBuildProvenance: string;
}

interface CapturedSourceState {
    commit: string;
    branch: string;
    clean: boolean;
    digest: string;
    statusDigest: string;
}

const SHA256 = /^[0-9a-f]{64}$/;
const FULL_COMMIT = /^[0-9a-f]{40}$/;
const BUILD_MODES = new Set<SoulCordBuildMode>(["development", "diagnostic", "production", "release", "watch"]);
const ALL_PACKAGE_MODULES = ["earlyRenderer", "editor", "editorHtml", "editorPreload", "main", "preload", "soulcord"];

function sha256(value: string | Buffer): string {
    return crypto.createHash("sha256").update(value).digest("hex");
}

export function sha256File(file: string): string {
    const descriptor = fs.openSync(file, "r");
    const hash = crypto.createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    try {
        while (true) {
            const bytes = fs.readSync(descriptor, buffer, 0, buffer.length, null);
            if (bytes === 0) break;
            hash.update(buffer.subarray(0, bytes));
        }
    }
    finally {fs.closeSync(descriptor);}
    return hash.digest("hex");
}

function git(repoRoot: string, args: string[]): Buffer {
    const result = spawnSync("git", args, {
        cwd: repoRoot,
        encoding: null,
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true
    });
    if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) throw new Error("SoulCord provenance could not read the Git worktree.");
    return result.stdout;
}

function gitText(repoRoot: string, args: string[]): string {
    return git(repoRoot, args).toString("utf8").trim();
}

function currentBranch(repoRoot: string): string {
    const result = spawnSync("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], {
        cwd: repoRoot,
        encoding: "utf8",
        windowsHide: true
    });
    if (result.status !== 0) return "detached";
    const branch = result.stdout.trim();
    if (!branch || branch.length > 256 || [...branch].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
        throw new Error("SoulCord provenance found an invalid Git branch name.");
    }
    return branch;
}

function containedRepoPath(repoRoot: string, relativeFile: string): string {
    if (!relativeFile || relativeFile.includes("\0") || path.isAbsolute(relativeFile)) throw new Error("Git returned an unsafe source path.");
    const target = path.resolve(repoRoot, relativeFile);
    const relative = path.relative(repoRoot, target);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Git source path escaped the repository.");
    return target;
}

function sourceDigest(repoRoot: string, status: Buffer): string {
    const listed = git(repoRoot, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
        .toString("utf8")
        .split("\0")
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right));
    const hash = crypto.createHash("sha256");
    hash.update("soulcord-source-digest-v1\0");
    hash.update(sha256(status));
    for (const relativeFile of listed) {
        const target = containedRepoPath(repoRoot, relativeFile);
        hash.update("\0path\0");
        hash.update(relativeFile.replaceAll("\\", "/"));
        if (!fs.existsSync(target)) {
            hash.update("\0missing");
            continue;
        }
        const stat = fs.lstatSync(target);
        if (stat.isSymbolicLink()) {
            hash.update("\0symlink\0");
            hash.update(fs.readlinkSync(target));
            continue;
        }
        if (!stat.isFile()) throw new Error("SoulCord provenance found an unsupported tracked filesystem entry.");
        hash.update("\0file\0");
        hash.update(String(stat.size));
        hash.update("\0");
        hash.update(sha256File(target));
    }
    return hash.digest("hex");
}

function captureSourceState(repoRoot: string): CapturedSourceState {
    const commit = gitText(repoRoot, ["rev-parse", "HEAD"]).toLowerCase();
    if (!FULL_COMMIT.test(commit)) throw new Error("SoulCord provenance requires a full Git source SHA.");
    const status = git(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    return {
        commit,
        branch: currentBranch(repoRoot),
        clean: status.length === 0,
        digest: sourceDigest(repoRoot, status),
        statusDigest: sha256(status)
    };
}

function captureStableSourceState(repoRoot: string): CapturedSourceState {
    const first = captureSourceState(repoRoot);
    const second = captureSourceState(repoRoot);
    if (JSON.stringify(first) !== JSON.stringify(second)) {
        throw new Error("SoulCord source changed while provenance was being captured; retry from a stable worktree.");
    }
    return second;
}

function requiredFile(repoRoot: string, relativeFile: string): string {
    const target = containedRepoPath(repoRoot, relativeFile);
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`SoulCord provenance requires ${relativeFile}.`);
    return target;
}

function isoTimestamp(value: string): string {
    const timestamp = value;
    if (new Date(timestamp).toISOString() !== timestamp) throw new Error("SoulCord provenance requires a canonical UTC build timestamp.");
    return timestamp;
}

function epochSecondsTimestamp(value: string, label: string): string {
    if (!/^(?:0|[1-9]\d*)$/.test(value)) throw new Error(`SoulCord provenance requires ${label} to be whole non-negative Unix seconds.`);
    const seconds = BigInt(value);
    if (seconds > 8_640_000_000_000n) throw new Error(`SoulCord provenance received an out-of-range ${label}.`);
    return new Date(Number(seconds) * 1_000).toISOString();
}

function resolveBuildTimestamp(repoRoot: string, source: CapturedSourceState, options: CaptureOptions): string {
    if (options.buildTimestamp !== undefined) return isoTimestamp(options.buildTimestamp);
    const sourceDateEpoch = options.sourceDateEpoch === null ? undefined : options.sourceDateEpoch ?? process.env.SOURCE_DATE_EPOCH;
    if (sourceDateEpoch !== undefined) return epochSecondsTimestamp(sourceDateEpoch, "SOURCE_DATE_EPOCH");
    if (source.clean) return epochSecondsTimestamp(gitText(repoRoot, ["show", "-s", "--format=%ct", source.commit]), "Git commit timestamp");
    return new Date().toISOString();
}

export function captureSoulCordBuildProvenance(repoRootValue: string, options: CaptureOptions): SoulCordBuildProvenance {
    const repoRoot = path.resolve(repoRootValue);
    const resolvedGitRoot = path.resolve(gitText(repoRoot, ["rev-parse", "--show-toplevel"]));
    if (process.platform === "win32"
        ? resolvedGitRoot.toLowerCase() !== repoRoot.toLowerCase()
        : resolvedGitRoot !== repoRoot) throw new Error("SoulCord provenance must run from the repository root.");

    const source = captureStableSourceState(repoRoot);
    const modules = [...new Set(options.modules)].sort();
    if (!options.version || modules.length === 0 || modules.some(module => !/^[a-zA-Z][a-zA-Z0-9]*$/.test(module))) {
        throw new Error("SoulCord provenance received invalid build metadata.");
    }
    const bunExecutable = path.resolve(options.bunExecutable ?? process.execPath);
    const bunStat = fs.lstatSync(bunExecutable);
    if (!bunStat.isFile() || bunStat.isSymbolicLink()) throw new Error("SoulCord provenance requires a regular Bun executable.");
    const buildLabel = source.clean ? `${options.mode}-clean` : `${options.mode}-dirty.${source.digest.slice(0, 16)}`;
    const buildTimestamp = resolveBuildTimestamp(repoRoot, source, options);

    return {
        schemaVersion: 1,
        kind: "soulcord-build-provenance",
        product: "SoulCord",
        version: options.version,
        mode: options.mode,
        buildLabel,
        buildTimestamp,
        modules,
        source,
        inputs: {
            lockfile: {file: "bun.lock", sha256: sha256File(requiredFile(repoRoot, "bun.lock"))},
            toolchain: {
                bunVersion: options.bunVersion ?? Bun.version,
                bunExecutableSha256: sha256File(bunExecutable),
                packageJsonSha256: sha256File(requiredFile(repoRoot, "package.json")),
                buildScriptSha256: sha256File(requiredFile(repoRoot, "scripts/build.ts")),
                packScriptSha256: sha256File(requiredFile(repoRoot, "scripts/pack.ts"))
            }
        }
    };
}

export function assertSoulCordBuildAllowed(provenance: SoulCordBuildProvenance): void {
    if ((provenance.mode === "production" || provenance.mode === "release") && !provenance.source.clean) {
        throw new Error(`SoulCord ${provenance.mode} builds require a clean Git worktree; use --diagnostic for local evidence (dirty source ${provenance.source.digest.slice(0, 16)}).`);
    }
}

export function assertSoulCordPackagingAllowed(provenance: SoulCordBuildProvenance, diagnostic: boolean): void {
    assertSoulCordBuildAllowed(provenance);
    if (diagnostic && provenance.mode !== "diagnostic") {
        throw new Error("SoulCord diagnostic packaging requires an explicitly diagnostic build.");
    }
    if (!diagnostic && (provenance.mode !== "production" && provenance.mode !== "release")) {
        throw new Error("SoulCord release packaging requires production or release build metadata.");
    }
    if (!diagnostic && !provenance.source.clean) throw new Error("SoulCord release packaging requires a clean Git worktree.");
    const modules = [...provenance.modules].sort();
    if (JSON.stringify(modules) !== JSON.stringify(ALL_PACKAGE_MODULES)) {
        throw new Error("SoulCord packaging requires one complete all-module build.");
    }
}

export function assertSoulCordBuildStillCurrent(built: SoulCordBuildProvenance, current: SoulCordBuildProvenance): void {
    if (JSON.stringify(built) !== JSON.stringify(current)) {
        throw new Error("SoulCord source or toolchain changed after the build; rebuild before packaging.");
    }
}

function exactKeys(value: object, expected: string[]): boolean {
    return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function validateProvenance(value: unknown): SoulCordBuildProvenance {
    if (!value || typeof value !== "object") throw new Error("Invalid SoulCord build provenance.");
    const candidate = value as SoulCordBuildProvenance;
    const hashes = [
        candidate.source?.digest,
        candidate.source?.statusDigest,
        candidate.inputs?.lockfile?.sha256,
        candidate.inputs?.toolchain?.bunExecutableSha256,
        candidate.inputs?.toolchain?.packageJsonSha256,
        candidate.inputs?.toolchain?.buildScriptSha256,
        candidate.inputs?.toolchain?.packScriptSha256
    ];
    const source = candidate.source;
    const inputs = candidate.inputs;
    const lockfile = inputs?.lockfile;
    const toolchain = inputs?.toolchain;
    const modules = candidate.modules;
    const expectedLabel = source?.clean ? `${candidate.mode}-clean` : `${candidate.mode}-dirty.${source?.digest?.slice(0, 16)}`;
    if (!exactKeys(candidate, ["schemaVersion", "kind", "product", "version", "mode", "buildLabel", "buildTimestamp", "modules", "source", "inputs"])
        || !source || !exactKeys(source, ["commit", "branch", "clean", "digest", "statusDigest"])
        || !inputs || !exactKeys(inputs, ["lockfile", "toolchain"])
        || !lockfile || !exactKeys(lockfile, ["file", "sha256"])
        || !toolchain || !exactKeys(toolchain, ["bunVersion", "bunExecutableSha256", "packageJsonSha256", "buildScriptSha256", "packScriptSha256"])
        || candidate.schemaVersion !== 1
        || candidate.kind !== "soulcord-build-provenance"
        || candidate.product !== "SoulCord"
        || typeof candidate.version !== "string"
        || !candidate.version
        || !BUILD_MODES.has(candidate.mode)
        || !FULL_COMMIT.test(source.commit)
        || typeof source.branch !== "string"
        || !source.branch
        || source.branch.length > 256
        || [...source.branch].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
        || !hashes.every(hash => typeof hash === "string" && SHA256.test(hash))
        || !Array.isArray(modules)
        || modules.length === 0
        || modules.some(module => typeof module !== "string" || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(module))
        || JSON.stringify(modules) !== JSON.stringify([...new Set(modules)].sort())
        || typeof source.clean !== "boolean"
        || candidate.buildLabel !== expectedLabel
        || typeof candidate.buildTimestamp !== "string"
        || lockfile.file !== "bun.lock"
        || typeof toolchain.bunVersion !== "string"
        || !toolchain.bunVersion) throw new Error("Invalid SoulCord build provenance.");
    isoTimestamp(candidate.buildTimestamp);
    return candidate;
}

function atomicJson(target: string, value: unknown): void {
    const temporary = `${target}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {encoding: "utf8", flag: "wx", mode: 0o600});
    try {fs.renameSync(temporary, target);}
    catch (error) {
        try {fs.unlinkSync(temporary);}
        catch {/* best effort */}
        throw error;
    }
}

export function writeSoulCordBuildProvenance(target: string, provenance: SoulCordBuildProvenance): void {
    validateProvenance(provenance);
    atomicJson(target, provenance);
}

export function readSoulCordBuildProvenance(target: string): SoulCordBuildProvenance {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > 128 * 1024) throw new Error("Invalid SoulCord build provenance file.");
    return validateProvenance(JSON.parse(fs.readFileSync(target, "utf8")));
}

function artifact(file: string): ArtifactDigest {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) throw new Error("SoulCord post-build manifest requires regular non-empty artifacts.");
    return {file: path.basename(file), sha256: sha256File(file), bytes: stat.size};
}

export function createSoulCordPostBuildManifest(
    provenance: SoulCordBuildProvenance,
    artifacts: PostBuildArtifacts
): SoulCordPostBuildManifest {
    validateProvenance(provenance);
    return {
        schemaVersion: 1,
        kind: "soulcord-post-build-manifest",
        build: provenance,
        // A wall-clock packaging time would make otherwise identical release
        // artifacts differ. This is the normalized build/source timestamp.
        packagedAt: provenance.buildTimestamp,
        artifacts: {
            asar: artifact(artifacts.asar),
            packageMetadata: artifact(artifacts.packageMetadata),
            checksums: artifact(artifacts.checksums),
            embeddedBuildProvenance: artifact(artifacts.embeddedBuildProvenance)
        }
    };
}

export function writeSoulCordPostBuildManifest(target: string, manifest: SoulCordPostBuildManifest): void {
    atomicJson(target, manifest);
}
