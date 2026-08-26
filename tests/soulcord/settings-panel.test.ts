import {describe, expect, test} from "bun:test";

import {resolvePanelLabel, resolveTranslatedText} from "../../src/betterdiscord/stores/panel-label";

describe("SoulCord settings navigation label", () => {
    test("uses the product-owned literal without consulting a translation sentinel", () => {
        expect(resolvePanelLabel("soulcord", "SoulCord Suite", false)).toBe("SoulCord Suite");
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
