import {describe, expect, test} from "bun:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {resolvePanelLabel, resolveTranslatedText} from "../../src/betterdiscord/stores/panel-label";

describe("Solcord settings navigation label", () => {
    test("uses the product-owned literal without consulting a translation sentinel", () => {
        expect(resolvePanelLabel("solcord", "Solcord Suite", false)).toBe("Solcord Suite");
    });

    test("falls back instead of rendering the missing-translation sentinel", () => {
        expect(resolvePanelLabel("not-a-real-panel", "Fallback panel")).toBe("Fallback panel");
    });

    test("recovers a useful built-in label even when an eager translation became the sentinel", () => {
        expect(resolvePanelLabel("plugins", "String not found!")).toBe("Plugins");
        expect(resolvePanelLabel("customcss", "String not found!")).toBe("Custom CSS");
    });

    test("never leaks the translation sentinel into collection, setting, note, or option fallbacks", () => {
        expect(resolveTranslatedText("Collections.missing.name", "Readable fallback")).toBe("Readable fallback");
        expect(resolveTranslatedText("Collections.missing.note", undefined)).toBeUndefined();
    });
});

describe("Solcord Control Center clarity", () => {
    const panel = readFileSync(resolve(import.meta.dir, "../../src/betterdiscord/ui/solcord/panel.tsx"), "utf8");

    test("uses a stable vertical information architecture", () => {
        expect(panel).toContain("{label: \"Start\", ids: [\"overview\"]}");
        expect(panel).toContain("{label: \"Personalize\", ids: [\"appearance\", \"performance\"]}");
        expect(panel).toContain("{label: \"Features\", ids: [\"privacy\", \"chat\", \"voice\", \"friends\"]}");
        expect(panel).toContain("{label: \"System\", ids: [\"extensions\", \"recovery\"]}");
        expect(panel).toContain("placeholder=\"Find a setting\"");
    });

    test("keeps unsupported adapters out of the primary tool status strip", () => {
        expect(panel).toContain("const usableScopeStatus = scopeStatus.filter(item => item.maturity !== \"unsupported\" && item.maturity !== \"off\")");
        expect(panel).toContain("These tools are unavailable on this Discord build, so no inactive controls are shown.");
    });

    test("moves infrequent profile operations behind progressive disclosure", () => {
        expect(panel).toContain("className=\"solcord-secondary-tools\"");
        expect(panel).toContain("Import, export, or create a profile");
    });

    test("keeps runtime diagnostics and the community catalog out of the primary path", () => {
        expect(panel).toContain("className=\"solcord-extension-disclosure\"");
        expect(panel).toContain("Community software and technical state");
    });

    test("keeps idle Fake Deafen out of Overview attention signals", () => {
        const pulse = panel.slice(panel.indexOf("function SessionPulse"), panel.indexOf("function ProviderMigrationStatus"));
        expect(pulse).not.toContain("fakeDeafen");
        expect(pulse).not.toContain("Fake Deafen");
    });

    test("places Fake Deafen under a collapsed Voice experimental disclosure", () => {
        expect(panel).toContain("<details className=\"solcord-experimental\"><summary>Experimental</summary><PowerLabStatus /></details>");
        expect(panel).not.toContain("workspace === \"power\"");
    });

    test("uses a dedicated setup workspace and only a compact reminder after deferral", () => {
        expect(panel).toContain("const focusSetup = workspace === \"overview\" && workspaceFocus === \"setup\"");
        expect(panel).toContain("document.querySelector<HTMLElement>(\".solcord-wizard\")");
        expect(panel).toContain("onboarding.status === \"pending\" ? <SetupWizard />");
        expect(panel).toContain("className=\"solcord-setup-reminder\"");
        expect(panel).not.toContain("className=\"solcord-setup-banner\"");
    });

    test("leads Privacy with the explicit profile and content-free capability report", () => {
        expect(panel).toContain("<PrivacyProtectionPanel /><StreamShieldControls />");
        expect(panel).toContain("Use Strict Privacy");
        expect(panel).toContain("Check for updates");
        expect(panel).toContain("never URLs, payloads, account IDs, messages, attachments, or file paths");
    });
});

describe("Solcord five-step setup", () => {
    const wizard = readFileSync(resolve(import.meta.dir, "../../src/betterdiscord/ui/solcord/setup-wizard.tsx"), "utf8");

    test("offers one clear footer path and a quiet reversible deferral", () => {
        const footer = wizard.slice(wizard.indexOf("<div className=\"solcord-wizard-footer\">"));
        expect(footer).toContain(">Back</button>");
        expect(footer).toContain(">Continue</button>");
        expect(footer).toContain("{busy ? \"Applying…\" : \"Apply\"}");
        expect(footer).toContain(">Finish later</button>");
        expect(footer).not.toContain("Cancel for now");
        expect(footer).not.toContain("Skip setup");
    });

    test("does not replace community plugin files during initial setup", () => {
        expect(wizard).toContain("{migrateProviders: false}");
        expect(wizard).not.toContain("solcord-provider-choice");
        expect(wizard).not.toContain("Replace duplicate cards");
    });

    test("starts with Strict Privacy and keeps private history optional", () => {
        expect(wizard).toContain("Choose your privacy baseline");
        expect(wizard).toContain("Strict Privacy");
        expect(wizard).toContain("Optional private history");
    });
});
