// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {canonicalizeSoulCordProviderMigrationPlan, captureExactAddonStates, communityAddonIsEnabled, createSoulCordProviderMigrationPlan, isSoulCordBuiltInAddon, resolveCommunityAddon, soulCordProviderMigrationPlansMatch, SOULCORD_CLEAN_ROOM_BUILTIN_ADDONS} from "../../src/common/soulcord/builtin-addons";


describe("SoulCord clean-room curated built-ins", () => {
    test("recognizes only the three live interaction adapters and guarded splitting", () => {
        expect(SOULCORD_CLEAN_ROOM_BUILTIN_ADDONS).toEqual(["DoNotTrack", "DoubleClickToReply", "InvisibleTyping"]);
        expect(isSoulCordBuiltInAddon("DoNotTrack", "default")).toBeTrue();
        expect(isSoulCordBuiltInAddon("DoubleClickToReply", "default")).toBeTrue();
        expect(isSoulCordBuiltInAddon("InvisibleTyping", "default")).toBeTrue();
        expect(isSoulCordBuiltInAddon("SplitLargeMessages", "guarded")).toBeTrue();
        expect(isSoulCordBuiltInAddon("SplitLargeMessages", "native")).toBeFalse();
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
            addonProviders: {DoNotTrack: "prefer-soulcord"}
        };
        const candidates = [{name: "DoNotTrack", fileName: "DoNotTrack.plugin.js"}];
        const confirmed = createSoulCordProviderMigrationPlan(manager, candidates, selection)!;

        enabled.delete("A.plugin.js");
        enabled.add("B.plugin.js");
        resolvedFileName = "B.plugin.js";
        const current = createSoulCordProviderMigrationPlan(manager, candidates, selection)!;
        if (soulCordProviderMigrationPlansMatch(confirmed, current)) {
            for (const entry of confirmed.entries) manager.disableAddon(entry.fileName);
        }

        expect(confirmed.entries[0].fileName).toBe("A.plugin.js");
        expect(current.entries[0].fileName).toBe("B.plugin.js");
        expect(soulCordProviderMigrationPlansMatch(confirmed, current)).toBeFalse();
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
            addonProviders: {DoNotTrack: "prefer-soulcord"}
        };
        const candidates = [{name: "DoNotTrack", fileName: "DoNotTrack.plugin.js"}];
        const confirmed = createSoulCordProviderMigrationPlan(manager, candidates, selection)!;
        const priorStates = captureExactAddonStates(manager);
        const current = createSoulCordProviderMigrationPlan(manager, candidates, selection)!;

        expect(soulCordProviderMigrationPlansMatch(confirmed, current)).toBeTrue();
        for (const entry of confirmed.entries) enabled.delete(entry.fileName);
        expect(enabled.has("A.plugin.js")).toBeFalse();
        for (const [fileName, shouldEnable] of Object.entries(priorStates)) {
            if (shouldEnable) enabled.add(fileName);
            else enabled.delete(fileName);
        }
        expect(enabled.has("A.plugin.js")).toBeTrue();
        expect(enabled.has("Other.plugin.js")).toBeFalse();
    });

    test("canonicalizes a bounded exact plan and rejects path-shaped identities", () => {
        const plan = canonicalizeSoulCordProviderMigrationPlan({
            version: 1,
            entries: [{name: "DoNotTrack", fileName: "A.plugin.js", enabled: true, provider: "prefer-soulcord"}]
        });
        expect(plan?.entries).toEqual([{name: "DoNotTrack", fileName: "A.plugin.js", enabled: true, provider: "prefer-soulcord"}]);
        expect(Object.isFrozen(plan)).toBeTrue();
        expect(Object.isFrozen(plan?.entries)).toBeTrue();
        expect(canonicalizeSoulCordProviderMigrationPlan({
            version: 1,
            entries: [{name: "DoNotTrack", fileName: "..\\A.plugin.js", enabled: true, provider: "prefer-soulcord"}]
        })).toBeUndefined();
    });
});
