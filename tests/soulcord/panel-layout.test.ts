// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {calculateSoulCordPanelWidth} from "../../src/betterdiscord/ui/soulcord/panel-layout";

const PANEL_SOURCE = readFileSync(resolve(import.meta.dir, "../../src/betterdiscord/ui/soulcord/panel.tsx"), "utf8");

describe("SoulCord panel viewport bound", () => {
    test("caps a wide settings surface at the authored maximum", () => {
        expect(calculateSoulCordPanelWidth(240, 1600)).toBe(1080);
    });

    test("accounts for the measured left edge and right gutter in a narrow host", () => {
        expect(calculateSoulCordPanelWidth(310, 1142)).toBe(808);
        expect(calculateSoulCordPanelWidth(310.5, 1142.75)).toBe(808);
    });

    test("rejects invalid or exhausted measurements so CSS remains the fallback", () => {
        expect(calculateSoulCordPanelWidth(Number.NaN, 1142)).toBeUndefined();
        expect(calculateSoulCordPanelWidth(-1, 1142)).toBeUndefined();
        expect(calculateSoulCordPanelWidth(310, Number.POSITIVE_INFINITY)).toBeUndefined();
        expect(calculateSoulCordPanelWidth(310, 0)).toBeUndefined();
        expect(calculateSoulCordPanelWidth(1120, 1142)).toBeUndefined();
    });

    test("owns, coalesces, and fully releases runtime sizing resources", () => {
        expect(PANEL_SOURCE).toContain("window.addEventListener(\"resize\", scheduleMeasurement, {passive: true})");
        expect(PANEL_SOURCE).toContain("window.removeEventListener(\"resize\", scheduleMeasurement)");
        expect(PANEL_SOURCE).toContain("resizeObserver.observe(panel.parentElement ?? panel)");
        expect(PANEL_SOURCE).toContain("resizeObserver?.disconnect()");
        expect(PANEL_SOURCE).toContain("window.cancelAnimationFrame(animationFrame)");
        expect(PANEL_SOURCE).toContain("if (animationFrame !== undefined) return");
        expect(PANEL_SOURCE).toContain("restoreWidth()");
    });
});
