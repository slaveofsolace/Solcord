// SPDX-License-Identifier: Apache-2.0

import {afterEach, describe, expect, test} from "bun:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {SolcordDisposalScope} from "../../src/betterdiscord/modules/solcord/disposal";
import {solcordFlowPairCount, solcordFlowPalette, SolcordNativeSuiteController} from "../../src/betterdiscord/modules/solcord/native-suite";
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
    test("background blending respects explicit appearance under native light ancestry", () => {
        const previousMode = document.documentElement.dataset.solcordMode;
        const rootClass = document.documentElement.className;
        const bodyClass = document.body.className;
        startMotion("visual", "full", false);
        try {
            const cases = [
                ["solcord-dark", false, true, "screen"],
                ["solcord-light", false, true, "multiply"],
                ["follow-discord", false, true, "multiply"],
                ["follow-discord", true, false, "multiply"],
                ["solcord-dark", true, false, "screen"],
                ["follow-discord", false, false, "screen"]
            ] as const;
            for (const [mode, rootLight, bodyLight, expected] of cases) {
                document.documentElement.dataset.solcordMode = mode;
                document.documentElement.classList.toggle("theme-light", rootLight);
                document.body.classList.toggle("theme-light", bodyLight);
                // Fresh probes test the CSS state contract. Happy DOM caches
                // dataset-only restyling; native redraw remains a live gate.
                const field = document.createElement("div");
                field.className = "solcord-flow-field";
                document.body.append(field);
                try {expect(getComputedStyle(field).mixBlendMode).toBe(expected);}
                finally {field.remove();}
            }
        }
        finally {
            if (previousMode === undefined) delete document.documentElement.dataset.solcordMode;
            else document.documentElement.dataset.solcordMode = previousMode;
            document.documentElement.className = rootClass;
            document.body.className = bodyClass;
        }
    });

    test("SOL Flow consumes the selected tint and amount even in a narrow window", () => {
        expect(solcordFlowPalette("#ff755f", false)[0]).toBe("rgba(255,117,95,0.34)");
        expect(solcordFlowPalette("#76a891", false)).not.toEqual(solcordFlowPalette("#ff755f", false));
        expect(solcordFlowPalette("#ff755f", true)).not.toEqual(solcordFlowPalette("#ff755f", false));
        for (const width of [320, 600, 1366, 3840]) {
            expect(solcordFlowPairCount(width, 1)).toBeLessThan(solcordFlowPairCount(width, 12));
            expect(solcordFlowPairCount(width, 12)).toBeLessThan(solcordFlowPairCount(width, 24));
            expect(solcordFlowPairCount(width, 999)).toBeLessThanOrEqual(32);
        }
    });

    test("canvas failure is reported for that background without stopping neighboring tools", () => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = (() => null) as typeof original;
        try {
            const scope = new SolcordDisposalScope();
            const controller = new SolcordNativeSuiteController(scope, {DiscordEffects: true, Translator: true}, {
                motionPreferences: {...motionPreferences, effect: "field"},
                motionPolicy: {effectiveMotion: "full", ambientEffects: true},
                currentCall: () => undefined,
                subscribeCall: () => () => {}
            });
            owned.push({controller, scope});
            controller.start();
            expect(controller.providerReady("DiscordEffects")).toBeFalse();
            expect(controller.providerReady("Translator")).toBeTrue();
            expect(controller.statuses().find(status => status.id === "motion-studio")?.maturity).toBe("unsupported");
            expect(document.querySelector("[data-solcord-ambient-effect]")).toBeNull();
        }
        finally {HTMLCanvasElement.prototype.getContext = original;}
    });
    test("routes user and OS motion changes to the independently owned motion scope", () => {
        const runtime = readFileSync(resolve(import.meta.dir, "../../src/betterdiscord/modules/solcord/runtime.ts"), "utf8");
        expect(runtime).toContain("planSolcordPreferenceEffects(previous, next)");
        expect(runtime).toContain("else if (effects.motion) this.#synchronizeMotion()");
        expect(runtime).toContain("this.#nativeSuite.configureMotion(preferences.nativeSuite.motion");
        expect(runtime).toContain("reducedMotionQuery.addEventListener(\"change\", onReducedMotionChange)");
        expect(runtime).toContain("this.#rootScope.own(() => reducedMotionQuery.removeEventListener(\"change\", onReducedMotionChange), \"listener\")");
        expect(runtime.indexOf("this.#curatedScope.dispose();")).toBeLessThan(runtime.indexOf("const nativeSuite = new SolcordNativeSuiteController"));
    });

    test("a background never enables the separate surface-animation provider", () => {
        const {controller} = startMotion("balanced", "full", false);
        expect(document.querySelector("[data-solcord-ambient-effect]")).not.toBeNull();
        expect(document.getElementById("solcord-native-motion")!.textContent).not.toContain("chat-messages-");
        expect(controller.providerReady("BetterAnimations")).toBeFalse();

        controller.configureMotion(motionPreferences, {effectiveMotion: "full", ambientEffects: true}, {DiscordEffects: true, BetterAnimations: true});
        expect(document.getElementById("solcord-native-motion")!.textContent).toContain("chat-messages-");
        controller.configureMotion(motionPreferences, {effectiveMotion: "full", ambientEffects: true}, {DiscordEffects: true, BetterAnimations: false});
        expect(document.getElementById("solcord-native-motion")!.textContent).not.toContain("chat-messages-");
        expect(document.querySelector("[data-solcord-ambient-effect]")).not.toBeNull();
    });

    test("live motion changes preserve neighboring call subscriptions and update actual effect properties", () => {
        const scope = new SolcordDisposalScope();
        let subscriptions = 0;
        let releases = 0;
        const policy = {effectiveMotion: "full" as const, ambientEffects: true};
        const preferences = {...motionPreferences, particleCount: 8};
        const controller = new SolcordNativeSuiteController(scope, {DiscordEffects: true, CallTimeCounter: true}, {
            motionPreferences: preferences,
            motionPolicy: policy,
            currentCall: () => undefined,
            subscribeCall: () => {subscriptions++; return () => releases++;}
        });
        controller.start();
        owned.push({controller, scope});
        const original = document.querySelector<HTMLElement>("[data-solcord-ambient-effect]")!;
        const originalCounts = scope.counts();
        controller.configureMotion(preferences, policy, {DiscordEffects: true, BetterAnimations: false});
        expect(document.querySelector("[data-solcord-ambient-effect]")).toBe(original);
        expect(scope.counts()).toEqual(originalCounts);
        for (let speed = 50; speed <= 200; speed += 50) {
            controller.configureMotion({...preferences, speedPercent: speed, color: "#ff755f", opacityPercent: 70}, policy, {DiscordEffects: true, BetterAnimations: false});
            const scene = document.querySelector<HTMLElement>("[data-solcord-ambient-effect]")!;
            expect(document.querySelectorAll("[data-solcord-ambient-effect]")).toHaveLength(1);
            expect(scene.style.getPropertyValue("--solcord-effect-color")).toBe("#ff755f");
            expect(scene.style.getPropertyValue("--solcord-effect-opacity")).toBe("0.7");
            expect(scene.querySelector<HTMLElement>("span")!.style.animationDuration).toBe(`${(1.2 * 100 / speed).toFixed(2)}s`);
            expect(subscriptions).toBe(1);
            expect(releases).toBe(0);
            expect(scope.counts()).toEqual(originalCounts);
        }
        controller.configureMotion({...preferences, effect: "off"}, policy, {DiscordEffects: false, BetterAnimations: false});
        expect(document.querySelector("[data-solcord-ambient-effect]")).toBeNull();
        expect(controller.providerReady("DiscordEffects")).toBeFalse();
        expect(releases).toBe(0);
        controller.dispose();
        scope.dispose();
        expect(releases).toBe(1);
        expect(scope.counts()).toEqual({});
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
