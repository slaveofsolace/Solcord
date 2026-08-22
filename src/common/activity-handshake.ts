export interface ActivityHandshakeFacts {
    type: string;
    origin: string;
    sourceIsExpected: boolean;
    observedAt: number;
    iframePermissions?: readonly string[];
}

export interface ActivityHandshakeResult {
    state: "ready" | "ignored" | "rejected" | "timed-out";
    reason: "sdk-ready" | "non-ready-event" | "origin-mismatch" | "source-mismatch" | "invalid-timing" | "late-ready";
    latencyMs?: number;
    originHost?: string;
    permissions: string[];
}

function normalizeOrigin(value: string): {origin: string; host: string;} | undefined {
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) return undefined;
        return {origin: parsed.origin, host: parsed.host};
    }
    catch {
        return undefined;
    }
}

/** Pure, payload-free classifier used by synthetic tests and bounded diagnostics. */
export function evaluateActivityHandshake(
    facts: ActivityHandshakeFacts,
    options: {expectedOrigin: string; startedAt: number; timeoutMs: number;}
): ActivityHandshakeResult {
    const expected = normalizeOrigin(options.expectedOrigin);
    const actual = normalizeOrigin(facts.origin);
    const permissions = [...new Set(facts.iframePermissions ?? [])]
        .filter(permission => /^[a-z-]{1,40}$/.test(permission))
        .sort()
        .slice(0, 16);
    if (facts.type !== "READY") return {state: "ignored", reason: "non-ready-event", originHost: actual?.host, permissions};
    if (!expected || !actual || expected.origin !== actual.origin) {
        return {state: "rejected", reason: "origin-mismatch", originHost: actual?.host, permissions};
    }
    if (!facts.sourceIsExpected) return {state: "rejected", reason: "source-mismatch", originHost: actual.host, permissions};
    if (!Number.isFinite(facts.observedAt) || !Number.isFinite(options.startedAt) || !Number.isFinite(options.timeoutMs) || options.timeoutMs < 0) {
        return {state: "rejected", reason: "invalid-timing", originHost: actual.host, permissions};
    }
    const latencyMs = Math.max(0, facts.observedAt - options.startedAt);
    if (latencyMs > options.timeoutMs) return {state: "timed-out", reason: "late-ready", latencyMs, originHost: actual.host, permissions};
    return {state: "ready", reason: "sdk-ready", latencyMs, originHost: actual.host, permissions};
}
