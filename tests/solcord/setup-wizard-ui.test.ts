// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";


const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");
const WIZARD_SOURCE = readFileSync(resolve(REPOSITORY_ROOT, "src/betterdiscord/ui/solcord/setup-wizard.tsx"), "utf8");
const WIZARD_CSS = readFileSync(resolve(REPOSITORY_ROOT, "src/betterdiscord/styles/solcord.css"), "utf8");
const CATALOG_SOURCE = readFileSync(resolve(REPOSITORY_ROOT, "src/betterdiscord/ui/solcord/catalog.ts"), "utf8");
const PRODUCT_SOURCE = readFileSync(resolve(REPOSITORY_ROOT, "src/common/solcord/product.ts"), "utf8");
const PANEL_SOURCE = readFileSync(resolve(REPOSITORY_ROOT, "src/betterdiscord/ui/solcord/panel.tsx"), "utf8");
const RUNTIME_SOURCE = readFileSync(resolve(REPOSITORY_ROOT, "src/betterdiscord/modules/solcord/runtime.ts"), "utf8");

function stepLabels(): string[] {
    const declaration = PRODUCT_SOURCE.match(/SOLCORD_SETUP_STEPS = Object\.freeze\(\[([^\]]+)] as const\)/s)?.[1];
    if (!declaration) throw new Error("Solcord wizard step declaration is missing.");
    return [...declaration.matchAll(/"([^"]+)"/g)].map(match => match[1]);
}

