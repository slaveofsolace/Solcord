import Store from "@stores/base";
import JsonStore from "@stores/json";
import Config from "@stores/config";
import fs from "@polyfill/fs";
import crypto from "crypto";
import path from "path";

import type {
    SoulCordAddonMode,
    SoulCordCuratedAddonState,
    SoulCordModuleId,
    SoulCordModuleSettings,
    SoulCordOnboardingState,
    SoulCordPowerConsent,
    SoulCordPowerExperimentId,
    SoulCordProfile,
    SoulCordSetupDraft,
    SoulCordSetupTransactionRecord,
    SoulCordSettingsDocument,
    SoulCordSnapshot,
    SoulCordThemeId,
    SoulCordTimelinePolicy
} from "./contracts";


export const SOULCORD_SCHEMA_VERSION = 3;
export const SOULCORD_CONSENT_VERSION = 2;
export const SOULCORD_ONBOARDING_VERSION = 1;
const MAX_SNAPSHOTS = 20;
const MAX_LEDGER_ENTRIES = 100;
const MAX_PROFILES = 50;
const MAX_MIGRATION_ENTRIES = 30;
const MAX_SETUP_TRANSACTIONS = 10;

export const SOULCORD_THEMES: Array<{id: SoulCordThemeId; name: string; fileName: string;}> = [
    {id: "obsidian-thread", name: "Obsidian Thread", fileName: "SoulCord-ObsidianThread.theme.css"},
    {id: "carbon-ember", name: "Carbon Ember", fileName: "SoulCord-CarbonEmber.theme.css"},
    {id: "midnight-glass", name: "Midnight Glass", fileName: "SoulCord-MidnightGlass.theme.css"},
    {id: "paper-signal", name: "Paper Signal", fileName: "SoulCord-PaperSignal.theme.css"}
];

export const SOULCORD_PRESET_ADDONS = [
    "DoNotTrack", "InvisibleTyping", "DoubleClickToReply", "PinDMs", "MessagePeek", "FileNameRandomization", "BlurNSFW",
    "VoiceMessages", "VoiceActivity", "ShowSpectators", "CallTimeCounter", "BetterVolume", "AudioOptions", "NotifyWhenMuted",
    "Translator", "SplitLargeMessages", "CharCounter", "SpellCheck", "InsertTimestamps",
    "ServerHider", "ServerDetails", "ReadAllNotificationsButton", "BetterFolders", "PersonalPins", "PermissionsViewer", "ActivityFilter",
    "DiscordEffects", "CompleteTimestamps", "BetterFriendList", "BetterAnimations", "EditServers", "ImageUtilities", "HideDisabledEmojis", "BetterSearchPage", "RevealAllSpoilers", "ViewProfilePicture"
] as const;

export const SOULCORD_POWER_EXPERIMENTS: SoulCordPowerExperimentId[] = ["voice-anchor", "expression-relay", "decor", "fake-deafen", "fake-mute", "stream-rtc"];

export const MODULE_DEFAULTS: Record<SoulCordModuleId, SoulCordModuleSettings> = {
    "activity-bridge": {enabled: true, values: {}},
    "plugin-doctor": {enabled: true, values: {failureThreshold: 3, failureWindowMinutes: 10}},
    "drift-radar": {enabled: true, values: {}},
    "performance-hud": {enabled: true, values: {showOverlay: false, sampleSeconds: 5}},
    "workspace-profiles": {enabled: true, values: {activeProfile: "activities"}},
    "command-deck": {enabled: true, values: {shortcut: "Ctrl+Alt+K"}},
    "link-lens": {enabled: false, values: {confirmAllExternal: false, removeTrackers: true}},
    "stream-shield": {enabled: false, values: {manualActive: false, previewActive: false, redactGuilds: true, redactChannels: true, redactDMs: true, redactNotifications: true, redactNotes: true, redactAccount: true}},
    "settings-time-machine": {enabled: true, values: {}},
    "accessibility-toolkit": {enabled: false, values: {reducedMotion: true, roleContrast: true, readingRuler: false, readingWidth: 0}},
    "message-timeline": {enabled: false, values: {scope: "dm-only", retention: "7-days", content: "text-only"}}
};

