// SPDX-License-Identifier: Apache-2.0

export const SOLCORD_CLEAN_ROOM_BUILTIN_ADDONS = Object.freeze([
    "BetterAnimations",
    "BetterFriendList",
    "BetterVolume",
    "CallTimeCounter",
    "CharCounter",
    "CompleteTimestamps",
    "DiscordEffects",
    "DoNotTrack",
    "DoubleClickToReply",
    "EditServers",
    "InvisibleTyping",
    "MessagePeek",
    "PinDMs",
    "ReadAllNotificationsButton",
    "ServerDetails",
    "ServerHider",
    "ShowSpectators",
    "SplitLargeMessages",
    "Translator",
    "VoiceActivity",
    "VoiceMessages"
] as const);

export type SolcordNativeSuiteFeature =
    | "privacy-controls"
    | "composer-toolkit"
    | "call-context"
    | "audio-console"
    | "voice-note-studio"
    | "translation-desk"
    | "people-and-spaces"
    | "channel-glance"
    | "notification-review"
    | "motion-studio";

const NATIVE_SUITE_PROVIDER: Readonly<Record<(typeof SOLCORD_CLEAN_ROOM_BUILTIN_ADDONS)[number], SolcordNativeSuiteFeature>> = Object.freeze({
    BetterAnimations: "motion-studio",
    BetterFriendList: "people-and-spaces",
    BetterVolume: "audio-console",
    CallTimeCounter: "call-context",
    CharCounter: "composer-toolkit",
    CompleteTimestamps: "composer-toolkit",
    DiscordEffects: "motion-studio",
    DoNotTrack: "privacy-controls",
    DoubleClickToReply: "composer-toolkit",
    EditServers: "people-and-spaces",
    InvisibleTyping: "privacy-controls",
    MessagePeek: "channel-glance",
    PinDMs: "people-and-spaces",
    ReadAllNotificationsButton: "notification-review",
    ServerDetails: "people-and-spaces",
    ServerHider: "people-and-spaces",
    ShowSpectators: "call-context",
    SplitLargeMessages: "composer-toolkit",
    Translator: "translation-desk",
    VoiceActivity: "call-context",
    VoiceMessages: "voice-note-studio"
});

export function solcordNativeSuiteFeatureForAddon(name: string): SolcordNativeSuiteFeature | undefined {
    return NATIVE_SUITE_PROVIDER[name as keyof typeof NATIVE_SUITE_PROVIDER];
}

export interface SolcordAddonLookup {
    addonList?: ReadonlyArray<{filename: string;}>;
    resolveAddon(idOrFile: string): {id: string; filename: string;} | undefined;
    isEnabled(idOrFile: string): boolean | undefined;
}

export interface SolcordProviderMigrationCandidate {
    name: string;
    fileName: string;
}

export interface SolcordProviderMigrationSelection {
    selectedAddons: readonly string[];
    addonModes: Readonly<Record<string, string | undefined>>;
    addonProviders: Readonly<Record<string, string | undefined>>;
    timelinePolicy?: Readonly<{enabled?: boolean;}>;
}

export interface SolcordProviderMigrationIdentity {
    name: string;
    fileName: string;
    enabled: boolean;
    provider: "prefer-solcord";
}

export interface SolcordProviderMigrationPlan {
    version: 1;
    entries: readonly SolcordProviderMigrationIdentity[];
}

export interface SolcordProviderAdapterResult {
    enabled?: boolean;
    provider?: string;
}

const MESSAGE_LOGGER_PROVIDER = Object.freeze({name: "MessageLoggerV2", fileName: "MessageLoggerV2.plugin.js"});
const FAKE_DEAFEN_PROVIDER = Object.freeze({name: "FakeDeafen", fileName: "FakeDeafen.plugin.js"});
const MAX_PROVIDER_MIGRATIONS = SOLCORD_CLEAN_ROOM_BUILTIN_ADDONS.length + 2;

export function solcordStandaloneProviderFileName(name: string): string | undefined {
    if (name === MESSAGE_LOGGER_PROVIDER.name) return MESSAGE_LOGGER_PROVIDER.fileName;
    if (name === FAKE_DEAFEN_PROVIDER.name) return FAKE_DEAFEN_PROVIDER.fileName;
}

function safeProviderIdentity(value: string, maximumLength: number): boolean {
    return value.length > 0
        && value.length <= maximumLength
        && value.trim() === value
        && ![...value].some(character => {
            const code = character.charCodeAt(0);
            return code < 32 || code === 127;
        });
}

function safeProviderFileName(value: string): boolean {
    return safeProviderIdentity(value, 220)
        && value.endsWith(".plugin.js")
        && !/[\\/]/.test(value);
}

function compareProviderMigrations(left: SolcordProviderMigrationIdentity, right: SolcordProviderMigrationIdentity): number {
    return left.name.localeCompare(right.name, "en-US") || left.fileName.localeCompare(right.fileName, "en-US");
}

function freezeProviderMigrationPlan(entries: SolcordProviderMigrationIdentity[]): SolcordProviderMigrationPlan {
    const frozenEntries = entries.sort(compareProviderMigrations).map(entry => Object.freeze({...entry}));
    return Object.freeze({version: 1 as const, entries: Object.freeze(frozenEntries)});
}

