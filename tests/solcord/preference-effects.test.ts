import {describe, expect, test} from "bun:test";

import {normalizeSolcordProductPreferences} from "../../src/common/solcord/product";
import {planSolcordPreferenceEffects} from "../../src/common/solcord/preference-effects";

describe("Solcord preference effect routing", () => {
    test("changing appearance or an effect never restarts unrelated provider families", () => {
        const previous = normalizeSolcordProductPreferences(undefined);
        const appearance = structuredClone(previous);
        appearance.appearance.mode = "solcord-light";
        expect(planSolcordPreferenceEffects(previous, appearance)).toEqual({changed: true, presentation: true, baseline: false, nativeSuite: false, motion: false, privacy: false, features: []});
        for (const patch of [{color: "#ff755f"}, {speedPercent: 150}, {opacityPercent: 70}, {effect: "rain" as const}]) {
            const next = structuredClone(previous);
            Object.assign(next.nativeSuite.motion, patch);
            expect(planSolcordPreferenceEffects(previous, next)).toEqual({changed: true, presentation: false, baseline: false, nativeSuite: false, motion: true, privacy: false, features: []});
        }
    });

    test("performance changes reach sampling and motion without rebuilding the native suite", () => {
        const previous = normalizeSolcordProductPreferences(undefined);
        const next = {...previous, performanceProfile: "lean" as const};
        expect(planSolcordPreferenceEffects(previous, next)).toEqual({changed: true, presentation: true, baseline: false, nativeSuite: false, motion: true, privacy: false, features: ["performance-hud"]});
    });

    test("only the changed consumers are reconciled for private and baseline settings", () => {
        const previous = normalizeSolcordProductPreferences(undefined);
        const next = structuredClone(previous);
        next.friendWatch.retentionDays = 7;
        next.baseline.embedControls = !previous.baseline.embedControls;
        expect(planSolcordPreferenceEffects(previous, next)).toEqual({changed: true, presentation: false, baseline: true, nativeSuite: false, motion: false, privacy: false, features: ["friend-watch"]});
        expect(planSolcordPreferenceEffects(previous, structuredClone(previous))).toEqual({changed: false, presentation: false, baseline: false, nativeSuite: false, motion: false, privacy: false, features: []});
    });
});
