// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {PropertySymbol} from "happy-dom";

import {runSolcordBackendSoak} from "../../scripts/soak-solcord-backend";

describe("Solcord non-live backend soak", () => {
    test("repeatedly tears down real controllers without executing adapter intents", async () => {
        const report = await runSolcordBackendSoak({
            durationMs: 60_000,
            cycleDelayMs: 0,
            sampleIntervalMs: 10,
            heapGrowthLimitBytes: 64 * 1024 * 1024,
            maxCycles: 8
        });

        expect(report.pass).toBeTrue();
        expect(report.evidenceKind).toBe("non-live synthetic backend lifecycle soak");
        expect(report.cycles).toBe(8);
        expect(report.adapterExecutions).toBe(0);
        expect(report.maximumVoiceHealthSamples).toBe(120);
        expect(report.maximumOwnedResources).toBeGreaterThan(0);
        expect(report.fixtureQueryCacheResets).toBe(8);
        const dependencies = (document as unknown as Record<symbol, unknown>)[PropertySymbol.affectsCache] as unknown[];
        expect(dependencies.length).toBeLessThan(10);
        expect(report.failures).toEqual([]);
        expect(report.nonclaims).toContain("This does not launch or inspect Discord.");
        expect(report.nonclaims).toContain("Happy DOM document query caches are cleared after each asserted teardown; this is disclosed test-harness maintenance, not product cleanup.");
    });
});
