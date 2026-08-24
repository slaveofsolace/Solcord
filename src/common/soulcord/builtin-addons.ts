// SPDX-License-Identifier: Apache-2.0

export const SOULCORD_CLEAN_ROOM_BUILTIN_ADDONS = Object.freeze([
    "DoNotTrack",
    "DoubleClickToReply",
    "InvisibleTyping"
] as const);

export interface SoulCordAddonLookup {
    addonList?: ReadonlyArray<{filename: string;}>;
    resolveAddon(idOrFile: string): {id: string; filename: string;} | undefined;
    isEnabled(idOrFile: string): boolean;
}

export interface SoulCordProviderMigrationCandidate {
    name: string;
    fileName: string;
}

export interface SoulCordProviderMigrationSelection {
    selectedAddons: readonly string[];
    addonModes: Readonly<Record<string, string | undefined>>;
    addonProviders: Readonly<Record<string, string | undefined>>;
}

export interface SoulCordProviderMigrationIdentity {
    name: string;
    fileName: string;
    enabled: true;
    provider: "prefer-soulcord";
}

export interface SoulCordProviderMigrationPlan {
    version: 1;
    entries: readonly SoulCordProviderMigrationIdentity[];
}

const MAX_PROVIDER_MIGRATIONS = SOULCORD_CLEAN_ROOM_BUILTIN_ADDONS.length + 1;

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

function compareProviderMigrations(left: SoulCordProviderMigrationIdentity, right: SoulCordProviderMigrationIdentity): number {
    return left.name.localeCompare(right.name, "en-US") || left.fileName.localeCompare(right.fileName, "en-US");
}

function freezeProviderMigrationPlan(entries: SoulCordProviderMigrationIdentity[]): SoulCordProviderMigrationPlan {
    const frozenEntries = entries.sort(compareProviderMigrations).map(entry => Object.freeze({...entry}));
    return Object.freeze({version: 1 as const, entries: Object.freeze(frozenEntries)});
}

export function canonicalizeSoulCordProviderMigrationPlan(value: unknown): SoulCordProviderMigrationPlan | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const record = value as {version?: unknown; entries?: unknown;};
    if (record.version !== 1 || !Array.isArray(record.entries) || record.entries.length > MAX_PROVIDER_MIGRATIONS) return;

    const names = new Set<string>();
    const fileNames = new Set<string>();
    const entries: SoulCordProviderMigrationIdentity[] = [];
    for (const valueEntry of record.entries) {
        if (!valueEntry || typeof valueEntry !== "object" || Array.isArray(valueEntry)) return;
        const entry = valueEntry as Partial<SoulCordProviderMigrationIdentity>;
        if (typeof entry.name !== "string" || !safeProviderIdentity(entry.name, 120) || names.has(entry.name)) return;
        if (typeof entry.fileName !== "string" || !safeProviderFileName(entry.fileName) || fileNames.has(entry.fileName)) return;
        if (entry.enabled !== true || entry.provider !== "prefer-soulcord") return;
        names.add(entry.name);
        fileNames.add(entry.fileName);
        entries.push({name: entry.name, fileName: entry.fileName, enabled: true, provider: "prefer-soulcord"});
    }
    return freezeProviderMigrationPlan(entries);
}

export function createSoulCordProviderMigrationPlan(
    manager: SoulCordAddonLookup,
    candidates: readonly SoulCordProviderMigrationCandidate[],
    selection: SoulCordProviderMigrationSelection
): SoulCordProviderMigrationPlan | undefined {
    const selected = new Set(selection.selectedAddons);
    const entries = candidates.flatMap(candidate => {
        if (!selected.has(candidate.name)
            || !isSoulCordBuiltInAddon(candidate.name, selection.addonModes[candidate.name])
            || selection.addonProviders[candidate.name] !== "prefer-soulcord") return [];
        const addon = resolveCommunityAddon(manager, candidate.name, candidate.fileName);
        if (!addon || !manager.isEnabled(addon.filename)) return [];
        return [{name: candidate.name, fileName: addon.filename, enabled: true as const, provider: "prefer-soulcord" as const}];
    });
    return canonicalizeSoulCordProviderMigrationPlan({version: 1, entries});
}

export function soulCordProviderMigrationPlansMatch(left: unknown, right: unknown): boolean {
    const leftPlan = canonicalizeSoulCordProviderMigrationPlan(left);
    const rightPlan = canonicalizeSoulCordProviderMigrationPlan(right);
    if (!leftPlan || !rightPlan || leftPlan.entries.length !== rightPlan.entries.length) return false;
    return leftPlan.entries.every((entry, index) => {
        const candidate = rightPlan.entries[index];
        return entry.name === candidate.name
            && entry.fileName === candidate.fileName
            && entry.enabled === candidate.enabled
            && entry.provider === candidate.provider;
    });
}

export function resolveCommunityAddon(manager: SoulCordAddonLookup, name: string, fileName: string): {id: string; filename: string;} | undefined {
    return manager.resolveAddon(fileName) ?? manager.resolveAddon(name);
}

export function communityAddonIsEnabled(manager: SoulCordAddonLookup, name: string, fileName: string): boolean {
    const addon = resolveCommunityAddon(manager, name, fileName);
    return Boolean(addon && manager.isEnabled(addon.filename));
}

export function captureExactAddonStates(manager: SoulCordAddonLookup): Record<string, boolean> {
    return Object.fromEntries((manager.addonList ?? []).map(addon => [addon.filename, manager.isEnabled(addon.filename)]));
}

export function isSoulCordBuiltInAddon(name: string, mode: string | undefined): boolean {
    if (name === "SplitLargeMessages") return mode === "guarded";
    return (SOULCORD_CLEAN_ROOM_BUILTIN_ADDONS as readonly string[]).includes(name);
}
