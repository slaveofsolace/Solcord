import Store from "@stores/base";
import JsonStore from "@stores/json";
import {failuresInWindow, shouldQuarantine} from "./quarantine-policy";

const TEN_MINUTES = 10 * 60 * 1_000;
const MAX_FAILURES_PER_ADDON = 20;

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

    for (const [rawId, value] of Object.entries(raw.records)) {
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
        records[addonId] = {
            addonId,
            failures,
            quarantinedAt: typeof candidate.quarantinedAt === "number" ? candidate.quarantinedAt : undefined,
            quarantineReason: typeof candidate.quarantineReason === "string" ? candidate.quarantineReason.slice(0, 160) : undefined,
            lastSuccessfulStart: typeof candidate.lastSuccessfulStart === "number" ? candidate.lastSuccessfulStart : undefined
        };
    }
    return {version: 1, records};
}

class PluginDoctorStore extends Store {
    #document: StoredDoctorDocument = {version: 1, records: {}};
    #initialized = false;

    initialize(): void {
        if (this.#initialized) return;
        this.#initialized = true;
        this.#document = normalize(JsonStore.get("misc", "soulcordPluginDoctor"));
        this.#prune();
        this.#save();
    }

    isQuarantined(addonId: string): boolean {
        return Boolean(this.#document.records[safeId(addonId)]?.quarantinedAt);
    }

    recordFailure(addonId: string, phase: AddonFailure["phase"], error: unknown, now = Date.now()): boolean {
        this.initialize();
        const id = safeId(addonId);
        const record = this.#document.records[id] ??= {addonId: id, failures: []};
        record.failures.push({at: now, phase, errorName: errorName(error)});
        record.failures = failuresInWindow(record.failures, now, TEN_MINUTES).slice(-MAX_FAILURES_PER_ADDON);
        if (!record.quarantinedAt && shouldQuarantine(record.failures, now)) {
            record.quarantinedAt = now;
            record.quarantineReason = `Three failures within ten minutes; last phase: ${phase}.`;
        }
        this.#save();
        return Boolean(record.quarantinedAt);
    }

    recordSuccessfulStart(addonId: string, now = Date.now()): void {
        this.initialize();
        const id = safeId(addonId);
        const record = this.#document.records[id] ??= {addonId: id, failures: []};
        record.lastSuccessfulStart = now;
        this.#save();
    }

    clearQuarantine(addonId: string): boolean {
        this.initialize();
        const record = this.#document.records[safeId(addonId)];
        if (!record?.quarantinedAt) return false;
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
            if (!record.quarantinedAt && !record.failures.length && !record.lastSuccessfulStart) delete this.#document.records[id];
        }
    }

    #save(): void {
        JsonStore.set("misc", "soulcordPluginDoctor", structuredClone(this.#document));
        this.emitChange();
    }
}

export default new PluginDoctorStore();
