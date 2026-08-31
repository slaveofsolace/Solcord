export const SOLCORD_STARTUP_PHASES = [
    "identity-config",
    "settings-storage",
    "runtime-initialize",
    "control-center",
    "privacy-outbound",
    "integrity-validation",
    "module-registry",
    "patch-observer",
    "background"
] as const;

export type SolcordStartupPhaseId = typeof SOLCORD_STARTUP_PHASES[number];
export type SolcordStartupPhaseLimit = "none" | "all" | SolcordStartupPhaseId;
export type SolcordStartupPhaseStatus = "held" | "running" | "complete" | "failed" | "cancelled";

export interface SolcordStartupPhaseReceipt {
    phase: SolcordStartupPhaseId;
    sequence: number;
    status: SolcordStartupPhaseStatus;
    startedAt: number;
    durationMs: number;
    resourcesBefore: Record<string, number>;
    resourcesAfter: Record<string, number>;
    resourceDelta: Record<string, number>;
    errorName?: string;
}

export interface SolcordStartupPhaseOptions {
    limit?: unknown;
    now?: () => number;
    wallNow?: () => number;
    readResources?: () => Record<string, number>;
}

const RESOURCE_KEY = /^[a-z][a-z0-9-]{0,39}$/;
const MAX_RESOURCE_KEYS = 32;
const MAX_RESOURCE_COUNT = 1_000_000;

export async function boundedSolcordStartupOperation<T>(operation: Promise<T>, timeoutMs = 2_500): Promise<T> {
    const delay = Number.isFinite(timeoutMs) ? Math.min(30_000, Math.max(1, Math.floor(timeoutMs))) : 2_500;
    let handle: ReturnType<typeof globalThis.setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
        handle = globalThis.setTimeout(() => {
            const error = new Error("SolcordStartupOperationTimedOut");
            error.name = "TimeoutError";
            reject(error);
        }, delay);
    });
    try {
        return await Promise.race([operation, timeout]);
    }
    finally {
        if (handle !== undefined) globalThis.clearTimeout(handle);
    }
}

function errorName(error: unknown): string {
    return error instanceof Error ? error.name.slice(0, 80) : typeof error;
}

function boundedResources(value: unknown): Record<string, number> {
    if (!value || typeof value !== "object") return {};
    const result: Record<string, number> = {};
    for (const [key, count] of Object.entries(value as Record<string, unknown>).slice(0, MAX_RESOURCE_KEYS)) {
        if (!RESOURCE_KEY.test(key) || typeof count !== "number" || !Number.isFinite(count) || count < 0) continue;
        result[key] = Math.min(MAX_RESOURCE_COUNT, Math.floor(count));
    }
    return result;
}

function resourceDelta(before: Record<string, number>, after: Record<string, number>): Record<string, number> {
    const delta: Record<string, number> = {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
        const value = (after[key] ?? 0) - (before[key] ?? 0);
        if (value !== 0) delta[key] = value;
    }
    return delta;
}

export function normalizeSolcordStartupPhaseLimit(value: unknown): SolcordStartupPhaseLimit {
    if (value === "none" || value === "all") return value;
    return SOLCORD_STARTUP_PHASES.includes(value as SolcordStartupPhaseId) ? value as SolcordStartupPhaseId : "all";
}

export function solcordStartupPhaseAllowed(limit: SolcordStartupPhaseLimit, phase: SolcordStartupPhaseId): boolean {
    if (limit === "all") return true;
    if (limit === "none") return false;
    return SOLCORD_STARTUP_PHASES.indexOf(phase) <= SOLCORD_STARTUP_PHASES.indexOf(limit);
}

/**
 * Coordinates startup work without retaining phase payloads. Receipts contain
 * only phase identity, bounded timings, resource counts, and sanitized error
 * classes so diagnostics cannot absorb account or message data.
 */
export class SolcordStartupPhaseController {
    readonly #limit: SolcordStartupPhaseLimit;
    readonly #now: () => number;
    readonly #wallNow: () => number;
    readonly #readResources: () => Record<string, number>;
    readonly #receipts = new Map<SolcordStartupPhaseId, SolcordStartupPhaseReceipt>();
    readonly #inFlight = new Map<SolcordStartupPhaseId, Promise<unknown>>();
    readonly #completed = new Set<SolcordStartupPhaseId>();
    #controller = new AbortController();
    #sequence = 0;

    constructor(options: SolcordStartupPhaseOptions = {}) {
        this.#limit = normalizeSolcordStartupPhaseLimit(options.limit);
        this.#now = options.now ?? (() => globalThis.performance?.now?.() ?? Date.now());
        this.#wallNow = options.wallNow ?? Date.now;
        this.#readResources = options.readResources ?? (() => ({}));
    }

    get limit(): SolcordStartupPhaseLimit {
        return this.#limit;
    }

