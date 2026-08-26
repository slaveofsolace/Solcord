// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {afterEach, describe, expect, test} from "bun:test";
import asar from "@electron/asar";

import {
    assertSolcordBuildAllowed,
    assertSolcordBuildStillCurrent,
    assertSolcordPackagingAllowed,
    captureSolcordBuildProvenance,
    createSolcordPostBuildManifest,
    readSolcordBuildProvenance,
    sha256File,
    writeSolcordBuildProvenance,
    writeSolcordPostBuildManifest
} from "../../scripts/helpers/build-provenance";

const MODULES = ["solcord", "main", "preload", "earlyRenderer", "editorPreload", "editor", "editorHtml"];
const TIMESTAMP = "2026-08-23T05:00:00.000Z";
const roots: string[] = [];

interface Fixture {
    root: string;
    bunExecutable: string;
}

function git(root: string, ...args: string[]): void {
    execFileSync("git", args, {cwd: root, stdio: "ignore", windowsHide: true});
}

function fixture(): Fixture {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "solcord-provenance-test-"));
    roots.push(root);
    fs.mkdirSync(path.join(root, "scripts"), {recursive: true});
    fs.writeFileSync(path.join(root, "package.json"), "{\"name\":\"solcord-test\"}\n");
    fs.writeFileSync(path.join(root, "bun.lock"), "lockfileVersion = 1\n");
    fs.writeFileSync(path.join(root, "scripts", "build.ts"), "console.log('build');\n");
    fs.writeFileSync(path.join(root, "scripts", "pack.ts"), "console.log('pack');\n");
    fs.writeFileSync(path.join(root, "source.ts"), "export const value = 1;\n");
    const bunExecutable = path.join(root, "synthetic-bun.exe");
    fs.writeFileSync(bunExecutable, "synthetic-bun-toolchain");
    git(root, "init", "--initial-branch=main");
    git(root, "config", "user.email", "solcord-test@example.invalid");
    git(root, "config", "user.name", "Solcord Test");
    git(root, "add", ".");
    git(root, "commit", "-m", "fixture");
    return {root, bunExecutable};
}

function capture(
    testFixture: Fixture,
    mode: "diagnostic" | "production" = "diagnostic",
    timing: {buildTimestamp?: string; sourceDateEpoch?: string | null;} = {buildTimestamp: TIMESTAMP}
) {
    return captureSolcordBuildProvenance(testFixture.root, {
        version: "1.0.0-test",
        mode,
        modules: MODULES,
        ...timing,
        bunExecutable: testFixture.bunExecutable,
        bunVersion: "1.4.0-test"
    });
}

const PACKAGE_FILES = [
    "main.js",
    "package.json",
    "preload.js",
    "earlyRenderer.js",
    "solcord.js",
    "editor/preload.js",
    "editor/script.js",
    "editor/index.html",
    "build-provenance.json"
] as const;

function stagePackage(root: string, provenance: ReturnType<typeof capture>, modifiedAt: Date): string[] {
    for (const relativeFile of PACKAGE_FILES) {
        const target = path.join(root, relativeFile);
        fs.mkdirSync(path.dirname(target), {recursive: true});
        const content = relativeFile === "build-provenance.json"
            ? `${JSON.stringify(provenance, null, 2)}\n`
            : relativeFile === "package.json"
                ? "{\"name\":\"solcord\",\"main\":\"main.js\"}\n"
                : `${relativeFile}\nfixed package input\n`;
        fs.writeFileSync(target, content);
        fs.utimesSync(target, modifiedAt, modifiedAt);
    }
    return PACKAGE_FILES.map(relativeFile => path.join(root, relativeFile));
}

