import Store from "@stores/base";
import JsonStore from "@stores/json";
import Config from "@stores/config";
import fs from "@polyfill/fs";
import path from "path";

import type {
    SoulCordModuleId,
    SoulCordModuleSettings,
    SoulCordProfile,
    SoulCordSettingsDocument,
    SoulCordSnapshot
} from "./contracts";


export const SOULCORD_SCHEMA_VERSION = 2;
export const SOULCORD_CONSENT_VERSION = 1;
const MAX_SNAPSHOTS = 20;
const MAX_LEDGER_ENTRIES = 100;
const MAX_PROFILES = 50;

export const MODULE_DEFAULTS: Record<SoulCordModuleId, SoulCordModuleSettings> = {
    "activity-bridge": {enabled: true, values: {}},
    "plugin-doctor": {enabled: true, values: {failureThreshold: 3, failureWindowMinutes: 10}},
    "drift-radar": {enabled: true, values: {}},
    "performance-hud": {enabled: true, values: {showOverlay: false, sampleSeconds: 5}},
    "workspace-profiles": {enabled: true, values: {activeProfile: "activities"}},
    "command-deck": {enabled: true, values: {shortcut: "Ctrl+Alt+K"}},
    "link-lens": {enabled: true, values: {confirmAllExternal: false, removeTrackers: true}},
    "stream-shield": {enabled: false, values: {manualActive: false, previewActive: false, redactGuilds: true, redactChannels: true, redactDMs: true, redactNotifications: true, redactNotes: true, redactAccount: true}},
    "settings-time-machine": {enabled: true, values: {}},
    "accessibility-toolkit": {enabled: false, values: {reducedMotion: true, roleContrast: true, readingRuler: false, readingWidth: 0}}
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
    return {enabled: typeof value.enabled === "boolean" ? value.enabled : defaults.enabled, values};
}

