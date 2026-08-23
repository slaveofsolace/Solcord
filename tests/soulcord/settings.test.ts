import {describe, expect, test} from "bun:test";

import {
    createSoulCordImportPreview,
    defaultProfiles,
    diffModules,
    MODULE_DEFAULTS,
    normalizeSetupDraft,
    normalizeSoulCordDocument,
    parseSoulCordImport,
    previewSoulCordImportChanges,
    previewSetupChanges,
    restoreSnapshotState,
    serializeSoulCordSettingsExport,
    verifySoulCordImportAtApply
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
            profiles: defaultProfiles().slice(0, 1),
            selectedTheme: document.selectedTheme,
            curatedAddons: structuredClone(document.curatedAddons),
            timelinePolicy: structuredClone(document.timelinePolicy)
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
        expect(parseSoulCordImport(JSON.stringify({format: "soulcord-settings", version: 99}))).toBeUndefined();
        expect(parseSoulCordImport(JSON.stringify({format: "soulcord-settings", version: 2}))).toBeDefined();
    });

    test("ordinary settings exports omit Timeline channel identifiers and normalize their scope", () => {
        const document = normalizeSoulCordDocument({
            schemaVersion: 3,
            timelinePolicy: {enabled: true, scope: "selected-channels", serverChannelIds: ["123456789012345678"], retention: "30-days", content: "text-only"},
            modules: {"message-timeline": {enabled: true, values: {scope: "selected-channels", retention: "30-days", content: "text-only"}}}
        });

        const exported = serializeSoulCordSettingsExport(document);
        const imported = parseSoulCordImport(exported);

        expect(exported).not.toContain("123456789012345678");
        expect(imported?.timelinePolicy.scope).toBe("dm-only");
        expect(imported?.timelinePolicy.serverChannelIds).toEqual([]);
        expect(imported?.modules["message-timeline"].values.scope).toBe("dm-only");
        expect(document.timelinePolicy.serverChannelIds).toEqual(["123456789012345678"]);
    });

    test("previews every imported theme, addon, Timeline, and Power Lab mutation without exposing channel identifiers", () => {
        const current = normalizeSoulCordDocument({
            schemaVersion: 3,
            powerLab: {decor: {enabled: true, acknowledgementVersion: 2, acknowledgedAt: 5}},
            timelinePolicy: {enabled: false, scope: "dm-only", serverChannelIds: [], retention: "7-days", content: "text-only"}
        });
        const candidate = normalizeSoulCordDocument({
            schemaVersion: 3,
            selectedTheme: "paper-signal",
            curatedAddons: {DoNotTrack: {selected: false, enabled: true, mode: "native", reviewedSha256: "a".repeat(64), quarantineReason: "held"}},
            timelinePolicy: {enabled: true, scope: "selected-channels", serverChannelIds: ["987654321098765432"], retention: "90-days", content: "encrypted-media", mediaBudgetBytes: 5_368_709_120}
        });

        const changes = previewSoulCordImportChanges(current, candidate);
        const preview = changes.join("\n");

        expect(changes).toContain("theme: obsidian-thread → paper-signal");
        expect(changes).toContain("DoNotTrack selected: on → off");
        expect(changes).toContain("DoNotTrack enabled: off → on");
        expect(changes).toContain("DoNotTrack mode: default → native");
        expect(changes).toContain("DoNotTrack review receipt: none → present");
        expect(changes).toContain("DoNotTrack quarantine: none → present");
        expect(changes).toContain("Message Timeline enabled: off → on");
        expect(changes).toContain("Message Timeline scope: dm-only → selected-channels");
        expect(changes).toContain("Message Timeline selected channels: 0 → 1 (identifiers hidden)");
        expect(changes).toContain("Message Timeline retention: 7-days → 90-days");
        expect(changes).toContain("Message Timeline content: text-only → encrypted-media");
        expect(changes).toContain("Message Timeline media budget: 1073741824 → 5368709120 bytes");
        expect(changes).toContain("Power Lab: clear 1 acknowledgement(s) and disable 1 experiment(s)");
        expect(preview).not.toContain("987654321098765432");
    });

    test("revalidates the complete normalized import preview immediately before apply", () => {
        const current = normalizeSoulCordDocument({schemaVersion: 3});
        const text = serializeSoulCordSettingsExport(normalizeSoulCordDocument({schemaVersion: 3, selectedTheme: "carbon-ember"}));
        const candidate = parseSoulCordImport(text)!;
        const preview = createSoulCordImportPreview(current, candidate);

        expect(verifySoulCordImportAtApply(current, text, preview.fingerprint)?.selectedTheme).toBe("carbon-ember");
        expect(verifySoulCordImportAtApply(current, text, "0".repeat(64))).toBeUndefined();
    });

    test("binds approval to opaque normalized state when privacy-safe summaries collide", () => {
        const current = normalizeSoulCordDocument({schemaVersion: 3});
        current.timelinePolicy = {...current.timelinePolicy, scope: "selected-channels", serverChannelIds: ["111"]};
        current.modules["performance-hud"].values.sampleSeconds = 5;
        current.curatedAddons.DoNotTrack = {...current.curatedAddons.DoNotTrack, reviewedSha256: "a".repeat(64), quarantineReason: "first"};
        current.profiles[0] = {...current.profiles[0], name: "Current profile"};

        const candidate = structuredClone(current);
        candidate.timelinePolicy.serverChannelIds = ["333"];
        candidate.modules["performance-hud"].values.sampleSeconds = 10;
        candidate.curatedAddons.DoNotTrack = {...candidate.curatedAddons.DoNotTrack, reviewedSha256: "c".repeat(64), quarantineReason: "candidate"};
        candidate.profiles[0] = {...candidate.profiles[0], name: "Candidate profile"};
        const text = JSON.stringify({format: "soulcord-settings", version: 2, ...candidate});
        const normalizedCandidate = parseSoulCordImport(text)!;
        const approved = createSoulCordImportPreview(current, normalizedCandidate);

        const drifted = structuredClone(current);
        drifted.timelinePolicy.serverChannelIds = ["222"];
        drifted.modules["performance-hud"].values.sampleSeconds = 15;
        drifted.curatedAddons.DoNotTrack = {...drifted.curatedAddons.DoNotTrack, reviewedSha256: "b".repeat(64), quarantineReason: "second"};
        drifted.profiles[0] = {...drifted.profiles[0], name: "Drifted profile"};
        const collidingSummary = createSoulCordImportPreview(drifted, normalizedCandidate);

        expect(collidingSummary.changes).toEqual(approved.changes);
        expect(collidingSummary.fingerprint).not.toBe(approved.fingerprint);
        expect(verifySoulCordImportAtApply(drifted, text, approved.fingerprint)).toBeUndefined();
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

    test("migrates schema v2 to v3 fail-closed without carrying stale Link Lens or Power Lab consent", () => {
        const document = normalizeSoulCordDocument({
            schemaVersion: 2,
            modules: {"link-lens": {enabled: true, values: {confirmAllExternal: true, removeTrackers: true}}},
            powerLab: {"voice-anchor": {enabled: true, acknowledgementVersion: 2, acknowledgedAt: 1}}
        });

        expect(document.schemaVersion).toBe(3);
        expect(document.consentVersion).toBe(2);
        expect(document.onboarding.status).toBe("pending");
        expect(document.modules["link-lens"].enabled).toBeFalse();
        expect(document.powerLab["voice-anchor"].enabled).toBeFalse();
        expect(document.migrationProvenance.at(-1)).toEqual(expect.objectContaining({fromSchema: 2, toSchema: 3}));
    });

    test("disables Power Lab entries unless their versioned acknowledgement is current", () => {
        const document = normalizeSoulCordDocument({
            schemaVersion: 3,
            powerLab: {
                "voice-anchor": {enabled: true, acknowledgementVersion: 1, acknowledgedAt: 1},
                "decor": {enabled: true, acknowledgementVersion: 2, acknowledgedAt: 2}
            }
        });

        expect(document.powerLab["voice-anchor"]).toEqual({enabled: false, acknowledgementVersion: 1, acknowledgedAt: 1});
        expect(document.powerLab.decor).toEqual({enabled: true, acknowledgementVersion: 2, acknowledgedAt: 2});
        expect(document.powerLab["fake-mute"]).toEqual({enabled: false, acknowledgementVersion: 0});
    });

    test("normalizes a setup draft to the 36 known addons and safe defaults", () => {
        const draft = normalizeSetupDraft({
            selectedTheme: "unknown",
            selectedAddons: ["DoNotTrack", "DoNotTrack", "not-real"],
            addonModes: {SplitLargeMessages: "native", DoNotTrack: "invalid"},
            timelinePolicy: {
                enabled: true,
                scope: "selected-channels",
                serverChannelIds: ["123", "123", "../bad"],
                retention: "90-days",
                content: "text-and-metadata",
                textBudgetBytes: 1,
                mediaBudgetBytes: 123
            }
        });

        expect(draft.selectedTheme).toBe("obsidian-thread");
        expect(draft.selectedAddons).toEqual(["DoNotTrack"]);
        expect(Object.keys(draft.addonModes)).toHaveLength(36);
        expect(draft.addonModes.SplitLargeMessages).toBe("native");
        expect(draft.addonModes.DoNotTrack).toBe("default");
        expect(draft.timelinePolicy).toEqual(expect.objectContaining({
            enabled: true,
            serverChannelIds: ["123"],
            textBudgetBytes: 262_144_000,
            mediaBudgetBytes: 1_073_741_824
        }));
    });

    test("previews staged setup intent while preserving skipped onboarding and current state", () => {
        const document = normalizeSoulCordDocument({schemaVersion: 3, onboarding: {status: "skipped", completedAt: 10}});
        const before = structuredClone(document);
        const noChangeDraft = {
            selectedTheme: document.selectedTheme,
            selectedAddons: Object.entries(document.curatedAddons).filter(([, state]) => state.selected).map(([name]) => name),
            addonModes: Object.fromEntries(Object.entries(document.curatedAddons).map(([name, state]) => [name, state.mode])),
            timelinePolicy: document.timelinePolicy
        };

        expect(document.onboarding).toEqual({version: 1, status: "skipped", completedAt: 10});
        const enablePreview = previewSetupChanges(document, noChangeDraft);
        expect(enablePreview).toHaveLength(36);
        expect(enablePreview.filter(change => change.endsWith(": stage, verify, and enable individually"))).toHaveLength(35);
        expect(enablePreview).toContain("SplitLargeMessages: enable SoulCord guarded preview adapter (no community file)");
        expect(document).toEqual(before);

        expect(previewSetupChanges(document, {...noChangeDraft, selectedTheme: "paper-signal", selectedAddons: []})).toContain("theme: obsidian-thread → paper-signal");
        expect(document).toEqual(before);
    });

    test("normalizes setup rollback journals and drops unknown addon/theme state", () => {
        const document = normalizeSoulCordDocument({
            schemaVersion: 3,
            setupTransactions: [{
                id: "setup-0123456789abcdef",
                at: 5,
                snapshotId: "before-setup",
                priorAddonStates: {DoNotTrack: true, UnknownPlugin: true, Translator: false},
                priorThemeStates: {"SoulCord-ObsidianThread.theme.css": true, "foreign.theme.css": true}
            }, {
                id: "path/traversal",
                snapshotId: "bad",
                priorAddonStates: {}
            }]
        });

        expect(document.setupTransactions).toEqual([{
            id: "setup-0123456789abcdef",
            at: 5,
            snapshotId: "before-setup",
            priorAddonStates: {DoNotTrack: true, Translator: false},
            priorThemeStates: {"SoulCord-ObsidianThread.theme.css": true}
        }]);
    });
});
