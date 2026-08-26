// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");
const read = (path: string) => readFileSync(resolve(REPOSITORY_ROOT, path), "utf8");

describe("SoulCord brand surfaces", () => {
    test("leaves Discord's native launch spinner unobstructed and uses the production mark on command surfaces", () => {
        const loader = read("src/betterdiscord/loadingicon.ts");
        const commands = read("src/betterdiscord/modules/commandmanager.tsx");

        expect(loader).toContain("SoulCord deliberately adds no second splash");
        expect(loader).toContain("static show(): void {return;}");
        expect(loader).toContain("static hide(): void {return;}");
        expect(loader).not.toContain("soulcord-launch-");
        expect(loader).not.toContain("document.createElement");
        expect(commands).toContain("import soulCordMark from \"@assets/branding/soulcord-mark.svg\"");
        expect(commands).toContain("const SOULCORD_COMMAND_ICON = soulCordMark;");
        expect(commands).not.toContain("%3Crect width='64'");
    });

    test("renders the production cord-cut silhouette in the editor loader", () => {
        const editor = read("src/editor/index.html");

        expect(editor).toContain("Loading SoulCord editor…");
        expect(editor).toContain("d=\"M52 12C43 5 26 6 17 14C8 22 13 30 28 32\"");
        expect(editor).toContain("d=\"M36 32C51 34 56 42 47 50C38 58 21 59 12 52\"");
        expect(editor).toContain("#bd-icon::before,");
        expect(editor).toContain("content: none;");
        expect(editor).toContain("prefers-reduced-motion: reduce");
    });

    test("keeps saved appearance choices live across every atomic settings path", () => {
        const runtime = read("src/betterdiscord/modules/soulcord/runtime.ts");
        const styles = read("src/betterdiscord/styles/soulcord.css");

        expect(runtime).toMatch(/async #synchronizeFeatures\(\): Promise<void> \{\s*this\.#applyProductPresentation\(\);/);
        expect(styles).toContain("html[data-soulcord-message-shape=\"seamed\"] #app-mount li[id^=\"chat-messages-\"]");
    });
});
