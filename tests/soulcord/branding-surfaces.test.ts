// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");
const read = (path: string) => readFileSync(resolve(REPOSITORY_ROOT, path), "utf8");

describe("SoulCord brand surfaces", () => {
    test("uses the production mark in renderer loading and command surfaces", () => {
        const loader = read("src/betterdiscord/loadingicon.ts");
        const commands = read("src/betterdiscord/modules/commandmanager.tsx");

        expect(loader).toContain("import soulCordMark from \"@assets/branding/soulcord-mark.svg\"");
        expect(loader).toMatch(/background-image: url\("\$\{soulCordMark\}"\)/);
        expect(loader).not.toContain("PHN2ZyB2ZXJzaW9u");
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
});