function clone<T>(value: T): T {
    return structuredClone(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function stringChoice<T extends string | number>(value: unknown, choices: readonly T[], fallback: T): T {
    return (typeof value === "string" || typeof value === "number") && choices.includes(value as T) ? value as T : fallback;
}

export function defaultTimelinePolicy(): SoulCordTimelinePolicy {
    return {
        enabled: false,
        scope: "dm-only",
        serverChannelIds: [],
        retention: "7-days",
        content: "text-only",
        textBudgetBytes: 262_144_000,
        mediaBudgetBytes: 1_073_741_824
    };
}

function normalizeTimelinePolicy(value: unknown): SoulCordTimelinePolicy {
    const record = isRecord(value) ? value : {};
    const ids = Array.isArray(record.serverChannelIds)
        ? [...new Set(record.serverChannelIds.filter((id): id is string => typeof id === "string" && /^\d{1,32}$/.test(id)))].slice(0, 500)
        : [];
    return {
        enabled: record.enabled === true,
        scope: stringChoice(record.scope, ["dm-only", "selected-channels"] as const, "dm-only"),
        serverChannelIds: ids,
        retention: stringChoice(record.retention, ["session", "24-hours", "7-days", "30-days", "90-days", "manual"] as const, "7-days"),
        content: stringChoice(record.content, ["text-only", "text-and-metadata", "encrypted-media"] as const, "text-only"),
        textBudgetBytes: 262_144_000,
        mediaBudgetBytes: stringChoice(record.mediaBudgetBytes, [268_435_456, 1_073_741_824, 5_368_709_120] as const, 1_073_741_824)
    };
}

export function defaultCuratedAddons(): Record<string, SoulCordCuratedAddonState> {
    return Object.fromEntries(SOULCORD_PRESET_ADDONS.map(name => [name, {
        selected: true,
        enabled: false,
        mode: name === "SplitLargeMessages" ? "guarded" : "default"
    }])) as Record<string, SoulCordCuratedAddonState>;
}

function normalizeAddonMode(value: unknown, name: string): SoulCordAddonMode {
    const fallback: SoulCordAddonMode = name === "SplitLargeMessages" ? "guarded" : "default";
    return stringChoice(value, ["default", "guarded", "native"] as const, fallback);
}

function normalizeCuratedAddons(value: unknown): Record<string, SoulCordCuratedAddonState> {
    const record = isRecord(value) ? value : {};
    const normalized = defaultCuratedAddons();
    for (const name of SOULCORD_PRESET_ADDONS) {
        const candidate = record[name];
        if (!isRecord(candidate)) continue;
        normalized[name] = {
            selected: typeof candidate.selected === "boolean" ? candidate.selected : true,
            enabled: candidate.enabled === true,
            mode: normalizeAddonMode(candidate.mode, name),
            ...(typeof candidate.reviewedSha256 === "string" && /^[0-9a-f]{64}$/i.test(candidate.reviewedSha256) ? {reviewedSha256: candidate.reviewedSha256.toLowerCase()} : {}),
            ...(typeof candidate.quarantineReason === "string" ? {quarantineReason: candidate.quarantineReason.slice(0, 160)} : {})
        };
    }
    return normalized;
}

function defaultPowerLab(): Record<SoulCordPowerExperimentId, SoulCordPowerConsent> {
    return Object.fromEntries(SOULCORD_POWER_EXPERIMENTS.map(id => [id, {enabled: false, acknowledgementVersion: 0}])) as Record<SoulCordPowerExperimentId, SoulCordPowerConsent>;
}

function normalizePowerLab(value: unknown): Record<SoulCordPowerExperimentId, SoulCordPowerConsent> {
    const record = isRecord(value) ? value : {};
    const result = defaultPowerLab();
    for (const id of SOULCORD_POWER_EXPERIMENTS) {
        const candidate = record[id];
        if (!isRecord(candidate)) continue;
        result[id] = {
            enabled: candidate.enabled === true && boundedNumber(candidate.acknowledgementVersion, 0, 0, 100) === SOULCORD_CONSENT_VERSION,
            acknowledgementVersion: boundedNumber(candidate.acknowledgementVersion, 0, 0, 100),
            ...(typeof candidate.acknowledgedAt === "number" ? {acknowledgedAt: boundedNumber(candidate.acknowledgedAt, 0, 0, Number.MAX_SAFE_INTEGER)} : {})
        };
    }
    return result;
}

function normalizeOnboarding(value: unknown): SoulCordOnboardingState {
    const record = isRecord(value) ? value : {};
    return {
        version: 1,
        status: stringChoice(record.status, ["pending", "complete", "skipped"] as const, "pending"),
        ...(typeof record.completedAt === "number" ? {completedAt: boundedNumber(record.completedAt, 0, 0, Number.MAX_SAFE_INTEGER)} : {})
    };
}

function normalizeModule(id: SoulCordModuleId, value: unknown): SoulCordModuleSettings {
    const defaults = MODULE_DEFAULTS[id];
    if (!isRecord(value)) return clone(defaults);
    const values = clone(defaults.values);
    if (isRecord(value.values)) {
        for (const [key, fallback] of Object.entries(defaults.values)) {
            const candidate = value.values[key];
            if (typeof candidate === typeof fallback) values[key] = candidate;
        }
    }
    if (id === "performance-hud") values.sampleSeconds = boundedNumber(values.sampleSeconds, 5, 2, 30);
    if (id === "plugin-doctor") {
        values.failureThreshold = boundedNumber(values.failureThreshold, 3, 3, 10);
        values.failureWindowMinutes = boundedNumber(values.failureWindowMinutes, 10, 1, 60);
    }
    if (id === "accessibility-toolkit") values.readingWidth = boundedNumber(values.readingWidth, 0, 0, 1_200);
    if (id === "message-timeline") {
        values.scope = stringChoice(values.scope, ["dm-only", "selected-channels"] as const, "dm-only");
        values.retention = stringChoice(values.retention, ["session", "24-hours", "7-days", "30-days", "90-days", "manual"] as const, "7-days");
        values.content = stringChoice(values.content, ["text-only", "text-and-metadata", "encrypted-media"] as const, "text-only");
    }
    return {enabled: typeof value.enabled === "boolean" ? value.enabled : defaults.enabled, values};
}

function normalizeProfile(value: unknown): SoulCordProfile | null {
    if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" || !isRecord(value.modules)) return null;
    const normalizedModules = {} as Record<SoulCordModuleId, SoulCordModuleSettings>;
    for (const id of Object.keys(MODULE_DEFAULTS) as SoulCordModuleId[]) normalizedModules[id] = normalizeModule(id, value.modules[id]);
    const selectedPlugins = normalizeAddonFileNames(value.selectedPlugins, "plugin");
    const selectedThemes = normalizeAddonFileNames(value.selectedThemes, "theme");
    return {
        id: value.id.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64) || "profile",
        name: value.name.slice(0, 80),
        createdAt: boundedNumber(value.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
        updatedAt: boundedNumber(value.updatedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
        modules: normalizedModules,
        selectedPlugins,
        selectedThemes,
        includesThirdPartyAddons: value.includesThirdPartyAddons === true && (selectedPlugins.length > 0 || selectedThemes.length > 0)
    };
}

function normalizeProfiles(value: unknown): SoulCordProfile[] {
    if (!Array.isArray(value)) return [];
    const profiles: SoulCordProfile[] = [];
    const ids = new Set<string>();
    for (const candidate of value) {
        const profile = normalizeProfile(candidate);
        if (!profile || ids.has(profile.id)) continue;
        ids.add(profile.id);
        profiles.push(profile);
        if (profiles.length === MAX_PROFILES) break;
    }
    return profiles;
}

function normalizeAddonFileNames(value: unknown, kind: "plugin" | "theme"): string[] {
    if (!Array.isArray(value)) return [];
    const suffix = kind === "plugin" ? ".plugin.js" : ".theme.css";
    const pattern = kind === "plugin"
        ? /^[a-zA-Z0-9][a-zA-Z0-9 _&().+—-]{0,180}\.plugin\.js$/
        : /^[a-zA-Z0-9][a-zA-Z0-9 _&().+—-]{0,180}\.theme\.css$/;
    return [...new Set(value.filter((item): item is string => typeof item === "string" && item.endsWith(suffix) && pattern.test(item)))].slice(0, 100);
}

function defaultProfile(id: string, name: string, enabled: SoulCordModuleId[]): SoulCordProfile {
    const modules = clone(MODULE_DEFAULTS);
    for (const key of Object.keys(modules) as SoulCordModuleId[]) modules[key].enabled = enabled.includes(key);
    const now = Date.now();
    return {id, name, createdAt: now, updatedAt: now, modules, selectedPlugins: [], selectedThemes: [], includesThirdPartyAddons: false};
}

export function defaultProfiles(): SoulCordProfile[] {
    const safety: SoulCordModuleId[] = ["activity-bridge", "plugin-doctor", "drift-radar", "settings-time-machine", "command-deck"];
    return [
        defaultProfile("activities", "Activities", [...safety, "performance-hud"]),
        defaultProfile("gaming", "Gaming", [...safety, "performance-hud"]),
        defaultProfile("calls", "Calls", [...safety, "performance-hud"]),
        defaultProfile("streaming", "Streaming", [...safety, "performance-hud", "stream-shield"]),
        defaultProfile("focus", "Focus", [...safety, "accessibility-toolkit"])
    ];
}

export function normalizeSoulCordDocument(raw: unknown): SoulCordSettingsDocument {
    const record = isRecord(raw) ? raw : {};
    const rawSchemaVersion = boundedNumber(record.schemaVersion, 0, 0, 10_000);
    const rawModules = isRecord(record.modules) ? record.modules : {};
    const modules = {} as Record<SoulCordModuleId, SoulCordModuleSettings>;
    for (const id of Object.keys(MODULE_DEFAULTS) as SoulCordModuleId[]) modules[id] = normalizeModule(id, rawModules[id]);
    if (rawSchemaVersion < SOULCORD_SCHEMA_VERSION) modules["link-lens"].enabled = false;

    const profiles = normalizeProfiles(record.profiles);
    if (!profiles.length) profiles.push(...defaultProfiles());
    if (rawSchemaVersion < SOULCORD_SCHEMA_VERSION) for (const profile of profiles) profile.modules["link-lens"].enabled = false;

    const snapshots = Array.isArray(record.snapshots)
        ? record.snapshots.filter(isRecord).flatMap(snapshot => {
            if (typeof snapshot.id !== "string" || typeof snapshot.reason !== "string" || !isRecord(snapshot.modules) || !Array.isArray(snapshot.profiles)) return [];
            const snapshotModules = {} as Record<SoulCordModuleId, SoulCordModuleSettings>;
            for (const id of Object.keys(MODULE_DEFAULTS) as SoulCordModuleId[]) snapshotModules[id] = normalizeModule(id, snapshot.modules[id]);
            if (rawSchemaVersion < SOULCORD_SCHEMA_VERSION) snapshotModules["link-lens"].enabled = false;
            return [{
                id: snapshot.id,
                reason: snapshot.reason.slice(0, 120),
                createdAt: boundedNumber(snapshot.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
                modules: snapshotModules,
                profiles: normalizeProfiles(snapshot.profiles),
                selectedTheme: stringChoice(snapshot.selectedTheme, SOULCORD_THEMES.map(theme => theme.id), "obsidian-thread"),
                curatedAddons: normalizeCuratedAddons(snapshot.curatedAddons),
                timelinePolicy: normalizeTimelinePolicy(snapshot.timelinePolicy),
                activePlugins: normalizeAddonFileNames(snapshot.activePlugins, "plugin"),
                activeThemes: normalizeAddonFileNames(snapshot.activeThemes, "theme")
            } satisfies SoulCordSnapshot];
        }).slice(-MAX_SNAPSHOTS)
        : [];

    const updateLedger = Array.isArray(record.updateLedger)
        ? record.updateLedger.filter(isRecord).flatMap(entry => {
            if (typeof entry.detail !== "string" || typeof entry.kind !== "string") return [];
            if (!["schema", "profile", "setting", "rollback", "runtime"].includes(entry.kind)) return [];
            return [{
                at: boundedNumber(entry.at, Date.now(), 0, Number.MAX_SAFE_INTEGER),
                kind: entry.kind as "schema" | "profile" | "setting" | "rollback" | "runtime",
                detail: entry.detail.slice(0, 160),
                version: typeof entry.version === "string" ? entry.version.slice(0, 32) : "1.0.0"
            }];
        }).slice(-MAX_LEDGER_ENTRIES)
        : [];

    const migrationProvenance = Array.isArray(record.migrationProvenance)
        ? record.migrationProvenance.filter(isRecord).flatMap(entry => {
            if (typeof entry.detail !== "string") return [];
            return [{
                at: boundedNumber(entry.at, Date.now(), 0, Number.MAX_SAFE_INTEGER),
                fromSchema: boundedNumber(entry.fromSchema, 0, 0, SOULCORD_SCHEMA_VERSION),
                toSchema: boundedNumber(entry.toSchema, SOULCORD_SCHEMA_VERSION, 0, SOULCORD_SCHEMA_VERSION),
                detail: entry.detail.slice(0, 200)
            }];
        }).slice(-MAX_MIGRATION_ENTRIES)
        : [];

    if (rawSchemaVersion !== SOULCORD_SCHEMA_VERSION) {
        migrationProvenance.push({
            at: Date.now(),
            fromSchema: rawSchemaVersion,
            toSchema: SOULCORD_SCHEMA_VERSION,
            detail: "Added onboarding, theme selection, curated-addon state, Message Timeline policy, and versioned Power Lab consent; Link Lens was disabled for repaired-modal acceptance."
        });
        migrationProvenance.splice(0, Math.max(0, migrationProvenance.length - MAX_MIGRATION_ENTRIES));
    }

    const setupTransactions = Array.isArray(record.setupTransactions)
        ? record.setupTransactions.filter(isRecord).flatMap(entry => {
            if (typeof entry.id !== "string" || !/^[a-z0-9]+-[0-9a-f]{16}$/.test(entry.id) || typeof entry.snapshotId !== "string") return [];
            const priorAddonStates: Record<string, boolean> = isRecord(entry.priorAddonStates)
                ? Object.fromEntries(Object.entries(entry.priorAddonStates).filter((stateEntry): stateEntry is [string, boolean] => SOULCORD_PRESET_ADDONS.includes(stateEntry[0] as typeof SOULCORD_PRESET_ADDONS[number]) && typeof stateEntry[1] === "boolean"))
                : {};
            const priorThemeStates: Record<string, boolean> = isRecord(entry.priorThemeStates)
                ? Object.fromEntries(Object.entries(entry.priorThemeStates).filter((stateEntry): stateEntry is [string, boolean] => SOULCORD_THEMES.some(theme => theme.fileName === stateEntry[0]) && typeof stateEntry[1] === "boolean"))
                : {};
            return [{id: entry.id, at: boundedNumber(entry.at, Date.now(), 0, Number.MAX_SAFE_INTEGER), snapshotId: entry.snapshotId.slice(0, 96), priorAddonStates, priorThemeStates} satisfies SoulCordSetupTransactionRecord];
        }).slice(-MAX_SETUP_TRANSACTIONS)
        : [];

    return {
        schemaVersion: 3,
        consentVersion: 2,
        onboarding: normalizeOnboarding(record.onboarding),
        selectedTheme: stringChoice(record.selectedTheme, SOULCORD_THEMES.map(theme => theme.id), "obsidian-thread"),
        curatedAddons: normalizeCuratedAddons(record.curatedAddons),
        timelinePolicy: normalizeTimelinePolicy(record.timelinePolicy),
        powerLab: rawSchemaVersion < SOULCORD_SCHEMA_VERSION ? defaultPowerLab() : normalizePowerLab(record.powerLab),
        migrationProvenance,
        setupTransactions,
        modules,
        profiles,
        snapshots,
        updateLedger
    };
}

export function diffModules(before: Record<SoulCordModuleId, SoulCordModuleSettings>, after: Record<SoulCordModuleId, SoulCordModuleSettings>): string[] {
    const changes: string[] = [];
    for (const id of Object.keys(MODULE_DEFAULTS) as SoulCordModuleId[]) {
        if (before[id].enabled !== after[id].enabled) changes.push(`${id}: ${before[id].enabled ? "on" : "off"} → ${after[id].enabled ? "on" : "off"}`);
        const keys = new Set([...Object.keys(before[id].values), ...Object.keys(after[id].values)]);
        for (const key of keys) {
            if (JSON.stringify(before[id].values[key]) !== JSON.stringify(after[id].values[key])) changes.push(`${id}.${key}`);
        }
    }
    return changes;
}

export function serializeSoulCordSettingsExport(document: SoulCordSettingsDocument): string {
    const modules = clone(document.modules);
    modules["message-timeline"].values.scope = "dm-only";
    const exported = {
        format: "soulcord-settings",
        version: 2,
        schemaVersion: document.schemaVersion,
        selectedTheme: document.selectedTheme,
        curatedAddons: document.curatedAddons,
        timelinePolicy: {
            ...document.timelinePolicy,
            scope: "dm-only",
            serverChannelIds: []
        },
        modules,
        profiles: document.profiles,
        updateLedger: document.updateLedger,
        migrationProvenance: document.migrationProvenance
    };
    return `${JSON.stringify(exported, null, 2)}\n`;
}

function booleanLabel(value: boolean): string {
    return value ? "on" : "off";
}

export function previewSoulCordImportChanges(current: SoulCordSettingsDocument, candidate: SoulCordSettingsDocument): string[] {
    const changes = diffModules(current.modules, candidate.modules);
    const currentProfiles = new Map(current.profiles.map(profile => [profile.id, profile]));
    const candidateProfiles = new Map(candidate.profiles.map(profile => [profile.id, profile]));
    for (const id of new Set([...currentProfiles.keys(), ...candidateProfiles.keys()])) {
        const previous = currentProfiles.get(id);
        const next = candidateProfiles.get(id);
        if (!previous) changes.push(`profile ${id}: add`);
        else if (!next) changes.push(`profile ${id}: remove`);
        else if (JSON.stringify(previous) !== JSON.stringify(next)) changes.push(`profile ${id}: change`);
    }

    if (current.selectedTheme !== candidate.selectedTheme) changes.push(`theme: ${current.selectedTheme} → ${candidate.selectedTheme}`);
    for (const name of SOULCORD_PRESET_ADDONS) {
        const previous = current.curatedAddons[name];
        const next = candidate.curatedAddons[name];
        if (previous.selected !== next.selected) changes.push(`${name} selected: ${booleanLabel(previous.selected)} → ${booleanLabel(next.selected)}`);
        if (previous.enabled !== next.enabled) changes.push(`${name} enabled: ${booleanLabel(previous.enabled)} → ${booleanLabel(next.enabled)}`);
        if (previous.mode !== next.mode) changes.push(`${name} mode: ${previous.mode} → ${next.mode}`);
        if (previous.reviewedSha256 !== next.reviewedSha256) changes.push(`${name} review receipt: ${previous.reviewedSha256 ? "present" : "none"} → ${next.reviewedSha256 ? "present" : "none"}`);
        if (previous.quarantineReason !== next.quarantineReason) changes.push(`${name} quarantine: ${previous.quarantineReason ? "present" : "none"} → ${next.quarantineReason ? "present" : "none"}`);
    }

    const previousPolicy = current.timelinePolicy;
    const nextPolicy = candidate.timelinePolicy;
    if (previousPolicy.enabled !== nextPolicy.enabled) changes.push(`Message Timeline enabled: ${booleanLabel(previousPolicy.enabled)} → ${booleanLabel(nextPolicy.enabled)}`);
    if (previousPolicy.scope !== nextPolicy.scope) changes.push(`Message Timeline scope: ${previousPolicy.scope} → ${nextPolicy.scope}`);
    if (JSON.stringify(previousPolicy.serverChannelIds) !== JSON.stringify(nextPolicy.serverChannelIds)) {
        changes.push(`Message Timeline selected channels: ${previousPolicy.serverChannelIds.length} → ${nextPolicy.serverChannelIds.length} (identifiers hidden)`);
    }
    if (previousPolicy.retention !== nextPolicy.retention) changes.push(`Message Timeline retention: ${previousPolicy.retention} → ${nextPolicy.retention}`);
    if (previousPolicy.content !== nextPolicy.content) changes.push(`Message Timeline content: ${previousPolicy.content} → ${nextPolicy.content}`);
    if (previousPolicy.textBudgetBytes !== nextPolicy.textBudgetBytes) changes.push(`Message Timeline text budget: ${previousPolicy.textBudgetBytes} → ${nextPolicy.textBudgetBytes} bytes`);
    if (previousPolicy.mediaBudgetBytes !== nextPolicy.mediaBudgetBytes) changes.push(`Message Timeline media budget: ${previousPolicy.mediaBudgetBytes} → ${nextPolicy.mediaBudgetBytes} bytes`);

    const resetPowerLab = defaultPowerLab();
    if (JSON.stringify(current.powerLab) !== JSON.stringify(resetPowerLab)) {
        const acknowledged = Object.values(current.powerLab).filter(consent => consent.acknowledgementVersion > 0 || consent.acknowledgedAt).length;
        const enabled = Object.values(current.powerLab).filter(consent => consent.enabled).length;
        changes.push(`Power Lab: clear ${acknowledged} acknowledgement(s) and disable ${enabled} experiment(s)`);
    }
    return changes;
}

export interface SoulCordImportPreview {
    changes: string[];
    fingerprint: string;
}

function importState(document: SoulCordSettingsDocument): object {
    return {
        modules: document.modules,
        profiles: document.profiles,
        selectedTheme: document.selectedTheme,
        curatedAddons: document.curatedAddons,
        timelinePolicy: document.timelinePolicy,
        powerLab: document.powerLab
    };
}

export function createSoulCordImportPreview(current: SoulCordSettingsDocument, candidate: SoulCordSettingsDocument): SoulCordImportPreview {
    const normalizedPair = JSON.stringify({current: importState(current), candidate: importState(candidate)});
    return {
        changes: previewSoulCordImportChanges(current, candidate),
        fingerprint: crypto.createHash("sha256").update(normalizedPair, "utf8").digest("hex")
    };
}

export function verifySoulCordImportAtApply(current: SoulCordSettingsDocument, text: string, expectedFingerprint: string): SoulCordSettingsDocument | undefined {
    if (!/^[0-9a-f]{64}$/.test(expectedFingerprint)) return;
    const candidate = parseSoulCordImport(text);
    if (!candidate) return;
    if (createSoulCordImportPreview(current, candidate).fingerprint !== expectedFingerprint) return;
    return candidate;
}

export function restoreSnapshotState(document: SoulCordSettingsDocument, snapshotId: string): Pick<SoulCordSettingsDocument, "modules" | "profiles" | "selectedTheme" | "curatedAddons" | "timelinePolicy"> | undefined {
    const snapshot = document.snapshots.find(item => item.id === snapshotId);
    if (!snapshot) return;
    return {
        modules: clone(snapshot.modules),
        profiles: snapshot.profiles.length ? clone(snapshot.profiles) : clone(document.profiles),
        selectedTheme: snapshot.selectedTheme,
        curatedAddons: clone(snapshot.curatedAddons),
        timelinePolicy: clone(snapshot.timelinePolicy)
    };
}

export function parseSoulCordImport(text: string): SoulCordSettingsDocument | undefined {
    try {
        const parsed: unknown = JSON.parse(text);
        if (!isRecord(parsed) || parsed.format !== "soulcord-settings" || ![1, 2].includes(Number(parsed.version))) return;
        return normalizeSoulCordDocument(parsed);
    }
    catch {
        return;
    }
}

export function normalizeSetupDraft(value: unknown): SoulCordSetupDraft {
    const record = isRecord(value) ? value : {};
    const selected = Array.isArray(record.selectedAddons)
        ? [...new Set(record.selectedAddons.filter((name): name is typeof SOULCORD_PRESET_ADDONS[number] => typeof name === "string" && SOULCORD_PRESET_ADDONS.includes(name as typeof SOULCORD_PRESET_ADDONS[number])))]
        : [...SOULCORD_PRESET_ADDONS];
    const rawModes = isRecord(record.addonModes) ? record.addonModes : {};
    return {
        selectedTheme: stringChoice(record.selectedTheme, SOULCORD_THEMES.map(theme => theme.id), "obsidian-thread"),
        selectedAddons: selected,
        addonModes: Object.fromEntries(SOULCORD_PRESET_ADDONS.map(name => [name, normalizeAddonMode(rawModes[name], name)])),
        timelinePolicy: normalizeTimelinePolicy(record.timelinePolicy)
    };
}

export function previewSetupChanges(document: SoulCordSettingsDocument, rawDraft: unknown): string[] {
    const draft = normalizeSetupDraft(rawDraft);
    const changes: string[] = [];
    if (document.selectedTheme !== draft.selectedTheme) changes.push(`theme: ${document.selectedTheme} → ${draft.selectedTheme}`);
    for (const name of SOULCORD_PRESET_ADDONS) {
        const selected = draft.selectedAddons.includes(name);
        if (document.curatedAddons[name].selected !== selected) changes.push(`${name}: ${selected ? "select" : "deselect"}`);
        if (selected && !document.curatedAddons[name].enabled) {
            changes.push(name === "SplitLargeMessages" && draft.addonModes[name] === "guarded"
                ? `${name}: enable SoulCord guarded preview adapter (no community file)`
                : `${name}: stage, verify, and enable individually`);
        }
        if (!selected && document.curatedAddons[name].enabled) changes.push(`${name}: disable`);
        if (document.curatedAddons[name].mode !== draft.addonModes[name]) changes.push(`${name}.mode: ${document.curatedAddons[name].mode} → ${draft.addonModes[name]}`);
    }
    if (JSON.stringify(document.timelinePolicy) !== JSON.stringify(draft.timelinePolicy)) changes.push("Message Timeline policy");
    return changes;
}

class SoulCordStore extends Store {
    #document = normalizeSoulCordDocument(undefined);

    initialize(): void {
        let raw: unknown;
        try {
            raw = JSON.parse(fs.readFileSync(this.#filePath()).toString());
        }
        catch {
            raw = JsonStore.get("misc", "soulcordV1");
        }
        this.#document = normalizeSoulCordDocument(raw);
        if (!isRecord(raw) || raw.schemaVersion !== SOULCORD_SCHEMA_VERSION) {
            this.#appendLedger("schema", "Migrated SoulCord settings atomically to schema 3.");
        }
        this.#save();
    }

    snapshot(): SoulCordSettingsDocument {
        return clone(this.#document);
    }

    module(id: SoulCordModuleId): SoulCordModuleSettings {
        return clone(this.#document.modules[id]);
    }

    setEnabled(id: SoulCordModuleId, enabled: boolean): void {
        if (id === "plugin-doctor" && !enabled) return;
        if (this.#document.modules[id].enabled === enabled) return;
        this.capture(`Before ${enabled ? "enabling" : "disabling"} ${id}`);
        this.#document.modules[id].enabled = enabled;
        this.#appendLedger("setting", `${id} ${enabled ? "enabled" : "disabled"}.`);
        this.#save();
    }

    setValue(id: SoulCordModuleId, key: string, value: unknown): void {
        if (!/^[a-z][A-Za-z0-9]{0,63}$/.test(key)) throw new TypeError("Invalid SoulCord setting key.");
        if (!Object.hasOwn(MODULE_DEFAULTS[id].values, key)) throw new TypeError("Unknown SoulCord setting key.");
        this.capture(`Before changing ${id}.${key}`);
        this.#document.modules[id].values[key] = value;
        this.#document.modules[id] = normalizeModule(id, this.#document.modules[id]);
        this.#appendLedger("setting", `${id}.${key} changed.`);
        this.#save();
    }

    capture(reason: string, activeAddons?: {plugins?: string[]; themes?: string[]}): SoulCordSnapshot {
        const snapshot: SoulCordSnapshot = {
            id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            reason: reason.slice(0, 120),
            createdAt: Date.now(),
            modules: clone(this.#document.modules),
            profiles: clone(this.#document.profiles),
            selectedTheme: this.#document.selectedTheme,
            curatedAddons: clone(this.#document.curatedAddons),
            timelinePolicy: clone(this.#document.timelinePolicy),
            ...(activeAddons ? {
                activePlugins: normalizeAddonFileNames(activeAddons.plugins, "plugin"),
                activeThemes: normalizeAddonFileNames(activeAddons.themes, "theme")
            } : {})
        };
        this.#document.snapshots.push(snapshot);
        this.#document.snapshots.splice(0, Math.max(0, this.#document.snapshots.length - MAX_SNAPSHOTS));
        this.#save();
        return clone(snapshot);
    }

    saveProfile(name: string, selectedPlugins: string[] = [], selectedThemes: string[] = []): SoulCordProfile {
        if (this.#document.profiles.length >= MAX_PROFILES) throw new RangeError(`SoulCord keeps at most ${MAX_PROFILES} profiles.`);
        const cleanName = name.trim().slice(0, 80);
        if (!cleanName) throw new TypeError("Profile name is required.");
        const now = Date.now();
        const idBase = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "profile";
        let id = idBase;
        let suffix = 2;
        while (this.#document.profiles.some(profile => profile.id === id)) id = `${idBase}-${suffix++}`;
        const normalizedPlugins = normalizeAddonFileNames(selectedPlugins, "plugin");
        const normalizedThemes = normalizeAddonFileNames(selectedThemes, "theme");
        const profile: SoulCordProfile = {
            id,
            name: cleanName,
            createdAt: now,
            updatedAt: now,
            modules: clone(this.#document.modules),
            selectedPlugins: normalizedPlugins,
            selectedThemes: normalizedThemes,
            includesThirdPartyAddons: normalizedPlugins.length > 0 || normalizedThemes.length > 0
        };
        this.#document.profiles.push(profile);
        this.#appendLedger("profile", `Saved ${cleanName}.`);
        this.#save();
        return clone(profile);
    }

    rollback(snapshotId: string): boolean {
        const restored = restoreSnapshotState(this.#document, snapshotId);
        if (!restored) return false;
        this.capture(`Before rollback to ${snapshotId}`);
        this.#document.modules = restored.modules;
        this.#document.profiles = restored.profiles;
        this.#document.selectedTheme = restored.selectedTheme;
        this.#document.curatedAddons = restored.curatedAddons;
        this.#document.timelinePolicy = restored.timelinePolicy;
        this.#appendLedger("rollback", `Rolled back to snapshot ${snapshotId}.`);
        this.#save();
        return true;
    }

    previewProfile(profileId: string): string[] {
        const profile = this.#document.profiles.find(item => item.id === profileId);
        return profile ? diffModules(this.#document.modules, profile.modules) : [];
    }

    profile(profileId: string): SoulCordProfile | undefined {
        const profile = this.#document.profiles.find(item => item.id === profileId);
        return profile ? clone(profile) : undefined;
    }

    snapshotById(snapshotId: string): SoulCordSnapshot | undefined {
        const snapshot = this.#document.snapshots.find(item => item.id === snapshotId);
        return snapshot ? clone(snapshot) : undefined;
    }

    applyProfile(profileId: string, captureSnapshot = true): boolean {
        const profile = this.#document.profiles.find(item => item.id === profileId);
        if (!profile) return false;
        if (captureSnapshot) this.capture(`Before applying ${profile.name}`);
        this.#document.modules = clone(profile.modules);
        this.#document.modules["plugin-doctor"].enabled = true;
        this.#appendLedger("profile", `Applied ${profile.name}.`);
        this.#save();
        return true;
    }

    exportDocument(): string {
        return serializeSoulCordSettingsExport(this.#document);
    }

    previewImport(text: string): SoulCordImportPreview | undefined {
        const candidate = parseSoulCordImport(text);
        if (!candidate) return;
        return createSoulCordImportPreview(this.#document, candidate);
    }

    importDocument(text: string, expectedFingerprint: string): boolean {
        const candidate = verifySoulCordImportAtApply(this.#document, text, expectedFingerprint);
        if (!candidate) return false;
        this.capture("Before importing settings");
        this.#document.modules = candidate.modules;
        this.#document.profiles = candidate.profiles;
        this.#document.selectedTheme = candidate.selectedTheme;
        this.#document.curatedAddons = candidate.curatedAddons;
        this.#document.timelinePolicy = candidate.timelinePolicy;
        this.#document.powerLab = defaultPowerLab();
        this.#appendLedger("schema", "Imported and validated SoulCord settings format 2; Power Lab acknowledgements were not imported.");
        this.#save();
        return true;
    }

    previewSetup(draft: unknown): string[] {
        return previewSetupChanges(this.#document, draft);
    }

    completeSetup(rawDraft: unknown, installResults: Record<string, {enabled: boolean; reviewedSha256?: string; quarantineReason?: string;}>, transaction: {id: string; priorAddonStates: Record<string, boolean>; priorThemeStates: Record<string, boolean>;}): void {
        const draft = normalizeSetupDraft(rawDraft);
        const snapshot = this.capture("Before completing SoulCord setup");
        this.#document.selectedTheme = draft.selectedTheme;
        this.#document.timelinePolicy = draft.timelinePolicy;
        this.#document.modules["message-timeline"].enabled = draft.timelinePolicy.enabled;
        for (const name of SOULCORD_PRESET_ADDONS) {
            const selected = draft.selectedAddons.includes(name);
            const result = installResults[name];
            this.#document.curatedAddons[name] = {
                selected,
                enabled: selected && result?.enabled === true,
                mode: draft.addonModes[name],
                ...(typeof result?.reviewedSha256 === "string" ? {reviewedSha256: result.reviewedSha256} : {}),
                ...(typeof result?.quarantineReason === "string" ? {quarantineReason: result.quarantineReason.slice(0, 160)} : {})
            };
        }
        this.#document.onboarding = {version: 1, status: "complete", completedAt: Date.now()};
        this.#document.setupTransactions.push({id: transaction.id, at: Date.now(), snapshotId: snapshot.id, priorAddonStates: transaction.priorAddonStates, priorThemeStates: transaction.priorThemeStates});
        this.#document.setupTransactions.splice(0, Math.max(0, this.#document.setupTransactions.length - MAX_SETUP_TRANSACTIONS));
        this.#appendLedger("schema", "Completed SoulCord setup transaction version 1.");
        this.#save();
    }

    skipOnboarding(): void {
        if (this.#document.onboarding.status !== "pending") return;
        this.#document.onboarding = {version: 1, status: "skipped", completedAt: Date.now()};
        this.#appendLedger("schema", "Skipped SoulCord setup; addon and theme state was not changed.");
        this.#save();
    }

    reopenOnboarding(): void {
        this.#document.onboarding = {version: 1, status: "pending"};
        this.#appendLedger("schema", "Reopened SoulCord setup.");
        this.#save();
    }

    setCuratedAddonEnabled(name: string, enabled: boolean, quarantineReason?: string): void {
        if (!SOULCORD_PRESET_ADDONS.includes(name as typeof SOULCORD_PRESET_ADDONS[number])) throw new TypeError("Unknown curated addon.");
        const current = this.#document.curatedAddons[name];
        if (current.enabled === enabled && current.quarantineReason === quarantineReason) return;
        this.capture(`Before ${enabled ? "enabling" : "disabling"} curated addon ${name}`);
        this.#document.curatedAddons[name] = {
            ...current,
            enabled,
            ...(quarantineReason ? {quarantineReason: quarantineReason.slice(0, 160)} : {quarantineReason: undefined})
        };
        this.#appendLedger("setting", `${name} ${enabled ? "enabled" : "disabled"}.`);
        this.#save();
    }

    setTimelinePolicy(rawPolicy: unknown): void {
        const policy = normalizeTimelinePolicy(rawPolicy);
        if (JSON.stringify(policy) === JSON.stringify(this.#document.timelinePolicy)) return;
        this.capture("Before changing Message Timeline policy");
        this.#document.timelinePolicy = policy;
        this.#document.modules["message-timeline"].enabled = policy.enabled;
        this.#appendLedger("setting", `Message Timeline policy changed (${policy.enabled ? `${policy.scope}, ${policy.retention}, ${policy.content}` : "off"}).`);
        this.#save();
    }

    latestSetupTransaction(): SoulCordSetupTransactionRecord | undefined {
        const transaction = this.#document.setupTransactions.at(-1);
        return transaction ? clone(transaction) : undefined;
    }

    #appendLedger(kind: SoulCordSettingsDocument["updateLedger"][number]["kind"], detail: string): void {
        this.#document.updateLedger.push({at: Date.now(), kind, detail, version: "1.0.0"});
        this.#document.updateLedger.splice(0, Math.max(0, this.#document.updateLedger.length - MAX_LEDGER_ENTRIES));
    }

    #save(): void {
        const target = this.#filePath();
        const temporary = `${target}.${Date.now().toString(36)}.tmp`;
        fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.writeFileSync(temporary, `${JSON.stringify(clone(this.#document), null, 4)}\n`);
        try {
            fs.renameSync(temporary, target);
        }
        catch (error) {
            try {
                if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
            }
            catch {/* cleanup already best-effort */}
            throw error;
        }
        this.emitChange();
    }

    #filePath(): string {
        return path.resolve(Config.get("channelPath"), "soulcord.json");
    }
}

export default new SoulCordStore();
