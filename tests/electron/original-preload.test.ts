import {describe, expect, test} from "bun:test";

import {runOriginalPreloadOnce, type OriginalPreloadRuntime} from "../../src/electron/preload/original-preload";


describe("Discord original preload chaining", () => {
    test("registers and loads exactly once", () => {
        const calls: string[] = [];
        const initialKill = (() => true) as typeof process.kill;
        let kill = initialKill;
        const runtime: OriginalPreloadRuntime = {
            register: () => calls.push("register"),
            load: () => calls.push("load"),
            getKill: () => kill,
            setKill: value => {kill = value;}
        };
        const state = {attempted: false};
        expect(runOriginalPreloadOnce(state, "C:\\Discord\\mainPreload.js", runtime).state).toBe("loaded");
        expect(runOriginalPreloadOnce(state, "C:\\Discord\\mainPreload.js", runtime).state).toBe("duplicate");
        expect(calls).toEqual(["register", "load"]);
        expect(kill).toBe(initialKill);
    });

    test("restores process.kill after a preload error", () => {
        const initialKill = (() => true) as typeof process.kill;
        let kill = initialKill;
        const result = runOriginalPreloadOnce({attempted: false}, "/opt/discord/mainPreload.js", {
            register() {},
            load() {throw new TypeError("private message not retained");},
            getKill: () => kill,
            setKill: value => {kill = value;}
        });
        expect(result).toEqual({state: "failed", errorName: "TypeError"});
        expect(kill).toBe(initialKill);
        expect(JSON.stringify(result)).not.toContain("private message");
    });
});