    get signal(): AbortSignal {
        return this.#controller.signal;
    }

    allows(phase: SolcordStartupPhaseId): boolean {
        return solcordStartupPhaseAllowed(this.#limit, phase);
    }

    snapshot(): SolcordStartupPhaseReceipt[] {
        return SOLCORD_STARTUP_PHASES.flatMap(phase => {
            const receipt = this.#receipts.get(phase);
            return receipt ? [{...receipt, resourcesBefore: {...receipt.resourcesBefore}, resourcesAfter: {...receipt.resourcesAfter}, resourceDelta: {...receipt.resourceDelta}}] : [];
        });
    }

    runSync<T>(phase: SolcordStartupPhaseId, operation: (signal: AbortSignal) => T): T | undefined {
        if (!this.allows(phase)) {
            this.#recordHeld(phase);
            return;
        }
        if (this.#completed.has(phase)) return;
        if (this.#inFlight.has(phase)) throw new Error("SolcordStartupPhaseAlreadyRunning");
        const before = boundedResources(this.#readResources());
        const startedAt = this.#wallNow();
        const started = this.#now();
        const sequence = ++this.#sequence;
        this.#receipts.set(phase, this.#receipt(phase, sequence, "running", startedAt, 0, before, before));
        try {
            this.signal.throwIfAborted();
            const result = operation(this.signal);
            this.signal.throwIfAborted();
            const after = boundedResources(this.#readResources());
            this.#completed.add(phase);
            this.#receipts.set(phase, this.#receipt(phase, sequence, "complete", startedAt, this.#elapsed(started), before, after));
            return result;
        }
        catch (error) {
            const after = boundedResources(this.#readResources());
            const status: SolcordStartupPhaseStatus = this.signal.aborted ? "cancelled" : "failed";
            this.#receipts.set(phase, {...this.#receipt(phase, sequence, status, startedAt, this.#elapsed(started), before, after), errorName: errorName(error)});
            throw error;
        }
    }

    run<T>(phase: SolcordStartupPhaseId, operation: (signal: AbortSignal) => Promise<T> | T): Promise<T | undefined> {
        if (!this.allows(phase)) {
            this.#recordHeld(phase);
            return Promise.resolve(undefined);
        }
        const existing = this.#inFlight.get(phase);
        if (existing) return existing as Promise<T>;
        if (this.#completed.has(phase)) return Promise.resolve(undefined);

        const before = boundedResources(this.#readResources());
        const startedAt = this.#wallNow();
        const started = this.#now();
        const sequence = ++this.#sequence;
        this.#receipts.set(phase, this.#receipt(phase, sequence, "running", startedAt, 0, before, before));
        const task = Promise.resolve().then(async () => {
            try {
                this.signal.throwIfAborted();
                const result = await operation(this.signal);
                this.signal.throwIfAborted();
                const after = boundedResources(this.#readResources());
                this.#completed.add(phase);
                this.#receipts.set(phase, this.#receipt(phase, sequence, "complete", startedAt, this.#elapsed(started), before, after));
                return result;
            }
            catch (error) {
                const after = boundedResources(this.#readResources());
                const status: SolcordStartupPhaseStatus = this.signal.aborted ? "cancelled" : "failed";
                this.#receipts.set(phase, {...this.#receipt(phase, sequence, status, startedAt, this.#elapsed(started), before, after), errorName: errorName(error)});
                throw error;
            }
            finally {
                this.#inFlight.delete(phase);
            }
        });
        this.#inFlight.set(phase, task);
        return task;
    }

    cancel(reason = "SolcordStartupCancelled"): void {
        if (!this.#controller.signal.aborted) this.#controller.abort(new Error(reason.slice(0, 80)));
    }

    #recordHeld(phase: SolcordStartupPhaseId): void {
        if (this.#receipts.has(phase)) return;
        const resources = boundedResources(this.#readResources());
        this.#receipts.set(phase, this.#receipt(phase, ++this.#sequence, "held", this.#wallNow(), 0, resources, resources));
    }

    #elapsed(started: number): number {
        const elapsed = this.#now() - started;
        return Number.isFinite(elapsed) && elapsed > 0 ? Math.round(elapsed * 10) / 10 : 0;
    }

    #receipt(phase: SolcordStartupPhaseId, sequence: number, status: SolcordStartupPhaseStatus, startedAt: number, durationMs: number, before: Record<string, number>, after: Record<string, number>): SolcordStartupPhaseReceipt {
        return {
            phase,
            sequence,
            status,
            startedAt: Number.isSafeInteger(startedAt) && startedAt >= 0 ? startedAt : 0,
            durationMs,
            resourcesBefore: before,
            resourcesAfter: after,
            resourceDelta: resourceDelta(before, after)
        };
    }
}