export function canonicalizeSolcordProviderMigrationPlan(value: unknown): SolcordProviderMigrationPlan | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const record = value as {version?: unknown; entries?: unknown;};
    if (record.version !== 1 || !Array.isArray(record.entries) || record.entries.length > MAX_PROVIDER_MIGRATIONS) return;

    const names = new Set<string>();
    const fileNames = new Set<string>();
    const entries: SolcordProviderMigrationIdentity[] = [];
    for (const valueEntry of record.entries) {
        if (!valueEntry || typeof valueEntry !== "object" || Array.isArray(valueEntry)) return;
        const entry = valueEntry as Partial<SolcordProviderMigrationIdentity>;
        if (typeof entry.name !== "string" || !safeProviderIdentity(entry.name, 120) || names.has(entry.name)) return;
        if (typeof entry.fileName !== "string" || !safeProviderFileName(entry.fileName) || fileNames.has(entry.fileName)) return;
        if (typeof entry.enabled !== "boolean" || entry.provider !== "prefer-solcord") return;
        names.add(entry.name);
        fileNames.add(entry.fileName);
        entries.push({name: entry.name, fileName: entry.fileName, enabled: entry.enabled, provider: "prefer-solcord"});
    }
    return freezeProviderMigrationPlan(entries);
}

export function createSolcordProviderMigrationPlan(
    manager: SolcordAddonLookup,
    candidates: readonly SolcordProviderMigrationCandidate[],
    selection: SolcordProviderMigrationSelection
): SolcordProviderMigrationPlan | undefined {
    const selected = new Set(selection.selectedAddons);
    const entries = candidates.flatMap(candidate => {
        if (!selected.has(candidate.name)
            || !isSolcordBuiltInAddon(candidate.name, selection.addonModes[candidate.name])
            || selection.addonProviders[candidate.name] !== "prefer-solcord") return [];
        const addon = resolveCommunityAddon(manager, candidate.name, candidate.fileName);
        if (!addon) return [];
        return [{name: candidate.name, fileName: addon.filename, enabled: manager.isEnabled(addon.filename) === true, provider: "prefer-solcord" as const}];
    });
    const messageLogger = resolveCommunityAddon(manager, MESSAGE_LOGGER_PROVIDER.name, MESSAGE_LOGGER_PROVIDER.fileName);
    if (messageLogger?.filename === MESSAGE_LOGGER_PROVIDER.fileName) {
        const enabled = manager.isEnabled(messageLogger.filename) === true;
        if (!enabled || selection.timelinePolicy?.enabled === true) {
            entries.push({
                name: MESSAGE_LOGGER_PROVIDER.name,
                fileName: messageLogger.filename,
                enabled,
                provider: "prefer-solcord"
            });
        }
    }
    const fakeDeafen = resolveCommunityAddon(manager, FAKE_DEAFEN_PROVIDER.name, FAKE_DEAFEN_PROVIDER.fileName);
    if (fakeDeafen?.filename === FAKE_DEAFEN_PROVIDER.fileName && manager.isEnabled(fakeDeafen.filename) !== true) {
        entries.push({
            name: FAKE_DEAFEN_PROVIDER.name,
            fileName: fakeDeafen.filename,
            enabled: false,
            provider: "prefer-solcord"
        });
    }
    return canonicalizeSolcordProviderMigrationPlan({version: 1, entries});
}

export function solcordProviderReplacementIsReady(
    migration: SolcordProviderMigrationIdentity,
    adapter: SolcordProviderAdapterResult | undefined,
    timelineEnabled: boolean,
    timelineRuntimeReady: boolean
): boolean {
    if (migration.name === MESSAGE_LOGGER_PROVIDER.name) return !migration.enabled || timelineEnabled && timelineRuntimeReady;
    if (migration.name === FAKE_DEAFEN_PROVIDER.name) return !migration.enabled;
    return adapter?.enabled === true && adapter.provider === "solcord";
}

export function solcordProviderMigrationPlansMatch(left: unknown, right: unknown): boolean {
    const leftPlan = canonicalizeSolcordProviderMigrationPlan(left);
    const rightPlan = canonicalizeSolcordProviderMigrationPlan(right);
    if (!leftPlan || !rightPlan || leftPlan.entries.length !== rightPlan.entries.length) return false;
    return leftPlan.entries.every((entry, index) => {
        const candidate = rightPlan.entries[index];
        return entry.name === candidate.name
            && entry.fileName === candidate.fileName
            && entry.enabled === candidate.enabled
            && entry.provider === candidate.provider;
    });
}

export function resolveCommunityAddon(manager: SolcordAddonLookup, name: string, fileName: string): {id: string; filename: string;} | undefined {
    return manager.resolveAddon(fileName) ?? manager.resolveAddon(name);
}

export function communityAddonIsEnabled(manager: SolcordAddonLookup, name: string, fileName: string): boolean {
    const addon = resolveCommunityAddon(manager, name, fileName);
    return Boolean(addon && manager.isEnabled(addon.filename));
}

export function captureExactAddonStates(manager: SolcordAddonLookup): Record<string, boolean> {
    return Object.fromEntries((manager.addonList ?? []).map(addon => [addon.filename, manager.isEnabled(addon.filename) === true]));
}

export function isSolcordBuiltInAddon(name: string, mode: string | undefined): boolean {
    if (name === "SplitLargeMessages") return mode !== "native";
    return (SOLCORD_CLEAN_ROOM_BUILTIN_ADDONS as readonly string[]).includes(name);
}
