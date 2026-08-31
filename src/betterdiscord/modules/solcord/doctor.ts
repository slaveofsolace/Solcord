import Store from "@stores/base";
import JsonStore from "@stores/json";
import {failuresInWindow, shouldQuarantine} from "./quarantine-policy";

const TEN_MINUTES = 10 * 60 * 1_000;
const MAX_FAILURES_PER_ADDON = 20;
const MAX_ADDON_RECORDS = 512;
const SUCCESS_WRITE_INTERVAL = 60_000;
const LEGACY_CAPABILITY_MISS_REASON = "Three failures within ten minutes; last phase: start.";

export interface AddonFailure {
    at: number;
    phase: "compile" | "construct" | "load" | "start" | "stop" | "switch" | "mutation";
    errorName: string;
}

export interface AddonDoctorRecord {
    addonId: string;
    failures: AddonFailure[];
    quarantinedAt?: number;
    quarantineReason?: string;
    lastSuccessfulStart?: number;
}

interface StoredDoctorDocument {
    version: 1;
    records: Record<string, AddonDoctorRecord>;
}

function safeId(value: unknown): string {
    if (typeof value !== "string") return "unknown-addon";
    return value.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "unknown-addon";
}

function errorName(error: unknown): string {
    if (error instanceof Error && error.name) return error.name.slice(0, 80);
    return typeof error === "object" && error !== null ? "NonErrorObject" : typeof error;
}

function normalize(raw: unknown): StoredDoctorDocument {
    const records: Record<string, AddonDoctorRecord> = {};
    if (typeof raw !== "object" || raw === null || !("records" in raw) || typeof raw.records !== "object" || raw.records === null) {
        return {version: 1, records};
    }

    let acceptedRecords = 0;
    for (const rawId in raw.records) {
        if (acceptedRecords >= MAX_ADDON_RECORDS) break;
        if (!Object.hasOwn(raw.records, rawId)) continue;
        const value = (raw.records as Record<string, unknown>)[rawId];
        if (typeof value !== "object" || value === null) continue;
        const addonId = safeId(rawId);
        const candidate = value as Partial<AddonDoctorRecord>;
        const failures = Array.isArray(candidate.failures) ? candidate.failures.flatMap(item => {
            if (typeof item !== "object" || item === null) return [];
            const failure = item as Partial<AddonFailure>;
            if (typeof failure.at !== "number" || !Number.isFinite(failure.at)) return [];
            if (!failure.phase || !["compile", "construct", "load", "start", "stop", "switch", "mutation"].includes(failure.phase)) return [];
            return [{at: failure.at, phase: failure.phase, errorName: safeId(failure.errorName)} satisfies AddonFailure];
        }).slice(-MAX_FAILURES_PER_ADDON) : [];
        const quarantinedAt = typeof candidate.quarantinedAt === "number" && Number.isFinite(candidate.quarantinedAt) && candidate.quarantinedAt >= 0 ? candidate.quarantinedAt : undefined;
        const lastSuccessfulStart = typeof candidate.lastSuccessfulStart === "number" && Number.isFinite(candidate.lastSuccessfulStart) && candidate.lastSuccessfulStart >= 0 ? candidate.lastSuccessfulStart : undefined;
        records[addonId] = {
            addonId,
            failures,
            quarantinedAt,
            quarantineReason: quarantinedAt !== undefined && typeof candidate.quarantineReason === "string" ? candidate.quarantineReason.slice(0, 160) : undefined,
            lastSuccessfulStart
        };
        acceptedRecords++;
    }
    return {version: 1, records};
}

export class PluginDoctorStore extends Store {
    #document: StoredDoctorDocument = {version: 1, records: {}};
    #initialized = false;

