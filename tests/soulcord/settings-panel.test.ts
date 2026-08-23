import {describe, expect, test} from "bun:test";

import {resolvePanelLabel} from "../../src/betterdiscord/stores/panel-label";

describe("SoulCord settings navigation label", () => {
    test("uses the product-owned literal without consulting a translation sentinel", () => {
        expect(resolvePanelLabel("soulcord", "SoulCord Suite", false)).toBe("SoulCord Suite");
    });

    test("falls back instead of rendering the missing-translation sentinel", () => {
        expect(resolvePanelLabel("not-a-real-panel", "Fallback panel")).toBe("Fallback panel");
    });
});
