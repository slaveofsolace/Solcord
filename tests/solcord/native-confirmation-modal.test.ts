// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const ROOT = resolve(import.meta.dir, "../..");

describe("Solcord native-only confirmation modal wiring", () => {
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

    test("publishes ready only through the accepted native modal and bounded focus lifecycle", () => {
        const source = readFileSync(resolve(ROOT, "src/betterdiscord/modules/solcord/runtime.ts"), "utf8");
        const start = source.indexOf("async #startLinkLens");
        const end = source.indexOf("#startStreamShield", start);
        const linkLensRuntime = source.slice(start, end);

        expect(linkLensRuntime).toContain("Modals.showNativeConfirmationModal");
        expect(linkLensRuntime).toContain("maturity: \"ready\"");
        expect(linkLensRuntime).toContain("userIntervened");
        expect(linkLensRuntime).toContain("scope.listen(globalThis, \"pointerdown\"");
        expect(linkLensRuntime).toContain("scope.listen(globalThis, \"keydown\"");
        expect(linkLensRuntime).toContain("scope.timeout");
        expect(linkLensRuntime).not.toContain("globalThis.addEventListener");
        expect(linkLensRuntime).not.toContain("globalThis.setTimeout");
        expect(linkLensRuntime).not.toContain("Modals.showConfirmationModal");
    });
});
