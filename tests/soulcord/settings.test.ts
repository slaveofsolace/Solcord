import {describe, expect, test} from "bun:test";

import {
    defaultProfiles,
    diffModules,
    MODULE_DEFAULTS,
    normalizeSoulCordDocument,
    parseSoulCordImport,
    restoreSnapshotState
} from "../../src/betterdiscord/modules/soulcord/store";


describe("SoulCord settings schema", () => {
    test("bounds numeric fields and strips unknown values from imports", () => {
        const document = normalizeSoulCordDocument({
            modules: {
                "performance-hud": {enabled: true, values: {sampleSeconds: 999, bearerToken: "must-not-survive"}},
                "accessibility-toolkit": {enabled: true, values: {readingWidth: -5, injectedCss: "nope"}}
            }
        });

        expect(document.modules["performance-hud"].values.sampleSeconds).toBe(30);
        expect(document.modules["accessibility-toolkit"].values.readingWidth).toBe(0);
        expect(document.modules["performance-hud"].values).not.toHaveProperty("bearerToken");
        expect(document.modules["accessibility-toolkit"].values).not.toHaveProperty("injectedCss");
    });

    test("produces a complete profile diff without mutating either side", () => {
        const before = structuredClone(MODULE_DEFAULTS);
        const after = structuredClone(MODULE_DEFAULTS);
        after["stream-shield"].enabled = true;
        after["performance-hud"].values.sampleSeconds = 12;

        expect(diffModules(before, after)).toEqual([
            "performance-hud.sampleSeconds",
            "stream-shield: off → on"
        ]);
        expect(before["stream-shield"].enabled).toBeFalse();
    });

    test("restores modules and profiles from a validated snapshot copy", () => {
        const document = normalizeSoulCordDocument(undefined);
        const snapshotModules = structuredClone(document.modules);
        snapshotModules["stream-shield"].enabled = true;
        document.snapshots.push({
            id: "known",
            reason: "test",
            createdAt: 1,
            modules: snapshotModules,
            profiles: defaultProfiles().slice(0, 1)
        });

        const restored = restoreSnapshotState(document, "known");
        expect(restored?.modules["stream-shield"].enabled).toBeTrue();
        expect(restored?.profiles).toHaveLength(1);
        restored!.modules["stream-shield"].enabled = false;
        expect(document.snapshots[0].modules["stream-shield"].enabled).toBeTrue();
        expect(restoreSnapshotState(document, "missing")).toBeUndefined();
    });

    test("rejects malformed or foreign settings imports", () => {
        expect(parseSoulCordImport("not json")).toBeUndefined();
        expect(parseSoulCordImport(JSON.stringify({format: "other", version: 1}))).toBeUndefined();
        expect(parseSoulCordImport(JSON.stringify({format: "soulcord-settings", version: 2}))).toBeUndefined();
    });

    test("bounds and deduplicates imported profiles while preserving later unique entries", () => {
        const base = defaultProfiles()[0];
        const profiles = [
            {...base, id: "same", name: "First"},
            {...base, id: "same", name: "Duplicate"},
            ...Array.from({length: 55}, (_, index) => ({...base, id: `custom-${index}`, name: `Custom ${index}`}))
        ];
        const document = parseSoulCordImport(JSON.stringify({format: "soulcord-settings", version: 1, profiles}));

        expect(document?.profiles).toHaveLength(50);
        expect(document?.profiles.filter(profile => profile.id === "same")).toHaveLength(1);
        expect(document?.profiles.some(profile => profile.id === "custom-48")).toBeTrue();
        expect(document?.profiles.some(profile => profile.id === "custom-49")).toBeFalse();
    });

    test("restores built-in profiles when an import contains no valid profile", () => {
        const document = parseSoulCordImport(JSON.stringify({format: "soulcord-settings", version: 1, profiles: [{id: 1}]}));
        expect(document?.profiles.map(profile => profile.id)).toEqual(["activities", "gaming", "calls", "streaming", "focus"]);
    });
});