function normalizeProfile(value: unknown): SoulCordProfile | null {
    if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" || !isRecord(value.modules)) return null;
    const normalizedModules = {} as Record<SoulCordModuleId, SoulCordModuleSettings>;
    for (const id of Object.keys(MODULE_DEFAULTS) as SoulCordModuleId[]) normalizedModules[id] = normalizeModule(id, value.modules[id]);
    return {
        id: value.id.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64) || "profile",
        name: value.name.slice(0, 80),
        createdAt: boundedNumber(value.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
        updatedAt: boundedNumber(value.updatedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
        modules: normalizedModules,
        selectedPlugins: Array.isArray(value.selectedPlugins) ? value.selectedPlugins.filter((item): item is string => typeof item === "string").slice(0, 100) : [],
        selectedThemes: Array.isArray(value.selectedThemes) ? value.selectedThemes.filter((item): item is string => typeof item === "string").slice(0, 100) : [],
        includesThirdPartyAddons: value.includesThirdPartyAddons === true
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

function defaultProfile(id: string, name: string, enabled: SoulCordModuleId[]): SoulCordProfile {
    const modules = clone(MODULE_DEFAULTS);
    for (const key of Object.keys(modules) as SoulCordModuleId[]) modules[key].enabled = enabled.includes(key);
    const now = Date.now();
    return {id, name, createdAt: now, updatedAt: now, modules, selectedPlugins: [], selectedThemes: [], includesThirdPartyAddons: false};
}

export function defaultProfiles(): SoulCordProfile[] {
    const safety: SoulCordModuleId[] = ["activity-bridge", "plugin-doctor", "drift-radar", "settings-time-machine", "command-deck", "link-lens"];
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
    const rawModules = isRecord(record.modules) ? record.modules : {};
    const modules = {} as Record<SoulCordModuleId, SoulCordModuleSettings>;
    for (const id of Object.keys(MODULE_DEFAULTS) as SoulCordModuleId[]) modules[id] = normalizeModule(id, rawModules[id]);

    const profiles = normalizeProfiles(record.profiles);
    if (!profiles.length) profiles.push(...defaultProfiles());

    const snapshots = Array.isArray(record.snapshots)
        ? record.snapshots.filter(isRecord).flatMap(snapshot => {
            if (typeof snapshot.id !== "string" || typeof snapshot.reason !== "string" || !isRecord(snapshot.modules) || !Array.isArray(snapshot.profiles)) return [];
            const snapshotModules = {} as Record<SoulCordModuleId, SoulCordModuleSettings>;
            for (const id of Object.keys(MODULE_DEFAULTS) as SoulCordModuleId[]) snapshotModules[id] = normalizeModule(id, snapshot.modules[id]);
            return [{
                id: snapshot.id,
                reason: snapshot.reason.slice(0, 120),
                createdAt: boundedNumber(snapshot.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
                modules: snapshotModules,
                profiles: normalizeProfiles(snapshot.profiles)
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

    return {schemaVersion: 2, consentVersion: 1, modules, profiles, snapshots, updateLedger};
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

export function restoreSnapshotState(document: SoulCordSettingsDocument, snapshotId: string): Pick<SoulCordSettingsDocument, "modules" | "profiles"> | undefined {
    const snapshot = document.snapshots.find(item => item.id === snapshotId);
    if (!snapshot) return;
    return {
        modules: clone(snapshot.modules),
        profiles: snapshot.profiles.length ? clone(snapshot.profiles) : clone(document.profiles)
    };
}

export function parseSoulCordImport(text: string): SoulCordSettingsDocument | undefined {
    try {
        const parsed: unknown = JSON.parse(text);
        if (!isRecord(parsed) || parsed.format !== "soulcord-settings" || parsed.version !== 1) return;
        return normalizeSoulCordDocument(parsed);
    }
    catch {
        return;
    }
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
            this.#appendLedger("schema", "Migrated SoulCord settings atomically to schema 2.");
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

    capture(reason: string): SoulCordSnapshot {
        const snapshot: SoulCordSnapshot = {
            id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            reason: reason.slice(0, 120),
            createdAt: Date.now(),
            modules: clone(this.#document.modules),
            profiles: clone(this.#document.profiles)
        };
        this.#document.snapshots.push(snapshot);
        this.#document.snapshots.splice(0, Math.max(0, this.#document.snapshots.length - MAX_SNAPSHOTS));
        this.#save();
        return clone(snapshot);
    }

    saveProfile(name: string): SoulCordProfile {
        if (this.#document.profiles.length >= MAX_PROFILES) throw new RangeError(`SoulCord keeps at most ${MAX_PROFILES} profiles.`);
        const cleanName = name.trim().slice(0, 80);
        if (!cleanName) throw new TypeError("Profile name is required.");
        const now = Date.now();
        const idBase = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "profile";
        let id = idBase;
        let suffix = 2;
        while (this.#document.profiles.some(profile => profile.id === id)) id = `${idBase}-${suffix++}`;
        const profile: SoulCordProfile = {
            id,
            name: cleanName,
            createdAt: now,
            updatedAt: now,
            modules: clone(this.#document.modules),
            selectedPlugins: [],
            selectedThemes: [],
            includesThirdPartyAddons: false
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
        this.#appendLedger("rollback", `Rolled back to snapshot ${snapshotId}.`);
        this.#save();
        return true;
    }

    previewProfile(profileId: string): string[] {
        const profile = this.#document.profiles.find(item => item.id === profileId);
        return profile ? diffModules(this.#document.modules, profile.modules) : [];
    }

    applyProfile(profileId: string): boolean {
        const profile = this.#document.profiles.find(item => item.id === profileId);
        if (!profile) return false;
        this.capture(`Before applying ${profile.name}`);
        this.#document.modules = clone(profile.modules);
        this.#document.modules["plugin-doctor"].enabled = true;
        this.#appendLedger("profile", `Applied ${profile.name}.`);
        this.#save();
        return true;
    }

    exportDocument(): string {
        const exported = {
            format: "soulcord-settings",
            version: 1,
            schemaVersion: this.#document.schemaVersion,
            modules: this.#document.modules,
            profiles: this.#document.profiles,
            updateLedger: this.#document.updateLedger
        };
        return `${JSON.stringify(exported, null, 2)}\n`;
    }

    previewImport(text: string): string[] | undefined {
        const candidate = parseSoulCordImport(text);
        if (!candidate) return;
        const changes = diffModules(this.#document.modules, candidate.modules);
        const currentProfiles = new Map(this.#document.profiles.map(profile => [profile.id, profile]));
        const candidateProfiles = new Map(candidate.profiles.map(profile => [profile.id, profile]));
        for (const id of new Set([...currentProfiles.keys(), ...candidateProfiles.keys()])) {
            const current = currentProfiles.get(id);
            const next = candidateProfiles.get(id);
            if (!current) changes.push(`profile ${id}: add`);
            else if (!next) changes.push(`profile ${id}: remove`);
            else if (JSON.stringify(current) !== JSON.stringify(next)) changes.push(`profile ${id}: change`);
        }
        return changes;
    }

    importDocument(text: string): boolean {
        const candidate = parseSoulCordImport(text);
        if (!candidate) return false;
        this.capture("Before importing settings");
        this.#document.modules = candidate.modules;
        this.#document.profiles = candidate.profiles;
        this.#appendLedger("schema", "Imported and validated SoulCord settings format 1.");
        this.#save();
        return true;
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
