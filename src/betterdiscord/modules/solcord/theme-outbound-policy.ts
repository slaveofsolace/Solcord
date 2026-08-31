// SPDX-License-Identifier: Apache-2.0

export type CommunityThemeOutboundDisposition = "local-only" | "outbound" | "undeclared";

export interface CommunityThemeSourceInput {
    fileName: string;
    fileContent?: string;
    css?: string;
}

export interface CommunityThemePolicyDecision {
    fileName: string;
    disposition: CommunityThemeOutboundDisposition;
    action: "keep" | "disable";
    reason: string;
}

interface CssEscapeResult {
    value: string;
    next: number;
}

interface CssIdentifierResult {
    value: string;
    next: number;
}

interface CssUrlResult {
    value?: string;
    next: number;
}

const SAFE_THEME_FILE = /^[^\\/:*?"<>|]{1,120}\.theme\.css$/i;
const CSS_HEX = /^[0-9a-f]$/i;
const CSS_IDENTIFIER = /^[a-z0-9_-]$/i;
const SAFE_DATA_URL = /^data:(?:image\/(?:avif|gif|jpeg|png|webp|x-icon)|font\/(?:otf|ttf|woff|woff2)|application\/(?:font-sfnt|font-woff|vnd\.ms-fontobject))(?:;[a-z0-9!#$&^_.+-]+(?:=[a-z0-9!#$&^_.+/-]+)?)*,/i;

function cssEscape(source: string, index: number): CssEscapeResult {
    let cursor = index + 1;
    if (cursor >= source.length) return {value: "", next: cursor};
    if (source[cursor] === "\r" || source[cursor] === "\n" || source[cursor] === "\f") {
        if (source[cursor] === "\r" && source[cursor + 1] === "\n") cursor++;
        return {value: "", next: cursor + 1};
    }
    let hex = "";
    while (cursor < source.length && hex.length < 6 && CSS_HEX.test(source[cursor])) hex += source[cursor++];
    if (hex) {
        if (/\s/.test(source[cursor] ?? "")) cursor++;
        const point = Number.parseInt(hex, 16);
        return {value: point === 0 || point > 0x10ffff ? "\uFFFD" : String.fromCodePoint(point), next: cursor};
    }
    return {value: source[cursor], next: cursor + 1};
}

function skipCssSpaceAndComments(source: string, index: number): number {
    let cursor = index;
    while (cursor < source.length) {
        if (/\s/.test(source[cursor])) {
            cursor++;
            continue;
        }
        if (source[cursor] !== "/" || source[cursor + 1] !== "*") break;
        const close = source.indexOf("*/", cursor + 2);
        if (close < 0) return source.length;
        cursor = close + 2;
    }
    return cursor;
}

function cssIdentifier(source: string, index: number): CssIdentifierResult {
    let value = "";
    let cursor = index;
    while (cursor < source.length) {
        if (source[cursor] === "\\") {
            const escaped = cssEscape(source, cursor);
            value += escaped.value;
            cursor = escaped.next;
            continue;
        }
        if (!CSS_IDENTIFIER.test(source[cursor]) && source.charCodeAt(cursor) < 0x80) break;
        value += source[cursor++];
    }
    return {value: value.toLocaleLowerCase("en-US"), next: cursor};
}

function cssString(source: string, index: number): CssUrlResult {
    const quote = source[index];
    let value = "";
    let cursor = index + 1;
    while (cursor < source.length) {
        if (source[cursor] === quote) return {value, next: cursor + 1};
        if (source[cursor] === "\\") {
            const escaped = cssEscape(source, cursor);
            value += escaped.value;
            cursor = escaped.next;
            continue;
        }
        if (source[cursor] === "\r" || source[cursor] === "\n" || source[cursor] === "\f") return {next: source.length};
        value += source[cursor++];
    }
    return {next: source.length};
}

function cssUrl(source: string, openParen: number): CssUrlResult {
    let cursor = skipCssSpaceAndComments(source, openParen + 1);
    let value = "";
    if (source[cursor] === "\"" || source[cursor] === "'") {
        const parsed = cssString(source, cursor);
        if (parsed.value === undefined) return {next: source.length};
        value = parsed.value;
        cursor = skipCssSpaceAndComments(source, parsed.next);
        if (source[cursor] !== ")") return {next: source.length};
        return {value: value.trim(), next: cursor + 1};
    }
    while (cursor < source.length && source[cursor] !== ")") {
        if (source[cursor] === "(" || source[cursor] === "\"" || source[cursor] === "'") return {next: source.length};
        if (source[cursor] === "\\") {
            const escaped = cssEscape(source, cursor);
            value += escaped.value;
            cursor = escaped.next;
            continue;
        }
        value += source[cursor++];
    }
    return source[cursor] === ")" ? {value: value.trim(), next: cursor + 1} : {next: source.length};
}

function urlIsLocal(value: string | undefined): boolean {
    if (!value) return false;
    return value.startsWith("#") || SAFE_DATA_URL.test(value);
}

/**
 * Classifies CSS before it reaches a live style element. Strict Privacy allows
 * ordinary local CSS, fragment references, and inert embedded raster/font
 * data. Imports, remote/relative URLs, SVG data, image-set strings, malformed
 * escapes, and future source functions fail closed because they can initiate
 * renderer network traffic without a separate provider prompt.
 */
export function strictCommunityThemeActivationDecision(input: CommunityThemeSourceInput): CommunityThemePolicyDecision {
    const fileName = typeof input.fileName === "string" && SAFE_THEME_FILE.test(input.fileName) ? input.fileName : "invalid.theme.css";
    const source = typeof input.fileContent === "string" ? input.fileContent : typeof input.css === "string" ? input.css : undefined;
    if (!source || fileName !== input.fileName) return {fileName, disposition: "undeclared", action: "disable", reason: "The theme source could not be validated for outbound requests."};

    let cursor = 0;
    while (cursor < source.length) {
        cursor = skipCssSpaceAndComments(source, cursor);
        if (cursor >= source.length) break;
        if (source[cursor] === "\"" || source[cursor] === "'") {
            cursor = cssString(source, cursor).next;
            continue;
        }
        if (source[cursor] === "@") {
            const name = cssIdentifier(source, cursor + 1);
            if (name.value === "import") return {fileName, disposition: "outbound", action: "disable", reason: "CSS imports are disabled by Strict Privacy."};
            cursor = Math.max(name.next, cursor + 1);
            continue;
        }
        if (CSS_IDENTIFIER.test(source[cursor]) || source[cursor] === "\\" || source.charCodeAt(cursor) >= 0x80) {
            const name = cssIdentifier(source, cursor);
            const open = skipCssSpaceAndComments(source, name.next);
            if (source[open] === "(") {
                if (name.value === "image-set" || name.value === "-webkit-image-set" || name.value === "src") {
                    return {fileName, disposition: "outbound", action: "disable", reason: "A CSS source function requires outbound review."};
                }
                if (name.value === "url") {
                    const parsed = cssUrl(source, open);
                    if (!urlIsLocal(parsed.value)) return {fileName, disposition: "outbound", action: "disable", reason: "The theme contains a remote, relative, SVG, or malformed CSS resource URL."};
                    cursor = parsed.next;
                    continue;
                }
                cursor = open + 1;
                continue;
            }
            cursor = Math.max(name.next, cursor + 1);
            continue;
        }
        cursor++;
    }

    return {fileName, disposition: "local-only", action: "keep", reason: "The theme contains no unapproved outbound CSS resource."};
}
