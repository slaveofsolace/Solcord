export interface SolcordLoadedMessageOutput {
    id: string;
    authorLabel: string;
    text: string;
    timestamp: number;
}

export interface SolcordChannelGlanceRow {
    key: string;
    author: string;
    excerpt: string;
    timestamp: number;
}

export interface SolcordChannelGlancePresentation {
    rows: readonly SolcordChannelGlanceRow[];
    totalCount: number;
    hiddenCount: number;
}

export const SOLCORD_CHANNEL_GLANCE_VISIBLE_LIMIT = 5;
export const SOLCORD_CHANNEL_GLANCE_AUTHOR_LIMIT = 40;
export const SOLCORD_CHANNEL_GLANCE_EXCERPT_LIMIT = 180;
const MAX_JAVASCRIPT_DATE = 8_640_000_000_000_000;

const DISCORD_SNOWFLAKE = /\b\d{15,22}\b/g;
const RAW_LINK = /\b(?:(?:https?:\/\/)|(?:www\.))[^\s<>{}[\]"']+/gi;
const BARE_DISCORD_INVITE = /\b(?:discord\.gg|discord(?:app)?\.com\/invite)\/[^\s<>{}[\]"']+/gi;
const BARE_DOMAIN = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?:\/[^\s<>{}[\]"']*)?/gi;

function truncateVisible(value: string, limit: number): string {
    const characters = Array.from(value);
    if (characters.length <= limit) return value;
    return `${characters.slice(0, Math.max(1, limit - 1)).join("")}…`;
}

function replaceUnsafeControls(value: string): string {
    return Array.from(value, character => {
        const code = character.codePointAt(0) ?? 0;
        return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127 ? " " : character;
    }).join("");
}

/**
 * Converts Discord's already-loaded message markup into a short evidence-safe
 * label. The result deliberately contains neither destination URLs nor raw
 * Discord snowflakes; Channel Glance is a local preview, not a message dump.
 */
export function presentSolcordLoadedText(input: unknown, limit = SOLCORD_CHANNEL_GLANCE_EXCERPT_LIMIT): string {
    if (typeof input !== "string") return "";
    const readable = replaceUnsafeControls(input
        .replace(/\[([^\]\r\n]{1,80})\]\(\s*(?:(?:https?:\/\/)|(?:www\.))[^)\s]+\s*\)/gi, "$1 [link]")
        .replace(/<@&(\d{1,32})>/g, "@role")
        .replace(/<@!?(\d{1,32})>/g, "@member")
        .replace(/<#(\d{1,32})>/g, "#channel")
        .replace(/<a?:([A-Za-z0-9_]{1,32}):\d{1,32}>/g, ":$1:")
        .replace(/<t:\d{1,16}(?::[tTdDfFR])?>/g, "[time]")
        .replace(BARE_DISCORD_INVITE, "[link]")
        .replace(RAW_LINK, "[link]")
        .replace(BARE_DOMAIN, "[link]")
        .replace(DISCORD_SNOWFLAKE, "[id]"))
        .replace(/\s+/g, " ")
        .trim();
    return truncateVisible(readable, Math.max(1, limit));
}

export function presentSolcordChannelGlance(messages: readonly SolcordLoadedMessageOutput[]): SolcordChannelGlancePresentation {
    const totalCount = messages.length;
    const rows = messages.slice(0, SOLCORD_CHANNEL_GLANCE_VISIBLE_LIMIT).map((message, index) => {
        const author = presentSolcordLoadedText(message.authorLabel, SOLCORD_CHANNEL_GLANCE_AUTHOR_LIMIT);
        const excerpt = presentSolcordLoadedText(message.text, SOLCORD_CHANNEL_GLANCE_EXCERPT_LIMIT);
        return Object.freeze({
            key: `${Number.isSafeInteger(message.timestamp) ? message.timestamp : 0}:${index}`,
            author: author && author !== "[id]" ? author : "Loaded participant",
            excerpt: excerpt || "No text content",
            timestamp: Number.isSafeInteger(message.timestamp) && message.timestamp >= 0 ? Math.min(message.timestamp, MAX_JAVASCRIPT_DATE) : 0
        });
    });
    return Object.freeze({rows: Object.freeze(rows), totalCount, hiddenCount: Math.max(0, totalCount - rows.length)});
}
