// SPDX-License-Identifier: Apache-2.0

export interface ActivityHandshakeFacts {
    /** Raw Embedded App SDK postMessage tuple: [Opcodes.FRAME, payload]. */
    message: unknown;
    origin: unknown;
    sourceIsExpected: unknown;
    observedAt: unknown;
    iframePermissions?: unknown;
}

export interface ActivityHandshakeResult {
    state: "ready" | "ignored" | "rejected" | "timed-out";
    reason: "sdk-ready" | "malformed-frame" | "non-ready-event" | "origin-mismatch" | "source-mismatch" | "invalid-timing" | "late-ready";
    latencyMs?: number;
    originHost?: string;
    permissions: string[];
}

const FRAME_OPCODE = 1;
const MAX_HANDSHAKE_TIMEOUT_MS = 60_000;

function normalizeOrigin(value: unknown): {origin: string; host: string;} | undefined {
    if (typeof value !== "string") return undefined;
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) return undefined;
        return {origin: parsed.origin, host: parsed.host};
    }
    catch {
        return undefined;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readyFrame(message: unknown): "ready" | "other" | "malformed" {
    if (!Array.isArray(message) || message.length !== 2 || message[0] !== FRAME_OPCODE || !isRecord(message[1])) return "malformed";
    const payload = message[1];
    if (payload.cmd !== "DISPATCH" || payload.evt !== "READY") return "other";
    return isRecord(payload.data) ? "ready" : "malformed";
}

function normalizePermissions(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((permission): permission is string => typeof permission === "string"))]
        .filter(permission => /^[a-z-]{1,40}$/.test(permission))
        .sort()
        .slice(0, 16);
}

/** Pure, payload-free classifier used by synthetic tests and bounded diagnostics. */
export function evaluateActivityHandshake(
    facts: ActivityHandshakeFacts,
    options: {expectedOrigin: unknown; startedAt: unknown; timeoutMs: unknown;}
): ActivityHandshakeResult {
    const expected = normalizeOrigin(options.expectedOrigin);
    const actual = normalizeOrigin(facts.origin);
    const permissions = normalizePermissions(facts.iframePermissions);
    const frame = readyFrame(facts.message);
    if (frame === "malformed") return {state: "rejected", reason: "malformed-frame", originHost: actual?.host, permissions};
    if (frame === "other") return {state: "ignored", reason: "non-ready-event", originHost: actual?.host, permissions};
    if (!expected || !actual || expected.origin !== actual.origin) {
        return {state: "rejected", reason: "origin-mismatch", originHost: actual?.host, permissions};
    }
    if (facts.sourceIsExpected !== true) return {state: "rejected", reason: "source-mismatch", originHost: actual.host, permissions};
    if (typeof facts.observedAt !== "number" || typeof options.startedAt !== "number" || typeof options.timeoutMs !== "number"
        || !Number.isFinite(facts.observedAt) || !Number.isFinite(options.startedAt) || !Number.isFinite(options.timeoutMs)
        || facts.observedAt < options.startedAt || options.timeoutMs < 0 || options.timeoutMs > MAX_HANDSHAKE_TIMEOUT_MS) {
        return {state: "rejected", reason: "invalid-timing", originHost: actual.host, permissions};
    }
    const latencyMs = facts.observedAt - options.startedAt;
    if (latencyMs > options.timeoutMs) return {state: "timed-out", reason: "late-ready", latencyMs, originHost: actual.host, permissions};
    return {state: "ready", reason: "sdk-ready", latencyMs, originHost: actual.host, permissions};
}
