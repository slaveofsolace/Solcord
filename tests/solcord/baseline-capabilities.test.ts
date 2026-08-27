// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {getSolcordBaselineCapability, SOLCORD_BASELINE_CAPABILITIES} from "../../src/common/solcord/baseline-capabilities";


describe("Solcord baseline capabilities", () => {
    test("keeps the reviewed capability list unique and performance ordered", () => {
        const ids = SOLCORD_BASELINE_CAPABILITIES.map(capability => capability.id);
        const orders = SOLCORD_BASELINE_CAPABILITIES.map(capability => capability.performanceOrder);

        expect(new Set(ids).size).toBe(ids.length);
        expect(orders).toEqual([...orders].sort((left, right) => left - right));
        expect(ids).toEqual([
            "layout-collapse",
            "embed-controls",
            "cross-platform-autoscroll",
            "media-shelf",
            "message-link-preview"
        ]);
    });

    test("marks every reviewed adapter ready, default-off, lazy, and free while disabled", () => {
        for (const capability of SOLCORD_BASELINE_CAPABILITIES) {
            expect(capability.status).toBe("ready");
            expect(capability.defaultEnabled).toBeFalse();
            expect(capability.loading).toBe("lazy");
            expect(capability.disabledRuntimeCost).toBe("none");
            expect(capability.networkAccess).toBeFalse();
            expect(capability.accountActions).toBeFalse();
            expect(capability.requiredAdapters.length).toBeGreaterThan(0);
            expect(capability.boundaries.length).toBeGreaterThan(0);
        }
    });

    test("pins every inspiration to the reviewed BetterDiscord plugin route", () => {
        expect(SOLCORD_BASELINE_CAPABILITIES.map(capability => capability.inspiration.name)).toEqual([
            "CollapsibleUI",
            "CollapseEmbeds",
            "AutoScroll",
            "ImageFolder",
            "PeekMessageLinks"
        ]);

        for (const capability of SOLCORD_BASELINE_CAPABILITIES) {
            const url = new URL(capability.inspiration.url);
            expect(url.origin).toBe("https://betterdiscord.app");
            expect(url.pathname).toBe(`/plugins/${capability.inspiration.name}`);
        }
    });

    test("returns immutable capability metadata", () => {
        const capability = getSolcordBaselineCapability("layout-collapse");

        expect(Object.isFrozen(SOLCORD_BASELINE_CAPABILITIES)).toBeTrue();
        expect(Object.isFrozen(capability)).toBeTrue();
        expect(Object.isFrozen(capability.inspiration)).toBeTrue();
        expect(Object.isFrozen(capability.requiredAdapters)).toBeTrue();
        expect(Object.isFrozen(capability.boundaries)).toBeTrue();
    });
});
