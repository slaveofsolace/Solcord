// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const CSS = readFileSync(resolve(ROOT, "src/betterdiscord/styles/solcord.css"), "utf8");
const RUNTIME = readFileSync(resolve(ROOT, "src/betterdiscord/modules/solcord/runtime.ts"), "utf8");
const SETUP = readFileSync(resolve(ROOT, "src/betterdiscord/ui/solcord/setup-wizard.tsx"), "utf8");
const THEMES = [
    "Solcord-Default.theme.css",
    "Solcord-ObsidianThread.theme.css",
    "Solcord-CarbonEmber.theme.css",
    "Solcord-MidnightGlass.theme.css",
    "Solcord-PaperSignal.theme.css",
    "Solcord-Threadline.theme.css",
    "Solcord-SignalBlock.theme.css",
    "Solcord-RelayClassic.theme.css",
    "Solcord-Workshop.theme.css",
    "Solcord-QuietRead.theme.css",
    "Solcord-NightTransit.theme.css"
] as const;

function block(selector: string): string {
    const start = CSS.indexOf(`${selector} {`);
    expect(start, selector).toBeGreaterThanOrEqual(0);
    const end = CSS.indexOf("}\n", start);
    expect(end, selector).toBeGreaterThan(start);
    return CSS.slice(start, end + 1);
}

