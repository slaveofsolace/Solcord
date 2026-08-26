// SPDX-License-Identifier: Apache-2.0

export type SolcordV2ReplacementTarget =
    | "dependency-retirement"
    | "privacy-controls"
    | "composer-toolkit"
    | "call-context"
    | "audio-console"
    | "voice-note-studio"
    | "translation-desk"
    | "people-and-spaces"
    | "channel-glance"
    | "notification-review"
    | "motion-studio"
    | "message-timeline"
    | "scoped-fake-deafen";

export interface SolcordV2ReplacementEntry {
    cardName: string;
    fileName: string;
    dependencies: readonly string[];
    replacement: SolcordV2ReplacementTarget;
    implementation: "existing-clean-room" | "new-clean-room" | "licensed-adaptation" | "dependency-only";
    privateData: "not-applicable" | "leave-untouched";
    archiveScope: "source-file-only";
    requiresHashBinding: true;
}

export interface SolcordV2ReplacementManifest {
    version: 2;
    entries: ReadonlyArray<Readonly<SolcordV2ReplacementEntry>>;
}

function entry(
    cardName: string,
    fileName: string,
    dependencies: readonly string[],
    replacement: SolcordV2ReplacementTarget,
    implementation: SolcordV2ReplacementEntry["implementation"],
    privateData: SolcordV2ReplacementEntry["privateData"] = "not-applicable"
): Readonly<SolcordV2ReplacementEntry> {
    return Object.freeze({cardName, fileName, dependencies: Object.freeze([...dependencies]), replacement, implementation, privateData, archiveScope: "source-file-only" as const, requiresHashBinding: true as const});
}

const ENTRIES: ReadonlyArray<Readonly<SolcordV2ReplacementEntry>> = [
    entry("BDFDB", "0BDFDB.plugin.js", [], "dependency-retirement", "dependency-only"),
    entry("BetterAnimations", "BetterAnimations.plugin.js", [], "motion-studio", "licensed-adaptation"),
    entry("BetterFriendList", "BetterFriendList.plugin.js", ["BDFDB"], "people-and-spaces", "new-clean-room"),
    entry("BetterVolume", "BetterVolume.plugin.js", [], "audio-console", "licensed-adaptation"),
    entry("CallTimeCounter", "CallTimeCounter.plugin.js", [], "call-context", "new-clean-room"),
    entry("CharCounter", "CharCounter.plugin.js", ["BDFDB"], "composer-toolkit", "new-clean-room"),
    entry("CompleteTimestamps", "CompleteTimestamps.plugin.js", ["BDFDB"], "composer-toolkit", "new-clean-room"),
    entry("DiscordEffects", "DiscordEffects.plugin.js", [], "motion-studio", "new-clean-room"),
    entry("DoNotTrack", "DoNotTrack.plugin.js", [], "privacy-controls", "existing-clean-room"),
    entry("DoubleClickToReply", "DoubleClickToReply.plugin.js", [], "composer-toolkit", "existing-clean-room"),
    entry("EditServers", "EditServers.plugin.js", ["BDFDB"], "people-and-spaces", "new-clean-room"),
    entry("FakeDeafen", "FakeDeafen.plugin.js", [], "scoped-fake-deafen", "existing-clean-room"),
    entry("InvisibleTyping", "InvisibleTyping.plugin.js", [], "privacy-controls", "existing-clean-room"),
    entry("MessageLoggerV2", "MessageLoggerV2.plugin.js", [], "message-timeline", "existing-clean-room", "leave-untouched"),
    entry("MessagePeek", "MessagePeek.plugin.js", [], "channel-glance", "new-clean-room"),
    entry("PinDMs", "PinDMs.plugin.js", ["BDFDB"], "people-and-spaces", "new-clean-room"),
    entry("ReadAllNotificationsButton", "ReadAllNotificationsButton.plugin.js", ["BDFDB"], "notification-review", "new-clean-room"),
    entry("ServerDetails", "ServerDetails.plugin.js", ["BDFDB"], "people-and-spaces", "new-clean-room"),
    entry("ServerHider", "ServerHider.plugin.js", ["BDFDB"], "people-and-spaces", "new-clean-room"),
    entry("ShowSpectators", "ShowSpectators.plugin.js", [], "call-context", "new-clean-room"),
    entry("SplitLargeMessages", "SplitLargeMessages.plugin.js", ["BDFDB"], "composer-toolkit", "existing-clean-room"),
    entry("Translator", "Translator.plugin.js", ["BDFDB"], "translation-desk", "new-clean-room"),
    entry("VoiceActivity", "VoiceActivity.plugin.js", [], "call-context", "licensed-adaptation"),
    entry("VoiceMessages", "VoiceMessages.plugin.js", [], "voice-note-studio", "new-clean-room")
];

export const SOLCORD_V2_REPLACEMENT_MANIFEST: SolcordV2ReplacementManifest = Object.freeze({version: 2 as const, entries: Object.freeze(ENTRIES)});

