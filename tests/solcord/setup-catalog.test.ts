// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {SOLCORD_PRESET_ADDONS} from "../../src/betterdiscord/modules/solcord/store";
import {recommendedSolcordSetupAddons, resolveSolcordSetupPlan} from "../../src/common/solcord/setup-catalog";


const defaultModes = Object.fromEntries(SOLCORD_PRESET_ADDONS.map(name => [name, name === "SplitLargeMessages" ? "guarded" : "default"]));
const expectedBuiltIns = [
    "BetterAnimations", "BetterFriendList", "BetterVolume", "CallTimeCounter", "CharCounter", "CompleteTimestamps", "DiscordEffects",
    "DoNotTrack", "DoubleClickToReply", "EditServers", "InvisibleTyping", "MessagePeek", "PinDMs", "ReadAllNotificationsButton",
    "ServerDetails", "ServerHider", "ShowSpectators", "SplitLargeMessages", "Translator", "VoiceActivity", "VoiceMessages"
];
const expectedRecommended = ["DoNotTrack", "InvisibleTyping", "DoubleClickToReply"];

describe("Solcord beginner-first setup catalog", () => {
    test("recommends only accepted Solcord built-ins", () => {
        expect(recommendedSolcordSetupAddons()).toEqual(expectedRecommended);
        const plan = resolveSolcordSetupPlan(recommendedSolcordSetupAddons(), defaultModes);
        expect(plan.executableAddons).toEqual(recommendedSolcordSetupAddons());
        expect(plan.skipped).toEqual([]);
        expect(plan.decisions.filter(decision => decision.selected).every(decision => decision.availability === "built-in")).toBeTrue();
        expect(plan.decisions.filter(decision => decision.selected).every(decision => decision.statusLabel === "included · checked at startup")).toBeTrue();
        expect(plan.decisions.filter(decision => decision.selected).every(decision => !decision.statusLabel.toLowerCase().includes("ready"))).toBeTrue();
    });

    test("skips every selected unavailable community candidate without blocking the ready set", () => {
        const plan = resolveSolcordSetupPlan(SOLCORD_PRESET_ADDONS, defaultModes);

        expect(plan.requestedAddons).toHaveLength(36);
        expect([...plan.executableAddons].sort()).toEqual(expectedBuiltIns.sort());
        expect(plan.skipped).toHaveLength(SOLCORD_PRESET_ADDONS.length - expectedBuiltIns.length);
        expect(plan.skipped.every(decision => decision.reason.length > 20 && (decision.statusLabel.includes("optional") || decision.statusLabel.includes("unavailable") || decision.statusLabel.includes("preview")))).toBeTrue();
        expect(plan.dependencyNames).toEqual([]);
    });

    test("keeps guarded splitting built in while its native community mode stays held", () => {
        const guarded = resolveSolcordSetupPlan(["SplitLargeMessages"], defaultModes);
        const native = resolveSolcordSetupPlan(["SplitLargeMessages"], {...defaultModes, SplitLargeMessages: "native"});

        expect(guarded.executableAddons).toEqual(["SplitLargeMessages"]);
        expect(guarded.skipped).toEqual([]);
        expect(native.executableAddons).toEqual([]);
        expect(native.skipped[0]).toEqual(expect.objectContaining({name: "SplitLargeMessages", availability: "dependency-held"}));
        expect(native.skipped[0].reason).toContain("BDFDB");
    });

    test("uses the clean-room Translation Desk and ignores unknown input names", () => {
        const plan = resolveSolcordSetupPlan(["Translator", "not-a-candidate"], defaultModes);

        expect(plan.requestedAddons).toEqual(["Translator"]);
        expect(plan.executableAddons).toEqual(["Translator"]);
        expect(plan.skipped).toEqual([]);
    });
});
