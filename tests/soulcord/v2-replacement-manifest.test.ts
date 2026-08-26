// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {findSoulCordV2Replacement, planSoulCordV2ProviderRetirement, SOULCORD_V2_REPLACEMENT_MANIFEST} from "../../src/common/soulcord/v2-replacement-manifest";

const EXPECTED_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
    "0BDFDB.plugin.js": [],
    "BetterAnimations.plugin.js": [],
    "BetterFriendList.plugin.js": ["BDFDB"],
    "BetterVolume.plugin.js": [],
    "CallTimeCounter.plugin.js": [],
    "CharCounter.plugin.js": ["BDFDB"],
    "CompleteTimestamps.plugin.js": ["BDFDB"],
    "DiscordEffects.plugin.js": [],
    "DoNotTrack.plugin.js": [],
    "DoubleClickToReply.plugin.js": [],
    "EditServers.plugin.js": ["BDFDB"],
    "FakeDeafen.plugin.js": [],
    "InvisibleTyping.plugin.js": [],
    "MessageLoggerV2.plugin.js": [],
    "MessagePeek.plugin.js": [],
    "PinDMs.plugin.js": ["BDFDB"],
    "ReadAllNotificationsButton.plugin.js": ["BDFDB"],
    "ServerDetails.plugin.js": ["BDFDB"],
    "ServerHider.plugin.js": ["BDFDB"],
    "ShowSpectators.plugin.js": [],
    "SplitLargeMessages.plugin.js": ["BDFDB"],
    "Translator.plugin.js": ["BDFDB"],
    "VoiceActivity.plugin.js": [],
    "VoiceMessages.plugin.js": []
};

describe("SoulCord V2 provider replacement manifest", () => {
    test("maps exactly the 24 visible community cards to exact filenames and reviewed dependencies", () => {
        expect(SOULCORD_V2_REPLACEMENT_MANIFEST.version).toBe(2);
        expect(SOULCORD_V2_REPLACEMENT_MANIFEST.entries).toHaveLength(24);
        expect(Object.fromEntries(SOULCORD_V2_REPLACEMENT_MANIFEST.entries.map(entry => [entry.fileName, entry.dependencies]))).toEqual(EXPECTED_DEPENDENCIES);
        expect(new Set(SOULCORD_V2_REPLACEMENT_MANIFEST.entries.map(entry => entry.fileName)).size).toBe(24);
        expect(SOULCORD_V2_REPLACEMENT_MANIFEST.entries.every(entry => entry.requiresHashBinding && entry.archiveScope === "source-file-only")).toBeTrue();
    });

    test("keeps private MessageLoggerV2 data explicitly untouched", () => {
        expect(findSoulCordV2Replacement("MessageLoggerV2.plugin.js")).toMatchObject({replacement: "message-timeline", privateData: "leave-untouched", archiveScope: "source-file-only"});
        expect(findSoulCordV2Replacement("messageloggerv2.plugin.js")?.cardName).toBe("MessageLoggerV2");
    });

    test("archives only ready replacements and always schedules BDFDB last", () => {
        const presentFiles = Object.keys(EXPECTED_DEPENDENCIES);
        const plan = planSoulCordV2ProviderRetirement({presentFiles, replacementReadyFiles: presentFiles});
        expect(plan.blockers).toEqual([]);
        expect(plan.steps).toHaveLength(24);
        expect(plan.steps.at(-1)).toMatchObject({fileName: "0BDFDB.plugin.js", action: "retire-bdfdb-after-all-consumers", order: 24});
        expect(plan.steps.find(step => step.fileName === "MessageLoggerV2.plugin.js")?.preservePrivateData).toBeTrue();
        expect(plan.steps.slice(0, -1).some(step => step.fileName === "0BDFDB.plugin.js")).toBeFalse();
    });

    test("holds BDFDB while a declared dependent replacement is not ready", () => {
        const plan = planSoulCordV2ProviderRetirement({
            presentFiles: ["0BDFDB.plugin.js", "Translator.plugin.js", "DoNotTrack.plugin.js"],
            replacementReadyFiles: ["0BDFDB.plugin.js", "DoNotTrack.plugin.js"]
        });
        expect(plan.steps.map(step => step.fileName)).toEqual(["DoNotTrack.plugin.js"]);
        expect(plan.blockers).toContainEqual({fileName: "Translator.plugin.js", reason: "replacement-not-ready"});
        expect(plan.blockers).toContainEqual({fileName: "0BDFDB.plugin.js", reason: "bdfdb-consumer-not-retired", consumers: ["Translator.plugin.js"]});
    });

    test("holds BDFDB for an external retained consumer even when all manifest consumers are ready", () => {
        const plan = planSoulCordV2ProviderRetirement({
            presentFiles: ["0BDFDB.plugin.js", "PinDMs.plugin.js"],
            replacementReadyFiles: ["0BDFDB.plugin.js", "PinDMs.plugin.js"],
            retainedBdfdbConsumers: ["OwnerCustomPlugin", "OwnerCustomPlugin"]
        });
        expect(plan.steps.map(step => step.fileName)).toEqual(["PinDMs.plugin.js"]);
        expect(plan.blockers).toContainEqual({fileName: "0BDFDB.plugin.js", reason: "unreviewed-bdfdb-consumer", consumers: ["OwnerCustomPlugin"]});
    });

    test("rejects path-shaped and unbounded retirement inputs", () => {
        expect(() => planSoulCordV2ProviderRetirement({presentFiles: ["..\\DoNotTrack.plugin.js"], replacementReadyFiles: []})).toThrow("invalid plugin filename");
        expect(() => planSoulCordV2ProviderRetirement({presentFiles: [], replacementReadyFiles: [], retainedBdfdbConsumers: Array.from({length: 129}, (_, index) => `Plugin${index}`)})).toThrow("too large");
    });
});
