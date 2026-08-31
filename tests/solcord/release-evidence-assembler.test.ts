// SPDX-License-Identifier: Apache-2.0

import {afterEach, describe, expect, test} from "bun:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";

import * as asar from "@electron/asar";
import {assembleRelease, validateRelease} from "../../scripts/assemble-solcord-release-evidence.mjs";

const roots: string[] = [];

const hashFile = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const git = (repo: string, args: string[], env?: Record<string, string>) => {
    const result = spawnSync("git", args, {cwd: repo, encoding: "utf8", env: {...process.env, ...env}, windowsHide: true});
    if (result.status !== 0) throw new Error(result.stderr || "git fixture failed");
    return result.stdout.trim();
};
const rewriteInstallerChecksums = (bundle: string) => {
    const installerFiles = ["SolcordInstaller.exe", "solcord.asar", "solcord-build-manifest.json", "solcord-installer-manifest.json"];
    fs.writeFileSync(path.join(bundle, "SHA256SUMS.txt"), `${installerFiles.map(name => `${hashFile(path.join(bundle, name))}  ${name}`).join("\n")}\n`);
};

async function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "solcord-release-assembler-test-"));
    roots.push(root);
    const repo = path.join(root, "repo");
    const bundle = path.join(root, "bundle");
    const evidence = path.join(root, "inputs");
    fs.mkdirSync(repo);
    fs.mkdirSync(bundle);
    fs.mkdirSync(evidence);
    fs.writeFileSync(path.join(repo, "README.md"), "fixture source\n");
    git(repo, ["init", "--initial-branch", "development"]);
    git(repo, ["config", "user.name", "Solcord Fixture"]);
    git(repo, ["config", "user.email", "fixture@example.invalid"]);
    git(repo, ["add", "README.md"]);
    const commitEnvironment = {GIT_AUTHOR_DATE: "2026-08-30T00:00:00Z", GIT_COMMITTER_DATE: "2026-08-30T00:00:00Z"};
    git(repo, ["commit", "-m", "fixture"], commitEnvironment);
    const sourceCommit = git(repo, ["rev-parse", "HEAD"]).toLowerCase();

    const provenance = {
        schemaVersion: 2,
        kind: "solcord-build-provenance",
        product: "Solcord",
        version: "2.0.0",
        candidateLabel: "v2.0.0-rc.5",
        mode: "production",
        source: {commit: sourceCommit, clean: true}
    };
    const asarInput = path.join(root, "asar-input");
    fs.mkdirSync(asarInput);
    fs.writeFileSync(path.join(asarInput, "build-provenance.json"), `${JSON.stringify(provenance)}\n`);
    const asarFile = path.join(bundle, "solcord.asar");
    await asar.createPackage(asarInput, asarFile);
    const artifactSha256 = hashFile(asarFile);
    const buildManifest = {
        schemaVersion: 2,
        kind: "solcord-post-build-manifest",
        build: provenance,
        artifacts: {asar: {file: "solcord.asar", sha256: artifactSha256, bytes: fs.statSync(asarFile).size}}
    };
    const buildManifestFile = path.join(bundle, "solcord-build-manifest.json");
    fs.writeFileSync(buildManifestFile, `${JSON.stringify(buildManifest, null, 2)}\n`);
    const installerManifest = {
        version: "2.0.0",
        candidateLabel: "v2.0.0-rc.5",
        sourceCommit,
        artifactSha256,
        artifactFile: "solcord.asar",
        buildManifestSha256: hashFile(buildManifestFile),
        schemaVersion: 7,
        supportedDiscord: "fixture",
        releaseNotes: "fixture"
    };
    fs.writeFileSync(path.join(bundle, "solcord-installer-manifest.json"), `${JSON.stringify(installerManifest, null, 2)}\n`);
    fs.writeFileSync(path.join(bundle, "SolcordInstaller.exe"), "fixture installer\n");
    rewriteInstallerChecksums(bundle);
    const receiptFiles = ["SHA256SUMS.txt", "SolcordInstaller.exe", "solcord.asar", "solcord-build-manifest.json", "solcord-installer-manifest.json"].map(name => ({
        name,
        bytes: fs.statSync(path.join(bundle, name)).size,
        sha256: hashFile(path.join(bundle, name))
    }));
    const installerReceiptFile = path.join(bundle, "solcord-installer-build-receipt.json");
    fs.writeFileSync(installerReceiptFile, `${JSON.stringify({
        schemaVersion: 1,
        kind: "solcord-installer-build-receipt",
        product: "Solcord",
        productVersion: "2.0.0",
        candidateLabel: "v2.0.0-rc.5",
        sourceCommit,
        sourceClean: true,
        selfTest: {result: "PASS", isolatedWorkingDirectory: true},
        files: receiptFiles
    }, null, 2)}\n`);
    const installerReceiptSha256 = hashFile(installerReceiptFile);

    fs.writeFileSync(path.join(evidence, "backend-soak-report.json"), "{\"result\":\"PASS\"}\n");
    fs.writeFileSync(path.join(evidence, "security-report.md"), "# Security\n\nNo findings.\n");
    const soakSha256 = hashFile(path.join(evidence, "backend-soak-report.json"));
    const securitySha256 = hashFile(path.join(evidence, "security-report.md"));
    const evidenceManifest = path.join(evidence, "inputs.json");
    fs.writeFileSync(evidenceManifest, `${JSON.stringify({
        schemaVersion: 1,
        kind: "solcord-release-evidence-inputs",
        candidateLabel: "v2.0.0-rc.5",
        sourceCommit,
        files: [
            {source: "backend-soak-report.json", name: "backend-soak-report.json", category: "runtime-evidence", sha256: soakSha256},
            {source: "security-report.md", name: "security-report.md", category: "security-evidence", sha256: securitySha256}
        ],
        releaseContext: {
            discord: {version: "1.0.9255", channel: "Stable", profileType: "disposable"},
            backup: {identity: "fixture-backup", status: "PASS", evidenceName: "security-report.md", evidenceSha256: securitySha256},
            rollback: {backupIdentity: "fixture-backup", status: "PASS", evidenceName: "backend-soak-report.json", evidenceSha256: soakSha256},
            acceptanceGates: [
                {id: "backend-soak", status: "PASS", evidenceName: "backend-soak-report.json", evidenceSha256: soakSha256},
                {id: "security", status: "PASS", evidenceName: "security-report.md", evidenceSha256: securitySha256}
            ],
            distribution: {signed: false, merged: false, published: false, installed: false}
        }
    }, null, 2)}\n`);
    const evidenceManifestSha256 = hashFile(evidenceManifest);
    return {root, repo, bundle, evidenceManifest, evidenceManifestSha256, installerReceiptSha256, sourceCommit};
}

