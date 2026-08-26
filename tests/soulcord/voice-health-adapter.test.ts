import {describe, expect, test} from "bun:test";

import {createCachedVoiceHealthReader, normalizeCachedVoiceHealthSample} from "../../src/betterdiscord/modules/soulcord/voice-health";


describe("SoulCord cached-only Voice Health adapter", () => {
    test("normalizes one synchronous cached source without mutating it", () => {
        let reads = 0;
        const source = {getConnectionQuality: () => {reads++; return {rttMs: 42, jitterMs: 3, packetLossPercent: 0.5};}};
        const reader = createCachedVoiceHealthReader([source], () => 1234);

        expect(reader?.()).toEqual({timestamp: 1234, rttMs: 42, jitterMs: 3, packetLossPercent: 0.5});
        expect(reads).toBe(1);
        expect(Object.keys(source)).toEqual(["getConnectionQuality"]);
    });

    test("accepts a fractional packet-loss rate but rejects unsafe or ambiguous shapes", () => {
        expect(normalizeCachedVoiceHealthSample({rtt: 20, jitter: 2, packetLossRate: 0.025}, 10)).toEqual({timestamp: 10, rttMs: 20, jitterMs: 2, packetLossPercent: 2.5});
        expect(normalizeCachedVoiceHealthSample({rttMs: 20, rtt: 21, jitterMs: 2, packetLossPercent: 1}, 10)).toBeUndefined();
        expect(normalizeCachedVoiceHealthSample({rttMs: -1, jitterMs: 2, packetLossPercent: 1}, 10)).toBeUndefined();
        expect(normalizeCachedVoiceHealthSample({rttMs: 20, jitterMs: 2, packetLossPercent: 101}, 10)).toBeUndefined();
        expect(createCachedVoiceHealthReader([{getConnectionQuality() {return {};}, getVoiceConnectionQuality() {return {};}}])).toBeUndefined();
        expect(createCachedVoiceHealthReader([{getConnectionQuality() {return {};}}, {getConnectionQuality() {return {};}}])).toBeUndefined();
    });

    test("fails closed for async, throwing, or absent cached sources", async () => {
        const asyncReader = createCachedVoiceHealthReader([{getConnectionQuality: async () => ({rttMs: 1, jitterMs: 1, packetLossPercent: 0})}]);
        const throwingReader = createCachedVoiceHealthReader([{getVoiceConnectionQuality: () => {throw new Error("drift");}}]);

        expect(asyncReader?.()).toBeUndefined();
        expect(throwingReader?.()).toBeUndefined();
        expect(createCachedVoiceHealthReader([])).toBeUndefined();
    });
});
