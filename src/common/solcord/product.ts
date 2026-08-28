// SPDX-License-Identifier: Apache-2.0

export type SolcordWorkspaceId =
    | "overview"
    | "appearance"
    | "performance"
    | "privacy"
    | "chat"
    | "voice"
    | "friends"
    | "extensions"
    | "recovery"
    | "advanced";
export type SolcordVisualMode = "follow-discord" | "solcord-dark" | "solcord-light" | "oled";
export type SolcordAccent = "system" | "glacier" | "signal" | "coral" | "forest";
export type SolcordDensity = "comfortable" | "compact";
export type SolcordMotion = "follow-system" | "full" | "subtle" | "reduced";
export type SolcordMessageShape = "discord" | "seamed";
export type SolcordSetupPreset = "recommended" | "minimal" | "power-user";
export type SolcordPerformanceProfile = "lean" | "balanced" | "visual";
export type SolcordLayoutRegion = "guilds" | "channels" | "members";
export type SolcordMediaKind = "gif" | "sticker" | "emoji";

export interface SolcordMediaShelfItem {
    id: string;
    label: string;
    url: string;
    kind: SolcordMediaKind;
}

export interface SolcordBaselinePreferences {
    layoutCollapse: boolean;
    collapsedRegions: SolcordLayoutRegion[];
    embedControls: boolean;
    crossPlatformAutoscroll: boolean;
    messageLinkPreview: boolean;
    mediaShelf: SolcordMediaShelfItem[];
}

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
    performanceProfile: SolcordPerformanceProfile;
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
    baseline: SolcordBaselinePreferences;
}

export const SOLCORD_WORKSPACES = Object.freeze([
    {id: "overview", label: "Overview", summary: "Setup and current health."},
    {id: "appearance", label: "Appearance", summary: "Theme, density, and motion."},
    {id: "performance", label: "Performance", summary: "Runtime cost and profiles."},
    {id: "privacy", label: "Privacy & Safety", summary: "Links, uploads, and local history."},
    {id: "chat", label: "Chat & Composer", summary: "Writing and message tools."},
    {id: "voice", label: "Voice & Activities", summary: "Calls, Activities, and streams."},
    {id: "friends", label: "Friends & Spaces", summary: "People, servers, and local notes."},
    {id: "extensions", label: "Extensions", summary: "Built-ins and plugin migration."},
    {id: "recovery", label: "Recovery", summary: "Repair, rollback, and snapshots."},
    {id: "advanced", label: "Advanced", summary: "Diagnostics and experiments."}
] satisfies ReadonlyArray<{id: SolcordWorkspaceId; label: string; summary: string;}>);

export const SOLCORD_SETUP_STEPS = Object.freeze([
    "Welcome",
    "Privacy",
    "Performance",
    "Appearance",
    "Features",
    "Activities",
    "Import",
    "Ready"
] as const);

export interface SolcordPerformancePolicy {
    sampleSeconds: number;
    effectiveMotion: "full" | "subtle" | "reduced";
    ambientEffects: boolean;
    description: string;
}

export const SOLCORD_PERFORMANCE_POLICIES: Readonly<Record<SolcordPerformanceProfile, Readonly<SolcordPerformancePolicy>>> = Object.freeze({
    lean: Object.freeze({sampleSeconds: 15, effectiveMotion: "reduced", ambientEffects: false, description: "Minimum background work and no ambient motion."}),
    balanced: Object.freeze({sampleSeconds: 5, effectiveMotion: "subtle", ambientEffects: false, description: "Responsive controls with short interaction-led motion."}),
    visual: Object.freeze({sampleSeconds: 5, effectiveMotion: "full", ambientEffects: true, description: "Full interaction motion while keeping chat and long lists still."})
});

export function resolveSolcordPerformancePolicy(profile: SolcordPerformanceProfile, motion: SolcordMotion, reduceMotion: boolean): SolcordPerformancePolicy {
    const base = SOLCORD_PERFORMANCE_POLICIES[profile];
    if (reduceMotion || motion === "reduced") return {...base, effectiveMotion: "reduced", ambientEffects: false};
    if (motion === "full") return {...base, effectiveMotion: profile === "lean" ? "subtle" : "full"};
    if (motion === "subtle") return {...base, effectiveMotion: "subtle", ambientEffects: false};
    return {...base};
}

export function defaultSolcordProductPreferences(): SolcordProductPreferences {
    return {
        performanceProfile: "balanced",
        appearance: {mode: "follow-discord", accent: "glacier", density: "comfortable", motion: "follow-system", messageShape: "discord"},
        safety: {linkLens: true, domainMemory: "warn-only", attachmentGuard: true, privacyModeReady: true},
        friendWatch: {enabled: false, retentionDays: 30, includeDisplaySnapshot: true, digest: "daily"},
        returnLaterRetentionDays: 30,
        nativeSuite: {pinnedDmIds: [], hiddenGuildIds: [], guildAliases: {}, focusChannelIds: [], translation: {provider: "off", endpoint: ""}},
        baseline: {layoutCollapse: false, collapsedRegions: [], embedControls: false, crossPlatformAutoscroll: false, messageLinkPreview: false, mediaShelf: []}
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
    const baseline = record(source.baseline);
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
        performanceProfile: choice(source.performanceProfile, ["lean", "balanced", "visual"] as const, "balanced"),
        appearance: {
            mode: normalizeVisualMode(appearance.mode),
            accent: choice(appearance.accent, ["system", "glacier", "signal", "coral", "forest"] as const, "glacier"),
            density: choice(appearance.density, ["comfortable", "compact"] as const, "comfortable"),
            motion: choice(appearance.motion, ["follow-system", "full", "subtle", "reduced"] as const, "follow-system"),
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
        },
        baseline: {
            layoutCollapse: baseline.layoutCollapse === true,
            collapsedRegions: [...new Set((Array.isArray(baseline.collapsedRegions) ? baseline.collapsedRegions : []).filter((region): region is SolcordLayoutRegion => ["guilds", "channels", "members"].includes(String(region))))].slice(0, 3),
            embedControls: baseline.embedControls === true,
            crossPlatformAutoscroll: baseline.crossPlatformAutoscroll === true,
            messageLinkPreview: baseline.messageLinkPreview === true,
            mediaShelf: (Array.isArray(baseline.mediaShelf) ? baseline.mediaShelf : []).flatMap((candidate, index) => {
                const item = record(candidate);
                if (typeof item.url !== "string" || typeof item.label !== "string") return [];
                try {
                    const url = new URL(item.url);
                    if (url.protocol !== "https:" || !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname)) return [];
                    return [{
                        id: typeof item.id === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(item.id) ? item.id : `media-${index + 1}`,
                        label: item.label.trim().slice(0, 64) || "Saved media",
                        url: url.toString(),
                        kind: choice(item.kind, ["gif", "sticker", "emoji"] as const, "gif")
                    }];
                }
                catch {return [];}
            }).slice(0, 200)
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