describe("Solcord beginner-first setup UI", () => {
    test("uses eight resumable novice steps with private-history consent and no Power Lab page", () => {
        expect(stepLabels()).toEqual(["Welcome", "Privacy", "Performance", "Appearance", "Features", "Activities", "Import", "Ready"]);
        expect(WIZARD_SOURCE).toContain("function PrivateHistoryStep");
        expect(WIZARD_SOURCE).toContain("SolcordSettings.setOnboardingStep(bounded)");
        expect(WIZARD_SOURCE).not.toContain("function PowerLabStep");
        expect(WIZARD_SOURCE).not.toContain("SOLCORD_POWER_LAB");
        expect(WIZARD_SOURCE).not.toContain("Request all 36");
        expect(WIZARD_SOURCE).toContain("SolcordSettings.setSetupDraft(draft)");
        expect(WIZARD_SOURCE).toContain("The durable draft was left unchanged");
        expect(WIZARD_SOURCE).toContain("Solcord could not save this setup step");
        expect(WIZARD_SOURCE).toContain("role=\"progressbar\"");
        expect(WIZARD_CSS).toContain(".solcord-wizard-steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr))");
        expect(WIZARD_CSS).not.toContain(".solcord-wizard-steps { display: flex");
        expect(WIZARD_CSS).toContain("var(--brand-500, var(--button-filled-brand-background");
    });

    test("keys responsive layout to the actual settings content container", () => {
        expect(WIZARD_CSS).toContain("container: solcord-panel / inline-size; width: min(100%, 1180px); min-width: 0; max-width: 100%");
        expect(WIZARD_CSS).toContain("padding: 0 clamp(20px, 2.8vw, 34px) 52px");
        expect(WIZARD_CSS).toContain("@container solcord-panel (max-width: 720px)");
        expect(WIZARD_CSS).toContain(".solcord-workspace-nav-list { display: none; }");
        expect(WIZARD_CSS).toContain(".solcord-workspace-switcher { display: grid;");
        expect(WIZARD_CSS).toContain("@container solcord-panel (max-width: 760px)");
        expect(WIZARD_CSS).toContain("@container solcord-panel (max-width: 520px)");
        expect(WIZARD_CSS).toContain(".solcord-panel { padding-right: 14px; padding-left: 14px; }");
        expect(WIZARD_CSS).toContain("@media (max-width: 640px)");
        expect(WIZARD_CSS).toContain("[class*=\"container_\"]:has(.solcord-panel) > aside[class*=\"sidebar_\"] { display: none; }");
        expect(WIZARD_CSS).toContain("[class*=\"container_\"]:has(.solcord-panel) > [class*=\"content_\"] { width: 100%; min-width: 0; }");
    });

    test("applies explicit appearance modes to Discord instead of only recoloring the Solcord panel", () => {
        expect(WIZARD_CSS).toContain("html:not([data-solcord-mode=\"follow-discord\"])[data-solcord-mode] :is(body, #app-mount, .theme-dark, .theme-darker, .theme-midnight, .theme-light)");
        expect(WIZARD_CSS).toContain("--background-base-lowest: var(--sc-app-surface-0)");
        expect(WIZARD_CSS).toContain("--chat-background-default: var(--sc-app-surface-0)");
        expect(WIZARD_CSS).toContain("--modal-background: var(--sc-app-surface-1)");
        expect(WIZARD_CSS).toContain("background-color: var(--sc-app-surface-0) !important");
        expect(WIZARD_CSS).toContain("body::before");
        expect(WIZARD_CSS).toContain("--sc-field-grain: url(\"data:image/svg+xml");
        for (const mode of ["solcord-dark", "solcord-light", "oled"]) {
            const block = WIZARD_CSS.match(new RegExp(`html\\[data-solcord-mode="${mode}"\\] \\{([^}]+)}`, "s"))?.[1];
            expect(block).toBeDefined();
            expect(block).toContain("--sc-app-surface-0:");
            expect(block).toContain("--sc-app-surface-1:");
            expect(block).toContain("--sc-app-surface-2:");
            expect(block).toContain("--sc-app-text:");
            expect(block).toContain("--sc-app-muted:");
            expect(block).toContain("--sc-app-border:");
            expect(block).toContain(`color-scheme: ${mode === "solcord-light" ? "light" : "dark"}`);
        }
        expect(WIZARD_CSS).toContain("html:not([data-solcord-accent=\"system\"])[data-solcord-accent] :is(#app-mount, .theme-dark, .theme-darker, .theme-midnight, .theme-light)");
        expect(WIZARD_CSS).toContain("html[data-solcord-density=\"compact\"] #app-mount");
        expect(WIZARD_CSS).toContain("html[data-solcord-message-shape=\"seamed\"] #app-mount");
        expect(WIZARD_CSS).toContain("html[data-solcord-motion=\"reduced\"] #app-mount *");
    });

    test("renders only accepted ready tools and directs pending work to the catalog", () => {
        expect(WIZARD_SOURCE).toContain("addons: group.addons.filter(addon => isReadyDecision(decisions.get(addon.name)))");
        expect(WIZARD_SOURCE).toContain("const pendingDecisions = useMemo");
        expect(WIZARD_SOURCE).toContain("Review pending tools separately");
        expect(WIZARD_SOURCE).toContain("Review pending");
        expect(WIZARD_SOURCE).toContain("Apply and verify");
        expect(WIZARD_SOURCE).toContain("onReviewPending={onReviewPending}");
        expect(PANEL_SOURCE).toContain("setWorkspaceFocus(\"catalog\")");
        expect(PANEL_SOURCE).toContain(".solcord-catalog-table");
        expect(PANEL_SOURCE).toContain("<SetupWizard onReviewPending={openCatalog} />");
        expect(WIZARD_SOURCE).toContain("leaves pending catalog choices uninstalled");
        expect(WIZARD_SOURCE).toContain("Guarded Split Large Messages is built in.");
        expect(WIZARD_SOURCE).toContain("review-and-manual-copy flow");
        expect(PANEL_SOURCE).toContain("Optional catalog files absent");
        expect(readFileSync(resolve(REPOSITORY_ROOT, "src/betterdiscord/ui/solcord/addon-catalog.tsx"), "utf8")).toContain("optional catalog file(s) absent");
        expect(readFileSync(resolve(REPOSITORY_ROOT, "src/betterdiscord/ui/solcord/addon-catalog.tsx"), "utf8")).not.toContain("\"not staged\"");
        expect(WIZARD_SOURCE).toContain("Keep display snapshots");
        expect(WIZARD_SOURCE).toContain("Friend Watch notification mode");
        expect(WIZARD_SOURCE).toContain("You may opt in during the Private history step; skipping setup leaves its policy unchanged.");
        expect(WIZARD_SOURCE).not.toContain("this wizard does not change its policy");
        expect(WIZARD_SOURCE).not.toContain("addonModes: {...current.addonModes, SplitLargeMessages: \"guarded\"}");
    });

    test("keeps eleven theme choices, recommends Solcord Default, and preserves a no-change exit", () => {
        expect(WIZARD_SOURCE).toContain("\"solcord-default\": \"Recommended");
        expect(WIZARD_SOURCE).toContain("SOLCORD_THEMES.map(theme");
        expect(WIZARD_SOURCE).toContain("No plugin file, theme file, enabled state, or Timeline policy will change");
        expect(WIZARD_SOURCE).toContain("You can reopen this wizard later");
        expect(WIZARD_SOURCE).toContain("current.selectedAddons.filter(name => !readyNames.has(name))");
    });

    test("shows an explicit reversible provider choice for an installed community counterpart", () => {
        expect(WIZARD_SOURCE).toContain("showProviderChoice = selected.has(addon.name) && Boolean(communityFile) && isSolcordBuiltInAddon");
        expect(WIZARD_SOURCE).toContain("installedCommunityFiles");
        expect(WIZARD_SOURCE).toContain("Use Solcord built-in (recommended)");
        expect(WIZARD_SOURCE).toContain("Keep community addon");
        expect(WIZARD_SOURCE).toContain("the exact source file moves to a rollback archive");
        expect(WIZARD_SOURCE).toContain("SolcordRuntime.prepareProviderMigrationPlan(draft)");
        expect(WIZARD_SOURCE).toContain("SolcordRuntime.prepareProviderMigrationPlan(draft), [draft]");
        expect(WIZARD_SOURCE).toContain("SolcordRuntime.finishSetup(draft, providerMigrationPlan)");
        expect(WIZARD_SOURCE).toContain("active community provider changed after review");
        expect(WIZARD_SOURCE).toContain("Replace duplicate cards");
    });

    test("describes the clean-room interaction tools without claiming unavailable choices or automatic sends", () => {
        expect(CATALOG_SOURCE).toContain("Suppresses one validated outgoing typing-start path while the built-in is enabled.");
        expect(CATALOG_SOURCE).not.toContain("Stops typing indicators unless you choose otherwise.");
        expect(CATALOG_SOURCE).toContain("Guarded mode previews bounded chunks for manual copy without sending.");
    });

    test("keeps Attachment Guard truthful and gives its setup switch a visible effect", () => {
        expect(WIZARD_SOURCE).toContain("Show the manual Attachment Guard inspector");
        expect(WIZARD_SOURCE).toContain("It does not intercept clicks, open files, or claim automatic protection.");
        expect(WIZARD_SOURCE).not.toContain("Require a local review before opening high-risk file types.");
        expect(PANEL_SOURCE).toContain("productPreferences.safety.attachmentGuard && <AttachmentGuardWorkbench />");
    });

    test("keeps Fake Deafen visible and preserves an active community provider", () => {
        expect(PANEL_SOURCE).toContain("Optional catalog files absent");
        expect(PANEL_SOURCE).not.toContain("<dt>Not staged</dt>");
        expect(PANEL_SOURCE).toContain("SolcordRuntime.armFakeDeafen()");
        expect(PANEL_SOURCE).toContain("Disarm and resync");
        expect(PANEL_SOURCE).toContain("account risk · manual");
        expect(PANEL_SOURCE).toContain("community plugin active");
        expect(PANEL_SOURCE).toContain("Solcord leaves it untouched");
        expect(RUNTIME_SOURCE).toContain("fakeDeafenProvider()");
        expect(CATALOG_SOURCE).toContain("Voice Anchor / Anti-AFK");
        expect(CATALOG_SOURCE).toContain("Unavailable in the V2 release candidate.");
        expect(PANEL_SOURCE).toContain("state.privateState.storage.persistent");
        expect(PANEL_SOURCE).toContain("Encrypted storage is available. Enable the adapter while signed in to load this account's private list.");
        expect(PANEL_SOURCE).not.toContain("Denylist persistence is unavailable; entries remain session-only.\"");
        expect(RUNTIME_SOURCE).toContain("await this.#refreshAudienceGuardStorageStatus()");
        expect(RUNTIME_SOURCE).not.toContain("Audience Guard policy is unloaded while the adapter is stopped.");
    });

    test("distinguishes disabled Friend Watch storage from an active session-only fallback", () => {
        expect(PANEL_SOURCE).toContain("unopened while Friend Watch is off.");
        expect(PANEL_SOURCE).toContain("Enabling negotiates encrypted account-isolated storage");
        expect(PANEL_SOURCE).toContain("otherwise fails closed to session-only memory.");
        expect(PANEL_SOURCE).toContain("state.persistent");
    });

    test("makes appearance choices visible before setup is applied", () => {
        expect(WIZARD_SOURCE).toMatch(/solcord-mode-\$\{appearance\.mode\}/);
        expect(WIZARD_SOURCE).toMatch(/solcord-preview-shape-\$\{appearance\.messageShape\}/);
        expect(WIZARD_SOURCE).toContain("useFullShellAppearancePreview(appearance, performanceProfile)");
        expect(WIZARD_SOURCE).toContain("root.dataset.solcordMode = appearance.mode");
        expect(WIZARD_SOURCE).toContain("root.removeAttribute(attribute)");
        expect(WIZARD_SOURCE).toContain("The whole-shell preview updates immediately.");
        expect(WIZARD_CSS).toContain(".solcord-live-preview.solcord-mode-solcord-light");
        expect(WIZARD_CSS).toContain(".solcord-live-preview.solcord-preview-shape-seamed");
    });

    test("ships the V2 native tool surface without browser prompts or hidden account actions", () => {
        for (const label of ["Composer Proof and Time Composer", "Permission Lens and Focus Channels", "Encrypted Local Identity Notes", "Voice Note Studio", "Notification Review"]) {
            expect(PANEL_SOURCE).toContain(label);
        }
        expect(PANEL_SOURCE).not.toContain("window.prompt(");
        expect(PANEL_SOURCE).toContain("Open normal upload composer");
        expect(PANEL_SOURCE).toContain("not uploaded");
        expect(PANEL_SOURCE).toContain("never edit profiles, sync to cloud, enter diagnostics, or appear in portable settings exports");
        expect(PANEL_SOURCE).toContain("Media Shelf keeps {baseline.mediaShelf.length} local reference(s) and runs no Discord adapter.");
        expect(WIZARD_CSS).toContain("[data-solcord-focus-muted=\"true\"]");
        expect(WIZARD_CSS).toContain(".solcord-call-badge");
    });

    test("keeps baseline adapter settings and runtime status synchronized", () => {
        expect(PANEL_SOURCE).toContain("const current = SolcordSettings.snapshot().productPreferences;");
        expect(PANEL_SOURCE).toContain("baseline: {...current.baseline, ...patch}");
        expect(PANEL_SOURCE).not.toContain("update({...baseline, embedControls:");
        expect(RUNTIME_SOURCE).toMatch(/if \(affected\.size\) await this\.#synchronizeFeatures\(\[\.\.\.affected\]\);\s*this\.emitChange\(\);/);
    });
});
