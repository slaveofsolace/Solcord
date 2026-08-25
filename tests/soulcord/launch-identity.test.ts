// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {SOULCORD_LAUNCH_TIMING, soulCordLaunchFrame, soulCordLaunchTimeout} from "../../src/common/soulcord/launch-identity";


const source = readFileSync(resolve(import.meta.dir, "../../src/betterdiscord/loadingicon.ts"), "utf8");

describe("SoulCord launch identity", () => {
    test("resolves SOLcord by inserting U between O and L within the bounded sequence", () => {
        expect(soulCordLaunchFrame(0)).toBe("initial");
        expect(soulCordLaunchFrame(SOULCORD_LAUNCH_TIMING.settleMs + 1)).toBe("inserting");
        expect(soulCordLaunchFrame(SOULCORD_LAUNCH_TIMING.resolveMs)).toBe("resolved");
        expect(SOULCORD_LAUNCH_TIMING.resolveMs).toBeWithin(700, 1_001);
        expect(source).toContain("<span>SO</span><span class=\"soulcord-launch-u\">U</span><span class=\"soulcord-launch-suffix\">Lcord</span>");
    });

    test("uses a stable accessible label and immediate reduced-motion frame", () => {
        expect(soulCordLaunchFrame(0, true)).toBe("resolved");
        expect(source).toContain("aria-label\", \"SoulCord is starting\"");
        expect(source).toContain("@media (prefers-reduced-motion: reduce)");
        expect(source).toContain("@media (forced-colors: active)");
    });

    test("fails open over Discord's existing startup surface with bounded cleanup", () => {
        expect(soulCordLaunchTimeout(undefined)).toBe(12_000);
        expect(soulCordLaunchTimeout(1)).toBe(4_000);
        expect(soulCordLaunchTimeout(99_000)).toBe(15_000);
        expect(source).not.toContain("background-image");
        expect(source).not.toContain("backdrop-filter");
        expect(source).toContain("The Discord startup surface is deliberately left untouched as the fallback.");
        expect(source).toContain("soulcord:launch-recovery");
        expect(SOULCORD_LAUNCH_TIMING.handoffMs).toBeWithin(150, 221);
    });
});
