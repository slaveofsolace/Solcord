import {describe, expect, spyOn, test} from "bun:test";

import {SolcordDisposalScope} from "../../src/betterdiscord/modules/solcord/disposal";

describe("Solcord independently replaceable resource groups", () => {
    test("replacing one group leaves its neighbors live and preserves exact resource counts", () => {
        const parent = new SolcordDisposalScope();
        const voice = parent.fork();
        let voiceStops = 0;
        voice.own(() => voiceStops++, "listener");
        for (let i = 0; i < 40; i++) {
            const motion = parent.fork();
            motion.style("solcord-motion-group-test", "body { --motion-test: 1; }");
            expect(parent.counts()).toEqual({listener: 1, style: 1});
            motion.dispose();
            expect(parent.counts()).toEqual({listener: 1});
            expect(voiceStops).toBe(0);
        }
        parent.dispose();
        expect(parent.counts()).toEqual({});
        expect(voiceStops).toBe(1);
        expect(() => parent.fork()).toThrow("disposed");
    });

    test("failed child cleanup retains ownership for one exact retry without repeating successful cleanup", () => {
        const parent = new SolcordDisposalScope();
        const child = parent.fork();
        let fail = true;
        let attempts = 0;
        let stopped = 0;
        child.own(() => {attempts++; if (fail) throw new Error("busy");}, "patch");
        parent.own(() => stopped++, "listener");
        expect(() => parent.dispose()).toThrow();
        expect(parent.counts()).toEqual({patch: 1});
        expect(stopped).toBe(1);
        fail = false;
        parent.dispose();
        parent.dispose();
        expect(parent.counts()).toEqual({});
        expect(attempts).toBe(2);
        expect(stopped).toBe(1);
    });

    test("late scheduling after disable starts no timeout, interval, or idle work", () => {
        const scope = new SolcordDisposalScope();
        scope.dispose();
        const timeouts = spyOn(globalThis, "setTimeout");
        const intervals = spyOn(globalThis, "setInterval");
        try {
            expect(scope.timeout(() => {}, 10)).toBe(0);
            expect(scope.interval(() => {}, 10)).toBe(0);
            scope.idle(() => {});
            expect(timeouts).not.toHaveBeenCalled();
            expect(intervals).not.toHaveBeenCalled();
            expect(scope.counts()).toEqual({});
        }
        finally {timeouts.mockRestore(); intervals.mockRestore();}
    });
});
