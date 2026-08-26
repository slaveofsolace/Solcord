// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {parseJsDoc} from "../../src/common/utils";
import {SOULCORD_RUNTIME_THEMES} from "../../src/common/soulcord/addon-catalog.generated";

const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");
const THEME_FILES = [
    "SoulCord-Default.theme.css",
    "SoulCord-ObsidianThread.theme.css",
    "SoulCord-CarbonEmber.theme.css",
    "SoulCord-MidnightGlass.theme.css",
    "SoulCord-PaperSignal.theme.css"
] as const;
const SOULCORD_UI_CSS = readFileSync(resolve(REPOSITORY_ROOT, "src/betterdiscord/styles/soulcord.css"), "utf8");

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

function ruleProperty(css: string, selector: string, name: string): string {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)}`, "s"))?.[1];
    if (!block) throw new Error(`Missing rule: ${selector}`);
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const value = block.match(new RegExp(`${escapedName}\\s*:\\s*([^;]+);`))?.[1].trim();
    if (!value) throw new Error(`Missing ${name} in ${selector}`);
    return value;
}

describe("SoulCord theme presentation", () => {
    test("starts with BetterDiscord-readable metadata", () => {
        for (const fileName of THEME_FILES) {
            const source = readTheme(fileName);
            const firstLine = source.slice(0, source.indexOf("\n"));
            expect(firstLine).toContain("/**");
            const metadata = parseJsDoc(source);
            expect(metadata.name).toStartWith("SoulCord");
            expect(metadata.author).toBe("slaveofsolace");
            expect(metadata.version).toBe("1.2.0");
            expect(metadata.license).toBe("Apache-2.0");
        }
    });

    test("embeds the exact parseable files used by the setup transaction", () => {
        expect(SOULCORD_RUNTIME_THEMES).toHaveLength(THEME_FILES.length + 6);
        for (const theme of SOULCORD_RUNTIME_THEMES) {
            expect(theme.content as string).toBe(readTheme(theme.fileName));
            expect(theme.content.startsWith("/**")).toBeTrue();
            expect(parseJsDoc(theme.content).name).toStartWith("SoulCord");
        }
    });

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
            expect(css).toContain("--background-base-low:");
            expect(css).toContain("--background-surface-higher:");
            expect(css).toContain("--border-subtle:");
            expect(css).toContain("--channeltextarea-background:");
            expect(css).toContain("--brand-500:");
            expect(css).toContain("--button-filled-brand-background:");
            expect(css).toContain("--text-default:");
            expect(css).toContain("--interactive-text-default:");
            expect(css).toContain("[class*=\"peopleListItem_\"]");
            expect(css).toContain("[class*=\"itemCard_\"]");
            expect(css).toContain("[class*=\"chatContent_\"]");
            expect(css).toContain("#app-mount");
            expect(css).toContain("li[id^=\"chat-messages-\"]");
            expect(css).not.toContain("[class*=\"message_\"]");
            expect(css).not.toContain("overflow: hidden");
        }
    });

    test("applies every family member regardless of the native Discord light or dark selection", () => {
        for (const fileName of THEME_FILES) {
            const css = executableCss(readTheme(fileName));
            expect(css).toContain(".theme-light");
            expect(css).toContain(".theme-dark");
            expect(css).toContain(".theme-darker");
            expect(css).toContain(".theme-midnight");
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

    test("keeps Paper Signal semantic states readable on its light surfaces", () => {
        const css = executableCss(readTheme("SoulCord-PaperSignal.theme.css"));
        const paper = customProperty(css, "--background-primary");
        const statusSurface = customProperty(css, "--background-tertiary");
        const accentSurface = customProperty(css, "--brand-500");
        for (const property of ["--soulcord-accent-text", "--soulcord-warning-text", "--soulcord-danger-text", "--soulcord-callout-text"]) {
            const color = customProperty(css, property);
            expect(contrast(color, paper), `${property} on paper`).toBeGreaterThanOrEqual(4.5);
            expect(contrast(color, statusSurface), `${property} on status surface`).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrast(customProperty(css, "--soulcord-on-accent"), accentSurface)).toBeGreaterThanOrEqual(4.5);
        expect(css).toContain("[class*=\"addFriend_\"] *");
        expect(css).toContain("[class*=\"critical-secondary_\"] *");
    });

    test("keeps every application-wide appearance mode readable outside the SoulCord panel", () => {
        for (const mode of ["soul-dark", "soul-light", "oled"] as const) {
            const selector = `html[data-soulcord-mode="${mode}"]`;
            const surfaces = [
                ruleProperty(SOULCORD_UI_CSS, selector, "--sc-app-surface-0"),
                ruleProperty(SOULCORD_UI_CSS, selector, "--sc-app-surface-1"),
                ruleProperty(SOULCORD_UI_CSS, selector, "--sc-app-surface-2")
            ];
            for (const property of ["--sc-app-text", "--sc-app-muted", "--sc-app-link", "--sc-app-positive", "--sc-app-warning", "--sc-app-danger"]) {
                const color = ruleProperty(SOULCORD_UI_CSS, selector, property);
                expect(Math.min(...surfaces.map(surface => contrast(color, surface))), `${mode} ${property}`).toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    test("routes SoulCord controls through theme-aware semantic color pairs", () => {
        const css = executableCss(SOULCORD_UI_CSS);
        expect(css).toContain("var(--soulcord-on-accent, var(--soulcord-graphite))");
        expect(css).toContain("var(--soulcord-accent-text, var(--soulcord-sea))");
        expect(css).toContain("var(--soulcord-warning-text, var(--soulcord-amber))");
        expect(css).toContain("var(--soulcord-danger-text, var(--soulcord-coral))");
        expect(css).toContain("var(--soulcord-callout-text, var(--text-muted))");
        expect(css).toContain(".soulcord-wizard-body > p:not(.soulcord-callout)");
    });

    test("uses the default ember only as the warning and critical color", () => {
        const css = executableCss(readTheme("SoulCord-Default.theme.css"));
        expect(css).not.toMatch(/gradient\s*\(/i);
        expect(css).toContain("--soulcord-panel-filter: none");
        expect(css).not.toMatch(/--soulcord-panel-filter:\s*blur/i);
        expect(css.match(/var\(--soulcord-coral\)/g)).toHaveLength(1);
        expect(css).toContain("--status-danger: var(--soulcord-coral)");
        expect(css).toContain("[class*=\"mentioned_\"]");
        expect(css).toContain("border-left: 2px solid var(--soulcord-sea)");
    });
});
