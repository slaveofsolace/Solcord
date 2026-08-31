import {describe, expect, mock, test} from "bun:test";


let stored: unknown = {
    version: 1,
    records: {
        "../unsafe\u0000name": {
            addonId: "ignored-caller-id",
            failures: [
                {at: 100, phase: "start", errorName: "RangeError"},
                {at: Number.POSITIVE_INFINITY, phase: "load", errorName: "ignored"},
                {at: 101, phase: "unknown", errorName: "ignored"}
            ],
            quarantinedAt: Date.now(),
            quarantineReason: "x".repeat(500)
        }
    }
};

mock.module("@stores/json", () => ({
    "default": {
        get: () => structuredClone(stored),
        set: (_file: string, _key: string, value: unknown) => {stored = structuredClone(value);}
    }
}));

const {default: PluginDoctor, PluginDoctorStore} = await import("../../src/betterdiscord/modules/solcord/doctor");

describe("Plugin Doctor persistent quarantine", () => {
    test("normalizes persisted identities, phases, and bounded reasons", () => {
        const [record] = PluginDoctor.snapshot();
        expect(record.addonId).toBe(".._unsafe_name");
        expect(record.failures).toEqual([]);
        expect(record.quarantineReason?.length).toBe(160);
        expect(JSON.stringify(stored)).not.toContain("ignored-caller-id");
    });

    test("quarantines on the third recent failure and requires an explicit clear", () => {
        const id = "QuarantineFixture";
        expect(PluginDoctor.recordFailure(id, "start", new TypeError("private detail"), 10_000)).toBeFalse();
        expect(PluginDoctor.recordFailure(id, "mutation", {"private": "detail"}, 20_000)).toBeFalse();
        expect(PluginDoctor.recordFailure(id, "switch", "private detail", 30_000)).toBeTrue();
        expect(PluginDoctor.isQuarantined(id)).toBeTrue();

        const record = PluginDoctor.snapshot().find(candidate => candidate.addonId === id)!;
        expect(record.failures.map(failure => failure.errorName)).toEqual(["TypeError", "NonErrorObject", "string"]);
        expect(JSON.stringify(record)).not.toContain("private detail");
        expect(PluginDoctor.clearQuarantine(id)).toBeTrue();
        expect(PluginDoctor.isQuarantined(id)).toBeFalse();
        expect(PluginDoctor.clearQuarantine(id)).toBeFalse();
    });

    test("does not combine failures outside the ten-minute window", () => {
        const id = "WindowFixture";
        expect(PluginDoctor.recordFailure(id, "load", new Error("one"), 1_000)).toBeFalse();
        expect(PluginDoctor.recordFailure(id, "load", new Error("two"), 2_000)).toBeFalse();
        expect(PluginDoctor.recordFailure(id, "load", new Error("three"), 10 * 60 * 1_000 + 2_001)).toBeFalse();
        expect(PluginDoctor.snapshot().find(candidate => candidate.addonId === id)?.failures).toHaveLength(1);
    });

    test("enforces a persisted quarantine before explicit runtime initialization", () => {
        stored = {
            version: 1,
            records: {
                EarlyStartupFixture: {
                    addonId: "EarlyStartupFixture",
                    failures: [{at: Date.now(), phase: "start", errorName: "TypeError"}],
                    quarantinedAt: Date.now(),
                    quarantineReason: "Persisted runtime failure."
                }
            }
        };
        const restarted = new PluginDoctorStore();
        expect(restarted.isQuarantined("EarlyStartupFixture")).toBeTrue();
        expect(restarted.isAnyQuarantined("other-name", "EarlyStartupFixture.plugin.js", "EarlyStartupFixture")).toBeTrue();
    });

    test("keeps capability misses out of the crash-loop window", () => {
        stored = {version: 1, records: {}};
        const restarted = new PluginDoctorStore();
        expect(restarted.recordCapabilityMiss("VoiceMessages")).toBeFalse();
        expect(restarted.recordCapabilityMiss("VoiceMessages")).toBeFalse();
        expect(restarted.recordCapabilityMiss("VoiceMessages")).toBeFalse();
        expect(restarted.snapshot()).toEqual([]);
    });

    test("clears only the exact legacy first-party capability-miss receipt", () => {
        const now = Date.now();
        stored = {
            version: 1,
            records: {
                VoiceMessages: {
                    addonId: "VoiceMessages",
                    failures: [
                        {at: now - 2, phase: "start", errorName: "Error"},
                        {at: now - 1, phase: "start", errorName: "Error"},
                        {at: now, phase: "start", errorName: "Error"}
                    ],
                    quarantinedAt: now,
                    quarantineReason: "Three failures within ten minutes; last phase: start."
                },
                ThirdPartyFailure: {
                    addonId: "ThirdPartyFailure",
                    failures: [
                        {at: now - 2, phase: "start", errorName: "TypeError"},
                        {at: now - 1, phase: "start", errorName: "TypeError"},
                        {at: now, phase: "start", errorName: "TypeError"}
                    ],
                    quarantinedAt: now,
                    quarantineReason: "Three failures within ten minutes; last phase: start."
                },
                ManualHold: {
                    addonId: "ManualHold",
                    failures: [
                        {at: now - 2, phase: "start", errorName: "Error"},
                        {at: now - 1, phase: "start", errorName: "Error"},
                        {at: now, phase: "start", errorName: "Error"}
                    ],
                    quarantinedAt: now,
                    quarantineReason: "Manual recovery required."
                }
            }
        };
        const migrated = new PluginDoctorStore();
        expect(migrated.clearLegacyCapabilityMissQuarantine("VoiceMessages")).toBeTrue();
        expect(migrated.clearLegacyCapabilityMissQuarantine("ThirdPartyFailure")).toBeFalse();
        expect(migrated.clearLegacyCapabilityMissQuarantine("ManualHold")).toBeFalse();

        const restarted = new PluginDoctorStore();
        expect(restarted.isQuarantined("VoiceMessages")).toBeFalse();
        expect(restarted.isQuarantined("ThirdPartyFailure")).toBeTrue();
        expect(restarted.isQuarantined("ManualHold")).toBeTrue();
    });

    test("recovers only after an explicit clear and persists that decision across restart", () => {
        const now = Date.now();
        stored = {
            version: 1,
            records: {
                ThirdPartyFixture: {
                    addonId: "ThirdPartyFixture",
                    failures: [
                        {at: now - 2, phase: "start", errorName: "TypeError"},
                        {at: now - 1, phase: "start", errorName: "TypeError"},
                        {at: now, phase: "start", errorName: "TypeError"}
                    ],
                    quarantinedAt: now,
                    quarantineReason: "Three real failures."
                }
            }
        };
        const firstRestart = new PluginDoctorStore();
        expect(firstRestart.recordCapabilityMiss("ThirdPartyFixture")).toBeTrue();
        expect(firstRestart.isQuarantined("ThirdPartyFixture")).toBeTrue();

        expect(firstRestart.clearQuarantine("ThirdPartyFixture")).toBeTrue();
        const secondRestart = new PluginDoctorStore();
        expect(secondRestart.isQuarantined("ThirdPartyFixture")).toBeFalse();
        expect(secondRestart.snapshot().find(record => record.addonId === "ThirdPartyFixture")?.lastSuccessfulStart).toBeUndefined();
    });

    test("bounds persisted records and does not label a quarantined addon successful", () => {
        const now = Date.now();
        stored = {
            version: 1,
            records: Object.fromEntries(Array.from({length: 600}, (_, index) => [`Addon${index}`, {
                addonId: `Addon${index}`,
                failures: [],
                lastSuccessfulStart: now
            }]))
        };
        const bounded = new PluginDoctorStore();
        expect(bounded.snapshot()).toHaveLength(512);

        bounded.quarantine("Addon0", "Explicit runtime quarantine.", now);
        bounded.recordSuccessfulStart("Addon0", now + 1);
        const held = bounded.snapshot().find(record => record.addonId === "Addon0")!;
        expect(held.quarantinedAt).toBe(now);
        expect(held.lastSuccessfulStart).toBe(now);
    });
});
