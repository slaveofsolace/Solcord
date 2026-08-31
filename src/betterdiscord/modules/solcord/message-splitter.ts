export interface MessageSplitPreview {
    parts: string[];
    limit: number;
    delayMs: number;
    totalDelayMs: number;
}

export interface MessageSplitPolicy {
    limit?: number;
    delayMs?: number;
    boundary?: "balanced" | "newlines";
    preserveBlankLines?: boolean;
    maxParts?: number;
    attachmentThreshold?: number;
}

export interface MessageSplitPlan extends MessageSplitPreview {
    boundary: "balanced" | "newlines";
    preserveBlankLines: boolean;
    maxParts: number;
    truncated: boolean;
    omittedCharacters: number;
    attachment?: {
        fileName: string;
        mime: "text/plain";
        text: string;
    };
}

const MIN_LIMIT = 1_000;
const MAX_LIMIT = 4_000;

function preferredBoundary(value: string, maximum: number, mode: "balanced" | "newlines"): number {
    const floor = Math.floor(maximum * 0.55);
    const newline = value.lastIndexOf("\n", maximum);
    if (newline >= floor) return newline + 1;
    if (mode === "balanced") {
        const space = value.lastIndexOf(" ", maximum);
        if (space >= floor) return space + 1;
    }
    if (maximum > 0 && maximum < value.length) {
        const previous = value.charCodeAt(maximum - 1);
        const next = value.charCodeAt(maximum);
        if (previous >= 0xD800 && previous <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) return maximum - 1;
    }
    return maximum;
}

function openFence(value: string): string | undefined {
    const matches = [...value.matchAll(/```([^\n`]*)/g)];
    if (matches.length % 2 === 0) return;
    const language = (matches.at(-1)?.[1] ?? "").trim().slice(0, 64);
    return `\`\`\`${language}\n`;
}

function normalizedPolicy(policy: MessageSplitPolicy): Required<MessageSplitPolicy> {
    const numericLimit = Number.isFinite(policy.limit) ? Math.floor(policy.limit!) : 2_000;
    const numericDelay = Number.isFinite(policy.delayMs) ? Math.floor(policy.delayMs!) : 1_200;
    const numericMaxParts = Number.isFinite(policy.maxParts) ? Math.floor(policy.maxParts!) : 0;
    const numericAttachmentThreshold = Number.isFinite(policy.attachmentThreshold) ? Math.floor(policy.attachmentThreshold!) : 0;
    return {
        limit: Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, numericLimit)),
        delayMs: Math.max(500, Math.min(5_000, numericDelay)),
        boundary: policy.boundary === "newlines" ? "newlines" : "balanced",
        preserveBlankLines: policy.preserveBlankLines === true,
        maxParts: Math.max(0, Math.min(20, numericMaxParts)),
        attachmentThreshold: Math.max(0, Math.min(64_000, numericAttachmentThreshold))
    };
}

export function planLargeMessage(input: string, policy: MessageSplitPolicy = {}): MessageSplitPlan {
    const normalized = normalizedPolicy(policy);
    const {limit, delayMs: safeDelay, boundary, preserveBlankLines, maxParts, attachmentThreshold} = normalized;
    const text = (typeof input === "string" ? input : "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").trim();
    if (!text) return {parts: [], limit, delayMs: safeDelay, totalDelayMs: 0, boundary, preserveBlankLines, maxParts, truncated: false, omittedCharacters: 0};
    if (attachmentThreshold > 0 && text.length >= attachmentThreshold) {
        return {
            parts: [],
            limit,
            delayMs: safeDelay,
            totalDelayMs: 0,
            boundary,
            preserveBlankLines,
            maxParts,
            truncated: false,
            omittedCharacters: 0,
            attachment: {fileName: "Solcord-message.txt", mime: "text/plain", text}
        };
    }
    let remaining = text;
    const parts: string[] = [];
    let reopen = "";
    let omittedCharacters = 0;

    while (remaining.length) {
        if (maxParts > 0 && parts.length === maxParts) {
            omittedCharacters = remaining.length;
            break;
        }
        const available = Math.max(1, limit - reopen.length - 4);
        if (remaining.length + reopen.length <= limit) {
            parts.push(`${reopen}${remaining}`);
            break;
        }
        const splitAt = preferredBoundary(remaining, available, boundary);
        let body = remaining.slice(0, splitAt);
        remaining = remaining.slice(splitAt);
        if (!preserveBlankLines) {
            body = body.trimEnd();
            remaining = remaining.trimStart();
        }
        const fence = openFence(`${reopen}${body}`);
        if (fence) {
            body = `${body}\n\`\`\``;
            parts.push(`${reopen}${body}`.slice(0, limit));
            reopen = fence;
        }
        else {
            parts.push(`${reopen}${body}`.slice(0, limit));
            reopen = "";
        }
    }

    const filtered = parts.filter(Boolean);
    return {
        parts: filtered,
        limit,
        delayMs: safeDelay,
        totalDelayMs: Math.max(0, filtered.length - 1) * safeDelay,
        boundary,
        preserveBlankLines,
        maxParts,
        truncated: omittedCharacters > 0,
        omittedCharacters
    };
}

export function splitLargeMessage(input: string, requestedLimit = 2_000, delayMs = 1_200): MessageSplitPreview {
    const {parts, limit, delayMs: safeDelay, totalDelayMs} = planLargeMessage(input, {limit: requestedLimit, delayMs});
    return {parts, limit, delayMs: safeDelay, totalDelayMs};
}
