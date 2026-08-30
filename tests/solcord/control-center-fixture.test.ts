// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const root = resolve(import.meta.dir, "../..");
const fixture = readFileSync(resolve(root, "tests/fixtures/solcord-control-center.html"), "utf8");
const renderer = readFileSync(resolve(root, "scripts/render-solcord-ui-fixture.mjs"), "utf8");

describe("Solcord isolated Control Center fixture", () => {
    test("covers every canonical workspace and the dedicated setup state", () => {
        for (const id of ["overview", "appearance", "performance", "privacy", "chat", "voice", "friends", "extensions", "recovery"]) {
            expect(fixture).toContain(`${id}: () =>`);
        }
        expect(fixture).toContain("state === \"wizard\" ? setupScreen()");
        expect(fixture).toContain("Your choices save as you go. Nothing changes until Apply.");
        expect(fixture).toContain("result.workspaceHeadingCount === expectedHeadingCount");
        expect(fixture).toContain("<div class=\"solcord-section-heading\"><h3>$" + "{title}</h3>");
        expect(fixture).not.toContain("<div class=\"solcord-section-heading\"><h2>$" + "{title}</h2>");
        expect(fixture).toContain(String.raw`document.querySelector(".solcord-workspace-switcher select").value = workspace;`);
    });

    test("measures overflow, focus, contrast, responsive relationships, and reduced motion", () => {
        for (const contract of ["horizontalOverflow", "clippedOrOverflowingElements", "focusFailures", "normal: Number(elementContrast", "muted: Number(elementContrast", "navigation: Number(elementContrast", "settingTitle:", "settingCopy:", "navigationRelationship", "reducedMotion"]) {
            expect(fixture).toContain(contract);
        }
        expect(fixture).toContain("nativeRowSpacingFailures");
        expect(fixture).toContain("People and Spaces");
        expect(fixture).toContain("replacement.left - title.right < 8");
        expect(renderer).toContain("isolated representative fixture using the production Solcord stylesheet; not live Discord acceptance");
        expect(renderer).toContain("appearance-light-long-320-container");
        expect(renderer).toContain("fixtureWidth=320");
        expect(renderer).toContain("privacy-light-1920x1080");
        expect(renderer).toContain("setup-dark-1280x720");
        for (const scale of ["scale=100", "scale=125", "scale=150", "scale=200"]) {
            expect(renderer).toContain(scale);
        }
        for (const theme of ["solcord-default", "obsidian-thread", "carbon-ember", "midnight-glass", "paper-signal", "threadline", "signal-block", "relay-classic", "workshop", "quiet-read", "night-transit"]) {
            expect(renderer).toContain(`theme=${theme}`);
            expect(fixture).toContain(`"${theme}"`);
        }
    });

    test("uses an isolated browser profile with background networking disabled", () => {
        expect(renderer).toContain("mkdtempSync");
        expect(renderer).toContain("--disable-background-networking");
        expect(renderer).toContain("--disable-component-update");
        expect(renderer).toContain("--user-data-dir=");
        expect(renderer).toContain("rmSync(profile, {recursive: true, force: true})");
    });
});
