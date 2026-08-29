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

describe("Solcord addon controls", () => {
    const switchSource = readFileSync(resolve(import.meta.dir, "../../src/betterdiscord/ui/settings/components/switch.tsx"), "utf8");
    const addonCardSource = readFileSync(resolve(import.meta.dir, "../../src/betterdiscord/ui/settings/addoncard.tsx"), "utf8");
    const toastSource = readFileSync(resolve(import.meta.dir, "../../src/betterdiscord/stores/toasts.ts"), "utf8");
    const themeManagerSource = readFileSync(resolve(import.meta.dir, "../../src/betterdiscord/modules/thememanager.ts"), "utf8");
    const addonManagerSource = readFileSync(resolve(import.meta.dir, "../../src/betterdiscord/modules/addonmanager.ts"), "utf8");

    test("gives plugin and theme switches a feature-specific accessible name", () => {
        expect(switchSource).toContain("aria-label={props.label}");
        expect(addonCardSource).toMatch(/label=\{`\$\{enabled \? "Disable" : "Enable"\} \$\{getString\(addon\.name\)\}`\}/);
        expect(addonCardSource).not.toMatch(/\$\{title\}`\} disabled=\{disabled\} value=\{enabled\}/);
    });

    test("coalesces rapid theme feedback instead of stacking success and error toasts over previews", () => {
        expect(toastSource).toContain("existing.group !== toast.group");
        expect(themeManagerSource.match(/group: "theme-change"/g)).toHaveLength(2);
        expect(themeManagerSource).toMatch(/Toasts\.info\(t\("Addons\.disabled"/);
        expect(addonManagerSource.match(/this\.prefix === "theme" \? \{group: "theme-change"\} : undefined/g)).toHaveLength(2);
    });
});

describe("Solcord Control Center clarity", () => {
    const panel = readFileSync(resolve(import.meta.dir, "../../src/betterdiscord/ui/solcord/panel.tsx"), "utf8");
    const timeline = readFileSync(resolve(import.meta.dir, "../../src/betterdiscord/ui/solcord/timeline.tsx"), "utf8");
    const styles = readFileSync(resolve(import.meta.dir, "../../src/betterdiscord/styles/solcord.css"), "utf8");

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

    test("reports an idle Activity policy as ready to observe instead of a false warning", () => {
        expect(panel).toContain("activity?.status === \"healthy\" || activity?.status === \"idle\"");
        expect(panel).toContain("no Activity window has opened in this session");
    });

    test("places Fake Deafen under a collapsed Voice experimental disclosure", () => {
        expect(panel).toContain("<details className=\"solcord-experimental\"><summary>Experimental</summary><PowerLabStatus /></details>");
        expect(panel).toContain("aria-label=\"Enable Solcord Fake Deafen\"");
        expect(panel).toMatch(/aria-label=\{`Enable \$\{health\.name\}`\}/);
        expect(panel).not.toContain("workspace === \"power\"");
    });

    test("keeps Voice Note Studio actions synchronized with permission, recording, and preview state", () => {
        expect(panel).toContain("const [voiceStarting, setVoiceStarting] = useState(false)");
        expect(panel).toContain("disabled={voiceStarting || voiceRecording || Boolean(voicePreview)}");
        expect(panel).toContain("disabled={voiceStarting || !voiceRecording}");
        expect(panel).toContain("disabled={!voiceStarting && !voiceRecording && !voicePreview}");
    });

    test("never reports a built-in action succeeded after its runtime controller disappeared", () => {
        expect(panel).toContain("const requireController = () =>");
        for (const unsafeCall of [
            "controller?.prepareReviewedVoiceNoteUpload",
            "controller?.applyReviewedNotifications",
            "controller?.pinDm",
            "controller?.hideGuild",
            "controller?.aliasGuild",
            "controller?.setFocusChannels"
        ]) expect(panel).not.toContain(unsafeCall);
    });

    test("mounts native controls only in their owning workspace instead of hiding unrelated forms with CSS", () => {
        for (const contract of [
            "scope === \"chat\" && available(\"composer-toolkit\")",
            "scope === \"chat\" && available(\"channel-glance\")",
            "scope === \"chat\" && available(\"translation-desk\")",
            "scope === \"chat\" && available(\"notification-review\")",
            "scope === \"voice\" && available(\"audio-console\")",
            "scope === \"voice\" && available(\"voice-note-studio\")",
            "scope === \"friends\" && available(\"people-and-spaces\")",
            "scope === \"friends\" && available(\"permission-lens\")",
            "scope === \"friends\" && available(\"local-identity-notes\")"
        ]) expect(panel).toContain(contract);
        expect(panel).toContain("<summary>Channel Glance</summary>");
        expect(panel).toContain("<summary>People and Spaces</summary>");
        expect(panel).not.toContain("<summary>Channel Glance and People and Spaces</summary>");
        expect(styles).not.toContain("details:nth-child");
    });

    test("uses a dedicated setup workspace and only a compact reminder after deferral", () => {
        expect(panel).toContain("const focusSetup = workspace === \"overview\" && workspaceFocus === \"setup\"");
        expect(panel).toContain("document.querySelector<HTMLElement>(\".solcord-wizard\")");
        expect(panel).toContain("onboarding.status === \"pending\" ? <SetupWizard />");
        expect(panel).toContain("function SetupManagement({openSetup}: {openSetup: () => void})");
        expect(panel).toContain("<ActionButton onClick={openSetup}>Reopen setup</ActionButton>");
        expect(panel).toContain("<SetupManagement openSetup={openSetup} />");
        expect(panel).toContain("className=\"solcord-setup-reminder\"");
        expect(panel).not.toContain("className=\"solcord-setup-banner\"");
    });

    test("leads Privacy with the explicit profile and content-free capability report", () => {
        expect(panel).toContain("<PrivacyProtectionPanel /><StreamShieldControls />");
        expect(panel).toContain("Use Strict Privacy");
        expect(panel).toContain("Check for updates");
        expect(panel).toContain("never URLs, payloads, account IDs, messages, attachments, or file paths");
    });

    test("does not report a storage failure before Message Timeline is enabled", () => {
        expect(timeline).toContain("Not in use while Timeline is off");
        expect(timeline).toContain("Session only by choice");
        expect(timeline).toContain("Session only · encrypted persistence unavailable");
        expect(timeline).not.toContain("session only · secure storage unavailable or disabled");
    });

    test("removes Discord's 300px settings-panel floor at a 320px viewport", () => {
        expect(styles).toContain("[class*=\"contentBody_\"]:has(.solcord-panel) > [class*=\"scroller_\"] > [class*=\"panel_\"]");
        expect(styles).toMatch(/\[class\*="panel_"\].*min-width: 0; max-width: 100%; margin: 0; padding: 0;/);
        expect(styles).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.solcord-panel \{[^}]*width: 100%;[^}]*max-width: 100%;[^}]*padding-right: 12px;[^}]*padding-left: 12px;/);
    });

    test("keeps native file pickers inside narrow Privacy and Recovery workspaces", () => {
        expect(styles).toMatch(/\.solcord-panel input\[type="file"\][^{]*\{[^}]*box-sizing: border-box;[^}]*width: 100%;[^}]*min-width: 0;[^}]*max-width: 100%;[^}]*overflow: hidden;/);
        expect(styles).toMatch(/\.solcord-scrubber-controls > input\[type="file"\][^{]*\{[^}]*flex: 1 1 190px;/);
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