const assembleOptions = (data: Awaited<ReturnType<typeof fixture>>, output: string) => ({
    repo: data.repo,
    sourceCommit: data.sourceCommit,
    candidateLabel: "v2.0.0-rc.5",
    installerBundle: data.bundle,
    installerReceiptSha256: data.installerReceiptSha256,
    evidenceManifest: data.evidenceManifest,
    evidenceManifestSha256: data.evidenceManifestSha256,
    output
});

afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, {recursive: true, force: true});
});

describe("Solcord RC release-evidence assembler", () => {
    test("assembles and validates deterministic source, delivery, and evidence artifacts", async () => {
        const data = await fixture();
        const first = path.join(data.root, "release-one");
        const second = path.join(data.root, "release-two");
        const common = assembleOptions(data, first);
        const firstResult = assembleRelease(common);
        assembleRelease({...common, output: second});
        expect(firstResult.artifacts.length).toBe(10);
        expect(fs.readFileSync(path.join(first, `Solcord-source-${data.sourceCommit.slice(0, 8)}.zip`)).readUInt16LE(8)).toBe(0);
        expect(hashFile(path.join(first, `Solcord-source-${data.sourceCommit.slice(0, 8)}.zip`))).toBe(hashFile(path.join(second, `Solcord-source-${data.sourceCommit.slice(0, 8)}.zip`)));
        expect(hashFile(path.join(first, `Solcord-delivery-${data.sourceCommit.slice(0, 8)}.zip`))).toBe(hashFile(path.join(second, `Solcord-delivery-${data.sourceCommit.slice(0, 8)}.zip`)));
        expect(hashFile(path.join(first, "release-manifest.json"))).toBe(hashFile(path.join(second, "release-manifest.json")));
        expect(hashFile(path.join(first, "SHA256SUMS.txt"))).toBe(hashFile(path.join(second, "SHA256SUMS.txt")));
        expect(validateRelease({repo: data.repo, sourceCommit: data.sourceCommit, candidateLabel: "v2.0.0-rc.5", releaseDirectory: first, releaseManifestSha256: firstResult.manifestSha256}).artifactCount).toBe(10);
    }, 20_000);

    test("requires the exact clean source commit", async () => {
        const data = await fixture();
        fs.writeFileSync(path.join(data.repo, "untracked.txt"), "dirty\n");
        expect(() => assembleRelease(assembleOptions(data, path.join(data.root, "release")))).toThrow("exact clean source commit");
        expect(fs.existsSync(path.join(data.root, "release"))).toBeFalse();
    });

    test("rejects installer and evidence hash drift before publishing", async () => {
        const data = await fixture();
        fs.appendFileSync(path.join(data.bundle, "solcord.asar"), "tampered");
        expect(() => assembleRelease(assembleOptions(data, path.join(data.root, "release")))).toThrow();
        expect(fs.existsSync(path.join(data.root, "release"))).toBeFalse();
    });

    test("rejects evidence paths outside the manifest directory", async () => {
        const data = await fixture();
        const manifest = JSON.parse(fs.readFileSync(data.evidenceManifest, "utf8"));
        const outside = path.join(data.root, "outside.json");
        fs.writeFileSync(outside, "{\"result\":\"PASS\"}\n");
        manifest.files[0].source = "../outside.json";
        manifest.files[0].sha256 = hashFile(outside);
        fs.writeFileSync(data.evidenceManifest, `${JSON.stringify(manifest, null, 2)}\n`);
        expect(() => assembleRelease({...assembleOptions(data, path.join(data.root, "release")), evidenceManifestSha256: hashFile(data.evidenceManifest)})).toThrow("unsafe file record");
        expect(fs.existsSync(path.join(data.root, "release"))).toBeFalse();
    });

    test("rejects output parents reached through a reparse point", async () => {
        const data = await fixture();
        const target = path.join(data.root, "real-output-parent");
        const alias = path.join(data.root, "linked-output-parent");
        fs.mkdirSync(target);
        fs.symlinkSync(target, alias, process.platform === "win32" ? "junction" : "dir");
        expect(() => assembleRelease(assembleOptions(data, path.join(alias, "release")))).toThrow("reparse point");
        expect(fs.existsSync(path.join(target, "release"))).toBeFalse();
    });

    test("requires the schema-seven installer to bind the exact candidate label", async () => {
        const data = await fixture();
        expect(() => assembleRelease({...assembleOptions(data, path.join(data.root, "release")), candidateLabel: "v2.0.0-rc.6"})).toThrow("candidate label");
        expect(fs.existsSync(path.join(data.root, "release"))).toBeFalse();
    });

    test("rejects a coherently rehashed installer bundle without the external receipt hash", async () => {
        const data = await fixture();
        fs.writeFileSync(path.join(data.bundle, "SolcordInstaller.exe"), "substituted installer\n");
        rewriteInstallerChecksums(data.bundle);
        const receiptFile = path.join(data.bundle, "solcord-installer-build-receipt.json");
        const receipt = JSON.parse(fs.readFileSync(receiptFile, "utf8"));
        for (const record of receipt.files) {
            record.bytes = fs.statSync(path.join(data.bundle, record.name)).size;
            record.sha256 = hashFile(path.join(data.bundle, record.name));
        }
        fs.writeFileSync(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`);
        expect(() => assembleRelease(assembleOptions(data, path.join(data.root, "release")))).toThrow("external trust anchor");
        expect(fs.existsSync(path.join(data.root, "release"))).toBeFalse();
    });

    test("rejects release-context key and status injection", async () => {
        const data = await fixture();
        const manifest = JSON.parse(fs.readFileSync(data.evidenceManifest, "utf8"));
        manifest.releaseContext.distribution.status = "published";
        fs.writeFileSync(data.evidenceManifest, `${JSON.stringify(manifest, null, 2)}\n`);
        expect(() => assembleRelease({
            ...assembleOptions(data, path.join(data.root, "release-status-injection")),
            evidenceManifestSha256: hashFile(data.evidenceManifest)
        })).toThrow("invalid release context");

        delete manifest.releaseContext.distribution.status;
        manifest.releaseContext.discord.unexpected = true;
        fs.writeFileSync(data.evidenceManifest, `${JSON.stringify(manifest, null, 2)}\n`);
        expect(() => assembleRelease({
            ...assembleOptions(data, path.join(data.root, "release-extra-key")),
            evidenceManifestSha256: hashFile(data.evidenceManifest)
        })).toThrow("invalid or unbound evidence");
    }, 15_000);

    test("rejects incoherent distribution claims before assembly", async () => {
        const data = await fixture();
        const manifest = JSON.parse(fs.readFileSync(data.evidenceManifest, "utf8"));
        manifest.releaseContext.distribution.published = true;
        fs.writeFileSync(data.evidenceManifest, `${JSON.stringify(manifest, null, 2)}\n`);
        expect(() => assembleRelease({
            ...assembleOptions(data, path.join(data.root, "release-published-before-install")),
            evidenceManifestSha256: hashFile(data.evidenceManifest)
        })).toThrow("invalid release context");

        manifest.releaseContext.distribution.published = false;
        manifest.releaseContext.distribution.installed = true;
        fs.writeFileSync(data.evidenceManifest, `${JSON.stringify(manifest, null, 2)}\n`);
        expect(() => assembleRelease({
            ...assembleOptions(data, path.join(data.root, "release-installed-before-merge")),
            evidenceManifestSha256: hashFile(data.evidenceManifest)
        })).toThrow("invalid release context");
    }, 15_000);

    test("fails closed when an evidence source grows through the held snapshot descriptor", async () => {
        const data = await fixture();
        const target = path.join(path.dirname(data.evidenceManifest), "security-report.md");
        const originalOpen = fs.openSync;
        const originalRead = fs.readSync;
        let targetDescriptor: number | undefined;
        let mutated = false;
        (fs as unknown as {openSync: typeof fs.openSync}).openSync = ((file: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
            const descriptor = originalOpen(file, flags, mode);
            if (flags === "r" && path.resolve(String(file)) === path.resolve(target)) targetDescriptor = descriptor;
            return descriptor;
        }) as typeof fs.openSync;
        (fs as unknown as {readSync: typeof fs.readSync}).readSync = ((descriptor: number, ...args: unknown[]) => {
            const read = (originalRead as (...values: unknown[]) => number)(descriptor, ...args);
            if (descriptor === targetDescriptor && read > 0 && !mutated) {
                mutated = true;
                fs.appendFileSync(target, "source grew during snapshot\n");
            }
            return read;
        }) as typeof fs.readSync;
        try {
            expect(() => assembleRelease(assembleOptions(data, path.join(data.root, "release")))).toThrow("snapshotted");
            expect(fs.existsSync(path.join(data.root, "release"))).toBeFalse();
            expect(mutated).toBeTrue();
        }
        finally {
            (fs as unknown as {openSync: typeof fs.openSync}).openSync = originalOpen;
            (fs as unknown as {readSync: typeof fs.readSync}).readSync = originalRead;
        }
    }, 15_000);

    test("rejects staged evidence drift instead of re-anchoring changed snapshot bytes", async () => {
        const data = await fixture();
        const inputRoot = path.dirname(data.evidenceManifest);
        const walkthrough = path.join(inputRoot, "walkthrough.png");
        fs.writeFileSync(walkthrough, "reviewed walkthrough bytes\n");
        const manifest = JSON.parse(fs.readFileSync(data.evidenceManifest, "utf8"));
        manifest.files.push({source: "walkthrough.png", name: "walkthrough.png", category: "walkthrough-evidence", sha256: hashFile(walkthrough)});
        fs.writeFileSync(data.evidenceManifest, `${JSON.stringify(manifest, null, 2)}\n`);

        const originalOpen = fs.openSync;
        const originalClose = fs.closeSync;
        let stagedDescriptor: number | undefined;
        let stagedWalkthrough = "";
        let mutated = false;
        (fs as unknown as {openSync: typeof fs.openSync}).openSync = ((file: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
            const descriptor = originalOpen(file, flags, mode);
            const candidate = path.resolve(String(file));
            if (flags === "wx" && path.basename(candidate) === "walkthrough.png" && path.basename(path.dirname(candidate)) === "evidence") {
                stagedDescriptor = descriptor;
                stagedWalkthrough = candidate;
            }
            return descriptor;
        }) as typeof fs.openSync;
        (fs as unknown as {closeSync: typeof fs.closeSync}).closeSync = ((descriptor: number) => {
            originalClose(descriptor);
            if (descriptor === stagedDescriptor && !mutated) {
                mutated = true;
                fs.writeFileSync(stagedWalkthrough, "changed after trusted snapshot\n");
            }
        }) as typeof fs.closeSync;
        try {
            expect(() => assembleRelease({
                ...assembleOptions(data, path.join(data.root, "release")),
                evidenceManifestSha256: hashFile(data.evidenceManifest)
            })).toThrow("externally pinned input record");
            expect(fs.existsSync(path.join(data.root, "release"))).toBeFalse();
            expect(mutated).toBeTrue();
        }
        finally {
            (fs as unknown as {openSync: typeof fs.openSync}).openSync = originalOpen;
            (fs as unknown as {closeSync: typeof fs.closeSync}).closeSync = originalClose;
        }
    }, 15_000);

    test("published evidence remains bound to its private snapshot after the source changes", async () => {
        const data = await fixture();
        const release = path.join(data.root, "release");
        const result = assembleRelease(assembleOptions(data, release));
        fs.appendFileSync(path.join(path.dirname(data.evidenceManifest), "security-report.md"), "changed after publication\n");
        expect(validateRelease({
            repo: data.repo,
            sourceCommit: data.sourceCommit,
            candidateLabel: "v2.0.0-rc.5",
            releaseDirectory: release,
            releaseManifestSha256: result.manifestSha256
        }).artifactCount).toBe(10);
    }, 15_000);

    test("validation rejects an externally repinned release-status override", async () => {
        const data = await fixture();
        const release = path.join(data.root, "release");
        assembleRelease(assembleOptions(data, release));
        const manifestFile = path.join(release, "release-manifest.json");
        const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
        manifest.release.status = "published";
        fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
        expect(() => validateRelease({
            repo: data.repo,
            sourceCommit: data.sourceCommit,
            candidateLabel: "v2.0.0-rc.5",
            releaseDirectory: release,
            releaseManifestSha256: hashFile(manifestFile)
        })).toThrow("does not match this candidate");
    }, 15_000);

    test("validation rejects externally repinned root and nonclaim drift", async () => {
        const data = await fixture();
        const release = path.join(data.root, "release");
        assembleRelease(assembleOptions(data, release));
        const manifestFile = path.join(release, "release-manifest.json");
        const original = fs.readFileSync(manifestFile);
        const manifest = JSON.parse(original.toString("utf8"));
        manifest.nonclaims[0] = "Live behavior is proven.";
        fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
        expect(() => validateRelease({
            repo: data.repo,
            sourceCommit: data.sourceCommit,
            candidateLabel: "v2.0.0-rc.5",
            releaseDirectory: release,
            releaseManifestSha256: hashFile(manifestFile)
        })).toThrow("does not match this candidate");

        fs.writeFileSync(manifestFile, original);
        const extra = JSON.parse(original.toString("utf8"));
        extra.attestation = "reviewed";
        fs.writeFileSync(manifestFile, `${JSON.stringify(extra, null, 2)}\n`);
        expect(() => validateRelease({
            repo: data.repo,
            sourceCommit: data.sourceCommit,
            candidateLabel: "v2.0.0-rc.5",
            releaseDirectory: release,
            releaseManifestSha256: hashFile(manifestFile)
        })).toThrow("does not match this candidate");
    }, 20_000);

    test("validation rejects an externally repinned source commit timestamp", async () => {
        const data = await fixture();
        const release = path.join(data.root, "release");
        assembleRelease(assembleOptions(data, release));
        const manifestFile = path.join(release, "release-manifest.json");
        const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
        manifest.source.commitTimeUtc = "2099-01-01T00:00:00.000Z";
        fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
        expect(() => validateRelease({
            repo: data.repo,
            sourceCommit: data.sourceCommit,
            candidateLabel: "v2.0.0-rc.5",
            releaseDirectory: release,
            releaseManifestSha256: hashFile(manifestFile)
        })).toThrow("does not match this candidate");
    }, 15_000);

    test("validation rejects changed or unexpected release files", async () => {
        const data = await fixture();
        const release = path.join(data.root, "release");
        const result = assembleRelease(assembleOptions(data, release));
        fs.appendFileSync(path.join(release, "evidence", "security-report.md"), "changed\n");
        expect(() => validateRelease({repo: data.repo, sourceCommit: data.sourceCommit, candidateLabel: "v2.0.0-rc.5", releaseDirectory: release, releaseManifestSha256: result.manifestSha256})).toThrow("does not match");
        fs.writeFileSync(path.join(release, "evidence", "security-report.md"), "# Security\n\nNo findings.\n");
        fs.writeFileSync(path.join(release, "unexpected.txt"), "unexpected\n");
        expect(() => validateRelease({repo: data.repo, sourceCommit: data.sourceCommit, candidateLabel: "v2.0.0-rc.5", releaseDirectory: release, releaseManifestSha256: result.manifestSha256})).toThrow("unexpected file set");
    }, 15_000);

    test("validation requires the pinned manifest and bounded checksum input", async () => {
        const data = await fixture();
        const release = path.join(data.root, "release");
        const result = assembleRelease(assembleOptions(data, release));
        const manifestFile = path.join(release, "release-manifest.json");
        fs.appendFileSync(manifestFile, " \n");
        expect(() => validateRelease({repo: data.repo, sourceCommit: data.sourceCommit, candidateLabel: "v2.0.0-rc.5", releaseDirectory: release, releaseManifestSha256: result.manifestSha256})).toThrow("external trust anchor");
        fs.writeFileSync(manifestFile, `${JSON.stringify(JSON.parse(fs.readFileSync(manifestFile, "utf8")), null, 2)}\n`);
        const restoredManifestSha256 = hashFile(manifestFile);
        fs.writeFileSync(path.join(release, "SHA256SUMS.txt"), "x".repeat(4 * 1024 * 1024 + 1));
        expect(() => validateRelease({repo: data.repo, sourceCommit: data.sourceCommit, candidateLabel: "v2.0.0-rc.5", releaseDirectory: release, releaseManifestSha256: restoredManifestSha256})).toThrow("too large");
    }, 15_000);
});