    initialize(): void {
        if (this.#initialized) return;
        this.#initialized = true;
        this.#document = normalize(JsonStore.get("misc", "solcordPluginDoctor"));
        this.#prune();
        this.#save();
    }

    isQuarantined(addonId: string): boolean {
        this.initialize();
        return this.#document.records[safeId(addonId)]?.quarantinedAt !== undefined;
    }

    isAnyQuarantined(...addonIds: string[]): boolean {
        this.initialize();
        return addonIds.some(addonId => this.#document.records[safeId(addonId)]?.quarantinedAt !== undefined);
    }

    /**
     * A missing or not-yet-ready Discord capability is a product readiness
     * state, not an addon crash. Callers may use this to preserve an existing
     * quarantine decision without adding a failure or extending its window.
     */
    recordCapabilityMiss(addonId: string): boolean {
        this.initialize();
        return this.#document.records[safeId(addonId)]?.quarantinedAt !== undefined;
    }

    /**
     * RC4 incorrectly classified a structurally unavailable first-party
     * capability as three generic start failures. Runtime migration may call
     * this only for an owned provider with no active community implementation.
     * Manual quarantines and every non-matching runtime failure remain held.
     */
    clearLegacyCapabilityMissQuarantine(addonId: string): boolean {
        this.initialize();
        const record = this.#document.records[safeId(addonId)];
        if (record?.quarantinedAt === undefined
            || record.quarantineReason !== LEGACY_CAPABILITY_MISS_REASON
            || record.failures.length < 3
            || record.failures.some(failure => failure.phase !== "start" || failure.errorName !== "Error")) return false;
        record.failures = [];
        delete record.quarantinedAt;
        delete record.quarantineReason;
        this.#save();
        return true;
    }

    recordFailure(addonId: string, phase: AddonFailure["phase"], error: unknown, now = Date.now()): boolean {
        this.initialize();
        now = Number.isFinite(now) && now >= 0 ? now : Date.now();
        const id = safeId(addonId);
        const record = this.#document.records[id] ??= {addonId: id, failures: []};
        record.failures.push({at: now, phase, errorName: errorName(error)});
        record.failures = failuresInWindow(record.failures, now, TEN_MINUTES).slice(-MAX_FAILURES_PER_ADDON);
        if (record.quarantinedAt === undefined && shouldQuarantine(record.failures, now)) {
            record.quarantinedAt = now;
            record.quarantineReason = `Three failures within ten minutes; last phase: ${phase}.`;
        }
        this.#save();
        return record.quarantinedAt !== undefined;
    }

    recordSuccessfulStart(addonId: string, now = Date.now()): void {
        this.initialize();
        now = Number.isFinite(now) && now >= 0 ? now : Date.now();
        const id = safeId(addonId);
        const record = this.#document.records[id] ??= {addonId: id, failures: []};
        if (record.quarantinedAt !== undefined) return;
        if (record.lastSuccessfulStart !== undefined && now >= record.lastSuccessfulStart && now - record.lastSuccessfulStart < SUCCESS_WRITE_INTERVAL) return;
        record.lastSuccessfulStart = now;
        this.#save();
    }

    quarantine(addonId: string, reason: string, now = Date.now()): void {
        this.initialize();
        now = Number.isFinite(now) && now >= 0 ? now : Date.now();
        const id = safeId(addonId);
        const record = this.#document.records[id] ??= {addonId: id, failures: []};
        record.quarantinedAt = now;
        record.quarantineReason = reason.slice(0, 160);
        this.#save();
    }

    clearQuarantine(addonId: string): boolean {
        this.initialize();
        const record = this.#document.records[safeId(addonId)];
        if (record?.quarantinedAt === undefined) return false;
        record.failures = [];
        delete record.quarantinedAt;
        delete record.quarantineReason;
        this.#save();
        return true;
    }

    snapshot(): AddonDoctorRecord[] {
        this.initialize();
        return structuredClone(Object.values(this.#document.records).sort((a, b) => a.addonId.localeCompare(b.addonId)));
    }

    #prune(now = Date.now()): void {
        for (const [id, record] of Object.entries(this.#document.records)) {
            record.failures = failuresInWindow(record.failures, now, TEN_MINUTES).slice(-MAX_FAILURES_PER_ADDON);
            if (record.quarantinedAt === undefined && !record.failures.length && record.lastSuccessfulStart === undefined) delete this.#document.records[id];
        }
    }

    #save(): void {
        JsonStore.set("misc", "solcordPluginDoctor", structuredClone(this.#document));
        this.emitChange();
    }
}

export default new PluginDoctorStore();
