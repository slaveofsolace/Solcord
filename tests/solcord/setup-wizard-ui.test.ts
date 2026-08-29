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
    test("uses five resumable novice steps with private-history consent and no Power Lab page", () => {
        expect(stepLabels()).toEqual(["Welcome", "Privacy", "Appearance", "Features", "Review and Apply"]);
        expect(WIZARD_SOURCE).toContain("<summary>Optional private history</summary>");
        expect(WIZARD_SOURCE).toContain("SolcordSettings.setOnboardingStep(bounded)");
        expect(WIZARD_SOURCE).not.toContain("function PowerLabStep");
        expect(WIZARD_SOURCE).not.toContain("SOLCORD_POWER_LAB");
        expect(WIZARD_SOURCE).not.toContain("Request all 36");
        expect(WIZARD_SOURCE).toContain("SolcordSettings.setSetupDraft(draft)");
        expect(WIZARD_SOURCE).toContain("The durable draft was left unchanged");
        expect(WIZARD_SOURCE).toContain("Solcord could not save this setup step");
        expect(WIZARD_SOURCE).toContain("wizardRef.current?.scrollIntoView({behavior: \"auto\", block: \"start\"})");
        expect(WIZARD_SOURCE).toContain("<section ref={wizardRef} className=\"solcord-wizard\"");
        expect(WIZARD_SOURCE).toContain("role=\"progressbar\"");
        expect(WIZARD_CSS).toContain(".solcord-wizard-steps { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr))");
        expect(WIZARD_CSS).not.toContain(".solcord-wizard-steps { display: flex");
        expect(WIZARD_CSS).not.toContain(".solcord-wizard-steps { overflow-x: auto");
        expect(WIZARD_CSS).toContain("var(--brand-500, var(--button-filled-brand-background");
    });

    test("keys responsive layout to the actual settings content container", () => {
        expect(WIZARD_CSS).toContain("container: solcord-panel / inline-size; width: min(100%, 1180px); min-width: 0; max-width: 100%");
        expect(WIZARD_CSS).toContain("padding: 0 clamp(20px, 2.8vw, 34px) 52px");
        expect(WIZARD_CSS).toContain("@container solcord-panel (max-width: 720px)");
        expect(WIZARD_CSS).toContain(".solcord-workspace-nav-list { display: none; }");
        expect(WIZARD_CSS).toContain(".solcord-workspace-switcher { display: grid;");
        expect(WIZARD_CSS).toContain(".solcord-workspace-nav { position: sticky; z-index: 4; top: 0;");
        expect(WIZARD_CSS).toContain(".solcord-workspace { scroll-margin-top: 66px; }");
        expect(PANEL_SOURCE).toContain("function scrollSolcordTarget(target: HTMLElement | null): void");
        expect(PANEL_SOURCE).toContain("getComputedStyle(navigation).position === \"sticky\"");
        expect(PANEL_SOURCE).toContain("scrollOwner.scrollTo({top: Math.max(0, scrollOwner.scrollTop + targetOffset - stickyOffset), behavior: \"auto\"})");
        expect(PANEL_SOURCE).not.toContain("workspaceRef.current?.scrollIntoView");
        expect(WIZARD_CSS).toContain(":is(.solcord-setting-rows > label, .solcord-control-grid > label, .solcord-toggle) > input[type=\"checkbox\"] { appearance: none;");
        expect(WIZARD_CSS).toContain("> input[type=\"checkbox\"]:focus-visible");
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
        expect(WIZARD_CSS).toContain(".solcord-panel select option");
        expect(WIZARD_CSS).toContain("color: #F2EADF; background: #202528");
        expect(WIZARD_CSS).toContain("html[data-solcord-mode=\"solcord-light\"] .solcord-panel select option");
        expect(WIZARD_CSS).toContain("color: #24211F; background: #EBE2D5");
    });

    test("renders only accepted ready tools and directs pending work to the catalog", () => {
        expect(WIZARD_SOURCE).toContain("addons: group.addons.filter(addon => isReadyDecision(decisions.get(addon.name)))");
        expect(WIZARD_SOURCE).toContain("const pendingDecisions = useMemo");
        expect(WIZARD_SOURCE).toContain("Advanced choices come later");
        expect(WIZARD_SOURCE).toContain("Extensions can review community files with a separate backup and rollback preview.");
        expect(WIZARD_SOURCE).toContain("Apply and verify");
        expect(WIZARD_SOURCE).not.toContain("onReviewPending");
        expect(PANEL_SOURCE).toContain("<CatalogBrowser />");
        expect(PANEL_SOURCE).toContain("<SetupWizard />");
        expect(WIZARD_SOURCE).toContain("catalog candidates still need a runtime or security gate");
        expect(WIZARD_SOURCE).toContain("Each starts only after its Discord adapter validates.");
        expect(WIZARD_SOURCE).toContain("Pending tools stay uninstalled");
        expect(PANEL_SOURCE).toContain("Optional files not installed");
        const catalogSource = readFileSync(resolve(REPOSITORY_ROOT, "src/betterdiscord/ui/solcord/addon-catalog.tsx"), "utf8");
        expect(catalogSource).toContain("optional catalog file(s) absent");
        expect(catalogSource).toMatch(/aria-label=\{`\$\{addon\.enabled \? "Disable" : "Enable"\} \$\{presentation\.label\}`\}/);
        expect(catalogSource).not.toContain("\"not staged\"");
        expect(WIZARD_SOURCE).toContain("Keep display snapshots");
        expect(WIZARD_SOURCE).toContain("Friend Watch notification mode");
        expect(WIZARD_SOURCE).toContain("These features are off by default.");
        expect(WIZARD_SOURCE).not.toContain("this wizard does not change its policy");
        expect(WIZARD_SOURCE).not.toContain("addonModes: {...current.addonModes, SplitLargeMessages: \"guarded\"}");
    });

    test("keeps eleven theme choices, recommends Solcord Default, and preserves a no-change exit", () => {
        expect(WIZARD_SOURCE).toContain("\"solcord-default\": \"Recommended");
        expect(WIZARD_SOURCE).toContain("SOLCORD_THEMES.map(theme");
        expect(WIZARD_SOURCE).toContain("Nothing changes until Apply.");
        expect(WIZARD_SOURCE).toContain("Finish later");
        expect(WIZARD_SOURCE).toContain("SolcordSettings.skipOnboarding()");
        expect(WIZARD_SOURCE).toContain("current.selectedAddons.filter(name => !readyNames.has(name))");
        expect(PANEL_SOURCE).toContain("[onboarding.status, workspace]");
    });

    test("moves reversible provider replacement out of first setup and into Extensions", () => {
        expect(WIZARD_SOURCE).toContain("Existing community plugins stay untouched");
        expect(WIZARD_SOURCE).toContain("{migrateProviders: false}");
        expect(WIZARD_SOURCE).not.toContain("prepareProviderMigrationPlan");
        expect(PANEL_SOURCE).toContain("Replace duplicate plugins");
        expect(PANEL_SOURCE).toContain("SolcordRuntime.prepareProviderMigrationPlan(state.draft)");
        expect(PANEL_SOURCE).toContain("SolcordRuntime.finishSetup(state.draft, confirmedPlan)");
        expect(PANEL_SOURCE).toContain("move only these reviewed files to a timestamped rollback archive");
        expect(PANEL_SOURCE).toContain("Rollback latest migration");
        expect(PANEL_SOURCE).toContain("BDFDB retires last only if no remaining addon uses it");
        expect(PANEL_SOURCE).toContain("BDFDB is rechecked and retires last only when no remaining addon uses it");
        expect(PANEL_SOURCE).toContain("dependency rechecked last");
        expect(RUNTIME_SOURCE).toContain("const standaloneFileName = solcordStandaloneProviderFileName(entry.name)");
        expect(RUNTIME_SOURCE).toContain("const standaloneFileName = solcordStandaloneProviderFileName(migration.name)");
        expect(RUNTIME_SOURCE).toContain("SetupProviderMigrationConfirmationChanged");
        expect(RUNTIME_SOURCE).toContain("solcordV2QuarantineIdsForArchivedFiles(providerArchiveFiles)");
    });

    test("describes the clean-room interaction tools without claiming unavailable choices or automatic sends", () => {
        expect(CATALOG_SOURCE).toContain("Suppresses one validated outgoing typing-start path while the built-in is enabled.");
        expect(CATALOG_SOURCE).not.toContain("Stops typing indicators unless you choose otherwise.");
        expect(CATALOG_SOURCE).toContain("Guarded mode previews bounded chunks for manual copy without sending.");
    });

    test("keeps Attachment Guard truthful and gives its setup switch a visible effect", () => {
        expect(WIZARD_SOURCE).toContain("<strong>Attachment review</strong>");
        expect(WIZARD_SOURCE).toContain("Inspect a file locally before upload. Solcord never submits it for you.");
        expect(WIZARD_SOURCE).not.toContain("Require a local review before opening high-risk file types.");
        expect(PANEL_SOURCE).toContain("productPreferences.safety.attachmentGuard && <AttachmentGuardWorkbench />");
    });

    test("keeps Fake Deafen visible and preserves an active community provider", () => {
        expect(PANEL_SOURCE).toContain("Optional files not installed");
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
