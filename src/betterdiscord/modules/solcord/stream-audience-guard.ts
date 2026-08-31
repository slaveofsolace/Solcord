export const SOLCORD_AUDIENCE_GUARD_PROMISE = "Your stream will not start or continue while a denied user is detected in the current call or viewer list.";

const DISCORD_ID = /^[1-9]\d{16,19}$/;
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

export interface SolcordAudienceGuardArmReadiness {
    ready: boolean;
    detail: string;
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
        try {
            this.#unpatchStart = this.#adapter.interceptStreamStart(() => this.#allowStart());
            this.#unsubscribe = this.#adapter.subscribe(() => this.synchronize());
        }
        catch {
            const cleanupErrors = this.#releaseAdapters();
            this.#started = cleanupErrors.length > 0;
            this.#publish({
                phase: "unavailable",
                detail: cleanupErrors.length
                    ? "Audience Guard setup failed and one adapter cleanup remains owned for retry; no second adapter will be installed."
                    : "Audience Guard stayed unavailable because its start interception or observation subscription failed safely.",
                available: false
            });
            return false;
        }
        if (!this.#unpatchStart || !this.#unsubscribe) {
            const cleanupErrors = this.#releaseAdapters();
            this.#started = cleanupErrors.length > 0;
            this.#publish({
                phase: "unavailable",
                detail: cleanupErrors.length
                    ? "Audience Guard could not finish setup and one adapter cleanup remains owned for retry; no second adapter will be installed."
                    : "Audience Guard stayed unavailable because start interception or stream observation could not be installed.",
                available: false
            });
            return false;
        }
        this.#available = true;
        this.#publish({phase: "ready", detail: "Audience Guard is ready but not armed.", available: true});
        return true;
    }

    stop(): void {
        const cleanupErrors: unknown[] = [];
        try {this.#clearVerification();}
        catch (error) {cleanupErrors.push(error);}
        cleanupErrors.push(...this.#releaseAdapters());
        this.#started = cleanupErrors.length > 0;
        this.#available = false;
        this.#stopLatch = undefined;
        this.#clearPrivateState();
        this.#publish({
            phase: cleanupErrors.length ? "unavailable" : "off",
            detail: cleanupErrors.length
                ? "Audience Guard is off, but one or more exact adapter cleanups remain owned for retry."
                : "Audience Guard is off.",
            available: false,
            armed: false,
            accountBound: false,
            channelBound: false,
            denylistCount: 0,
            detectedCount: 0,
            activeModes: {...NO_MODES},
            lastTrigger: undefined
        });
        if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Audience Guard adapter cleanup failed.");
    }

    arm(entries: unknown, modes: SolcordAudienceGuardModes): boolean {
        const readiness = this.armReadiness(entries, modes);
        if (!readiness.ready) {
            this.disarm(readiness.detail);
            return false;
        }
        let accountId: string | undefined;
        let channelId: string | undefined;
        try {
            accountId = this.#adapter.currentAccountId();
            channelId = this.#adapter.currentVoiceChannelId();
        }
        catch {
            this.disarm("Audience Guard could not revalidate the current call while arming.");
            return false;
        }
        if (!accountId || !DISCORD_ID.test(accountId) || !channelId || !DISCORD_ID.test(channelId)) {
            this.disarm("Audience Guard could not revalidate the current call while arming.");
            return false;
        }
        const normalizedEntries = normalizeAudienceGuardEntries(entries);
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

    armReadiness(entries: unknown, modes: SolcordAudienceGuardModes): SolcordAudienceGuardArmReadiness {
        if (!this.#available) return {ready: false, detail: "Audience Guard's Discord adapters are unavailable."};
        let accountId: string | undefined;
        let channelId: string | undefined;
        try {
            accountId = this.#adapter.currentAccountId();
            channelId = this.#adapter.currentVoiceChannelId();
        }
        catch {return {ready: false, detail: "Audience Guard could not validate the current account and voice channel."};}
        if (!accountId || !DISCORD_ID.test(accountId)) return {ready: false, detail: "Audience Guard is waiting for a validated signed-in account."};
        if (!channelId || !DISCORD_ID.test(channelId)) return {ready: false, detail: "Join a voice call to arm Audience Guard."};
        if (!normalizeAudienceGuardEntries(entries).length) return {ready: false, detail: "Add at least one denied user before arming."};
        if (!modes.preventStart && !modes.stopOnJoin && !modes.stopOnWatch) return {ready: false, detail: "Enable at least one Audience Guard mode before arming."};
        return {ready: true, detail: "Ready to arm for the current voice call."};
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
        let accountId: string | undefined;
        let channelId: string | undefined;
        let stream: unknown;
        try {
            accountId = this.#adapter.currentAccountId();
            channelId = this.#adapter.currentVoiceChannelId();
            stream = this.#adapter.currentStream();
        }
        catch {
            this.#observationFailure("Audience Guard could not validate the current account, call, or stream. Stop sharing manually if Go Live is active.");
            return;
        }
        if (accountId !== this.#armedAccountId || channelId !== this.#armedChannelId) {
            this.disarm("Audience Guard disarmed because the Discord account or voice channel changed.");
            return;
        }
        if (!stream) {
            this.#stopLatch = undefined;
            this.#clearVerification();
            if (this.#status.phase !== "armed") this.#publish({phase: "armed", detail: SOLCORD_AUDIENCE_GUARD_PROMISE, detectedCount: 0, lastTrigger: undefined});
            return;
        }
        if (this.#modes.stopOnJoin) {
            let deniedInChannel: string[];
            try {deniedInChannel = deniedAudienceMatches(this.#denied, this.#adapter.voiceMemberIds(this.#armedChannelId));}
            catch {
                this.#observationFailure("Audience Guard could not validate call membership. Stop sharing manually until the voice-state adapter recovers.");
                return;
            }
            if (deniedInChannel.length) {
                this.#requestStop(stream, "stop-on-join", deniedInChannel.length);
                return;
            }
        }
        if (this.#modes.stopOnWatch) {
            let deniedViewers: string[];
            try {deniedViewers = deniedAudienceMatches(this.#denied, this.#adapter.viewerIds(stream));}
            catch {
                this.#observationFailure("Audience Guard could not validate the viewer list. Stop sharing manually; zero-frame protection is never guaranteed.");
                return;
            }
            if (deniedViewers.length) this.#requestStop(stream, "stop-on-watch", deniedViewers.length);
        }
    }

    #allowStart(): boolean {
        if (!this.#status.armed || !this.#modes.preventStart || !this.#armedChannelId) return true;
        let accountId: string | undefined;
        let channelId: string | undefined;
        try {
            accountId = this.#adapter.currentAccountId();
            channelId = this.#adapter.currentVoiceChannelId();
        }
        catch {
            this.#observationFailure("Go Live was not started because Audience Guard could not validate the current call. Disarm the guard explicitly to proceed without protection.");
            return false;
        }
        if (accountId !== this.#armedAccountId || channelId !== this.#armedChannelId) {
            this.disarm("Audience Guard disarmed before Go Live because the Discord account or voice channel changed.");
            return true;
        }
        let matches: string[];
        try {matches = deniedAudienceMatches(this.#denied, this.#adapter.voiceMemberIds(this.#armedChannelId));}
        catch {
            this.#observationFailure("Go Live was not started because Audience Guard could not validate call membership. Disarm the guard explicitly to proceed without protection.");
            return false;
        }
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
                    let currentStream: unknown;
                    try {currentStream = this.#adapter.currentStream();}
                    catch {
                        this.#publish({phase: "attention", detail: "Solcord could not verify whether Go Live stopped. Stop sharing manually now.", detectedCount, lastTrigger: trigger});
                        return;
                    }
                    if (currentStream) {
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

    #observationFailure(detail: string): void {
        this.#clearVerification();
        this.#publish({phase: "attention", detail, detectedCount: 0});
    }

    #releaseAdapters(): unknown[] {
        const errors: unknown[] = [];
        const unsubscribe = this.#unsubscribe;
        if (unsubscribe) {
            try {
                unsubscribe();
                this.#unsubscribe = undefined;
            }
            catch (error) {errors.push(error);}
        }
        const unpatchStart = this.#unpatchStart;
        if (unpatchStart) {
            try {
                unpatchStart();
                this.#unpatchStart = undefined;
            }
            catch (error) {errors.push(error);}
        }
        return errors;
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
