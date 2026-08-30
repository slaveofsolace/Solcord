import {afterEach, describe, expect, test} from "bun:test";

import {SolcordDisposalScope} from "../../src/betterdiscord/modules/solcord/disposal";

type IdleHost = typeof globalThis & {
    requestIdleCallback?: (callback: () => void, options?: {timeout: number;}) => number;
    cancelIdleCallback?: (handle: number) => void;
};

const host = globalThis as IdleHost;
const originalRequestIdleCallback = host.requestIdleCallback;
const originalCancelIdleCallback = host.cancelIdleCallback;

afterEach(() => {
    host.requestIdleCallback = originalRequestIdleCallback;
    host.cancelIdleCallback = originalCancelIdleCallback;
});

describe("Solcord disposal idle ownership", () => {
    test("runs an idle callback once and releases its owned timer", () => {
        let queued: IdleRequestCallback | undefined;
        let calls = 0;
        host.requestIdleCallback = callback => {
            queued = callback;
            return 42;
        };
        host.cancelIdleCallback = () => {};
        const scope = new SolcordDisposalScope();

        scope.idle(() => calls++, 900);
        expect(scope.counts()).toEqual({timer: 1});
        const deadline = {didTimeout: false, timeRemaining: () => 50} as IdleDeadline;
        queued?.(deadline);
        queued?.(deadline);
        expect(calls).toBe(1);
        expect(scope.counts()).toEqual({});
    });

    test("cancels queued idle work on disposal", () => {
        let queued: IdleRequestCallback | undefined;
        let cancelled = 0;
        let calls = 0;
        host.requestIdleCallback = callback => {
            queued = callback;
            return 77;
        };
        host.cancelIdleCallback = handle => {cancelled += handle;};
        const scope = new SolcordDisposalScope();

        scope.idle(() => calls++);
        scope.dispose();
        queued?.({didTimeout: false, timeRemaining: () => 50} as IdleDeadline);
        expect(cancelled).toBe(77);
        expect(calls).toBe(0);
        expect(scope.counts()).toEqual({});
    });
});
