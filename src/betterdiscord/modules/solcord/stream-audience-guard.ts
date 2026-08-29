export const SOLCORD_AUDIENCE_GUARD_PROMISE = "Your stream will not start or continue while a denied user is detected in the current call or viewer list.";

const DISCORD_ID = /^\d{1,32}$/;
const MAX_DENIED_USERS = 100;
const STOP_VERIFICATION_MS = 3_000;

export interface SolcordAudienceGuardModes {
    preventStart: boolean;
    stopOnJoin: boolean;
    stopOnWatch: boolean;
}

export interface SolcordAudienceGuardEntry {
    userId: string;
    label?: string;
}

export interface SolcordAudienceGuardPrivatePolicy {
    version: 1;
    entries: SolcordAudienceGuardEntry[];
}

export type SolcordAudienceGuardPhase = "off" | "ready" | "armed" | "blocked" | "stopping" | "attention" | "unavailable";

export interface SolcordAudienceGuardStatus {
    phase: SolcordAudienceGuardPhase;
    detail: string;
    available: boolean;
    armed: boolean;
    accountBound: boolean;
    channelBound: boolean;
    denylistCount: number;
    detectedCount: number;
    activeModes: SolcordAudienceGuardModes;
    lastTrigger?: "prevent-start" | "stop-on-join" | "stop-on-watch";
}

export interface SolcordAudienceGuardAdapter {
    currentAccountId(): string | undefined;
    currentVoiceChannelId(): string | undefined;
    currentStream(): unknown;
    voiceMemberIds(channelId: string): readonly string[];
    viewerIds(stream: unknown): readonly string[];
    stopOwnStream(): void | Promise<void>;
    interceptStreamStart(decide: () => boolean): (() => void) | undefined;
    subscribe(listener: () => void): (() => void) | undefined;
    setTimer(callback: () => void, delay: number): unknown;
    clearTimer(handle: unknown): void;
}

function boundedLabel(value: unknown): string | undefined {
    if (typeof value !== "string") return;
    const printable = [...value].map(character => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127 ? " " : character;
    }).join("");
    const normalized = printable.replace(/\s+/g, " ").trim().slice(0, 80);
    return normalized || undefined;
}

export function normalizeAudienceGuardEntries(value: unknown): SolcordAudienceGuardEntry[] {
    if (!Array.isArray(value)) return [];
    const entries: SolcordAudienceGuardEntry[] = [];
    const seen = new Set<string>();
    for (const candidate of value) {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
        const record = candidate as Record<string, unknown>;
        if (typeof record.userId !== "string" || !DISCORD_ID.test(record.userId) || seen.has(record.userId)) continue;
        seen.add(record.userId);
        const label = boundedLabel(record.label);
        entries.push({userId: record.userId, ...(label ? {label} : {})});
        if (entries.length === MAX_DENIED_USERS) break;
    }
    return entries;
}

export function normalizeAudienceGuardPrivatePolicy(value: unknown): SolcordAudienceGuardPrivatePolicy {
    const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    return {version: 1, entries: normalizeAudienceGuardEntries(record.entries)};
}

export function normalizeAudienceGuardIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((id): id is string => typeof id === "string" && DISCORD_ID.test(id)))].slice(0, 10_000);
}

export function audienceGuardIdsFromVoiceStates(value: unknown): string[] {
    const candidates = value instanceof Map
        ? [...value.entries()].flatMap(([key, entry]) => [key, entry])
        : Array.isArray(value)
            ? value
            : value && typeof value === "object"
                ? Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => [key, entry])
                : [];
    const ids: string[] = [];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && DISCORD_ID.test(candidate)) {ids.push(candidate);}
        else if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
            const record = candidate as Record<string, unknown>;
            const user = record.user && typeof record.user === "object" ? record.user as Record<string, unknown> : undefined;
            const id = record.userId ?? record.user_id ?? user?.id;
            if (typeof id === "string" && DISCORD_ID.test(id)) ids.push(id);
        }
    }
    return [...new Set(ids)].slice(0, 10_000);
}

export function audienceGuardHealthMaturity(status: Pick<SolcordAudienceGuardStatus, "phase">): "preview" | "unavailable" {
    return status.phase === "unavailable" ? "unavailable" : "preview";
}

export function isAudienceGuardStartAction(value: unknown): value is (...args: unknown[]) => unknown {
    if (typeof value !== "function") return false;
    const source = Function.prototype.toString.call(value);
    return source.length <= 24_000
        && source.includes("startStreamWithSource")
        && source.includes("no user or channel")
        && source.includes("no source")
        && source.includes("no permission");
}

export function isAudienceGuardStopAction(value: unknown): value is (...args: unknown[]) => unknown {
    if (typeof value !== "function") return false;
    const source = Function.prototype.toString.call(value);
    return source.length <= 1_000
        && source.includes("getCurrentUserActiveStream")
        && source.includes("arguments.length>0")
        && source.includes("null!=t");
}

