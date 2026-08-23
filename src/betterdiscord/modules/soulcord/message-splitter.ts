export interface MessageSplitPreview {
    parts: string[];
    limit: number;
    delayMs: number;
    totalDelayMs: number;
}

const MIN_LIMIT = 1_000;
const MAX_LIMIT = 4_000;

function preferredBoundary(value: string, maximum: number): number {
    const floor = Math.floor(maximum * 0.55);
    const newline = value.lastIndexOf("\n", maximum);
    if (newline >= floor) return newline + 1;
    const space = value.lastIndexOf(" ", maximum);
    if (space >= floor) return space + 1;
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

export function splitLargeMessage(input: string, requestedLimit = 2_000, delayMs = 1_200): MessageSplitPreview {
    const numericLimit = Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 2_000;
    const numericDelay = Number.isFinite(delayMs) ? Math.floor(delayMs) : 1_200;
    const limit = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, numericLimit));
    const safeDelay = Math.max(500, Math.min(5_000, numericDelay));
    let remaining = (typeof input === "string" ? input : "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").trim();
    const parts: string[] = [];
    let reopen = "";

    while (remaining.length) {
        const available = Math.max(1, limit - reopen.length - 4);
        if (remaining.length + reopen.length <= limit) {
            parts.push(`${reopen}${remaining}`);
            break;
        }
        const boundary = preferredBoundary(remaining, available);
        let body = remaining.slice(0, boundary).trimEnd();
        remaining = remaining.slice(boundary).trimStart();
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

    return {parts: parts.filter(Boolean), limit, delayMs: safeDelay, totalDelayMs: Math.max(0, parts.length - 1) * safeDelay};
}
