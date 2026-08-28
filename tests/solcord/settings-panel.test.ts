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
        expect(panel).toContain("{label: \"Home\", ids: [\"overview\"]}");
        expect(panel).toContain("{label: \"Tune\", ids: [\"appearance\", \"performance\"]}");
        expect(panel).toContain("{label: \"Use\", ids: [\"privacy\", \"chat\", \"voice\", \"friends\"]}");
        expect(panel).toContain("{label: \"Maintain\", ids: [\"extensions\", \"recovery\", \"advanced\"]}");
        expect(panel).toContain("placeholder=\"Find a setting\"");
    });

    test("keeps unsupported adapters out of the primary tool status strip", () => {
        expect(panel).toContain("const usableScopeStatus = scopeStatus.filter(item => item.maturity !== \"unsupported\" && item.maturity !== \"off\")");
        expect(panel).toContain("No tool in this section passed adapter validation on the current Discord build. Solcord left each one off.");
    });

    test("moves infrequent profile operations behind progressive disclosure", () => {
        expect(panel).toContain("className=\"solcord-secondary-tools\"");
        expect(panel).toContain("Import, export, or create a profile");
    });

    test("keeps an enabled Fake Deafen provider discoverable from Overview", () => {
        expect(panel).toContain("fakeDeafenProvider: SolcordRuntime.fakeDeafenProvider()");
        expect(panel).toContain("Fake Deafen is ready");
        expect(panel).toContain("action: \"Open Fake Deafen\"");
        expect(panel).toContain("signal.id === \"fake-deafen\" ? \"voice\"");
    });
});