export function deniedAudienceMatches(denied: ReadonlySet<string>, observed: unknown): string[] {
    return normalizeAudienceGuardIds(observed).filter(id => denied.has(id)).slice(0, MAX_DENIED_USERS);
}

export function validateAudienceGuardAdapter(adapter: SolcordAudienceGuardAdapter): boolean {
    return typeof adapter.currentAccountId === "function"
        && typeof adapter.currentVoiceChannelId === "function"
        && typeof adapter.currentStream === "function"
        && typeof adapter.voiceMemberIds === "function"
        && typeof adapter.viewerIds === "function"
        && typeof adapter.stopOwnStream === "function"
        && typeof adapter.interceptStreamStart === "function"
        && typeof adapter.subscribe === "function"
        && typeof adapter.setTimer === "function"
        && typeof adapter.clearTimer === "function";
}

const NO_MODES: SolcordAudienceGuardModes = {preventStart: false, stopOnJoin: false, stopOnWatch: false};

export class SolcordStreamAudienceGuard {
    #adapter: SolcordAudienceGuardAdapter;
    #onStatus?: (status: SolcordAudienceGuardStatus) => void;
    #started = false;
    #available = false;
    #armedAccountId?: string;
    #armedChannelId?: string;
    #denied = new Set<string>();
    #modes: SolcordAudienceGuardModes = {...NO_MODES};
    #unsubscribe?: () => void;
    #unpatchStart?: () => void;
    #verifyTimer?: unknown;
    #stopLatch?: unknown;
    #status: SolcordAudienceGuardStatus = {
        phase: "off",
        detail: "Audience Guard is off.",
        available: false,
        armed: false,
        accountBound: false,
        channelBound: false,
        denylistCount: 0,
        detectedCount: 0,
        activeModes: {...NO_MODES}
    };

    constructor(adapter: SolcordAudienceGuardAdapter, onStatus?: (status: SolcordAudienceGuardStatus) => void) {
        this.#adapter = adapter;
        this.#onStatus = onStatus;
    }

    start(): boolean {
        if (this.#started) return this.#available;
        this.#started = true;
        if (!validateAudienceGuardAdapter(this.#adapter)) {
            this.#publish({phase: "unavailable", detail: "Audience Guard stayed unavailable because its Discord adapters did not pass structural validation.", available: false});
            return false;
        }
        this.#unpatchStart = this.#adapter.interceptStreamStart(() => this.#allowStart());
        this.#unsubscribe = this.#adapter.subscribe(() => this.synchronize());
        if (!this.#unpatchStart || !this.#unsubscribe) {
            this.#unpatchStart?.();
            this.#unsubscribe?.();
            this.#unpatchStart = undefined;
            this.#unsubscribe = undefined;
            this.#publish({phase: "unavailable", detail: "Audience Guard stayed unavailable because start interception or stream observation could not be installed.", available: false});
            return false;
        }
        this.#available = true;
        this.#publish({phase: "ready", detail: "Audience Guard is ready but not armed.", available: true});
        return true;
    }

    stop(): void {
        this.#clearVerification();
        this.#unpatchStart?.();
        this.#unsubscribe?.();
        this.#unpatchStart = undefined;
        this.#unsubscribe = undefined;
        this.#started = false;
        this.#available = false;
        this.#stopLatch = undefined;
        this.#clearPrivateState();
        this.#publish({
            phase: "off",
            detail: "Audience Guard is off.",
            available: false,
            armed: false,
            accountBound: false,
            channelBound: false,
            denylistCount: 0,
            detectedCount: 0,
            activeModes: {...NO_MODES},
            lastTrigger: undefined
        });
    }

    arm(entries: unknown, modes: SolcordAudienceGuardModes): boolean {
        if (!this.#available) return false;
        const accountId = this.#adapter.currentAccountId();
        const channelId = this.#adapter.currentVoiceChannelId();
        const normalizedEntries = normalizeAudienceGuardEntries(entries);
        if (!accountId || !DISCORD_ID.test(accountId) || !channelId || !DISCORD_ID.test(channelId) || !normalizedEntries.length) {
            this.disarm("Audience Guard needs a validated account, current voice channel, and at least one denied user before it can be armed.");
            return false;
        }
        if (!modes.preventStart && !modes.stopOnJoin && !modes.stopOnWatch) {
            this.disarm("Audience Guard needs at least one protection mode before it can be armed.");
            return false;
        }
        this.#armedAccountId = accountId;
        this.#armedChannelId = channelId;
        this.#denied = new Set(normalizedEntries.map(entry => entry.userId));
        this.#modes = {...modes};
        this.#stopLatch = undefined;
        this.#publish({
            phase: "armed",
            detail: SOLCORD_AUDIENCE_GUARD_PROMISE,
            available: true,
            armed: true,
            accountBound: true,
            channelBound: true,
            denylistCount: this.#denied.size,
            detectedCount: 0,
            activeModes: {...this.#modes},
            lastTrigger: undefined
        });
        this.synchronize();
        return true;
    }

    disarm(detail = "Audience Guard was disarmed for this call."): boolean {
        const wasArmed = Boolean(this.#armedAccountId || this.#armedChannelId || this.#denied.size);
        this.#clearVerification();
        this.#stopLatch = undefined;
        this.#clearPrivateState();
        this.#publish({
            phase: this.#available ? "ready" : "off",
            detail,
            available: this.#available,
            armed: false,
            accountBound: false,
            channelBound: false,
            denylistCount: 0,
            detectedCount: 0,
            activeModes: {...NO_MODES},
            lastTrigger: undefined
        });
        return wasArmed;
    }

    snapshot(): SolcordAudienceGuardStatus {
        return structuredClone(this.#status);
    }

    synchronize(): void {
        if (!this.#status.armed || !this.#armedAccountId || !this.#armedChannelId) return;
        const accountId = this.#adapter.currentAccountId();
        const channelId = this.#adapter.currentVoiceChannelId();
        if (accountId !== this.#armedAccountId || channelId !== this.#armedChannelId) {
            this.disarm("Audience Guard disarmed because the Discord account or voice channel changed.");
            return;
        }
        const stream = this.#adapter.currentStream();
        if (!stream) {
            this.#stopLatch = undefined;
            this.#clearVerification();
            if (this.#status.phase !== "armed") this.#publish({phase: "armed", detail: SOLCORD_AUDIENCE_GUARD_PROMISE, detectedCount: 0, lastTrigger: undefined});
            return;
        }
        if (this.#modes.stopOnJoin) {
            const deniedInChannel = deniedAudienceMatches(this.#denied, this.#adapter.voiceMemberIds(this.#armedChannelId));
            if (deniedInChannel.length) {
                this.#requestStop(stream, "stop-on-join", deniedInChannel.length);
                return;
            }
        }
        if (this.#modes.stopOnWatch) {
            const deniedViewers = deniedAudienceMatches(this.#denied, this.#adapter.viewerIds(stream));
            if (deniedViewers.length) this.#requestStop(stream, "stop-on-watch", deniedViewers.length);
        }
    }

    #allowStart(): boolean {
        if (!this.#status.armed || !this.#modes.preventStart || !this.#armedChannelId) return true;
        if (this.#adapter.currentAccountId() !== this.#armedAccountId || this.#adapter.currentVoiceChannelId() !== this.#armedChannelId) {
            this.disarm("Audience Guard disarmed before Go Live because the Discord account or voice channel changed.");
            return true;
        }
        const matches = deniedAudienceMatches(this.#denied, this.#adapter.voiceMemberIds(this.#armedChannelId));
        if (!matches.length) return true;
        this.#publish({phase: "blocked", detail: "Go Live was not started because a denied user is present in this voice channel.", detectedCount: matches.length, lastTrigger: "prevent-start"});
        return false;
    }

    #requestStop(stream: unknown, trigger: "stop-on-join" | "stop-on-watch", detectedCount: number): void {
        if (this.#stopLatch === stream) return;
        this.#stopLatch = stream;
        this.#publish({phase: "stopping", detail: trigger === "stop-on-watch" ? "Stopping Go Live because a denied viewer was detected. Brief frame exposure cannot be ruled out." : "Stopping Go Live because a denied user entered this voice channel.", detectedCount, lastTrigger: trigger});
        try {
            const result = this.#adapter.stopOwnStream();
            void Promise.resolve(result).then(() => {
                if (this.#stopLatch !== stream) return;
                this.#clearVerification();
                this.#verifyTimer = this.#adapter.setTimer(() => {
                    this.#verifyTimer = undefined;
                    if (this.#adapter.currentStream()) {
                        this.#publish({phase: "attention", detail: "Solcord could not verify that Go Live stopped. Stop sharing manually now.", detectedCount, lastTrigger: trigger});
                    }
                    else {
                        this.#stopLatch = undefined;
                        this.#publish({phase: "armed", detail: "Go Live stopped. Audience Guard remains armed for this call.", detectedCount: 0, lastTrigger: trigger});
                    }
                }, STOP_VERIFICATION_MS);
            }, () => this.#stopFailed(trigger, detectedCount));
        }
        catch {this.#stopFailed(trigger, detectedCount);}
    }

    #stopFailed(trigger: "stop-on-join" | "stop-on-watch", detectedCount: number): void {
        this.#publish({phase: "attention", detail: "Solcord could not request a verified Go Live stop. Stop sharing manually now.", detectedCount, lastTrigger: trigger});
    }

    #clearVerification(): void {
        if (this.#verifyTimer === undefined) return;
        this.#adapter.clearTimer(this.#verifyTimer);
        this.#verifyTimer = undefined;
    }

    #clearPrivateState(): void {
        this.#armedAccountId = undefined;
        this.#armedChannelId = undefined;
        this.#denied.clear();
        this.#modes = {...NO_MODES};
    }

    #publish(patch: Partial<SolcordAudienceGuardStatus>): void {
        this.#status = {...this.#status, ...patch, activeModes: patch.activeModes ? {...patch.activeModes} : {...this.#status.activeModes}};
        this.#onStatus?.(this.snapshot());
    }
}
