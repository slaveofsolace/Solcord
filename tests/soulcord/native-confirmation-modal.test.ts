// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const ROOT = resolve(import.meta.dir, "../..");

describe("SoulCord native-only confirmation modal wiring", () => {
    test("keeps the Link Lens API isolated from the raw DOM fallback", () => {
        const source = readFileSync(resolve(ROOT, "src/betterdiscord/ui/modals.ts"), "utf8");
        const start = source.indexOf("static showNativeConfirmationModal");
        const end = source.indexOf("static addonErrorsOpen", start);
        expect(start).toBeGreaterThan(0);
        expect(end).toBeGreaterThan(start);
        const nativeOnly = source.slice(start, end);

        expect(nativeOnly).toContain("actions.openModal");
        expect(nativeOnly).toContain("onRenderError");
        expect(nativeOnly).toContain("showNativeConfirmationModal");
        expect(nativeOnly).not.toContain("this.default");
        expect(nativeOnly).not.toContain("bd-modal-wrapper");
    });

    test("keeps runtime maturity at preview until disposable acceptance", () => {
        const source = readFileSync(resolve(ROOT, "src/betterdiscord/modules/soulcord/runtime.ts"), "utf8");
        const start = source.indexOf("async #startLinkLens");
        const end = source.indexOf("#startStreamShield", start);
        const linkLensRuntime = source.slice(start, end);

        expect(linkLensRuntime).toContain("Modals.showNativeConfirmationModal");
        expect(linkLensRuntime).toContain("maturity: \"preview\"");
        expect(linkLensRuntime).not.toContain("maturity: \"ready\"");
        expect(linkLensRuntime).not.toContain("Modals.showConfirmationModal");
    });
});
