// SPDX-License-Identifier: Apache-2.0

import {SOULCORD_RUNTIME_ADDONS, SOULCORD_RUNTIME_DEPENDENCIES} from "./addon-catalog.generated";
import {isSoulCordBuiltInAddon, SOULCORD_CLEAN_ROOM_BUILTIN_ADDONS} from "./builtin-addons";


export type SoulCordSetupAvailability = "built-in" | "accepted" | "runtime-pending" | "action-gated" | "dependency-held" | "held" | "rejected";

export interface SoulCordSetupCandidateDecision {
    name: string;
    fileName: string;
    selected: boolean;
    willApply: boolean;
    availability: SoulCordSetupAvailability;
    statusLabel: string;
    reason: string;
    dependencies: readonly string[];
    conflicts: readonly string[];
    sizeBytes: number;
}

export interface SoulCordSetupPlan {
    requestedAddons: string[];
    executableAddons: string[];
    decisions: SoulCordSetupCandidateDecision[];
    skipped: SoulCordSetupCandidateDecision[];
    dependencyNames: string[];
}

export const SOULCORD_RECOMMENDED_SETUP_ADDONS = Object.freeze([
    ...SOULCORD_CLEAN_ROOM_BUILTIN_ADDONS
] as const);

const REVIEW_FLAG_LABELS: Readonly<Record<string, string>> = Object.freeze({
    ACTION_REQUIRED_TO_TEST: "an action-time acceptance test is still required",
    BDFDB_DEPENDENCY_HOLD: "the BDFDB dependency remains held",
    DEEP_STATIC_PASS_RUNTIME_REQUIRED: "disposable runtime acceptance is still pending",
    MULTI_SEND_ACTION_GATE: "multi-send behavior still needs an action-gated test",
    SOULCORD_GUARDED_MODE_AVAILABLE_WITHOUT_FILE: "SoulCord's guarded mode is available without this community file",
    TYPING_STATE_ACTION_REQUIRES_CONFIRMATION: "typing-state behavior still needs an explicit acceptance test"
});

function flagLabel(value: string): string {
    return REVIEW_FLAG_LABELS[value] ?? value.toLocaleLowerCase("en-US").replaceAll("_", " ");
}

function reviewFlags(candidate: (typeof SOULCORD_RUNTIME_ADDONS)[number]): string {
    const flags = candidate.securityReasonCodes.map(flagLabel);
    return flags.length ? ` Review flags: ${flags.join("; ")}.` : "";
}

function decisionFor(candidate: (typeof SOULCORD_RUNTIME_ADDONS)[number], selected: boolean, mode: string | undefined): SoulCordSetupCandidateDecision {
    const builtIn = isSoulCordBuiltInAddon(candidate.name, mode);
    const guardedSplitterPreview = candidate.name === "SplitLargeMessages" && mode === "guarded";
    const heldDependencies = candidate.dependencies.filter(name => {
        const dependency = SOULCORD_RUNTIME_DEPENDENCIES.find(entry => entry.name === name) as {installable?: boolean;} | undefined;
        return dependency?.installable !== true;
    });
    let availability: SoulCordSetupAvailability;
    let statusLabel: string;
    let reason: string;

    if (guardedSplitterPreview) {
        availability = "runtime-pending";
        statusLabel = "preview · SoulCord built-in";
        reason = "The guarded modal/clipboard adapter is implemented without a community file, but disposable Discord acceptance is still pending. Finish will not enable it.";
    }
    else if (builtIn) {
        availability = "built-in";
        statusLabel = "ready · SoulCord built-in";
        reason = "Included in SoulCord; no community file or external dependency is installed.";
    }
    else if (candidate.installable && heldDependencies.length === 0) {
        availability = "accepted";
        statusLabel = "ready · reviewed community addon";
        reason = "Pinned bytes and the complete dependency set passed static and disposable runtime review.";
    }
    else if (candidate.securityDisposition === "REJECT") {
        availability = "rejected";
        statusLabel = "unavailable · rejected";
        reason = `Security review rejected this candidate; SoulCord will not install or enable it.${reviewFlags(candidate)}`;
    }
    else if (heldDependencies.length) {
        availability = "dependency-held";
        statusLabel = "optional · dependency held";
        reason = `Skipped until ${heldDependencies.join(", ")} ${heldDependencies.length === 1 ? "passes" : "pass"} review.${reviewFlags(candidate)}`;
    }
    else if (candidate.securityDisposition === "ACTION_GATED_TEST") {
        availability = "action-gated";
        statusLabel = "optional · action gate pending";
        reason = `Not installed yet because its acceptance test requires a deliberate account-visible action.${reviewFlags(candidate)}`;
    }
    else if (candidate.securityDisposition === "SAFE_TO_RUNTIME_TEST") {
        availability = "runtime-pending";
        statusLabel = "optional · runtime pending";
        reason = `Static review passed, but isolated Discord runtime acceptance is still pending.${reviewFlags(candidate)}`;
    }
    else {
        availability = "held";
        statusLabel = "optional · held for review";
        reason = `Not installed until its security, licensing, teardown, network, and behavior checks pass.${reviewFlags(candidate)}`;
    }

    return {
        name: candidate.name,
        fileName: candidate.fileName,
        selected,
        willApply: selected && (availability === "built-in" || availability === "accepted"),
        availability,
        statusLabel,
        reason,
        dependencies: candidate.dependencies,
        conflicts: candidate.conflicts,
        sizeBytes: candidate.sizeBytes
    };
}

export function recommendedSoulCordSetupAddons(): string[] {
    return [...SOULCORD_RECOMMENDED_SETUP_ADDONS];
}

export function resolveSoulCordSetupPlan(selectedAddons: readonly string[], addonModes: Readonly<Record<string, string | undefined>>): SoulCordSetupPlan {
    const requested = new Set(selectedAddons);
    const decisions = SOULCORD_RUNTIME_ADDONS.map(candidate => decisionFor(candidate, requested.has(candidate.name), addonModes[candidate.name]));
    const decisionsByName = new Map(decisions.map(decision => [decision.name, decision]));
    const requestedAddons = [...new Set(selectedAddons)].filter(name => decisionsByName.has(name));
    const executableAddons = requestedAddons.filter(name => decisionsByName.get(name)?.willApply === true);
    const executableCommunity = decisions.filter(decision => decision.willApply && decision.availability === "accepted");
    const dependencyNames = [...new Set(executableCommunity.flatMap(decision => [...decision.dependencies]))];
    return {
        requestedAddons,
        executableAddons,
        decisions,
        skipped: requestedAddons.flatMap(name => {
            const decision = decisionsByName.get(name);
            return decision && !decision.willApply ? [decision] : [];
        }),
        dependencyNames
    };
}
