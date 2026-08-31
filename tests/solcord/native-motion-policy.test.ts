// SPDX-License-Identifier: Apache-2.0

import {afterEach, describe, expect, test} from "bun:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {SolcordDisposalScope} from "../../src/betterdiscord/modules/solcord/disposal";
import {SolcordNativeSuiteController} from "../../src/betterdiscord/modules/solcord/native-suite";
import {planSolcordNativeSuiteLookups} from "../../src/common/solcord/builtin-addons";
import {resolveSolcordPerformancePolicy} from "../../src/common/solcord/product";

const motionPreferences = Object.freeze({
    effect: "rain" as const,
    particleCount: 99,
    color: "#76a891",
    opacityPercent: 42,
    speedPercent: 100,
    starAngleDegrees: -28,
    surfaces: Object.freeze({
        messages: true,
        channels: true,
        servers: true,
        members: true,
        modals: true,
        popouts: true,
        settings: true,
        tooltips: true,
        threads: true
    })
});

const owned: Array<{controller: SolcordNativeSuiteController; scope: SolcordDisposalScope;}> = [];

function startMotion(profile: "lean" | "balanced" | "visual", motion: "full" | "subtle" | "reduced", reduceMotion: boolean) {
    const scope = new SolcordDisposalScope();
    const policy = resolveSolcordPerformancePolicy(profile, motion, reduceMotion);
    const controller = new SolcordNativeSuiteController(scope, {DiscordEffects: true}, {
        motionPreferences,
        motionPolicy: {effectiveMotion: policy.effectiveMotion, ambientEffects: policy.ambientEffects}
    });
    controller.start();
    owned.push({controller, scope});
    return {controller, scope};
}

afterEach(() => {
    for (const {controller, scope} of owned.splice(0)) {
        controller.dispose();
        scope.dispose();
    }
    document.querySelectorAll("[data-solcord-ambient-effect],[data-solcord-interaction-effect]").forEach(element => element.remove());
    document.getElementById("solcord-native-motion")?.remove();
});

describe("Solcord native motion performance policy", () => {
    test("restarts the owned native scope when user or OS motion policy changes", () => {
        const runtime = readFileSync(resolve(import.meta.dir, "../../src/betterdiscord/modules/solcord/runtime.ts"), "utf8");
        expect(runtime).toContain("const motionRuntimeChanged = previous.performanceProfile !== next.performanceProfile");
        expect(runtime).toContain("|| previous.appearance.motion !== next.appearance.motion");
        expect(runtime).toContain("JSON.stringify(previous.nativeSuite) !== JSON.stringify(next.nativeSuite) || motionRuntimeChanged");
        expect(runtime).toContain("reducedMotionQuery.addEventListener(\"change\", onReducedMotionChange)");
        expect(runtime).toContain("this.#rootScope.own(() => reducedMotionQuery.removeEventListener(\"change\", onReducedMotionChange), \"listener\")");
        expect(runtime.indexOf("this.#curatedScope.dispose();")).toBeLessThan(runtime.indexOf("const nativeSuite = new SolcordNativeSuiteController"));
    });

    test("Lean keeps bounded interaction motion but starts zero ambient resources", () => {
        const {controller, scope} = startMotion("lean", "full", false);

        expect(document.querySelector("[data-solcord-ambient-effect]")).toBeNull();
        expect(scope.counts().element).toBeUndefined();
        expect(scope.counts().timer).toBeUndefined();
        expect(scope.counts().observer).toBeUndefined();
        expect(scope.counts().listener).toBeUndefined();
        expect(scope.counts().style).toBe(1);
        expect(controller.statuses().find(status => status.id === "motion-studio")?.detail).toContain("Rain is off under the current performance policy");
    });

    test("Balanced Full honors an explicit ambient choice while Visual Subtle suppresses ambient work", () => {
        expect(planSolcordNativeSuiteLookups({DiscordEffects: true}, false)).toEqual({
            callContext: false,
            audioConsole: false,
            voiceNoteStudio: false,
            peopleAndSpaces: false,
            channelGlance: false,
            notificationReview: false,
            voiceHealth: false
        });

        const balanced = startMotion("balanced", "full", false);
        expect(document.querySelectorAll("[data-solcord-ambient-effect][data-effect='rain']")).toHaveLength(1);
        expect(balanced.controller.statuses().find(status => status.id === "motion-studio")?.detail).toContain("with Rain");
        balanced.controller.dispose();
        balanced.scope.dispose();
        expect(document.querySelector("[data-solcord-ambient-effect]")).toBeNull();

        const subtle = startMotion("visual", "subtle", false);
        expect(document.querySelector("[data-solcord-ambient-effect]")).toBeNull();
        expect(subtle.scope.counts()).toEqual({style: 1});
        expect(subtle.controller.statuses().find(status => status.id === "motion-studio")?.detail).toContain("Rain is off under the current performance policy");
        subtle.controller.dispose();
        subtle.scope.dispose();
    });

    test("effective Reduced starts no motion-owned styles, listeners, timers, canvases, or observers", () => {
        const {controller, scope} = startMotion("visual", "full", true);

        expect(document.querySelector("[data-solcord-ambient-effect]")).toBeNull();
        expect(document.getElementById("solcord-native-motion")).toBeNull();
        expect(scope.counts()).toEqual({});
        expect(controller.statuses().find(status => status.id === "motion-studio")?.detail).toContain("No motion listeners, timers, canvases, or observers were started");
    });

    test("Visual and Full allow one bounded ambient scene and idempotent startup", () => {
        const {controller, scope} = startMotion("visual", "full", false);
        const firstCounts = scope.counts();
        controller.start();

        const effects = document.querySelectorAll<HTMLElement>("[data-solcord-ambient-effect][data-effect='rain']");
        expect(effects).toHaveLength(1);
        expect(effects[0]?.querySelectorAll("span")).toHaveLength(24);
        expect(scope.counts()).toEqual(firstCounts);
        expect(controller.statuses().find(status => status.id === "motion-studio")?.detail).toContain("with Rain");

        controller.dispose();
        scope.dispose();
        expect(document.querySelector("[data-solcord-ambient-effect]")).toBeNull();
        expect(document.getElementById("solcord-native-motion")).toBeNull();
        expect(scope.counts()).toEqual({});
    });

    test("repeated Visual to Lean toggles return ambient ownership to baseline", () => {
        for (let index = 0; index < 3; index++) {
            const visual = startMotion("visual", "full", false);
            expect(document.querySelectorAll("[data-solcord-ambient-effect]")).toHaveLength(1);
            visual.controller.dispose();
            visual.scope.dispose();
            expect(document.querySelectorAll("[data-solcord-ambient-effect]")).toHaveLength(0);
            expect(visual.scope.counts()).toEqual({});

            const lean = startMotion("lean", "full", false);
            expect(document.querySelectorAll("[data-solcord-ambient-effect]")).toHaveLength(0);
            lean.controller.dispose();
            lean.scope.dispose();
            expect(lean.scope.counts()).toEqual({});
        }
    });
});
