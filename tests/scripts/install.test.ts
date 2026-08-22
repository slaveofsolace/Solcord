import {afterAll, describe, expect, test} from "bun:test";
import {createHash} from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {stageReleaseArtifact} from "../../scripts/helpers/install";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "soulcord-install-test-"));

afterAll(() => {
    const resolved = fs.realpathSync(root);
    if (!resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith("soulcord-install-test-")) throw new Error("Refusing to remove an unexpected test path.");
    fs.rmSync(resolved, {recursive: true});
});

describe("SoulCord release staging", () => {
    test("atomically replaces the compatibility target and preserves the source", () => {
        const source = path.join(root, "soulcord.asar");
        const target = path.join(root, "compatibility", "betterdiscord.asar");
        const content = Buffer.from("reviewed-soulcord-artifact");
        fs.writeFileSync(source, content);
        fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.writeFileSync(target, "previous-build");

        const sha256 = stageReleaseArtifact(source, target);

        expect(fs.readFileSync(source)).toEqual(content);
        expect(fs.readFileSync(target)).toEqual(content);
        expect(sha256).toBe(createHash("sha256").update(content).digest("hex"));
        expect(fs.readdirSync(path.dirname(target))).toEqual(["betterdiscord.asar"]);
    });

    test("rejects relative, missing, and empty artifacts", () => {
        const empty = path.join(root, "empty.asar");
        const target = path.join(root, "target.asar");
        fs.writeFileSync(empty, "");
        expect(() => stageReleaseArtifact("relative.asar", target)).toThrow("absolute paths");
        expect(() => stageReleaseArtifact(path.join(root, "missing.asar"), target)).toThrow("missing or empty");
        expect(() => stageReleaseArtifact(empty, target)).toThrow("missing or empty");
    });
});
