// SPDX-License-Identifier: Apache-2.0

import type {SolcordDisposalScope} from "./disposal";


const PATCH_CALLER = "Solcord~DoNotTrack";
const METHOD_KEY_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/;
const MAX_METHOD_COUNT = 8;

type AnalyticsEmitter = (...args: unknown[]) => unknown;

export interface DoNotTrackSettings {
    enabled: boolean;
}

export interface AnalyticsMethodTarget {
    module: Record<string, unknown>;
    key: string;
}

/**
 * One explicitly named analytics emission method and its independent proof.
 * Solcord never enumerates a module looking for additional methods.
 */
export interface AnalyticsMethodSpec {
    readonly key: string;
    lookup(): unknown;
    validate(target: AnalyticsMethodTarget): boolean;
}

export type AnalyticsPatchCallback = (
    thisObject: unknown,
    args: unknown[],
    original: AnalyticsEmitter
) => unknown;

export interface DoNotTrackPatchAdapter {
    instead(
        caller: string,
        module: Record<string, unknown>,
        key: string,
        callback: AnalyticsPatchCallback,
        options: {forcePatch: false;}
    ): (() => void) | null | undefined;
}

export interface DoNotTrackAdapterOptions {
    scope: SolcordDisposalScope;
    patcher: DoNotTrackPatchAdapter;
    methods: readonly AnalyticsMethodSpec[];
    getSettings(): unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return (typeof value === "object" && value !== null) || typeof value === "function";
}

/**
 * Resolves only Discord's observed analytics export shape. The named
 * AnalyticEventConfigs anchor and exact default.track method must coexist;
 * callers must not fall back to enumerating arbitrary modules or methods.
 */
export function resolveDiscordAnalyticsTrack(container: unknown): AnalyticsMethodTarget | undefined {
    if (!isRecord(container) || !isRecord(container.AnalyticEventConfigs) || !isRecord(container.default)) return;
    if (typeof container.default.track !== "function") return;
    return {module: container.default, key: "track"};
}

export function validateDiscordAnalyticsTrack(container: unknown, target: AnalyticsMethodTarget): boolean {
    return resolveDiscordAnalyticsTrack(container)?.module === target.module
        && target.key === "track"
        && typeof target.module.track === "function";
}

function readMethodSpecs(value: unknown): AnalyticsMethodSpec[] | undefined {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_METHOD_COUNT) return;

    const keys = new Set<string>();
    const specs: AnalyticsMethodSpec[] = [];
    for (const candidate of value) {
        if (!isRecord(candidate)) return;
        const {key, lookup, validate} = candidate;
        if (typeof key !== "string" || !METHOD_KEY_PATTERN.test(key) || keys.has(key)) return;
        if (typeof lookup !== "function" || typeof validate !== "function") return;
        keys.add(key);
        specs.push({
            key,
            lookup: () => Reflect.apply(lookup, candidate, []),
            validate: target => Reflect.apply(validate, candidate, [target]) === true
        });
    }
    return specs;
}

export function validateAnalyticsMethodTarget(value: unknown, expectedKey: string): value is AnalyticsMethodTarget {
    if (!isRecord(value)) return false;
    const target = value as Partial<AnalyticsMethodTarget>;
    return target.key === expectedKey
        && isRecord(target.module)
        && typeof target.module[expectedKey] === "function";
}

function readSettings(value: unknown): DoNotTrackSettings | undefined {
    if (!isRecord(value) || typeof value.enabled !== "boolean") return;
    return {enabled: value.enabled};
}

function callOriginal(original: AnalyticsEmitter, thisObject: unknown, args: unknown[]): unknown {
    return Reflect.apply(original, thisObject, args);
}

function releaseAll(releases: Array<() => void>): void {
    for (const release of releases.splice(0).reverse()) {
        try {release();}
        catch {
            // Best effort: one drifting unpatch must not strand later patches.
        }
    }
}

/**
 * Suppresses only an explicit, independently validated list of Discord
 * analytics emission methods. It never inspects payloads or patches fetch,
 * XMLHttpRequest, IPC, Sentry, process monitoring, or game monitoring.
 */
export class DoNotTrackAdapter {
    readonly #options: DoNotTrackAdapterOptions;
    #releases: Array<() => void> = [];

    constructor(options: DoNotTrackAdapterOptions) {
        this.#options = options;
    }

    get active(): boolean {
        return this.#releases.length > 0 && !this.#options.scope.disposed;
    }

    start(): boolean {
        if (this.active) return true;
        if (this.#options.scope.disposed) return false;

        let specs: AnalyticsMethodSpec[] | undefined;
        try {specs = readMethodSpecs(this.#options.methods);}
        catch {return false;}
        if (!specs) return false;

        const targets: Array<{spec: AnalyticsMethodSpec; target: AnalyticsMethodTarget;}> = [];
        for (const spec of specs) {
            let candidate: unknown;
            try {candidate = spec.lookup();}
            catch {return false;}
            if (!validateAnalyticsMethodTarget(candidate, spec.key)) return false;

            let valid = false;
            try {valid = spec.validate(candidate) === true;}
            catch {return false;}
            if (!valid) return false;
            targets.push({spec, target: candidate});
        }

        const callback: AnalyticsPatchCallback = (thisObject, args, original) => {
            let settings: DoNotTrackSettings | undefined;
            try {settings = readSettings(this.#options.getSettings());}
            catch {return callOriginal(original, thisObject, args);}
            if (!settings?.enabled) return callOriginal(original, thisObject, args);
            return undefined;
        };

        const releases: Array<() => void> = [];
        for (const {spec, target} of targets) {
            let unpatch: (() => void) | null | undefined;
            try {
                unpatch = this.#options.patcher.instead(
                    PATCH_CALLER,
                    target.module,
                    spec.key,
                    callback,
                    {forcePatch: false}
                );
            }
            catch {
                releaseAll(releases);
                return false;
            }
            if (typeof unpatch !== "function") {
                releaseAll(releases);
                return false;
            }

            let unpatched = false;
            const dispose = () => {
                if (unpatched) return;
                unpatched = true;
                unpatch?.();
            };
            try {releases.push(this.#options.scope.own(dispose, "patch"));}
            catch {
                try {dispose();}
                catch {
                    // Continue rolling back any earlier successfully owned patch.
                }
                releaseAll(releases);
                return false;
            }
            if (this.#options.scope.disposed) {
                releaseAll(releases);
                return false;
            }
        }

        this.#releases = releases;
        return true;
    }

    stop(): void {
        const releases = this.#releases;
        this.#releases = [];
        releaseAll(releases);
    }
}
