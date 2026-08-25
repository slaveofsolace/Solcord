// SPDX-License-Identifier: Apache-2.0

export type SoulCordWorkspaceId = "home" | "appearance" | "safety" | "people" | "tools";
export type SoulCordVisualMode = "follow-discord" | "soul-dark" | "soul-light" | "oled";
export type SoulCordAccent = "system" | "glacier" | "signal" | "coral" | "forest";
export type SoulCordDensity = "comfortable" | "compact";
export type SoulCordMotion = "follow-system" | "full" | "reduced";
export type SoulCordMessageShape = "discord" | "seamed";
export type SoulCordSetupPreset = "recommended" | "minimal" | "power-user";

export interface SoulCordAppearancePreferences {
    mode: SoulCordVisualMode;
    accent: SoulCordAccent;
    density: SoulCordDensity;
    motion: SoulCordMotion;
    messageShape: SoulCordMessageShape;
}

export interface SoulCordSafetyPreferences {
    linkLens: boolean;
    domainMemory: "off" | "warn-only";
    attachmentGuard: boolean;
    privacyModeReady: boolean;
}

export interface SoulCordFriendWatchPolicy {
    enabled: boolean;
    retentionDays: 7 | 30 | 90;
    includeDisplaySnapshot: boolean;
    digest: "off" | "daily" | "per-event";
}

export interface SoulCordProductPreferences {
    appearance: SoulCordAppearancePreferences;
    safety: SoulCordSafetyPreferences;
    friendWatch: SoulCordFriendWatchPolicy;
    returnLaterRetentionDays: 7 | 30 | 90;
}

export const SOULCORD_WORKSPACES = Object.freeze([
    {id: "home", label: "Home", summary: "Session health and the next useful action."},
    {id: "appearance", label: "Appearance", summary: "One coherent visual system with a live preview."},
    {id: "safety", label: "Safety", summary: "Links, attachments, privacy, and local review history."},
    {id: "people", label: "People", summary: "Private relationship history and local reminders."},
    {id: "tools", label: "Tools", summary: "Profiles, add-ons, recovery, accessibility, and diagnostics."}
] satisfies ReadonlyArray<{id: SoulCordWorkspaceId; label: string; summary: string;}>);

export const SOULCORD_SETUP_STEPS = Object.freeze([
    "Welcome",
    "Preflight",
    "Preset",
    "Appearance",
    "Safety",
    "Private history",
    "Review",
    "Apply"
] as const);

export function defaultSoulCordProductPreferences(): SoulCordProductPreferences {
    return {
        appearance: {mode: "follow-discord", accent: "glacier", density: "comfortable", motion: "follow-system", messageShape: "discord"},
        safety: {linkLens: true, domainMemory: "warn-only", attachmentGuard: true, privacyModeReady: true},
        friendWatch: {enabled: false, retentionDays: 30, includeDisplaySnapshot: true, digest: "daily"},
        returnLaterRetentionDays: 30
    };
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function choice<T extends string | number>(value: unknown, values: readonly T[], fallback: T): T {
    return values.includes(value as T) ? value as T : fallback;
}

export function normalizeSoulCordProductPreferences(value: unknown): SoulCordProductPreferences {
    const source = record(value);
    const appearance = record(source.appearance);
    const safety = record(source.safety);
    const friendWatch = record(source.friendWatch);
    return {
        appearance: {
            mode: choice(appearance.mode, ["follow-discord", "soul-dark", "soul-light", "oled"] as const, "follow-discord"),
            accent: choice(appearance.accent, ["system", "glacier", "signal", "coral", "forest"] as const, "glacier"),
            density: choice(appearance.density, ["comfortable", "compact"] as const, "comfortable"),
            motion: choice(appearance.motion, ["follow-system", "full", "reduced"] as const, "follow-system"),
            messageShape: choice(appearance.messageShape, ["discord", "seamed"] as const, "discord")
        },
        safety: {
            linkLens: safety.linkLens !== false,
            domainMemory: choice(safety.domainMemory, ["off", "warn-only"] as const, "warn-only"),
            attachmentGuard: safety.attachmentGuard !== false,
            privacyModeReady: safety.privacyModeReady !== false
        },
        friendWatch: {
            enabled: friendWatch.enabled === true,
            retentionDays: choice(friendWatch.retentionDays, [7, 30, 90] as const, 30),
            includeDisplaySnapshot: friendWatch.includeDisplaySnapshot !== false,
            digest: choice(friendWatch.digest, ["off", "daily", "per-event"] as const, "daily")
        },
        returnLaterRetentionDays: choice(source.returnLaterRetentionDays, [7, 30, 90] as const, 30)
    };
}

export interface SoulCordPulseSignal {
    id: string;
    priority: number;
    tone: "ok" | "attention" | "danger";
    label: string;
    detail: string;
    action?: string;
}

export function prioritizeSoulCordPulse(signals: readonly SoulCordPulseSignal[]): SoulCordPulseSignal[] {
    const unique = new Map<string, SoulCordPulseSignal>();
    for (const signal of signals) {
        if (!signal.id || unique.has(signal.id)) continue;
        unique.set(signal.id, {...signal, priority: Math.max(0, Math.min(100, Math.round(signal.priority)))});
    }
    return [...unique.values()].sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id)).slice(0, 3);
}

export interface SoulCordPermissionCard {
    network: boolean;
    filesystem: boolean;
    patching: boolean;
    messageAccess: "none" | "metadata" | "content";
    accountContext: boolean;
    localStorage: boolean;
}

export function expandedSoulCordPermissions(previous: SoulCordPermissionCard, next: SoulCordPermissionCard): string[] {
    const expanded: string[] = [];
    for (const key of ["network", "filesystem", "patching", "accountContext", "localStorage"] as const) {
        if (!previous[key] && next[key]) expanded.push(key);
    }
    const access = {none: 0, metadata: 1, content: 2} as const;
    if (access[next.messageAccess] > access[previous.messageAccess]) expanded.push(`messageAccess:${next.messageAccess}`);
    return expanded;
}

export interface SoulCordCatalogCapabilitySignals {
    networkBehavior: readonly string[];
    accountActions: readonly string[];
    cleanupBehavior: unknown;
    tags: readonly string[];
}

/** Conservative presentation adapter for already-reviewed catalog signals; it grants no capability. */
export function inferSoulCordPermissionCard(candidate: SoulCordCatalogCapabilitySignals): SoulCordPermissionCard {
    const network = candidate.networkBehavior.map(value => value.toLowerCase());
    const actions = candidate.accountActions.map(value => value.toLowerCase());
    const cleanup = JSON.stringify(candidate.cleanupBehavior).toLowerCase();
    const tags = candidate.tags.map(value => value.toLowerCase());
    const actionText = actions.join(" ");
    const hasExplicitNoNetwork = network.length > 0 && network.every(value => value === "no-static-network-signal");
    const content = /message|draft|composer|typing|upload|attachment/.test(actionText);
    const metadata = content || tags.some(tag => ["chat", "text", "server", "voice", "user", "role"].includes(tag));
    return {
        network: !hasExplicitNoNetwork,
        filesystem: /file|download|upload|config|storage/.test(`${actionText} ${cleanup}`),
        patching: /patch/.test(cleanup) || cleanup === "\"runtime_review_required\"",
        messageAccess: content ? "content" : metadata ? "metadata" : "none",
        accountContext: actions.some(value => value !== "no-static-account-action-signal"),
        localStorage: /storage|settings|config|data/.test(cleanup)
    };
}
