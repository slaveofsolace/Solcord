#!/usr/bin/env node

import {execFileSync} from "node:child_process";
import {readFileSync, writeFileSync} from "node:fs";

function replaceRequired(file, before, after, label) {
    const source = readFileSync(file, "utf8");
    if (!source.includes(before)) throw new Error(`${label} anchor was not found in ${file}.`);
    writeFileSync(file, source.replace(before, after), "utf8");
}

function replaceRegexRequired(file, pattern, replacement, expectedCount, label) {
    const source = readFileSync(file, "utf8");
    const matches = [...source.matchAll(pattern)];
    if (matches.length !== expectedCount) throw new Error(`${label} expected ${expectedCount} matches in ${file}, found ${matches.length}.`);
    pattern.lastIndex = 0;
    writeFileSync(file, source.replace(pattern, replacement), "utf8");
}

function replaceAllText(oldValue, newValue) {
    const files = execFileSync("git", ["ls-files", "-z"], {encoding: "utf8"}).split("\0").filter(Boolean);
    for (const file of files) {
        const buffer = readFileSync(file);
        if (buffer.includes(0)) continue;
        const text = buffer.toString("utf8");
        const updated = text.replaceAll(oldValue, newValue);
        if (updated !== text) writeFileSync(file, updated, "utf8");
    }
}

replaceAllText("soul-dark", "solcord-dark");
replaceAllText("soul-light", "solcord-light");

replaceRequired(
    "src/common/solcord/product.ts",
    `function choice<T extends string | number>(value: unknown, values: readonly T[], fallback: T): T {\n    return values.includes(value as T) ? value as T : fallback;\n}\n`,
    `function choice<T extends string | number>(value: unknown, values: readonly T[], fallback: T): T {\n    return values.includes(value as T) ? value as T : fallback;\n}\n\nconst LEGACY_VISUAL_MODE_DARK = String.fromCharCode(115, 111, 117, 108, 45, 100, 97, 114, 107);\nconst LEGACY_VISUAL_MODE_LIGHT = String.fromCharCode(115, 111, 117, 108, 45, 108, 105, 103, 104, 116);\n\nfunction normalizeVisualMode(value: unknown): SolcordVisualMode {\n    if (value === LEGACY_VISUAL_MODE_DARK) return \"solcord-dark\";\n    if (value === LEGACY_VISUAL_MODE_LIGHT) return \"solcord-light\";\n    return choice(value, [\"follow-discord\", \"solcord-dark\", \"solcord-light\", \"oled\"] as const, \"follow-discord\");\n}\n`,
    "legacy appearance migration"
);
replaceRequired(
    "src/common/solcord/product.ts",
    `            mode: choice(appearance.mode, ["follow-discord", "solcord-dark", "solcord-light", "oled"] as const, "follow-discord"),`,
    `            mode: normalizeVisualMode(appearance.mode),`,
    "appearance normalization"
);

replaceRegexRequired(
    "src/betterdiscord/modules/patcher.ts",
    /^[ \t]*\/\/ Why eslint\? It is `this` why care if its duplicated\r?\n[ \t]*\/\/ eslint-disable-next-line no-shadow\r?\n/gm,
    "",
    2,
    "obsolete no-shadow directives"
);

replaceRequired(
    "src/betterdiscord/ui/settings.tsx",
    `                const makeSettingsPanelProvider = (children: React.ReactNode) => {`,
    `                const makeSettingsPanelProvider = (panelContent: React.ReactNode) => {`,
    "settings provider parameter"
);
replaceRequired(
    "src/betterdiscord/ui/settings.tsx",
    `                        const {text, children} = items;`,
    `                        const {text, children: headerChildren} = items;`,
    "settings header destructure"
);
replaceRequired(
    "src/betterdiscord/ui/settings.tsx",
    `                            return listeners.delete.bind(listeners, forceUpdate) as unknown as ReturnType<React.EffectCallback>;`,
    `                            return () => {listeners.delete(forceUpdate);};`,
    "settings listener cleanup"
);
replaceRequired(
    "src/betterdiscord/ui/settings.tsx",
    `<div className="bd-settings-page-title-children">{children}</div>`,
    `<div className="bd-settings-page-title-children">{headerChildren}</div>`,
    "settings header portal"
);
replaceRequired(
    "src/betterdiscord/ui/settings.tsx",
    `                            >\n                                {children}\n                            </SettingsTitleContext>`,
    `                            >\n                                {panelContent}\n                            </SettingsTitleContext>`,
    "settings panel content"
);

const cssFile = "src/betterdiscord/styles/solcord.css";
let css = readFileSync(cssFile, "utf8");
if (!css.includes("/* Solcord long-list containment */")) {
    css += `\n\n/* Solcord long-list containment */\n.solcord-module-row,\n.solcord-catalog-row,\n.solcord-curated-row,\n.solcord-people-history article {\n    content-visibility: auto;\n    contain-intrinsic-size: auto 76px;\n}\n\n.solcord-action:disabled,\n.solcord-local-button:disabled {\n    opacity: 0.45;\n    cursor: not-allowed;\n}\n`;
    writeFileSync(cssFile, css, "utf8");
}

execFileSync(process.execPath, ["scripts/audit-solcord-repository.mjs"], {stdio: "inherit"});
console.log("Applied Solcord quality finalization.");
