// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {canonicalizeSolcordProviderMigrationPlan, captureExactAddonStates, communityAddonIsEnabled, createSolcordProviderMigrationPlan, isSolcordBuiltInAddon, resolveCommunityAddon, solcordProviderMigrationPlansMatch, solcordProviderReplacementIsReady, SOLCORD_CLEAN_ROOM_BUILTIN_ADDONS} from "../../src/common/solcord/builtin-addons";


describe("Solcord clean-room curated built-ins", () => {
    test("recognizes the V2 native provider set and keeps native multi-send excluded", () => {
        expect(SOLCORD_CLEAN_ROOM_BUILTIN_ADDONS).toContain("DoNotTrack");
        expect(SOLCORD_CLEAN_ROOM_BUILTIN_ADDONS).toContain("VoiceMessages");
        expect(SOLCORD_CLEAN_ROOM_BUILTIN_ADDONS).toContain("Translator");
        expect(SOLCORD_CLEAN_ROOM_BUILTIN_ADDONS).toContain("ReadAllNotificationsButton");
        expect(isSolcordBuiltInAddon("DoNotTrack", "default")).toBeTrue();
        expect(isSolcordBuiltInAddon("DoubleClickToReply", "default")).toBeTrue();
        expect(isSolcordBuiltInAddon("InvisibleTyping", "default")).toBeTrue();
        expect(isSolcordBuiltInAddon("SplitLargeMessages", "guarded")).toBeTrue();
        expect(isSolcordBuiltInAddon("SplitLargeMessages", "native")).toBeFalse();
    });

    test("finds an enabled community counterpart by addon id when its file was renamed", () => {
        const manager = {
            addonList: [{filename: "owner-renamed.plugin.js"}, {filename: "Other.plugin.js"}],
            resolveAddon(value: string) {
                return value === "DoNotTrack" ? {id: "DoNotTrack", filename: "owner-renamed.plugin.js"} : undefined;
            },
            isEnabled(value: string) {
                return value === "owner-renamed.plugin.js";
            }
        };

        expect(communityAddonIsEnabled(manager, "DoNotTrack", "DoNotTrack.plugin.js")).toBeTrue();
        expect(communityAddonIsEnabled(manager, "InvisibleTyping", "InvisibleTyping.plugin.js")).toBeFalse();
        expect(resolveCommunityAddon(manager, "DoNotTrack", "DoNotTrack.plugin.js")?.filename).toBe("owner-renamed.plugin.js");
        expect(captureExactAddonStates(manager)).toEqual({"owner-renamed.plugin.js": true, "Other.plugin.js": false});
    });

    test("rejects a provider plan when confirmed A is replaced by B before execution", () => {
        let resolvedFileName = "A.plugin.js";
        const enabled = new Set([resolvedFileName]);
        const disabled: string[] = [];
        const manager = {
            addonList: [{filename: "A.plugin.js"}, {filename: "B.plugin.js"}],
            resolveAddon(value: string) {
                return value === "DoNotTrack.plugin.js" || value === "DoNotTrack" ? {id: "DoNotTrack", filename: resolvedFileName} : undefined;
            },
            isEnabled(value: string) {return enabled.has(value);},
            disableAddon(value: string) {disabled.push(value); enabled.delete(value);}
        };
        const selection = {
            selectedAddons: ["DoNotTrack"],
            addonModes: {DoNotTrack: "default"},
            addonProviders: {DoNotTrack: "prefer-solcord"}
        };
        const candidates = [{name: "DoNotTrack", fileName: "DoNotTrack.plugin.js"}];
        const confirmed = createSolcordProviderMigrationPlan(manager, candidates, selection)!;

        enabled.delete("A.plugin.js");
        enabled.add("B.plugin.js");
        resolvedFileName = "B.plugin.js";
        const current = createSolcordProviderMigrationPlan(manager, candidates, selection)!;
        if (solcordProviderMigrationPlansMatch(confirmed, current)) {
            for (const entry of confirmed.entries) manager.disableAddon(entry.fileName);
        }

        expect(confirmed.entries[0].fileName).toBe("A.plugin.js");
        expect(current.entries[0].fileName).toBe("B.plugin.js");
        expect(solcordProviderMigrationPlansMatch(confirmed, current)).toBeFalse();
        expect(disabled).toEqual([]);
        expect(enabled.has("B.plugin.js")).toBeTrue();
    });

    test("accepts an unchanged exact provider plan and its exact state journal restores it", () => {
        const enabled = new Set(["A.plugin.js"]);
        const manager = {
            addonList: [{filename: "A.plugin.js"}, {filename: "Other.plugin.js"}],
            resolveAddon(value: string) {
                return value === "DoNotTrack.plugin.js" || value === "DoNotTrack" ? {id: "DoNotTrack", filename: "A.plugin.js"} : undefined;
            },
            isEnabled(value: string) {return enabled.has(value);}
        };
        const selection = {
            selectedAddons: ["DoNotTrack"],
            addonModes: {DoNotTrack: "default"},
            addonProviders: {DoNotTrack: "prefer-solcord"}
        };
        const candidates = [{name: "DoNotTrack", fileName: "DoNotTrack.plugin.js"}];
        const confirmed = createSolcordProviderMigrationPlan(manager, candidates, selection)!;
        const priorStates = captureExactAddonStates(manager);
        const current = createSolcordProviderMigrationPlan(manager, candidates, selection)!;

        expect(solcordProviderMigrationPlansMatch(confirmed, current)).toBeTrue();
        for (const entry of confirmed.entries) enabled.delete(entry.fileName);
        expect(enabled.has("A.plugin.js")).toBeFalse();
        for (const [fileName, shouldEnable] of Object.entries(priorStates)) {
            if (shouldEnable) enabled.add(fileName);
            else enabled.delete(fileName);
        }
        expect(enabled.has("A.plugin.js")).toBeTrue();
        expect(enabled.has("Other.plugin.js")).toBeFalse();
    });

    test("captures installed disabled providers so setup can archive duplicate cards after parity", () => {
        const manager = {
            addonList: [{filename: "DoNotTrack.plugin.js"}],
            resolveAddon(value: string) {
                return value === "DoNotTrack.plugin.js" || value === "DoNotTrack" ? {id: "DoNotTrack", filename: "DoNotTrack.plugin.js"} : undefined;
            },
            // AddonManager returns undefined for an installed addon that has no
            // saved enabled-state entry yet. That is still an exact disabled
            // state and must not make the provider seal invalid.
            isEnabled() {return undefined;}
        };
        const plan = createSolcordProviderMigrationPlan(manager, [{name: "DoNotTrack", fileName: "DoNotTrack.plugin.js"}], {
            selectedAddons: ["DoNotTrack"],
            addonModes: {DoNotTrack: "default"},
            addonProviders: {DoNotTrack: "prefer-solcord"}
        });

        expect(plan?.entries).toEqual([{name: "DoNotTrack", fileName: "DoNotTrack.plugin.js", enabled: false, provider: "prefer-solcord"}]);
        expect(captureExactAddonStates(manager)).toEqual({"DoNotTrack.plugin.js": false});
    });

    test("seals a disabled MessageLoggerV2 source for source-only retirement without enabling Timeline", () => {
        const manager = {
            addonList: [{filename: "MessageLoggerV2.plugin.js"}],
            resolveAddon(value: string) {
                return value === "MessageLoggerV2.plugin.js" || value === "MessageLoggerV2" ? {id: "MessageLoggerV2", filename: "MessageLoggerV2.plugin.js"} : undefined;
            },
            isEnabled() {return false;}
        };
        const plan = createSolcordProviderMigrationPlan(manager, [], {selectedAddons: [], addonModes: {}, addonProviders: {}, timelinePolicy: {enabled: false}});

        expect(plan?.entries).toEqual([{name: "MessageLoggerV2", fileName: "MessageLoggerV2.plugin.js", enabled: false, provider: "prefer-solcord"}]);
    });

    test("preserves an active MessageLoggerV2 provider unless Timeline was explicitly selected", () => {
        const manager = {
            addonList: [{filename: "MessageLoggerV2.plugin.js"}],
            resolveAddon(value: string) {
                return value === "MessageLoggerV2.plugin.js" || value === "MessageLoggerV2" ? {id: "MessageLoggerV2", filename: "MessageLoggerV2.plugin.js"} : undefined;
            },
            isEnabled() {return true;}
        };
        const held = createSolcordProviderMigrationPlan(manager, [], {selectedAddons: [], addonModes: {}, addonProviders: {}, timelinePolicy: {enabled: false}});
        const consented = createSolcordProviderMigrationPlan(manager, [], {selectedAddons: [], addonModes: {}, addonProviders: {}, timelinePolicy: {enabled: true}});

        expect(held?.entries).toEqual([]);
        expect(consented?.entries).toEqual([{name: "MessageLoggerV2", fileName: "MessageLoggerV2.plugin.js", enabled: true, provider: "prefer-solcord"}]);
    });

    test("requires a live Timeline adapter before retiring an active logger", () => {
        const disabledLogger = {name: "MessageLoggerV2", fileName: "MessageLoggerV2.plugin.js", enabled: false, provider: "prefer-solcord" as const};
        const activeLogger = {...disabledLogger, enabled: true};
        const ordinaryProvider = {name: "DoNotTrack", fileName: "DoNotTrack.plugin.js", enabled: true, provider: "prefer-solcord" as const};

        expect(solcordProviderReplacementIsReady(disabledLogger, undefined, false, false)).toBeTrue();
        expect(solcordProviderReplacementIsReady(activeLogger, undefined, true, false)).toBeFalse();
        expect(solcordProviderReplacementIsReady(activeLogger, undefined, true, true)).toBeTrue();
        expect(solcordProviderReplacementIsReady(ordinaryProvider, {enabled: true, provider: "solcord"}, false, false)).toBeTrue();
        expect(solcordProviderReplacementIsReady(ordinaryProvider, {enabled: true, provider: "community"}, false, false)).toBeFalse();
    });

    test("canonicalizes a bounded exact plan and rejects path-shaped identities", () => {
        const plan = canonicalizeSolcordProviderMigrationPlan({
            version: 1,
            entries: [{name: "DoNotTrack", fileName: "A.plugin.js", enabled: true, provider: "prefer-solcord"}]
        });
        expect(plan?.entries).toEqual([{name: "DoNotTrack", fileName: "A.plugin.js", enabled: true, provider: "prefer-solcord"}]);
        expect(Object.isFrozen(plan)).toBeTrue();
        expect(Object.isFrozen(plan?.entries)).toBeTrue();
        expect(canonicalizeSolcordProviderMigrationPlan({
            version: 1,
            entries: [{name: "DoNotTrack", fileName: "..\\A.plugin.js", enabled: true, provider: "prefer-solcord"}]
        })).toBeUndefined();
        expect(canonicalizeSolcordProviderMigrationPlan({
            version: 1,
            entries: [{name: "DoNotTrack", fileName: "A.plugin.js", enabled: "false", provider: "prefer-solcord"}]
        })).toBeUndefined();
    });
});
