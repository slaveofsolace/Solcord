import {describe, expect, test} from "bun:test";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {
    SOLCORD_CATALOG_INDEX,
    SOLCORD_CATALOG_SNAPSHOT,
    SOLCORD_REVIEWED_OPTIONALS,
    SOLCORD_RUNTIME_ADDONS,
    SOLCORD_RUNTIME_DEPENDENCIES,
    SOLCORD_RUNTIME_THEMES
} from "../../src/common/solcord/addon-catalog.generated";
import {SOLCORD_PRESET_ADDONS, SOLCORD_THEMES} from "../../src/betterdiscord/modules/solcord/store";


const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");
const IMMUTABLE_RAW_GITHUB = /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[0-9a-f]{40}\/.+$/i;
const SHA256 = /^[0-9a-f]{64}$/;

describe("Solcord catalog and theme invariants", () => {
    test("pins the complete catalog snapshot and aggressive preset", () => {
        const manifest = JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, "assets/catalog/solcord-catalog.json"), "utf8"));
        const pluginRecords = manifest.candidates.filter((candidate: {type: string;}) => candidate.type === "plugin");
        const themeRecords = manifest.candidates.filter((candidate: {type: string;}) => candidate.type === "theme");

        expect(manifest.snapshot).toEqual(SOLCORD_CATALOG_SNAPSHOT);
        expect(manifest.snapshot.pluginCount).toBe(209);
        expect(manifest.snapshot.themeCount).toBe(114);
        expect(pluginRecords).toHaveLength(209);
        expect(themeRecords).toHaveLength(114);
        expect(manifest.preset.declaredCount).toBe(36);
        expect(manifest.preset.matchedCount).toBe(36);
        expect(manifest.preset.missingRequested).toEqual([]);
        expect(new Set(manifest.preset.names)).toEqual(new Set(SOLCORD_PRESET_ADDONS));
        expect(manifest.optional).toEqual(expect.objectContaining({declaredCount: 12, matchedCount: 12, missingOptional: []}));
        expect(SOLCORD_CATALOG_INDEX).toHaveLength(323);
        for (const candidate of SOLCORD_CATALOG_INDEX) {
            expect(candidate).toEqual(expect.objectContaining({
                fileName: expect.any(String),
                version: expect.any(String),
                sourceUrl: expect.stringMatching(/^https:\/\/raw\.githubusercontent\.com\//),
                immutableRevision: expect.stringMatching(/^[0-9a-f]{40}$/),
                dependencies: expect.any(Array),
                networkBehavior: expect.any(Array),
                accountActions: expect.any(Array),
                conflicts: expect.any(Array),
                supportedModes: expect.any(Array),
                installable: false
            }));
            expect(["standard", "experimental", "account-risk", "external-service"]).toContain(candidate.risk);
            expect(candidate.verification).toEqual(expect.objectContaining({metadata: expect.any(String), provenance: expect.any(String), code: expect.any(String), security: expect.any(String), runtime: expect.any(String)}));
        }

        const showPing = pluginRecords.find((candidate: {name: string;}) => candidate.name === "ShowPing");
        const uncompressedImages = pluginRecords.find((candidate: {name: string;}) => candidate.name === "Uncompressed Images");
        const spotifyListenAlong = pluginRecords.find((candidate: {name: string;}) => candidate.name === "SpotifyListenAlong");
        const bubbleTheme = themeRecords.find((candidate: {name: string;}) => candidate.name === "Bubble Theme v2");
        expect(showPing).toEqual(expect.objectContaining({disposition: "OPTIONAL", targetDisposition: "OPTIONAL"}));
        expect(uncompressedImages).toEqual(expect.objectContaining({disposition: "OPTIONAL", targetDisposition: "OPTIONAL"}));
        expect(spotifyListenAlong).toEqual(expect.objectContaining({disposition: "POWER_LAB", targetDisposition: "POWER_LAB"}));
        expect(bubbleTheme).toEqual(expect.objectContaining({disposition: "HOLD", targetDisposition: "HOLD"}));
        expect(manifest.candidates.filter((candidate: {targetDisposition: string;}) => candidate.targetDisposition === "OPTIONAL")).toHaveLength(12);
        expect(manifest.candidates.filter((candidate: {targetDisposition: string;}) => candidate.targetDisposition === "POWER_LAB")).toHaveLength(1);

        const showPingIndex = SOLCORD_CATALOG_INDEX.find(candidate => candidate.name === "ShowPing");
        expect(showPingIndex).toEqual(expect.objectContaining({targetDisposition: "OPTIONAL", securityDisposition: "HOLD", licenseStatus: "FOUND", codeStatus: "STATIC_REVIEWED"}));
        const uncompressedIndex = SOLCORD_CATALOG_INDEX.find(candidate => candidate.name === "Uncompressed Images");
        expect(uncompressedIndex).toEqual(expect.objectContaining({targetDisposition: "OPTIONAL", securityDisposition: "HOLD", licenseStatus: "FOUND", codeStatus: "STATIC_REVIEWED"}));
        const spotifyIndex = SOLCORD_CATALOG_INDEX.find(candidate => candidate.name === "SpotifyListenAlong");
        expect(spotifyIndex).toEqual(expect.objectContaining({targetDisposition: "POWER_LAB", securityDisposition: "HOLD"}));
        expect(SOLCORD_REVIEWED_OPTIONALS).toHaveLength(12);
        expect(SOLCORD_REVIEWED_OPTIONALS.map(candidate => String(candidate.name))).toContain("ShowPing");
    });

    test("keeps all 36 candidates immutable while deep security dispositions gate staging", () => {
        expect(SOLCORD_RUNTIME_ADDONS).toHaveLength(36);
        expect(new Set(SOLCORD_RUNTIME_ADDONS.map(addon => addon.name))).toEqual(new Set(SOLCORD_PRESET_ADDONS));
        expect(new Set(SOLCORD_RUNTIME_ADDONS.map(addon => addon.fileName)).size).toBe(36);
        for (const addon of SOLCORD_RUNTIME_ADDONS) {
            expect(addon.sourceUrl).toMatch(IMMUTABLE_RAW_GITHUB);
            expect(addon.sourceSha256).toMatch(SHA256);
            expect(addon.sizeBytes).toBeGreaterThan(0);
            expect(addon.installable).toBeFalse();
        }
        expect(SOLCORD_RUNTIME_ADDONS.filter(addon => addon.securityDisposition === "SAFE_TO_RUNTIME_TEST" && addon.stageable)).toHaveLength(11);
        expect(SOLCORD_RUNTIME_ADDONS.filter(addon => addon.securityDisposition === "ACTION_GATED_TEST" && addon.stageable)).toHaveLength(4);
        expect(SOLCORD_RUNTIME_ADDONS.filter(addon => addon.securityDisposition === "HOLD" && !addon.stageable)).toHaveLength(19);
        expect(SOLCORD_RUNTIME_ADDONS.filter(addon => addon.securityDisposition === "REJECT" && !addon.stageable)).toHaveLength(2);
    });

    test("pins every staged dependency with an immutable source and checksum", () => {
        expect(SOLCORD_RUNTIME_DEPENDENCIES.length).toBeGreaterThanOrEqual(1);
        for (const dependency of SOLCORD_RUNTIME_DEPENDENCIES) {
            expect(dependency.sourceUrl).toMatch(IMMUTABLE_RAW_GITHUB);
            expect(dependency.sourceSha256).toMatch(SHA256);
            expect(dependency.sizeBytes).toBeGreaterThan(0);
        }
        expect(SOLCORD_RUNTIME_DEPENDENCIES.some(dependency => dependency.name === "BDFDB" && !dependency.stageable && !dependency.installable && dependency.reviewStatus === "HOLD")).toBeTrue();
    });

    test("ships the complete self-contained V2 theme family whose embedded bytes match disk and manifest hashes", () => {
        expect(SOLCORD_RUNTIME_THEMES).toHaveLength(SOLCORD_THEMES.length);
        expect(new Set(SOLCORD_RUNTIME_THEMES.map(theme => theme.id))).toEqual(new Set(SOLCORD_THEMES.map(theme => theme.id)));

        for (const theme of SOLCORD_RUNTIME_THEMES) {
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
