// SPDX-License-Identifier: Apache-2.0

import type {SolcordDisposalScope} from "./disposal";


const PATCH_CALLER = "Solcord~InvisibleTyping";
const TYPING_START_KEY = "startTyping";
const CHANNEL_ID_PATTERN = /^\d{1,32}$/;
const MAX_ALLOWLIST_SIZE = 10_000;

type TypingStart = (...args: unknown[]) => unknown;

export interface InvisibleTypingSettings {
    enabled: boolean;
    allowlistChannelIds: readonly string[];
}
export interface TypingStartTarget {
    module: Record<string, unknown>;
    key: string;
}

export type TypingStartPatchCallback = (
    thisObject: unknown,
    args: unknown[],
    original: TypingStart
) => unknown;

export interface InvisibleTypingPatchAdapter {
    instead(
        caller: string,
        module: Record<string, unknown>,
        key: string,
        callback: TypingStartPatchCallback,
        options: {forcePatch: false;}
    ): (() => void) | null | undefined;
}

export interface InvisibleTypingAdapterOptions {
    scope: SolcordDisposalScope;
    patcher: InvisibleTypingPatchAdapter;
    lookupTypingStart(): unknown;
    getSettings(): unknown;
    validateTypingStart?(target: TypingStartTarget): boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return (typeof value === "object" && value !== null) || typeof value === "function";
}

export function isDiscordChannelId(value: unknown): value is string {
    return typeof value === "string" && CHANNEL_ID_PATTERN.test(value);
}

export function validateTypingStartTarget(value: unknown): value is TypingStartTarget {
    if (!isRecord(value)) return false;
    const target = value as Partial<TypingStartTarget>;
    return target.key === TYPING_START_KEY
        && isRecord(target.module)
        && typeof target.module[TYPING_START_KEY] === "function";
}

function readSettings(value: unknown): {enabled: boolean; allowlist: Set<string>;} | undefined {
    if (!isRecord(value) || typeof value.enabled !== "boolean" || !Array.isArray(value.allowlistChannelIds)) return;
    if (value.allowlistChannelIds.length > MAX_ALLOWLIST_SIZE) return;

    const allowlist = new Set<string>();
    for (const channelId of value.allowlistChannelIds) {
        if (!isDiscordChannelId(channelId)) return;
        allowlist.add(channelId);
    }
    return {enabled: value.enabled, allowlist};
}

function callOriginal(original: TypingStart, thisObject: unknown, args: unknown[]): unknown {
    return Reflect.apply(original, thisObject, args);
}

/**
 * Owns the single outgoing typing-action patch. The controller never touches
 * incoming typing stores, message dispatch, or message-send actions.
 */
export class InvisibleTypingAdapter {
    readonly #options: InvisibleTypingAdapterOptions;
    #releasePatch?: () => void;

    constructor(options: InvisibleTypingAdapterOptions) {
        this.#options = options;
    }

    get active(): boolean {
        return Boolean(this.#releasePatch) && !this.#options.scope.disposed;
    }

    start(): boolean {
        if (this.active) return true;
        if (this.#options.scope.disposed) return false;

        let candidate: unknown;
        try {candidate = this.#options.lookupTypingStart();}
        catch {return false;}
        if (!validateTypingStartTarget(candidate)) return false;

        try {
            if (this.#options.validateTypingStart?.(candidate) === false) return false;
        }
        catch {
            return false;
        }

        const callback: TypingStartPatchCallback = (thisObject, args, original) => {
            const channelId = args[0];
            if (!isDiscordChannelId(channelId)) return callOriginal(original, thisObject, args);

            let settings: {enabled: boolean; allowlist: Set<string>;} | undefined;
            try {settings = readSettings(this.#options.getSettings());}
            catch {return callOriginal(original, thisObject, args);}

            if (!settings?.enabled || settings.allowlist.has(channelId)) return callOriginal(original, thisObject, args);
            return undefined;
        };

        let unpatch: (() => void) | null | undefined;
        try {
            unpatch = this.#options.patcher.instead(
                PATCH_CALLER,
                candidate.module,
                candidate.key,
                callback,
                {forcePatch: false}
            );
        }
        catch {
            return false;
        }
        if (typeof unpatch !== "function") return false;

        let released = false;
        const dispose = () => {
            if (released) return;
            released = true;
            unpatch?.();
        };
        try {
            this.#releasePatch = this.#options.scope.own(dispose, "patch");
        }
        catch {
            dispose();
            return false;
        }
        if (this.#options.scope.disposed) {
            this.#releasePatch = undefined;
            return false;
        }
        return true;
    }

    stop(): void {
        const release = this.#releasePatch;
        this.#releasePatch = undefined;
        release?.();
    }
}
