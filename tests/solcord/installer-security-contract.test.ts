// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "../..");
const builder = fs.readFileSync(path.join(root, "scripts/build-solcord-v2-installer.mjs"), "utf8");
const engine = fs.readFileSync(path.join(root, "installer/Solcord.Installer/InstallerEngine.cs"), "utf8");
const embeddedBundle = fs.readFileSync(path.join(root, "installer/Solcord.Installer/EmbeddedInstallerBundle.cs"), "utf8");
const selfTest = fs.readFileSync(path.join(root, "installer/Solcord.Installer/Program.cs"), "utf8");

describe("Solcord installer security contracts", () => {
    test("rebuilds ignored dist output from the exact clean commit before packaging", () => {
        const remove = builder.indexOf("fs.rmSync(dist, {recursive: true})");
        const rebuild = builder.indexOf("spawnSync(process.execPath, [\"run\", \"dist\"]");
        const publish = builder.indexOf("const publish = spawnSync(\"dotnet\", [");
        expect(remove).toBeGreaterThan(0);
        expect(rebuild).toBeGreaterThan(remove);
        expect(publish).toBeGreaterThan(rebuild);
        expect(builder).toContain("The ASAR's embedded provenance does not match");
        expect(builder).toContain("The source changed while the installer was being built");
        expect(builder).toContain("Fresh build output changed while the installer was being built");
        expect(builder).toContain("\"--self-contained\", \"true\"");
        expect(builder).toContain("\"-p:PublishSingleFile=true\"");
        expect(builder).toContain("\"-r\", \"win-x64\"");
    });

    test("embeds the exact manifest-bound resources and publishes no sidecars", () => {
        expect(builder).toContain("-p:SolcordRequireEmbeddedBundle=true");
        expect(builder).toContain("SolcordEmbeddedArtifact");
        expect(builder).toContain("SolcordEmbeddedBuildManifest");
        expect(builder).toContain("SolcordEmbeddedInstallerManifest");
        expect(builder).toContain("entries.length !== 1");
        expect(builder).toContain("entries[0].name !== \"SolcordInstaller.exe\"");
        expect(builder).not.toContain("SHA256SUMS.txt");
        expect(builder).not.toContain("path.join(output, \"solcord-installer-manifest.json\")");
    });

    test("verifies embedded bytes before private extraction and cleans only known files", () => {
        const verify = embeddedBundle.indexOf("InstallerEngine.VerifyBundleBytes(manifest, artifact, buildManifest)");
        const extract = embeddedBundle.indexOf("WriteExclusive(Path.Combine(root, \"solcord.asar\"), artifact)");
        expect(verify).toBeGreaterThan(0);
        expect(extract).toBeGreaterThan(verify);
        expect(embeddedBundle).toContain("SetAccessRuleProtection(isProtected: true, preserveInheritance: false)");
        expect(embeddedBundle).toContain("FileMode.CreateNew");
        expect(embeddedBundle).toContain("FileShare.None");
        expect(embeddedBundle).toContain("FileOptions.WriteThrough");
        expect(embeddedBundle).toContain("bundle.LockExtractedFiles()");
        expect(embeddedBundle).toContain("FileAccess.Read, FileShare.Read");
        expect(embeddedBundle).toContain("foreach (string name in ExtractedFiles)");
        expect(embeddedBundle).not.toContain("Directory.Delete(root, recursive: true)");
    });

    test("runs self-test from an empty directory using only embedded resources", () => {
        expect(builder).toContain("cwd: validationRoot");
        expect(builder).toContain("fs.readdirSync(validationRoot).length !== 0");
        expect(selfTest).toContain("EmbeddedInstallerBundle.ExtractVerified()");
        expect(selfTest).toContain("InstallerSelfTest.Run(bundle.Root)");
        expect(selfTest).not.toContain("string bundle = Path.Combine(root, \"bundle\")");
    });

    test("fails closed for an unsafe existing downgrade receipt", () => {
        expect(engine).toContain("if (!File.Exists(receipt)) return;");
        expect(engine).toContain("receiptInfo.Length is <= 0 or > 64 * 1024");
        expect(engine).toContain("update is held for review");
        expect(selfTest).toContain("oversized-receipt-refusal");
    });

    test("verifies stable core and injector backups before mutation", () => {
        expect(engine).toContain("The current core changed while its rollback backup was captured");
        expect(engine).toContain("The injector changed while its rollback backup was captured");
        expect(engine.indexOf("The current core changed while its rollback backup was captured")).toBeLessThan(engine.indexOf("File.Move(temporary, installed, overwrite: true)"));
    });

    test("keeps pending recovery, preserves unknown current core, and accepts a mixed retry state", () => {
        expect(engine).toContain("pending.json");
        expect(engine).toContain("The pending receipt was preserved for Roll Back");
        expect(engine).toContain("if (!candidatePresent && !priorPresent && !priorAbsent) throw new InvalidDataException");
        expect(engine).not.toContain("requireUnchangedInjector");
        expect(engine).toContain("install-after-core");
        expect(selfTest).toContain("automatic-recovery-owner-change");
        expect(selfTest).toContain("owner-changed-core");
        expect(engine).toContain("rollback-after-injector");
        expect(selfTest).toContain("partial-rollback");
    });
});
