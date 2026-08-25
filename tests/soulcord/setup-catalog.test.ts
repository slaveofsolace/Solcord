// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {SOULCORD_PRESET_ADDONS} from "../../src/betterdiscord/modules/soulcord/store";
import {recommendedSoulCordSetupAddons, resolveSoulCordSetupPlan} from "../../src/common/soulcord/setup-catalog";


const defaultModes = Object.fromEntries(SOULCORD_PRESET_ADDONS.map(name => [name, name === "SplitLargeMessages" ? "guarded" : "default"]));

describe("SoulCord beginner-first setup catalog", () => {
    test("recommends only accepted SoulCord built-ins", () => {
        expect(recommendedSoulCordSetupAddons()).toEqual([
            "DoNotTrack",
            "DoubleClickToReply",
            "InvisibleTyping"
        ]);
        const plan = resolveSoulCordSetupPlan(recommendedSoulCordSetupAddons(), defaultModes);
        expect(plan.executableAddons).toEqual(recommendedSoulCordSetupAddons());
        expect(plan.skipped).toEqual([]);
        expect(plan.decisions.filter(decision => decision.selected).every(decision => decision.availability === "built-in")).toBeTrue();
    });

    test("skips every selected unavailable community candidate without blocking the ready set", () => {
        const plan = resolveSoulCordSetupPlan(SOULCORD_PRESET_ADDONS, defaultModes);

        expect(plan.requestedAddons).toHaveLength(36);
        expect([...plan.executableAddons].sort()).toEqual(recommendedSoulCordSetupAddons().sort());
        expect(plan.skipped).toHaveLength(33);
        expect(plan.skipped.every(decision => decision.reason.length > 20 && (decision.statusLabel.includes("optional") || decision.statusLabel.includes("unavailable") || decision.statusLabel.includes("preview")))).toBeTrue();
        expect(plan.dependencyNames).toEqual([]);
    });

    test("keeps guarded splitting implemented but pending while its native community mode stays held", () => {
        const guarded = resolveSoulCordSetupPlan(["SplitLargeMessages"], defaultModes);
        const native = resolveSoulCordSetupPlan(["SplitLargeMessages"], {...defaultModes, SplitLargeMessages: "native"});

        expect(guarded.executableAddons).toEqual([]);
        expect(guarded.skipped[0]).toEqual(expect.objectContaining({
            name: "SplitLargeMessages",
            availability: "runtime-pending",
            statusLabel: "preview · SoulCord built-in",
            willApply: false
        }));
        expect(guarded.skipped[0].reason).toContain("modal/clipboard");
        expect(guarded.skipped[0].reason).toContain("Apply and verify will not enable it");
        expect(native.executableAddons).toEqual([]);
        expect(native.skipped[0]).toEqual(expect.objectContaining({name: "SplitLargeMessages", availability: "dependency-held"}));
        expect(native.skipped[0].reason).toContain("BDFDB");
    });

    test("makes rejected candidates explicit and ignores unknown input names", () => {
        const plan = resolveSoulCordSetupPlan(["Translator", "not-a-candidate"], defaultModes);

        expect(plan.requestedAddons).toEqual(["Translator"]);
        expect(plan.executableAddons).toEqual([]);
        expect(plan.skipped[0]).toEqual(expect.objectContaining({name: "Translator", availability: "rejected", statusLabel: "unavailable · rejected"}));
        expect(plan.skipped[0].reason).toContain("will not install or enable");
    });
});
