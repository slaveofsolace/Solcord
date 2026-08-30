// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");
const THEME_FILES = [
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
const LEGACY_PANEL_THEMES = new Set(THEME_FILES.slice(0, 5));

function readTheme(fileName: string): string {
    return readFileSync(resolve(REPOSITORY_ROOT, "assets/themes", fileName), "utf8");
}

function cssRules(source: string): Array<{selector: string; body: string;}> {
    const executableCss = source.replace(/\/\*[\s\S]*?\*\//g, "");
    return [...executableCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({selector: match[1].trim(), body: match[2]}));
}

describe("Solcord theme shell ownership regressions", () => {
    test("lets Discord own native field focus while Solcord owns its panel fields", () => {
        for (const fileName of THEME_FILES) {
            const source = readTheme(fileName);
            expect(source).toContain("--focus-primary: var(--solcord-focus);");
            expect(source).toContain("--input-border-focus: var(--solcord-focus);");
            expect(source).toContain(":where(button, [role=\"button\"], a):focus-visible");
            expect(source).toContain(".solcord-panel :where(input, textarea, select):focus-visible");
            expect(source).not.toContain(":where(button, [role=\"button\"], a, input, textarea, select):focus-visible");
        }
    });

    test("does not decorate Discord native search and input wrappers a second time", () => {
        for (const fileName of THEME_FILES) {
            const source = readTheme(fileName);
            expect(source).toContain("[class*=\"channelTextArea_\"]");
            expect(source).not.toContain("[class*=\"searchBar_\"]");
            expect(source).not.toContain("[class*=\"inputWrapper_\"]");
        }
    });

    test("keeps the settings rail as the only divider owner", () => {
        for (const fileName of THEME_FILES) {
            const rules = cssRules(readTheme(fileName));
            const sidebarBorders = rules.filter(rule => rule.selector.includes("standardSidebarView_") && rule.selector.includes("sidebarRegion_") && /\bborder(?:-[\w-]+)?\s*:/.test(rule.body));
            const contentBorders = rules.filter(rule => rule.selector.includes("standardSidebarView_") && rule.selector.includes("contentRegion_") && /\bborder(?:-[\w-]+)?\s*:/.test(rule.body));

            expect(sidebarBorders).toHaveLength(1);
            expect(sidebarBorders[0].selector).toBe("#app-mount [class*=\"standardSidebarView_\"] [class*=\"sidebarRegion_\"]");
            expect(sidebarBorders[0].body).toMatch(/\bborder:\s*0;/);
            expect(sidebarBorders[0].body).toMatch(/\bborder-right:\s*(?:1px|2px) solid/);
            expect(contentBorders).toHaveLength(1);
            expect(contentBorders[0].selector).toBe("#app-mount [class*=\"standardSidebarView_\"] [class*=\"contentRegion_\"]");
            expect(contentBorders[0].body).toMatch(/\bborder:\s*0;/);
            expect(contentBorders[0].body).not.toMatch(/\bborder-right:/);
        }
    });

    test("uses an inset accent seam instead of boxing the legacy account panel", () => {
        for (const fileName of LEGACY_PANEL_THEMES) {
            const source = readTheme(fileName);
            const panelRule = cssRules(source).find(rule => rule.selector === "#app-mount [class*=\"panels_\"]");
            expect(source).not.toMatch(/#app-mount :is\([^)]*\[class\*="panels_"\][^)]*\)\s*\{/s);
            expect(panelRule).toBeDefined();
            expect(panelRule?.body).toMatch(/box-shadow:\s*inset 0 2px 0/);
            expect(panelRule?.body).not.toMatch(/\bborder(?:-[\w-]+)?\s*:/);
        }
    });
});
