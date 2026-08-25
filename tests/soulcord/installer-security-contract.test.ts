// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "../..");
const builder = fs.readFileSync(path.join(root, "scripts/build-soulcord-installer.cjs"), "utf8");
const engine = fs.readFileSync(path.join(root, "installer/SoulCord.Installer/InstallerEngine.cs"), "utf8");
const selfTest = fs.readFileSync(path.join(root, "installer/SoulCord.Installer/Program.cs"), "utf8");

describe("SoulCord installer security contracts", () => {
    test("rebuilds ignored dist output from the exact clean commit before packaging", () => {
        const remove = builder.indexOf("fs.rmSync(dist, {recursive: true})");
        const rebuild = builder.indexOf("spawnSync(process.execPath, [\"run\", \"dist\"]");
        const publish = builder.indexOf("spawnSync(\"dotnet\", [\"publish\"");
        expect(remove).toBeGreaterThan(0);
        expect(rebuild).toBeGreaterThan(remove);
        expect(publish).toBeGreaterThan(rebuild);
        expect(builder).toContain("The ASAR's embedded provenance does not match");
        expect(builder).toContain("The source changed while the installer was being built");
        expect(builder).toContain("Fresh build output changed while the installer was being built");
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
