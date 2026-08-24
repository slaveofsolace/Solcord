// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");
const THEME_FILES = [
    "SoulCord-Default.theme.css",
    "SoulCord-ObsidianThread.theme.css",
    "SoulCord-CarbonEmber.theme.css",
    "SoulCord-MidnightGlass.theme.css",
    "SoulCord-PaperSignal.theme.css"
] as const;

function readTheme(fileName: string): string {
    return readFileSync(resolve(REPOSITORY_ROOT, "assets/themes", fileName), "utf8");
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
    if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Expected a six-digit color, received ${hex}`);
    const channels = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
        .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first: string, second: string): number {
    const a = luminance(first);
    const b = luminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("SoulCord theme presentation", () => {
    test("keeps the recommended theme and four alternatives self-contained", () => {
        expect(THEME_FILES).toHaveLength(5);
        for (const fileName of THEME_FILES) {
            const css = executableCss(readTheme(fileName));
            expect(css).not.toMatch(/@import\b/i);
            expect(css).not.toMatch(/url\s*\(/i);
            expect(css).not.toMatch(/https?:\/\//i);
            expect(css).toContain(":focus-visible");
            expect(css).toContain("outline: 3px");
            expect(css).toContain("prefers-reduced-motion");
            expect(css).toContain("animation-iteration-count: 1");
            expect(css).toContain("color-scheme:");
        }
    });

    test("keeps normal and muted text readable on both primary surfaces", () => {
        for (const fileName of THEME_FILES) {
            const css = executableCss(readTheme(fileName));
            const backgrounds = [customProperty(css, "--background-primary"), customProperty(css, "--background-secondary")];
            for (const textProperty of ["--text-normal", "--text-muted"]) {
                const textColor = customProperty(css, textProperty);
                expect(Math.min(...backgrounds.map(background => contrast(textColor, background)))).toBeGreaterThanOrEqual(4.5);
            }
            const focus = customProperty(css, "--soulcord-focus");
            expect(Math.min(...backgrounds.map(background => contrast(focus, background)))).toBeGreaterThanOrEqual(3);
        }
    });

    test("uses the default ember only as the warning and critical color", () => {
        const css = executableCss(readTheme("SoulCord-Default.theme.css"));
        expect(css).not.toMatch(/gradient\s*\(/i);
        expect(css).not.toMatch(/backdrop-filter\s*:/i);
        expect(css.match(/var\(--soulcord-coral\)/g)).toHaveLength(1);
        expect(css).toContain("--status-danger: var(--soulcord-coral)");
        expect(css).toContain("[class*=\"mentioned\"]");
        expect(css).toContain("border-left: 2px solid var(--soulcord-sea)");
    });
});