export interface SolcordV2RetirementInput {
    presentFiles: readonly string[];
    replacementReadyFiles: readonly string[];
    retainedBdfdbConsumers?: readonly string[];
}

export interface SolcordV2RetirementStep {
    order: number;
    fileName: string;
    cardName: string;
    replacement: SolcordV2ReplacementTarget;
    action: "archive-source-after-hash-and-health-check" | "retire-bdfdb-after-all-consumers";
    preservePrivateData: boolean;
}

export interface SolcordV2RetirementBlocker {
    fileName: string;
    reason: "replacement-not-ready" | "bdfdb-consumer-not-retired" | "unreviewed-bdfdb-consumer";
    consumers?: readonly string[];
}

export interface SolcordV2RetirementPlan {
    version: 2;
    steps: ReadonlyArray<Readonly<SolcordV2RetirementStep>>;
    blockers: ReadonlyArray<Readonly<SolcordV2RetirementBlocker>>;
}

function hasControlCharacter(value: string): boolean {
    return [...value].some(character => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
    });
}

function validateFileList(values: readonly string[], label: string): Set<string> {
    if (!Array.isArray(values) || values.length > 256) throw new Error(`${label} is too large.`);
    const normalized = new Set<string>();
    for (const value of values) {
        if (typeof value !== "string" || value.length < 1 || value.length > 220 || !value.endsWith(".plugin.js") || /[\\/]/.test(value) || hasControlCharacter(value)) {
            throw new Error(`${label} contains an invalid plugin filename.`);
        }
        normalized.add(value.toLowerCase());
    }
    return normalized;
}

function validateConsumerList(values: readonly string[]): readonly string[] {
    if (!Array.isArray(values) || values.length > 128) throw new Error("The retained BDFDB consumer list is too large.");
    return Object.freeze([...new Set(values.map(value => {
        if (typeof value !== "string" || value.length < 1 || value.length > 120 || hasControlCharacter(value)) throw new Error("A retained BDFDB consumer is invalid.");
        return value;
    }))].sort((left, right) => left.localeCompare(right, "en-US")));
}

export function findSolcordV2Replacement(fileName: string): Readonly<SolcordV2ReplacementEntry> | undefined {
    if (typeof fileName !== "string") return;
    const normalized = fileName.toLowerCase();
    return SOLCORD_V2_REPLACEMENT_MANIFEST.entries.find(candidate => candidate.fileName.toLowerCase() === normalized);
}

export function planSolcordV2ProviderRetirement(input: SolcordV2RetirementInput): SolcordV2RetirementPlan {
    const present = validateFileList(input.presentFiles, "Present files");
    const ready = validateFileList(input.replacementReadyFiles, "Replacement-ready files");
    const externalConsumers = validateConsumerList(input.retainedBdfdbConsumers ?? []);
    const dependency = findSolcordV2Replacement("0BDFDB.plugin.js")!;
    const steps: SolcordV2RetirementStep[] = [];
    const blockers: SolcordV2RetirementBlocker[] = [];

    const presentFeatures = SOLCORD_V2_REPLACEMENT_MANIFEST.entries
        .filter(candidate => candidate.fileName !== dependency.fileName && present.has(candidate.fileName.toLowerCase()))
        .sort((left, right) => left.fileName.localeCompare(right.fileName, "en-US"));

    for (const candidate of presentFeatures) {
        if (!ready.has(candidate.fileName.toLowerCase())) {
            blockers.push(Object.freeze({fileName: candidate.fileName, reason: "replacement-not-ready" as const}));
            continue;
        }
        steps.push({order: steps.length + 1, fileName: candidate.fileName, cardName: candidate.cardName, replacement: candidate.replacement, action: "archive-source-after-hash-and-health-check", preservePrivateData: candidate.privateData === "leave-untouched"});
    }

    if (present.has(dependency.fileName.toLowerCase())) {
        const blockedManifestConsumers = presentFeatures
            .filter(candidate => candidate.dependencies.includes("BDFDB") && !ready.has(candidate.fileName.toLowerCase()))
            .map(candidate => candidate.fileName);
        if (blockedManifestConsumers.length) {
            blockers.push(Object.freeze({fileName: dependency.fileName, reason: "bdfdb-consumer-not-retired" as const, consumers: Object.freeze(blockedManifestConsumers)}));
        }
        else if (externalConsumers.length) {
            blockers.push(Object.freeze({fileName: dependency.fileName, reason: "unreviewed-bdfdb-consumer" as const, consumers: externalConsumers}));
        }
        else if (!ready.has(dependency.fileName.toLowerCase())) {
            blockers.push(Object.freeze({fileName: dependency.fileName, reason: "replacement-not-ready" as const}));
        }
        else {
            steps.push({order: steps.length + 1, fileName: dependency.fileName, cardName: dependency.cardName, replacement: dependency.replacement, action: "retire-bdfdb-after-all-consumers", preservePrivateData: false});
        }
    }

    return Object.freeze({
        version: 2 as const,
        steps: Object.freeze(steps.map((step, index) => Object.freeze({...step, order: index + 1}))),
        blockers: Object.freeze(blockers)
    });
}
