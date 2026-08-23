import {describe, expect, test} from "bun:test";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {
    SOULCORD_CATALOG_INDEX,
    SOULCORD_CATALOG_SNAPSHOT,
    SOULCORD_RUNTIME_ADDONS,
    SOULCORD_RUNTIME_DEPENDENCIES,
    SOULCORD_RUNTIME_THEMES
} from "../../src/common/soulcord/addon-catalog.generated";
import {SOULCORD_PRESET_ADDONS, SOULCORD_THEMES} from "../../src/betterdiscord/modules/soulcord/store";


const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");
const IMMUTABLE_RAW_GITHUB = /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[0-9a-f]{40}\/.+$/i;
const SHA256 = /^[0-9a-f]{64}$/;

describe("SoulCord catalog and theme invariants", () => {
    test("pins the complete catalog snapshot and aggressive preset", () => {
        const manifest = JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, "assets/catalog/soulcord-catalog.json"), "utf8"));
        const pluginRecords = manifest.candidates.filter((candidate: {type: string;}) => candidate.type === "plugin");
        const themeRecords = manifest.candidates.filter((candidate: {type: string;}) => candidate.type === "theme");

        expect(manifest.snapshot).toEqual(SOULCORD_CATALOG_SNAPSHOT);
        expect(manifest.snapshot.pluginCount).toBe(209);
        expect(manifest.snapshot.themeCount).toBe(114);
        expect(pluginRecords).toHaveLength(209);
        expect(themeRecords).toHaveLength(114);
        expect(manifest.preset.declaredCount).toBe(36);
        expect(manifest.preset.matchedCount).toBe(36);
        expect(manifest.preset.missingRequested).toEqual([]);
        expect(new Set(manifest.preset.names)).toEqual(new Set(SOULCORD_PRESET_ADDONS));
        expect(SOULCORD_CATALOG_INDEX).toHaveLength(323);
    });

    test("keeps all 36 candidates immutable while deep security dispositions gate staging", () => {
        expect(SOULCORD_RUNTIME_ADDONS).toHaveLength(36);
        expect(new Set(SOULCORD_RUNTIME_ADDONS.map(addon => addon.name))).toEqual(new Set(SOULCORD_PRESET_ADDONS));
        expect(new Set(SOULCORD_RUNTIME_ADDONS.map(addon => addon.fileName)).size).toBe(36);
        for (const addon of SOULCORD_RUNTIME_ADDONS) {
            expect(addon.sourceUrl).toMatch(IMMUTABLE_RAW_GITHUB);
            expect(addon.sourceSha256).toMatch(SHA256);
            expect(addon.sizeBytes).toBeGreaterThan(0);
            expect(addon.installable).toBeFalse();
        }
        expect(SOULCORD_RUNTIME_ADDONS.filter(addon => addon.securityDisposition === "SAFE_TO_RUNTIME_TEST" && addon.stageable)).toHaveLength(11);
        expect(SOULCORD_RUNTIME_ADDONS.filter(addon => addon.securityDisposition === "ACTION_GATED_TEST" && addon.stageable)).toHaveLength(4);
        expect(SOULCORD_RUNTIME_ADDONS.filter(addon => addon.securityDisposition === "HOLD" && !addon.stageable)).toHaveLength(19);
        expect(SOULCORD_RUNTIME_ADDONS.filter(addon => addon.securityDisposition === "REJECT" && !addon.stageable)).toHaveLength(2);
    });

    test("pins every staged dependency with an immutable source and checksum", () => {
        expect(SOULCORD_RUNTIME_DEPENDENCIES.length).toBeGreaterThanOrEqual(1);
        for (const dependency of SOULCORD_RUNTIME_DEPENDENCIES) {
            expect(dependency.sourceUrl).toMatch(IMMUTABLE_RAW_GITHUB);
            expect(dependency.sourceSha256).toMatch(SHA256);
            expect(dependency.sizeBytes).toBeGreaterThan(0);
        }
        expect(SOULCORD_RUNTIME_DEPENDENCIES.some(dependency => dependency.name === "BDFDB" && !dependency.stageable && !dependency.installable && dependency.reviewStatus === "HOLD")).toBeTrue();
    });

    test("ships exactly four self-contained themes whose embedded bytes match disk and manifest hashes", () => {
        expect(SOULCORD_RUNTIME_THEMES).toHaveLength(4);
        expect(new Set(SOULCORD_RUNTIME_THEMES.map(theme => theme.id))).toEqual(new Set(SOULCORD_THEMES.map(theme => theme.id)));

        for (const theme of SOULCORD_RUNTIME_THEMES) {
            const disk = readFileSync(resolve(REPOSITORY_ROOT, "assets/themes", theme.fileName), "utf8");
            const executableCss = disk.replace(/\/\*[\s\S]*?\*\//g, "");
            expect(theme.content as string).toBe(disk);
            expect(createHash("sha256").update(disk).digest("hex")).toBe(theme.sourceSha256);
            expect(theme.sourceSha256).toMatch(SHA256);
            expect(executableCss).not.toMatch(/@import\b/i);
            expect(executableCss).not.toMatch(/url\s*\(/i);
            expect(executableCss).not.toMatch(/https?:\/\//i);
            expect(executableCss).toContain(":focus-visible");
            expect(executableCss).toContain("prefers-reduced-motion");
        }
    });
});
