// SPDX-License-Identifier: Apache-2.0

/**
 * First-party voice adapters intentionally have no community runtime library.
 * Every dependency is a reviewed Discord store/action or a browser media API.
 */
export const SOLCORD_VOICE_DEPENDENCIES = Object.freeze({
    externalLibraries: Object.freeze([] as string[]),
    discordStores: Object.freeze([
        "ApplicationStreamingStore",
        "MediaEngineStore",
        "RTCConnectionStore",
        "SelectedChannelStore",
        "SpeakingStore",
        "UserStore",
        "VoiceConnectionStore",
        "VoiceStateStore"
    ]),
    browserApis: Object.freeze(["MediaDevices.getUserMedia", "MediaRecorder"])
});

const DISCORD_SNOWFLAKE = /^[1-9]\d{16,19}$/;
const MAX_CALL_USERS = 500;

export interface SolcordObservableStore {
    addChangeListener?(listener: () => void): void;
    removeChangeListener?(listener: () => void): void;
}

export interface SolcordSelectedVoiceStore extends SolcordObservableStore {
    getVoiceChannelId?(): unknown;
}

export interface SolcordVoiceStateStore extends SolcordObservableStore {
    getVoiceStatesForChannel?(channelId: string): unknown;
}

export interface SolcordStreamingStore extends SolcordObservableStore {
    getCurrentUserActiveStream?(): unknown;
    getStreamerActiveStreamMetadata?(): unknown;
    getViewerIds?(stream?: unknown): unknown;
}

export interface SolcordLocalVolumeModule {
    setLocalVolume?(userId: string, volumePercent: number): unknown;
}

export interface SolcordVoiceNoteEnvironment {
    mediaDevices?: {getUserMedia?: unknown;};
    mediaRecorder?: unknown;
}

export type SolcordVoiceCapabilityState = "ready" | "available" | "degraded" | "unavailable";

export interface SolcordVoiceCapability<T> {
    state: SolcordVoiceCapabilityState;
    detail: string;
    value?: T;
}

function discordId(value: unknown): string | undefined {
    return typeof value === "string" && DISCORD_SNOWFLAKE.test(value) ? value : undefined;
}

export function isSolcordDiscordSnowflake(value: unknown): value is string {
    return typeof value === "string" && DISCORD_SNOWFLAKE.test(value);
}

function plainRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : undefined;
}

function voiceStateId(value: unknown): string | undefined {
    const direct = discordId(value);
    if (direct) return direct;
    const record = plainRecord(value);
    if (!record) return;
    const user = plainRecord(record.user);
    return discordId(record.userId ?? record.user_id ?? user?.id ?? record.id);
}

/**
 * Accepts the reviewed Map, Set, Array, and id-keyed object store variants.
 * A non-empty snapshot with no structurally recoverable user is drift, not an
 * empty call. This distinction prevents safety adapters from failing open.
 */
export function normalizeSolcordVoiceStateIds(value: unknown): string[] | undefined {
    let candidates: unknown[];
    if (value instanceof Map) {candidates = [...value.entries()].flatMap(([key, entry]) => [key, entry]);}
    else if (value instanceof Set || Array.isArray(value)) {candidates = [...value];}
    else {
        const record = plainRecord(value);
        if (!record) return;
        candidates = Object.entries(record).flatMap(([key, entry]) => [key, entry]);
    }
    if (!candidates.length) return [];
    const ids = candidates.map(voiceStateId).filter((id): id is string => Boolean(id));
    if (!ids.length) return;
    return [...new Set(ids)].slice(0, MAX_CALL_USERS);
}

export function isSolcordObservableStore<T>(value: T): value is T & Required<SolcordObservableStore> {
    return Boolean(value
        && typeof value === "object"
        && typeof (value as SolcordObservableStore).addChangeListener === "function"
        && typeof (value as SolcordObservableStore).removeChangeListener === "function");
}

