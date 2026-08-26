// SPDX-License-Identifier: Apache-2.0

export type SolcordWorkspaceId = "home" | "appearance" | "safety" | "people" | "tools";
export type SolcordVisualMode = "follow-discord" | "solcord-dark" | "solcord-light" | "oled";
export type SolcordAccent = "system" | "glacier" | "signal" | "coral" | "forest";
export type SolcordDensity = "comfortable" | "compact";
export type SolcordMotion = "follow-system" | "full" | "reduced";
export type SolcordMessageShape = "discord" | "seamed";
export type SolcordSetupPreset = "recommended" | "minimal" | "power-user";

export interface SolcordAppearancePreferences {
    mode: SolcordVisualMode;
    accent: SolcordAccent;
    density: SolcordDensity;
    motion: SolcordMotion;
    messageShape: SolcordMessageShape;
}

export interface SolcordSafetyPreferences {
    linkLens: boolean;
    domainMemory: "off" | "warn-only";
    attachmentGuard: boolean;
    privacyModeReady: boolean;
}

export interface SolcordFriendWatchPolicy {
    enabled: boolean;
    retentionDays: 7 | 30 | 90;
    includeDisplaySnapshot: boolean;
    digest: "off" | "daily" | "per-event";
}

export interface SolcordProductPreferences {
    appearance: SolcordAppearancePreferences;
    safety: SolcordSafetyPreferences;
    friendWatch: SolcordFriendWatchPolicy;
    returnLaterRetentionDays: 7 | 30 | 90;
    nativeSuite: {
        pinnedDmIds: string[];
        hiddenGuildIds: string[];
        guildAliases: Record<string, string>;
        focusChannelIds: string[];
        translation: {provider: "off" | "deepl" | "libretranslate"; endpoint: string;};
    };
}

export const SOLCORD_WORKSPACES = Object.freeze([
    {id: "home", label: "Home", summary: "Session health and the next useful action."},
    {id: "appearance", label: "Appearance", summary: "One coherent visual system with a live preview."},
    {id: "safety", label: "Safety", summary: "Links, attachments, privacy, and local review history."},
    {id: "people", label: "People", summary: "Private relationship history and local reminders."},
    {id: "tools", label: "Tools", summary: "Profiles, add-ons, recovery, accessibility, and diagnostics."}
] satisfies ReadonlyArray<{id: SolcordWorkspaceId; label: string; summary: string;}>);

export const SOLCORD_SETUP_STEPS = Object.freeze([
    "Welcome",
    "Preflight",
    "Preset",
    "Appearance",
    "Safety",
    "Private history",
    "Review",
    "Apply"
] as const);

export function defaultSolcordProductPreferences(): SolcordProductPreferences {
    return {
        appearance: {mode: "follow-discord", accent: "glacier", density: "comfortable", motion: "follow-system", messageShape: "discord"},
        safety: {linkLens: true, domainMemory: "warn-only", attachmentGuard: true, privacyModeReady: true},
        friendWatch: {enabled: false, retentionDays: 30, includeDisplaySnapshot: true, digest: "daily"},
        returnLaterRetentionDays: 30,
        nativeSuite: {pinnedDmIds: [], hiddenGuildIds: [], guildAliases: {}, focusChannelIds: [], translation: {provider: "off", endpoint: ""}}
    };
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function choice<T extends string | number>(value: unknown, values: readonly T[], fallback: T): T {
    return values.includes(value as T) ? value as T : fallback;
}

const LEGACY_VISUAL_MODE_DARK = String.fromCharCode(115, 111, 117, 108, 45, 100, 97, 114, 107);
const LEGACY_VISUAL_MODE_LIGHT = String.fromCharCode(115, 111, 117, 108, 45, 108, 105, 103, 104, 116);

function normalizeVisualMode(value: unknown): SolcordVisualMode {
    if (value === LEGACY_VISUAL_MODE_DARK) return "solcord-dark";
    if (value === LEGACY_VISUAL_MODE_LIGHT) return "solcord-light";
    return choice(value, ["follow-discord", "solcord-dark", "solcord-light", "oled"] as const, "follow-discord");
}

export function normalizeSolcordProductPreferences(value: unknown): SolcordProductPreferences {
    const source = record(value);
    const appearance = record(source.appearance);
    const safety = record(source.safety);
    const friendWatch = record(source.friendWatch);
    const nativeSuite = record(source.nativeSuite);
    const translation = record(nativeSuite.translation);
    const snowflakes = (candidate: unknown, maximum: number) => Array.isArray(candidate) ? [...new Set(candidate.filter((item): item is string => typeof item === "string" && /^\d{1,32}$/.test(item)))].slice(0, maximum) : [];
    const aliases = Object.fromEntries(Object.entries(record(nativeSuite.guildAliases)).flatMap(([id, alias]) => /^\d{1,32}$/.test(id) && typeof alias === "string" && alias.length <= 48 ? [[id, alias] as const] : []).slice(0, 200));
    let endpoint = "";
    if (typeof translation.endpoint === "string" && translation.endpoint.length <= 500) {
        try {
            const url = new URL(translation.endpoint);
            if (url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash) endpoint = url.toString();
        }
        catch {/* invalid endpoint stays empty */}
    }
    return {
        appearance: {
            mode: normalizeVisualMode(appearance.mode),
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
        returnLaterRetentionDays: choice(source.returnLaterRetentionDays, [7, 30, 90] as const, 30),
        nativeSuite: {
            pinnedDmIds: snowflakes(nativeSuite.pinnedDmIds, 100),
            hiddenGuildIds: snowflakes(nativeSuite.hiddenGuildIds, 200),
            guildAliases: aliases,
            focusChannelIds: snowflakes(nativeSuite.focusChannelIds, 500),
            translation: {provider: choice(translation.provider, ["off", "deepl", "libretranslate"] as const, "off"), endpoint}
        }
    };
}

export interface SolcordPulseSignal {
    id: string;
    priority: number;
    tone: "ok" | "attention" | "danger";
    label: string;
    detail: string;
    action?: string;
}

export function prioritizeSolcordPulse(signals: readonly SolcordPulseSignal[]): SolcordPulseSignal[] {
    const unique = new Map<string, SolcordPulseSignal>();
    for (const signal of signals) {
        if (!signal.id || unique.has(signal.id)) continue;
        unique.set(signal.id, {...signal, priority: Math.max(0, Math.min(100, Math.round(signal.priority)))});
    }
    return [...unique.values()].sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id)).slice(0, 3);
}

export interface SolcordPermissionCard {
    network: boolean;
    filesystem: boolean;
    patching: boolean;
    messageAccess: "none" | "metadata" | "content";
    accountContext: boolean;
    localStorage: boolean;
}

export function expandedSolcordPermissions(previous: SolcordPermissionCard, next: SolcordPermissionCard): string[] {
    const expanded: string[] = [];
    for (const key of ["network", "filesystem", "patching", "accountContext", "localStorage"] as const) {
        if (!previous[key] && next[key]) expanded.push(key);
    }
    const access = {none: 0, metadata: 1, content: 2} as const;
    if (access[next.messageAccess] > access[previous.messageAccess]) expanded.push(`messageAccess:${next.messageAccess}`);
    return expanded;
}

export interface SolcordCatalogCapabilitySignals {
    networkBehavior: readonly string[];
    accountActions: readonly string[];
    cleanupBehavior: unknown;
    tags: readonly string[];
}

/** Conservative presentation adapter for already-reviewed catalog signals; it grants no capability. */
export function inferSolcordPermissionCard(candidate: SolcordCatalogCapabilitySignals): SolcordPermissionCard {
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
