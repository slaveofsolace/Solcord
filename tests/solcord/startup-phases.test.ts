import {describe, expect, test} from "bun:test";

import {boundedSolcordStartupOperation, normalizeSolcordStartupPhaseLimit, SOLCORD_STARTUP_PHASES, SolcordStartupPhaseController, solcordStartupPhaseAllowed} from "../../src/betterdiscord/modules/solcord/startup-phases";

describe("Solcord startup phases", () => {
    test("bounds startup operations that never settle", async () => {
        const never = new Promise<never>(() => {});
        await expect(boundedSolcordStartupOperation(never, 5)).rejects.toMatchObject({name: "TimeoutError"});
        await expect(boundedSolcordStartupOperation(Promise.resolve("ready"), 5)).resolves.toBe("ready");
    });

    test("normalizes diagnostic limits without accepting arbitrary input", () => {
        expect(normalizeSolcordStartupPhaseLimit("privacy-outbound")).toBe("privacy-outbound");
        expect(normalizeSolcordStartupPhaseLimit("none")).toBe("none");
        expect(normalizeSolcordStartupPhaseLimit("all")).toBe("all");
        expect(normalizeSolcordStartupPhaseLimit("messages-and-tokens")).toBe("all");
        expect(normalizeSolcordStartupPhaseLimit({phase: "identity-config"})).toBe("all");
    });

    test("enables one cumulative phase boundary at a time", () => {
        const limit = "integrity-validation";
        expect(SOLCORD_STARTUP_PHASES.filter(phase => solcordStartupPhaseAllowed(limit, phase))).toEqual([
            "identity-config",
            "settings-storage",
            "runtime-initialize",
            "control-center",
            "privacy-outbound",
            "integrity-validation"
        ]);
        expect(solcordStartupPhaseAllowed("none", "identity-config")).toBeFalse();
        expect(solcordStartupPhaseAllowed("all", "background")).toBeTrue();
    });

    test("orders cumulative diagnostic limits by the actual startup call path", () => {
        expect(SOLCORD_STARTUP_PHASES).toEqual([
            "identity-config",
            "settings-storage",
            "runtime-initialize",
            "control-center",
            "privacy-outbound",
            "integrity-validation",
            "module-registry",
            "patch-observer",
            "background"
        ]);
        expect(solcordStartupPhaseAllowed("privacy-outbound", "control-center")).toBeTrue();
        expect(solcordStartupPhaseAllowed("privacy-outbound", "integrity-validation")).toBeFalse();
    });

    test("runs an asynchronous phase exactly once and shares its in-flight promise", async () => {
        let calls = 0;
        let release!: () => void;
        const gate = new Promise<void>(resolve => {release = resolve;});
        const phases = new SolcordStartupPhaseController({limit: "all"});
        const first = phases.run("settings-storage", async () => {
            calls++;
            await gate;
            return "ready";
        });
        const second = phases.run("settings-storage", async () => {
            calls++;
            return "duplicate";
        });
        expect(calls).toBe(0);
        release();
        expect(await first).toBe("ready");
        expect(await second).toBe("ready");
        expect(await phases.run("settings-storage", () => "late")).toBeUndefined();
        expect(calls).toBe(1);
        expect(phases.snapshot().find(record => record.phase === "settings-storage")?.status).toBe("complete");
    });

    test("records bounded timing and resource deltas without phase payloads", () => {
        let tick = 10;
        let listeners = 1;
        const phases = new SolcordStartupPhaseController({
            limit: "all",
            now: () => tick,
            wallNow: () => 1234,
            readResources: () => ({"listener": listeners, "bad key": 7, "timer": Number.POSITIVE_INFINITY})
        });
        const result = phases.runSync("module-registry", () => {
            listeners = 3;
            tick = 12.34;
            return {privatePayload: "not retained"};
        });
        expect(result).toEqual({privatePayload: "not retained"});
        expect(phases.snapshot()).toEqual([{
            phase: "module-registry",
            sequence: 1,
            status: "complete",
            startedAt: 1234,
            durationMs: 2.3,
            resourcesBefore: {listener: 1},
            resourcesAfter: {listener: 3},
            resourceDelta: {listener: 2}
        }]);
        expect(JSON.stringify(phases.snapshot())).not.toContain("privatePayload");
    });

    test("holds later phases without executing them", async () => {
        let calls = 0;
        const phases = new SolcordStartupPhaseController({limit: "runtime-initialize", wallNow: () => 77});
        expect(await phases.run("privacy-outbound", () => {calls++;})).toBeUndefined();
        expect(phases.runSync("background", () => {calls++;})).toBeUndefined();
        expect(calls).toBe(0);
        expect(phases.snapshot().map(record => [record.phase, record.status])).toEqual([
            ["privacy-outbound", "held"],
            ["background", "held"]
        ]);
    });

    test("cancels an in-flight phase and sanitizes the receipt", async () => {
        let release!: () => void;
        const gate = new Promise<void>(resolve => {release = resolve;});
        const phases = new SolcordStartupPhaseController({limit: "all"});
        const task = phases.run("background", async signal => {
            await gate;
            signal.throwIfAborted();
        });
        await Promise.resolve();
        phases.cancel("owner account identifier must not appear");
        release();
        expect(task).rejects.toThrow();
        await task.catch(() => undefined);
        const receipt = phases.snapshot().find(record => record.phase === "background");
        expect(receipt?.status).toBe("cancelled");
        expect(receipt?.errorName).toBe("Error");
        expect(JSON.stringify(receipt)).not.toContain("owner account identifier");
    });
});
