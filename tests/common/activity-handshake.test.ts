// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {evaluateActivityHandshake} from "../../src/common/activity-handshake";


describe("synthetic Embedded App SDK READY fixture", () => {
    test("accepts an on-time READY from the expected frame and origin", () => {
        expect(evaluateActivityHandshake({
            message: [1, {cmd: "DISPATCH", evt: "READY", data: {v: 1, config: {environment: "production"}}}],
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
            message: [1, {cmd: "DISPATCH", evt: "READY", data: {"private": "not retained"}}],
            origin: "https://example.invalid",
            sourceIsExpected: true,
            observedAt: 1_100
        }, {expectedOrigin: "https://discord.com", startedAt: 1_000, timeoutMs: 5_000}).reason).toBe("origin-mismatch");

        expect(evaluateActivityHandshake({
            message: [1, {cmd: "DISPATCH", evt: "READY", data: {"private": "not retained"}}],
            origin: "https://discord.com",
            sourceIsExpected: false,
            observedAt: 1_100
        }, {expectedOrigin: "https://discord.com", startedAt: 1_000, timeoutMs: 5_000}).reason).toBe("source-mismatch");
    });

    test("distinguishes non-READY traffic and a late READY", () => {
        expect(evaluateActivityHandshake({
            message: [1, {cmd: "DISPATCH", evt: "VOICE_STATE_UPDATE", data: {}}],
            origin: "https://discord.com",
            sourceIsExpected: true,
            observedAt: 1_100
        }, {expectedOrigin: "https://discord.com", startedAt: 1_000, timeoutMs: 5_000}).state).toBe("ignored");
        expect(evaluateActivityHandshake({
            message: [1, {cmd: "DISPATCH", evt: "READY", data: {}}],
            origin: "https://discord.com",
            sourceIsExpected: true,
            observedAt: 6_001
        }, {expectedOrigin: "https://discord.com", startedAt: 1_000, timeoutMs: 5_000}).state).toBe("timed-out");
    });

    test("rejects malformed timing facts rather than treating NaN as READY", () => {
        expect(evaluateActivityHandshake({
            message: [1, {cmd: "DISPATCH", evt: "READY", data: {}}],
            origin: "https://discord.com",
            sourceIsExpected: true,
            observedAt: Number.NaN
        }, {expectedOrigin: "https://discord.com", startedAt: 1_000, timeoutMs: 5_000})).toMatchObject({
            state: "rejected",
            reason: "invalid-timing"
        });
    });

    test("rejects malformed frames, truthy non-boolean sources, reversed clocks, and unbounded windows", () => {
        const base = {
            message: [1, {cmd: "DISPATCH", evt: "READY", data: {}}],
            origin: "https://discord.com",
            sourceIsExpected: true,
            observedAt: 1_100
        };
        const options = {expectedOrigin: "https://discord.com", startedAt: 1_000, timeoutMs: 5_000};

        for (const message of [undefined, {}, [1], [0, {cmd: "DISPATCH", evt: "READY", data: {}}], [1, {cmd: "DISPATCH", evt: "READY"}]]) {
            expect(evaluateActivityHandshake({...base, message}, options).reason).toBe("malformed-frame");
        }
        expect(evaluateActivityHandshake({...base, sourceIsExpected: "yes"}, options).reason).toBe("source-mismatch");
        expect(evaluateActivityHandshake({...base, observedAt: 999}, options).reason).toBe("invalid-timing");
        expect(evaluateActivityHandshake(base, {...options, timeoutMs: 60_001}).reason).toBe("invalid-timing");
    });
});
