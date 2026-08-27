// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {parseJsDoc} from "../../src/common/utils";

const ROOT = resolve(import.meta.dir, "../..");
const THEMES = [
    "Solcord-Threadline.theme.css",
    "Solcord-SignalBlock.theme.css",
    "Solcord-RelayClassic.theme.css",
    "Solcord-Workshop.theme.css",
    "Solcord-QuietRead.theme.css",
    "Solcord-NightTransit.theme.css"
] as const;

function readTheme(fileName: string): string {
    return readFileSync(resolve(ROOT, "assets/themes", fileName), "utf8");
}

function executableCss(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function customProperty(css: string, name: string, seen = new Set<string>()): string {
    if (seen.has(name)) throw new Error(`Circular custom property: ${name}`);
    seen.add(name);
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = [...css.matchAll(new RegExp(`${escaped}\\s*:\\s*([^;]+);`, "g"))];
    const value = matches.at(-1)?.[1].trim();
    if (!value) throw new Error(`Missing custom property: ${name}`);
    const reference = value.match(/^var\((--[a-z0-9-]+)\)$/i)?.[1];
    return reference ? customProperty(css, reference, seen) : value;
}

function luminance(hex: string): number {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Expected six-digit color, received ${hex}`);
    const channels = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
        .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first: string, second: string): number {
    const a = luminance(first);
    const b = luminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("Solcord V2 theme family", () => {
    test("ships six parseable, self-contained theme sources", () => {
        expect(THEMES).toHaveLength(6);
        for (const fileName of THEMES) {
            const source = readTheme(fileName);
            const css = executableCss(source);
            const metadata = parseJsDoc(source);
            expect(source.startsWith("/**")).toBeTrue();
            expect(metadata.name).toStartWith("Solcord");
            expect(metadata.author).toBe("slaveofsolace");
            expect(metadata.version).toBe("2.0.0");
            expect(metadata.license).toBe("Apache-2.0");
            expect(createHash("sha256").update(source).digest("hex")).toMatch(/^[0-9a-f]{64}$/);
            expect(css).not.toMatch(/@import\b/i);
            expect(css).not.toMatch(/url\s*\(/i);
            expect(css).not.toMatch(/https?:\/\//i);
            expect(css).not.toMatch(/gradient\s*\(/i);
        }
    });

    test("covers the complete Discord shell and accessibility states", () => {
        const required = [
            "[class*=\"guilds_\"]",
            "[class*=\"sidebarList_\"]",
            "[class*=\"chatContent_\"]",
            "[class*=\"membersWrap_\"]",
            "[class*=\"nowPlayingColumn_\"]",
            "[class*=\"channelTextArea_\"]",
            "[class*=\"peopleListItem_\"]",
            "[class*=\"itemCard_\"]",
            "li[id^=\"chat-messages-\"]",
            "[class*=\"standardSidebarView_\"]",
            "[role=\"dialog\"]",
            ":focus-visible",
            "prefers-reduced-motion",
            "animation-iteration-count: 1"
        ];
        for (const fileName of THEMES) {
            const css = executableCss(readTheme(fileName));
            for (const selector of required) expect(css, `${fileName}: ${selector}`).toContain(selector);
            for (const nativeMode of [".theme-light", ".theme-dark", ".theme-darker", ".theme-midnight"]) {
                expect(css, `${fileName}: ${nativeMode}`).toContain(nativeMode);
            }
        }
    });

    test("maintains AA text contrast and visible non-text focus", () => {
        for (const fileName of THEMES) {
            const css = executableCss(readTheme(fileName));
            const backgrounds = [customProperty(css, "--background-primary"), customProperty(css, "--background-secondary")];
            for (const property of ["--text-normal", "--text-muted"]) {
                const color = customProperty(css, property);
                expect(Math.min(...backgrounds.map(background => contrast(color, background))), `${fileName}: ${property}`).toBeGreaterThanOrEqual(4.5);
            }
            const focus = customProperty(css, "--solcord-focus");
            expect(Math.min(...backgrounds.map(background => contrast(focus, background))), `${fileName}: focus`).toBeGreaterThanOrEqual(3);
            expect(contrast(customProperty(css, "--button-filled-brand-text"), customProperty(css, "--button-filled-brand-background")), `${fileName}: primary action`).toBeGreaterThanOrEqual(4.5);
        }
    });

    test("keeps BetterDiscord card titles readable in Quiet Read", () => {
        const css = executableCss(readTheme("Solcord-QuietRead.theme.css"));
        const backgrounds = [customProperty(css, "--background-primary"), customProperty(css, "--background-secondary")];
        const primary = customProperty(css, "--text-primary");
        expect(primary).toBe(customProperty(css, "--text-normal"));
        expect(Math.min(...backgrounds.map(background => contrast(primary, background)))).toBeGreaterThanOrEqual(4.5);
    });

    test("uses six materially different structural signatures", () => {
        const fingerprints = new Map<string, readonly string[]>([
            ["Solcord-Threadline.theme.css", ["--sct-radius: 0px", "border-bottom: 1px solid rgb(52 70 81 / 42%)", "box-shadow: inset 3px 0 0"]],
            ["Solcord-SignalBlock.theme.css", ["border: 2px solid var(--scb-line)", "box-shadow: 8px 8px 0", "font-stretch: 82%"]],
            ["Solcord-RelayClassic.theme.css", ["border-radius: 7px", "box-shadow: inset 3px 0 0 var(--scr-blue)", "border-right: 1px solid var(--scr-line)"]],
            ["Solcord-Workshop.theme.css", ["box-shadow: inset 0 2px 4px", "margin: 5px", "background: var(--scw-recess)"]],
            ["Solcord-QuietRead.theme.css", ["max-width: 78ch", "min-height: 44px", "transition-duration: 0s"]],
            ["Solcord-NightTransit.theme.css", ["[class*=\"unread_\"]", "[class*=\"voiceUser_\"]", "border-radius: 0 0 7px 7px"]]
        ]);
        expect(fingerprints.size).toBe(THEMES.length);
        for (const [fileName, markers] of fingerprints) {
            const source = readTheme(fileName);
            for (const marker of markers) expect(source, `${fileName}: ${marker}`).toContain(marker);
        }
    });
});
