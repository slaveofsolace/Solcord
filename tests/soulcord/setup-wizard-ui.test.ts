// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";


const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");
const WIZARD_SOURCE = readFileSync(resolve(REPOSITORY_ROOT, "src/betterdiscord/ui/soulcord/setup-wizard.tsx"), "utf8");
const WIZARD_CSS = readFileSync(resolve(REPOSITORY_ROOT, "src/betterdiscord/styles/soulcord.css"), "utf8");
const CATALOG_SOURCE = readFileSync(resolve(REPOSITORY_ROOT, "src/betterdiscord/ui/soulcord/catalog.ts"), "utf8");
const PRODUCT_SOURCE = readFileSync(resolve(REPOSITORY_ROOT, "src/common/soulcord/product.ts"), "utf8");
const PANEL_SOURCE = readFileSync(resolve(REPOSITORY_ROOT, "src/betterdiscord/ui/soulcord/panel.tsx"), "utf8");

function stepLabels(): string[] {
    const declaration = PRODUCT_SOURCE.match(/SOULCORD_SETUP_STEPS = Object\.freeze\(\[([^\]]+)] as const\)/s)?.[1];
    if (!declaration) throw new Error("SoulCord wizard step declaration is missing.");
    return [...declaration.matchAll(/"([^"]+)"/g)].map(match => match[1]);
}

describe("SoulCord beginner-first setup UI", () => {
    test("uses eight resumable steps with separate private-history consent and no Power Lab page", () => {
        expect(stepLabels()).toEqual(["Welcome", "Preflight", "Preset", "Appearance", "Safety", "Private history", "Review", "Apply"]);
        expect(WIZARD_SOURCE).toContain("function PrivateHistoryStep");
        expect(WIZARD_SOURCE).toContain("SoulCordSettings.setOnboardingStep(bounded)");
        expect(WIZARD_SOURCE).not.toContain("function PowerLabStep");
        expect(WIZARD_SOURCE).not.toContain("SOULCORD_POWER_LAB");
        expect(WIZARD_SOURCE).not.toContain("Request all 36");
        expect(WIZARD_CSS).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    });

    test("keys responsive layout to the actual settings content container", () => {
        expect(WIZARD_CSS).toContain("container: soulcord-panel / inline-size; width: min(100%, 1180px); min-width: 0; max-width: 100%");
        expect(WIZARD_CSS).toContain("@container soulcord-panel (max-width: 900px)");
        expect(WIZARD_CSS).toContain("@container soulcord-panel (max-width: 760px)");
        expect(WIZARD_CSS).toContain("@container soulcord-panel (max-width: 520px)");
        expect(WIZARD_CSS).not.toContain("@media (max-width:");
    });

    test("renders only accepted ready tools and directs pending work to the catalog", () => {
        expect(WIZARD_SOURCE).toContain("addons: group.addons.filter(addon => isReadyDecision(decisions.get(addon.name)))");
        expect(WIZARD_SOURCE).toContain("const pendingDecisions = useMemo");
        expect(WIZARD_SOURCE).toContain("Review pending tools separately");
        expect(WIZARD_SOURCE).toContain("Review pending");
        expect(WIZARD_SOURCE).toContain("Apply and verify");
        expect(WIZARD_SOURCE).toContain(".soulcord-catalog-table");
        expect(WIZARD_SOURCE).toContain("leaves pending catalog choices uninstalled");
        expect(WIZARD_SOURCE).toContain("Guarded Split Large Messages is preview-only.");
        expect(WIZARD_SOURCE).toContain("Apply and verify will not enable it until a disposable Discord acceptance receipt exists.");
        expect(WIZARD_SOURCE).toContain("Keep display snapshots");
        expect(WIZARD_SOURCE).toContain("Friend Watch notification mode");
        expect(WIZARD_SOURCE).toContain("You may opt in during the Private history step; skipping setup leaves its policy unchanged.");
        expect(WIZARD_SOURCE).not.toContain("this wizard does not change its policy");
        expect(WIZARD_SOURCE).not.toContain("addonModes: {...current.addonModes, SplitLargeMessages: \"guarded\"}");
    });

    test("keeps five theme choices, recommends SoulCord Default, and preserves a no-change exit", () => {
        expect(WIZARD_SOURCE).toContain("\"soulcord-default\": \"Recommended");
        expect(WIZARD_SOURCE).toContain("SOULCORD_THEMES.map(theme");
        expect(WIZARD_SOURCE).toContain("No plugin file, theme file, enabled state, or Timeline policy will change");
        expect(WIZARD_SOURCE).toContain("You can reopen this wizard later");
        expect(WIZARD_SOURCE).toContain("current.selectedAddons.filter(name => !readyNames.has(name))");
    });

    test("shows an explicit reversible provider choice only for an active community counterpart", () => {
        expect(WIZARD_SOURCE).toContain("showProviderChoice = selected.has(addon.name) && Boolean(communityFile) && isSoulCordBuiltInAddon");
        expect(WIZARD_SOURCE).toContain("Keep community addon (recommended)");
        expect(WIZARD_SOURCE).toContain("Use SoulCord built-in");
        expect(WIZARD_SOURCE).toContain("Apply and verify disables this exact community file. Rollback restores its exact prior state.");
        expect(WIZARD_SOURCE).toContain("SoulCordRuntime.prepareProviderMigrationPlan(draft)");
        expect(WIZARD_SOURCE).toContain("SoulCordRuntime.prepareProviderMigrationPlan(draft), [draft]");
        expect(WIZARD_SOURCE).toContain("SoulCordRuntime.finishSetup(draft, providerMigrationPlan)");
        expect(WIZARD_SOURCE).toContain("active community provider changed after review");
        expect(WIZARD_SOURCE).toContain("This explicitly disables");
    });

    test("describes the clean-room interaction tools without claiming unavailable choices or automatic sends", () => {
        expect(CATALOG_SOURCE).toContain("Suppresses one validated outgoing typing-start path while the built-in is enabled.");
        expect(CATALOG_SOURCE).not.toContain("Stops typing indicators unless you choose otherwise.");
        expect(CATALOG_SOURCE).toContain("Guarded preview prepares bounded chunks for manual copy, but setup keeps it off pending Discord modal/clipboard acceptance. Native multi-send remains held.");
    });

    test("keeps Attachment Guard truthful and gives its setup switch a visible effect", () => {
        expect(WIZARD_SOURCE).toContain("Show the manual Attachment Guard inspector");
        expect(WIZARD_SOURCE).toContain("It does not intercept clicks, open files, or claim automatic protection.");
        expect(WIZARD_SOURCE).not.toContain("Require a local review before opening high-risk file types.");
        expect(PANEL_SOURCE).toContain("productPreferences.safety.attachmentGuard && <AttachmentGuardWorkbench />");
    });
});