afterEach(() => {
    for (const root of roots.splice(0)) {
        const resolved = path.resolve(root);
        if (!resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`) || !path.basename(resolved).startsWith("solcord-provenance-test-")) {
            throw new Error("Refusing unsafe provenance-test cleanup target.");
        }
        fs.rmSync(resolved, {recursive: true, force: true});
    }
});

describe("Solcord build provenance", () => {
    test("labels dirty diagnostics with a deterministic content digest and exposes no local paths", () => {
        const testFixture = fixture();
        const clean = capture(testFixture);
        expect(clean.source.clean).toBeTrue();
        expect(clean.source.commit).toMatch(/^[0-9a-f]{40}$/);
        expect(clean.buildLabel).toBe("diagnostic-clean");

        fs.writeFileSync(path.join(testFixture.root, "source.ts"), "export const value = 2;\n");
        fs.writeFileSync(path.join(testFixture.root, "new-source.ts"), "export const added = true;\n");
        const first = capture(testFixture);
        const second = capture(testFixture);

        expect(first.source.clean).toBeFalse();
        expect(first.source.digest).toBe(second.source.digest);
        expect(first.source.statusDigest).toBe(second.source.statusDigest);
        expect(first.source.digest).not.toBe(clean.source.digest);
        expect(first.buildLabel).toBe(`diagnostic-dirty.${first.source.digest.slice(0, 16)}`);
        expect(JSON.stringify(first)).not.toContain("solcord-provenance-test-");
    });

    test("derives clean timestamps reproducibly and honors SOURCE_DATE_EPOCH", () => {
        const testFixture = fixture();
        const first = capture(testFixture, "production", {sourceDateEpoch: null});
        const second = capture(testFixture, "production", {sourceDateEpoch: null});
        const commitEpoch = execFileSync("git", ["show", "-s", "--format=%ct", "HEAD"], {cwd: testFixture.root, encoding: "utf8", windowsHide: true}).trim();

        expect(first).toEqual(second);
        expect(first.buildTimestamp).toBe(new Date(Number(commitEpoch) * 1_000).toISOString());

        const epoch = capture(testFixture, "production", {sourceDateEpoch: String(Date.parse(TIMESTAMP) / 1_000)});
        expect(epoch.buildTimestamp).toBe(TIMESTAMP);
        expect(() => capture(testFixture, "production", {sourceDateEpoch: "1787446800.5"})).toThrow("whole non-negative Unix seconds");
        expect(() => capture(testFixture, "production", {sourceDateEpoch: ""})).toThrow("whole non-negative Unix seconds");
    });

    test("produces identical metadata, manifests, and ASAR bytes from identical clean inputs", async () => {
        const testFixture = fixture();
        const first = capture(testFixture, "production", {sourceDateEpoch: null});
        const second = capture(testFixture, "production", {sourceDateEpoch: null});
        const firstStage = path.join(testFixture.root, "package-a", "stage");
        const secondStage = path.join(testFixture.root, "package-b", "stage");
        const firstOutput = path.join(testFixture.root, "package-a", "output");
        const secondOutput = path.join(testFixture.root, "package-b", "output");
        fs.mkdirSync(firstOutput, {recursive: true});
        fs.mkdirSync(secondOutput, {recursive: true});
        const firstFiles = stagePackage(firstStage, first, new Date("2020-01-01T00:00:00.000Z"));
        const secondFiles = stagePackage(secondStage, second, new Date("2030-01-01T00:00:00.000Z"));
        const firstAsar = path.join(firstOutput, "solcord.asar");
        const secondAsar = path.join(secondOutput, "solcord.asar");

        await asar.createPackageFromFiles(firstStage, firstAsar, firstFiles);
        await asar.createPackageFromFiles(secondStage, secondAsar, secondFiles);
        expect(fs.readFileSync(firstAsar)).toEqual(fs.readFileSync(secondAsar));

        const firstChecksums = path.join(firstOutput, "checksums.txt");
        const secondChecksums = path.join(secondOutput, "checksums.txt");
        const checksumText = `${sha256File(firstAsar)}  solcord.asar\n`;
        fs.writeFileSync(firstChecksums, checksumText);
        fs.writeFileSync(secondChecksums, checksumText);
        const firstManifest = createSolcordPostBuildManifest(first, {
            asar: firstAsar,
            packageMetadata: path.join(firstStage, "package.json"),
            checksums: firstChecksums,
            embeddedBuildProvenance: path.join(firstStage, "build-provenance.json")
        });
        const secondManifest = createSolcordPostBuildManifest(second, {
            asar: secondAsar,
            packageMetadata: path.join(secondStage, "package.json"),
            checksums: secondChecksums,
            embeddedBuildProvenance: path.join(secondStage, "build-provenance.json")
        });
        const firstManifestFile = path.join(firstOutput, "solcord-build-manifest.json");
        const secondManifestFile = path.join(secondOutput, "solcord-build-manifest.json");
        writeSolcordPostBuildManifest(firstManifestFile, firstManifest);
        writeSolcordPostBuildManifest(secondManifestFile, secondManifest);

        expect(firstManifest.packagedAt).toBe(first.buildTimestamp);
        expect(firstManifest).toEqual(secondManifest);
        expect(fs.readFileSync(firstManifestFile)).toEqual(fs.readFileSync(secondManifestFile));
    });

    test("rejects dirty production builds while permitting explicitly diagnostic packaging", () => {
        const testFixture = fixture();
        fs.writeFileSync(path.join(testFixture.root, "source.ts"), "export const value = 3;\n");
        const production = capture(testFixture, "production");
        const diagnostic = capture(testFixture, "diagnostic");

        expect(() => assertSolcordBuildAllowed(production)).toThrow("clean Git worktree");
        expect(() => assertSolcordPackagingAllowed(production, true)).toThrow("clean Git worktree");
        expect(() => assertSolcordPackagingAllowed(diagnostic, false)).toThrow("production or release");
        expect(() => assertSolcordPackagingAllowed(diagnostic, true)).not.toThrow();

        const mislabeled = {...diagnostic, mode: "development" as const, buildLabel: `development-dirty.${diagnostic.source.digest.slice(0, 16)}`};
        expect(() => assertSolcordPackagingAllowed(mislabeled, true)).toThrow("explicitly diagnostic");
    });

    test("rejects source drift between build and packaging", () => {
        const testFixture = fixture();
        const built = capture(testFixture);
        fs.writeFileSync(path.join(testFixture.root, "source.ts"), "export const value = 4;\n");
        const current = capture(testFixture);
        expect(() => assertSolcordBuildStillCurrent(built, current)).toThrow("changed after the build");
    });

    test("writes validated embedded metadata and binds final artifacts without absolute paths", () => {
        const testFixture = fixture();
        const provenance = capture(testFixture, "production");
        const metadataFile = path.join(testFixture.root, "build-provenance.json");
        expect(() => writeSolcordBuildProvenance(metadataFile, {...provenance, localAbsolutePath: testFixture.root} as typeof provenance))
            .toThrow("Invalid Solcord build provenance");
        writeSolcordBuildProvenance(metadataFile, provenance);
        expect(readSolcordBuildProvenance(metadataFile)).toEqual(provenance);

        const asarFile = path.join(testFixture.root, "solcord.asar");
        const packageFile = path.join(testFixture.root, "dist-package.json");
        const checksums = path.join(testFixture.root, "checksums.txt");
        fs.writeFileSync(asarFile, "final-asar");
        fs.writeFileSync(packageFile, "{\"name\":\"solcord\"}\n");
        fs.writeFileSync(checksums, `${crypto.createHash("sha256").update("final-asar").digest("hex")}  solcord.asar\n`);
        const manifest = createSolcordPostBuildManifest(provenance, {
            asar: asarFile,
            packageMetadata: packageFile,
            checksums,
            embeddedBuildProvenance: metadataFile
        });

        expect(manifest.artifacts.asar.sha256).toBe(sha256File(asarFile));
        expect(manifest.artifacts.asar.file).toBe("solcord.asar");
        expect(manifest.artifacts.packageMetadata.file).toBe("dist-package.json");
        expect(manifest.build.source.commit).toHaveLength(40);
        expect(JSON.stringify(manifest)).not.toContain("solcord-provenance-test-");
    });
});