export function resolveSolcordVoiceChannelReader(store: SolcordSelectedVoiceStore | undefined): SolcordVoiceCapability<() => string | undefined> {
    if (!isSolcordObservableStore(store) || typeof store.getVoiceChannelId !== "function") {
        return {state: "unavailable", detail: "The selected voice-channel store did not match the reviewed observable shape."};
    }
    const read = store.getVoiceChannelId.bind(store);
    return {
        state: "available",
        detail: "The selected voice-channel reader is validated; joining a call will prove a live channel snapshot.",
        value: () => {
            const raw = read();
            if (raw === undefined || raw === null) return;
            const id = discordId(raw);
            if (!id) throw new TypeError("SelectedVoiceChannelShapeDrifted");
            return id;
        }
    };
}

export function resolveSolcordVoiceStateReader(store: SolcordVoiceStateStore | undefined): SolcordVoiceCapability<(channelId: string) => string[]> {
    if (!isSolcordObservableStore(store) || typeof store.getVoiceStatesForChannel !== "function") {
        return {state: "unavailable", detail: "The voice-state store did not match the reviewed observable channel-reader shape."};
    }
    const read = store.getVoiceStatesForChannel.bind(store);
    return {
        state: "available",
        detail: "The voice-state reader is validated; a live call snapshot is still required before reporting Ready.",
        value: channelId => {
            if (!isSolcordDiscordSnowflake(channelId)) throw new TypeError("VoiceChannelIdInvalid");
            const ids = normalizeSolcordVoiceStateIds(read(channelId));
            if (!ids) throw new TypeError("VoiceStateSnapshotShapeDrifted");
            return ids;
        }
    };
}

export function resolveSolcordStreamingReaders(store: SolcordStreamingStore | undefined): SolcordVoiceCapability<{currentStream(): unknown; viewerIds(stream: unknown): string[];}> {
    if (!isSolcordObservableStore(store) || typeof store.getViewerIds !== "function") {
        return {state: "unavailable", detail: "The streaming store did not expose reviewed observable viewer readers."};
    }
    const current = typeof store.getCurrentUserActiveStream === "function"
        ? store.getCurrentUserActiveStream.bind(store)
        : typeof store.getStreamerActiveStreamMetadata === "function"
            ? store.getStreamerActiveStreamMetadata.bind(store)
            : undefined;
    if (!current) return {state: "unavailable", detail: "The streaming store did not expose a reviewed current-stream reader."};
    const viewers = store.getViewerIds.bind(store);
    return {
        state: "available",
        detail: "The current-stream and viewer readers are validated; a live stream is still required before reporting Ready.",
        value: {
            currentStream: () => current(),
            viewerIds: stream => {
                const ids = normalizeSolcordVoiceStateIds(viewers(stream));
                if (!ids) throw new TypeError("StreamViewerSnapshotShapeDrifted");
                return ids;
            }
        }
    };
}

export function resolveSolcordLocalVolumeAction(module: SolcordLocalVolumeModule | undefined): SolcordVoiceCapability<{apply(userId: string, volumePercent: number): void; validateOwnership(): boolean;}> {
    const action = module?.setLocalVolume;
    if (!module || typeof action !== "function") {
        return {state: "unavailable", detail: "Discord did not expose the reviewed local-volume action."};
    }
    return {
        state: "available",
        detail: "The local-volume action is structurally validated; it becomes Ready after one user-reviewed change succeeds.",
        value: {
            validateOwnership: () => module.setLocalVolume === action,
            apply: (userId, volumePercent) => {
                if (module.setLocalVolume !== action) throw new Error("LocalVolumeActionOwnershipDrifted");
                if (!isSolcordDiscordSnowflake(userId)) throw new TypeError("LocalVolumeUserIdInvalid");
                if (!Number.isFinite(volumePercent) || volumePercent < 0 || volumePercent > 200) throw new RangeError("LocalVolumePercentInvalid");
                Reflect.apply(action, module, [userId, volumePercent]);
            }
        }
    };
}

export function resolveSolcordVoiceNoteCapture(environment: SolcordVoiceNoteEnvironment): SolcordVoiceCapability<true> {
    if (typeof environment.mediaDevices?.getUserMedia !== "function" || typeof environment.mediaRecorder !== "function") {
        return {state: "unavailable", detail: "This Discord/Electron build did not expose local microphone capture and MediaRecorder together."};
    }
    return {
        state: "available",
        detail: "Local recording APIs are available. Ready is reported only after the user grants access and a preview is produced.",
        value: true
    };
}
