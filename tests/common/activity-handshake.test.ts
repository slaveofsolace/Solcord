import {describe, expect, test} from "bun:test";

import {evaluateActivityHandshake} from "../../src/common/activity-handshake";


describe("synthetic Embedded App SDK READY fixture", () => {
    test("accepts an on-time READY from the expected frame and origin", () => {
        expect(evaluateActivityHandshake({
            type: "READY",
            origin: "https://discord.com",
            sourceIsExpected: true,
            observedAt: 1_240,
            iframePermissions: ["microphone", "camera", "microphone"]
        }, {
            expectedOrigin: "https://discord.com",
            startedAt: 1_000,
            timeoutMs: 5_000
        })).toEqual({
            state: "ready",
            reason: "sdk-ready",
            latencyMs: 240,
            originHost: "discord.com",
            permissions: ["camera", "microphone"]
        });
    });

    test("rejects wrong-origin and wrong-source READY messages without retaining payloads", () => {
        expect(evaluateActivityHandshake({
            type: "READY",
            origin: "https://example.invalid",
            sourceIsExpected: true,
            observedAt: 1_100
        }, {expectedOrigin: "https://discord.com", startedAt: 1_000, timeoutMs: 5_000}).reason).toBe("origin-mismatch");

        expect(evaluateActivityHandshake({
            type: "READY",
            origin: "https://discord.com",
            sourceIsExpected: false,
            observedAt: 1_100
        }, {expectedOrigin: "https://discord.com", startedAt: 1_000, timeoutMs: 5_000}).reason).toBe("source-mismatch");
    });

    test("distinguishes non-READY traffic and a late READY", () => {
        expect(evaluateActivityHandshake({
            type: "SUBSCRIBE",
            origin: "https://discord.com",
            sourceIsExpected: true,
            observedAt: 1_100
        }, {expectedOrigin: "https://discord.com", startedAt: 1_000, timeoutMs: 5_000}).state).toBe("ignored");
        expect(evaluateActivityHandshake({
            type: "READY",
            origin: "https://discord.com",
            sourceIsExpected: true,
            observedAt: 6_001
        }, {expectedOrigin: "https://discord.com", startedAt: 1_000, timeoutMs: 5_000}).state).toBe("timed-out");
    });

    test("rejects malformed timing facts rather than treating NaN as READY", () => {
        expect(evaluateActivityHandshake({
            type: "READY",
            origin: "https://discord.com",
            sourceIsExpected: true,
            observedAt: Number.NaN
        }, {expectedOrigin: "https://discord.com", startedAt: 1_000, timeoutMs: 5_000})).toMatchObject({
            state: "rejected",
            reason: "invalid-timing"
        });
    });
});
