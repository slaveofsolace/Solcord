// SPDX-License-Identifier: Apache-2.0

import type {SolcordVoiceHealthSample} from "@common/solcord/v2-feature-models";


type CachedQualityGetter = () => unknown;

interface CachedQualityCandidate {
    getConnectionQuality?: CachedQualityGetter;
    getVoiceConnectionQuality?: CachedQualityGetter;
}

type NumericRecord = Record<string, unknown>;

const RTT_KEYS = ["rttMs", "roundTripTimeMs", "rtt", "ping"] as const;
const JITTER_KEYS = ["jitterMs", "jitter"] as const;
const LOSS_KEYS = ["packetLossPercent", "packetLoss", "packetLossRate"] as const;

function finiteField(record: NumericRecord, keys: readonly string[]): {key: string; value: number;} | undefined {
    const values = keys.flatMap(key => typeof record[key] === "number" ? [{key, value: record[key] as number}] : []);
    if (values.length !== 1 || !Number.isFinite(values[0].value)) return;
    return values[0];
}

export function normalizeCachedVoiceHealthSample(value: unknown, timestamp = Date.now()): SolcordVoiceHealthSample | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const record = value as NumericRecord;
    const rtt = finiteField(record, RTT_KEYS);
    const jitter = finiteField(record, JITTER_KEYS);
    const loss = finiteField(record, LOSS_KEYS);
    if (!rtt || !jitter || !loss || !Number.isSafeInteger(timestamp) || timestamp < 0) return;

    const rttMs = rtt.value;
    const jitterMs = jitter.value;
    const packetLossPercent = loss.key === "packetLossRate" ? loss.value * 100 : loss.value;
    if (rttMs < 0 || rttMs > 60_000 || jitterMs < 0 || jitterMs > 60_000 || packetLossPercent < 0 || packetLossPercent > 100) return;
    return {timestamp, rttMs, jitterMs, packetLossPercent};
}

function candidateGetter(value: unknown): CachedQualityGetter | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const candidate = value as CachedQualityCandidate;
    const getters = [candidate.getConnectionQuality, candidate.getVoiceConnectionQuality].filter((getter): getter is CachedQualityGetter => typeof getter === "function");
    if (getters.length !== 1) return;
    return getters[0].bind(candidate);
}

/**
 * Resolves one structurally unambiguous, synchronous cached-state reader.
 * It never calls RTCPeerConnection.getStats(), fetches, joins, or mutates voice state.
 */
export function createCachedVoiceHealthReader(candidates: readonly unknown[], clock: () => number = Date.now): (() => SolcordVoiceHealthSample | undefined) | undefined {
    const getters = candidates.flatMap(candidate => {
        const getter = candidateGetter(candidate);
        return getter ? [getter] : [];
    });
    if (getters.length !== 1) return;
    const getter = getters[0];
    return () => {
        let cached: unknown;
        try {cached = getter();}
        catch {return;}
        if (cached && typeof cached === "object" && "then" in cached && typeof (cached as {then?: unknown;}).then === "function") return;
        return normalizeCachedVoiceHealthSample(cached, clock());
    };
}

export interface SolcordVoiceHealthCapability {
    state: "ready" | "available" | "unavailable";
    detail: string;
    reader?: () => SolcordVoiceHealthSample | undefined;
    initialSample?: SolcordVoiceHealthSample;
}

/**
 * Separates a structurally available cached reader from a positively observed
 * quality sample. A disconnected client is Available, not falsely Ready.
 */
export function resolveCachedVoiceHealthCapability(candidates: readonly unknown[], clock: () => number = Date.now): SolcordVoiceHealthCapability {
    const reader = createCachedVoiceHealthReader(candidates, clock);
    if (!reader) return {state: "unavailable", detail: "No single reviewed synchronous cached voice-quality reader was available."};
    const initialSample = reader();
    if (!initialSample) {
        return {
            state: "available",
            detail: "The cached voice-quality reader is validated. Join a call to produce the first local sample.",
            reader
        };
    }
    return {
        state: "ready",
        detail: "A bounded cached voice-quality sample was validated without recording audio or requesting network statistics.",
        reader,
        initialSample
    };
}
