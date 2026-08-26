// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {
    expandedSolcordPermissions,
    inferSolcordPermissionCard,
    normalizeSolcordProductPreferences,
    prioritizeSolcordPulse,
    SOLCORD_SETUP_STEPS,
    SOLCORD_WORKSPACES
} from "../../src/common/solcord/product";

describe("Solcord V1 product model", () => {
    test("owns exactly five stable Control Center workspaces and eight resumable setup steps", () => {
        expect(SOLCORD_WORKSPACES.map(workspace => workspace.id)).toEqual(["home", "appearance", "safety", "people", "tools"]);
        expect(SOLCORD_SETUP_STEPS).toEqual(["Welcome", "Preflight", "Preset", "Appearance", "Safety", "Private history", "Review", "Apply"]);
    });

    test("normalizes hostile or obsolete preferences to conservative local defaults", () => {
        const normalized = normalizeSolcordProductPreferences({
            appearance: {mode: "remote-theme", accent: "crypto", density: "tiny", motion: "forced", messageShape: "bubbles"},
            safety: {linkLens: "yes", domainMemory: "auto-open", attachmentGuard: 1, privacyModeReady: null},
            friendWatch: {enabled: "yes", retentionDays: 3650, includeDisplaySnapshot: 0, digest: "cloud"},
            returnLaterRetentionDays: -1
        });

        expect(normalized.appearance).toEqual({mode: "follow-discord", accent: "glacier", density: "comfortable", motion: "follow-system", messageShape: "discord"});
        expect(normalized.safety).toEqual({linkLens: true, domainMemory: "warn-only", attachmentGuard: true, privacyModeReady: true});
        expect(normalized.friendWatch).toEqual({enabled: false, retentionDays: 30, includeDisplaySnapshot: true, digest: "daily"});
        expect(normalized.returnLaterRetentionDays).toBe(30);
    });

    test("keeps Session Pulse bounded, unique, deterministic, and priority ordered", () => {
        const signals = prioritizeSolcordPulse([
            {id: "healthy", priority: 1, tone: "ok", label: "healthy", detail: "ok"},
            {id: "recovery", priority: 130, tone: "danger", label: "recovery", detail: "held"},
            {id: "addons", priority: 90.4, tone: "danger", label: "addons", detail: "held"},
            {id: "drift", priority: 80, tone: "attention", label: "drift", detail: "held"},
            {id: "addons", priority: 99, tone: "danger", label: "duplicate", detail: "ignored"}
        ]);

        expect(signals.map(signal => [signal.id, signal.priority])).toEqual([["recovery", 100], ["addons", 90], ["drift", 80]]);
    });

    test("requires re-review only for newly expanded capabilities", () => {
        const baseline = {network: false, filesystem: true, patching: false, messageAccess: "metadata" as const, accountContext: false, localStorage: true};
        const expanded = {...baseline, network: true, patching: true, messageAccess: "content" as const};
        expect(expandedSolcordPermissions(baseline, expanded)).toEqual(["network", "patching", "messageAccess:content"]);
        expect(expandedSolcordPermissions(expanded, baseline)).toEqual([]);
    });

    test("turns reviewed catalog signals into conservative display-only permission cards", () => {
        expect(inferSolcordPermissionCard({
            networkBehavior: ["no-static-network-signal"],
            accountActions: ["message-send-path"],
            cleanupBehavior: {resources: ["patcher"], cleanup: ["settings"]},
            tags: ["chat"]
        })).toEqual({network: false, filesystem: false, patching: true, messageAccess: "content", accountContext: true, localStorage: true});
        expect(inferSolcordPermissionCard({networkBehavior: ["CODE_REVIEW_REQUIRED"], accountActions: ["CODE_REVIEW_REQUIRED"], cleanupBehavior: "RUNTIME_REVIEW_REQUIRED", tags: []})).toMatchObject({network: true, patching: true, accountContext: true});
    });
});
