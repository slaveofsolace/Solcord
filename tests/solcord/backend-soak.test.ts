// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

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
        expect(report.failures).toEqual([]);
        expect(report.nonclaims).toContain("This does not launch or inspect Discord.");
    });
});
