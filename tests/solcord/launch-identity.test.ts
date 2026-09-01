// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";


const source = readFileSync(resolve(import.meta.dir, "../../src/betterdiscord/loadingicon.ts"), "utf8");
const core = readFileSync(resolve(import.meta.dir, "../../src/betterdiscord/modules/core.ts"), "utf8");

describe("Solcord launch identity", () => {
    test("defers launch motion and branding to Discord's native splash", () => {
        expect(source).toContain("Solcord deliberately adds no second splash");
        expect(source).not.toContain("document.createElement");
        expect(source).not.toContain("innerHTML");
        expect(source).not.toContain("setTimeout");
    });

    test("keeps the inherited startup adapter as a harmless no-op", () => {
        expect(source).toContain("static show(): void {return;}");
        expect(source).toContain("static hide(): void {return;}");
        expect(source).not.toContain("CustomEvent");
        expect(source).not.toContain("fetch(");
    });

    test("confirms the exact Solcord candidate after the connected renderer is ready", () => {
        expect(core).toContain("ToastStore.success(`Solcord ");
        expect(core).toContain("Config.get(\"candidate\")");
        expect(core).toContain("forceShow: true");
        expect(core).toContain("group: \"solcord-startup-identity\"");
        expect(core.indexOf("await this.waitForConnection()")).toBeLessThan(core.indexOf("solcord-startup-identity"));
    });
});