function property(source: string, name: string): string {
    const match = source.match(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*([^;]+);`));
    expect(match, name).not.toBeNull();
    return match![1].trim();
}

function relativeLuminance(hex: string): number {
    const channels = hex.slice(1).match(/.{2}/g)!.map(value => Number.parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(a: string, b: string): number {
    const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((left, right) => right - left);
    return (light + 0.05) / (dark + 0.05);
}

describe("Solcord full-shell appearance contract", () => {
    test("applies every saved presentation dimension at startup and after live changes", () => {
        for (const assignment of [
            "root.dataset.solcordMode = appearance.mode",
            "root.dataset.solcordAccent = appearance.accent",
            "root.dataset.solcordDensity = appearance.density",
            "root.dataset.solcordMotion = appearance.motion",
            "root.dataset.solcordMessageShape = appearance.messageShape",
            "root.dataset.solcordPerformance = preferences.performanceProfile",
            "root.dataset.solcordEffectiveMotion = resolveSolcordPerformancePolicy"
        ]) expect(RUNTIME).toContain(assignment);
        expect(RUNTIME).toMatch(/setProductPreferences[\s\S]*?this\.#applyProductPresentation\(\)/);
        expect(RUNTIME).toMatch(/#completeStartupPhases[\s\S]*?this\.#applyProductPresentation\(\)/);
        for (const attribute of ["mode", "accent", "density", "motion", "message-shape", "performance", "effective-motion"]) expect(SETUP).toContain(`data-solcord-${attribute}`);
    });

    test("makes each non-system accent visible in focus, controls, and selected shell rows", () => {
        for (const accent of ["glacier", "signal", "coral", "forest"]) {
            const source = block(`html[data-solcord-accent="${accent}"]`);
            expect(property(source, "--sc-runtime-accent")).toMatch(/^#[0-9A-F]{6}$/i);
            expect(property(source, "--sc-runtime-accent-hover")).toMatch(/^#[0-9A-F]{6}$/i);
        }
        const shell = block("html:not([data-solcord-accent=\"system\"])[data-solcord-accent] :is(#app-mount, .theme-dark, .theme-darker, .theme-midnight, .theme-light)");
        for (const token of ["--brand-500", "--focus-primary", "--input-border-focus", "--text-brand", "--background-modifier-hover", "--background-modifier-selected", "--background-mod-strong"]) expect(shell).toContain(`${token}:`);
        expect(shell).toContain("color-mix(in srgb, var(--sc-runtime-accent)");
    });

    test("defines a materially different reversible density on shell rows, messages, and composer", () => {
        const comfortable = block("html[data-solcord-density=\"comfortable\"]");
        const compact = block("html[data-solcord-density=\"compact\"]");
        for (const token of ["--sc-density-channel-height", "--sc-density-member-height", "--sc-density-friend-height", "--sc-density-composer-height", "--sc-density-message-space"]) {
            expect(comfortable).toContain(`${token}:`);
            expect(compact).toContain(`${token}:`);
            expect(property(comfortable, token)).not.toBe(property(compact, token));
        }
        for (const surface of ["sidebarList_", "privateChannels_", "membersWrap_", "peopleListItem_", "channelTextArea_", "chat-messages-"]) expect(CSS).toContain(surface);
        expect(CSS).toContain("height: var(--sc-density-channel-height)");
        expect(CSS).toContain("height: var(--sc-density-member-height)");
        expect(CSS).toContain("height: var(--sc-density-friend-height)");
        expect(CSS).toContain("html[data-solcord-density=\"comfortable\"] #app-mount li[id^=\"chat-messages-\"]");
        expect(CSS).toContain("html[data-solcord-density=\"compact\"] #app-mount li[id^=\"chat-messages-\"]");
        expect(CSS).toContain(".solcord-panel.solcord-density-compact .solcord-workspace-nav button");
        expect(CSS).toContain(".solcord-panel.solcord-density-compact :is(.solcord-setting-rows > label, .solcord-setting-row)");
    });

    test("keeps light-mode account text and controls above graphical contrast requirements", () => {
        const mode = block("html[data-solcord-mode=\"solcord-light\"]");
        const panel = block("html[data-solcord-mode=\"solcord-light\"] #app-mount [class*=\"panels_\"]");
        const background = property(mode, "--sc-app-surface-1");
        for (const token of ["--interactive-normal", "--interactive-muted", "--icon-primary", "--icon-secondary", "--icon-tertiary"]) {
            expect(contrast(property(panel, token), background), token).toBeGreaterThanOrEqual(3);
        }
        expect(CSS).toContain("opacity: 1;");
        expect(CSS).toContain("[class*=\"panels_\"] :is(button, [role=\"button\"], [class*=\"button_\"])");
        expect(CSS).toContain("color: var(--status-danger, var(--sc-app-danger))");
    });

    test("gives full, subtle, and reduced motion distinct bounded policies and covers pseudo-elements", () => {
        expect(block("html[data-solcord-effective-motion=\"full\"]")).toContain("--sc-motion-duration: 180ms");
        expect(block("html[data-solcord-effective-motion=\"subtle\"]")).toContain("--sc-motion-duration: 110ms");
        expect(block("html[data-solcord-effective-motion=\"reduced\"]")).toContain("--sc-motion-duration: 0.01ms");
        expect(CSS).toContain("html[data-solcord-effective-motion=\"reduced\"] #app-mount *::before");
        expect(CSS).toContain("html[data-solcord-effective-motion=\"reduced\"] #app-mount *::after");
        expect(CSS).toContain("html:not([data-solcord-performance=\"visual\"]) [data-solcord-ambient-effect]");
        expect(CSS).toContain("html[data-solcord-effective-motion=\"reduced\"] [data-solcord-ambient-effect]");
        expect(CSS).toContain("display: none !important");
        expect(CSS).toContain("@media (prefers-reduced-motion: reduce)");
    });

    test("keeps the performance HUD readable, in-bounds, and away from account controls", () => {
        const overlay = block(".solcord-performance-overlay");
        expect(property(overlay, "position")).toBe("fixed");
        expect(property(overlay, "inset-block-start")).toContain("52px");
        expect(property(overlay, "inset-inline-end")).toContain("12px");
        expect(property(overlay, "max-inline-size")).toContain("100vw - 24px");
        expect(property(overlay, "color")).toContain("--text-normal");
        expect(property(overlay, "background")).toContain("--background-floating");
        expect(property(overlay, "border")).toContain("--border-strong");
        expect(overlay).not.toMatch(/(?:^|[;{]\s*)(?:left|bottom)\s*:/);
        expect(CSS).toContain("@media (max-width: 480px)");
        expect(CSS).toMatch(/@media \(max-width: 480px\)[\s\S]*?\.solcord-performance-overlay[\s\S]*?inset-inline:\s*8px/);

        const light = block("html[data-solcord-mode=\"solcord-light\"]");
        expect(contrast(property(light, "--sc-app-text"), property(light, "--sc-app-surface-3"))).toBeGreaterThanOrEqual(4.5);
    });

    test("keeps all eleven self-contained themes subordinate to the runtime presentation layer", () => {
        expect(THEMES).toHaveLength(11);
        for (const fileName of THEMES) {
            const source = readFileSync(resolve(ROOT, "assets/themes", fileName), "utf8");
            const executable = source.replace(/^\/\*\*[\s\S]*?\*\//, "");
            expect(source, fileName).toContain("@media (prefers-reduced-motion: reduce)");
            expect(source, fileName).not.toContain("data-solcord-mode");
            expect(source, fileName).not.toContain("data-solcord-accent");
            expect(source, fileName).not.toContain("data-solcord-density");
            expect(executable, fileName).not.toMatch(/@import|https?:\/\//i);
        }
        expect(CSS).toContain("html:not([data-solcord-mode=\"follow-discord\"])[data-solcord-mode]");
    });

    test("does not reserve the voice panel height twice in the channel rail", () => {
        for (const fileName of THEMES) {
            const source = readFileSync(resolve(ROOT, "assets/themes", fileName), "utf8");
            expect(source, fileName).not.toMatch(/\[class\*="sidebarList_"\]\s*\{[^}]*--custom-app-panels-height/);
        }
    });
});
