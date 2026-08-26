// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {SolcordDisposalScope} from "../../src/betterdiscord/modules/solcord/disposal";
import {
    InvisibleTypingAdapter,
    type InvisibleTypingPatchAdapter,
    type InvisibleTypingSettings,
    type TypingStartPatchCallback
} from "../../src/betterdiscord/modules/solcord/invisible-typing";


type TestModule = Record<string, unknown> & {
    startTyping(channelId: string, marker?: string): unknown;
    receiveTyping(channelId: string): unknown;
    sendMessage(channelId: string, content: string): unknown;
};

function createHarness(initial: InvisibleTypingSettings = {enabled: true, allowlistChannelIds: []}) {
    const calls = {typing: [] as unknown[][], incoming: [] as unknown[][], send: [] as unknown[][], patches: 0, unpatches: 0};
    const originalTyping = function (this: unknown, ...args: unknown[]) {
        calls.typing.push([this, ...args]);
        return `typing:${String(args[0])}`;
    };
    const module: TestModule = {
        startTyping: originalTyping,
        receiveTyping(...args: unknown[]) {
            calls.incoming.push(args);
            return `incoming:${String(args[0])}`;
        },
        sendMessage(...args: unknown[]) {
            calls.send.push(args);
            return `sent:${String(args[1])}`;
        }
    };
    const patcher: InvisibleTypingPatchAdapter = {
        instead(_caller, target, key, callback: TypingStartPatchCallback) {
            calls.patches++;
            const original = target[key] as (...args: unknown[]) => unknown;
            const patched = function (this: unknown, ...args: unknown[]) {
                return callback(this, args, original);
            };
            target[key] = patched;
            return () => {
                if (target[key] !== patched) return;
                calls.unpatches++;
                target[key] = original;
            };
        }
    };
    const scope = new SolcordDisposalScope();
    let settings = initial;
    const adapter = new InvisibleTypingAdapter({
        scope,
        patcher,
        lookupTypingStart: () => ({module, key: "startTyping"}),
        getSettings: () => settings,
        validateTypingStart: target => target.module === module && target.key === "startTyping"
    });
    return {adapter, calls, module, originalTyping, scope, setSettings: (next: InvisibleTypingSettings) => {settings = next;}};
}

describe("Solcord Invisible Typing adapter", () => {
    test("suppresses only the verified outgoing typing-start action while enabled", () => {
        const {adapter, calls, module} = createHarness();
        expect(adapter.start()).toBeTrue();

        expect(module.startTyping("123", "draft")).toBeUndefined();
        expect(calls.typing).toHaveLength(0);
    });

    test("preserves Discord behavior while disabled, including this and arguments", () => {
        const {adapter, calls, module} = createHarness({enabled: false, allowlistChannelIds: []});
        expect(adapter.start()).toBeTrue();

        const receiver = {startTyping: module.startTyping};
        expect(receiver.startTyping("456", "draft")).toBe("typing:456");
        expect(calls.typing).toEqual([[receiver, "456", "draft"]]);
    });

    test("allows configured channels and reads configuration changes at call time", () => {
        const {adapter, calls, module, setSettings} = createHarness({enabled: true, allowlistChannelIds: ["100"]});
        expect(adapter.start()).toBeTrue();

        expect(module.startTyping("100")).toBe("typing:100");
        expect(module.startTyping("200")).toBeUndefined();
        setSettings({enabled: true, allowlistChannelIds: ["200"]});
        expect(module.startTyping("200")).toBe("typing:200");
        expect(calls.typing.map(call => call[1])).toEqual(["100", "200"]);
    });

    test("does not patch incoming typing state or message sending", () => {
        const {adapter, calls, module} = createHarness();
        const incoming = module.receiveTyping;
        const send = module.sendMessage;
        expect(adapter.start()).toBeTrue();

        expect(module.receiveTyping).toBe(incoming);
        expect(module.sendMessage).toBe(send);
        expect(module.receiveTyping("300")).toBe("incoming:300");
        expect(module.sendMessage("300", "hello")).toBe("sent:hello");
        expect(calls.incoming).toEqual([["300"]]);
        expect(calls.send).toEqual([["300", "hello"]]);
    });

    test("fails open to Discord when settings or the channel argument drift", () => {
        const {adapter, calls, module, setSettings} = createHarness();
        expect(adapter.start()).toBeTrue();

        setSettings({enabled: true, allowlistChannelIds: ["not-a-channel"]});
        expect(module.startTyping("400")).toBe("typing:400");
        expect(module.startTyping("not-a-channel")).toBe("typing:not-a-channel");
        expect(calls.typing).toHaveLength(2);
    });

    test("refuses an unverified structural target without patching", () => {
        const {calls, module, scope} = createHarness();
        const patcher: InvisibleTypingPatchAdapter = {
            instead() {
                calls.patches++;
                return () => {};
            }
        };
        const wrongKey = new InvisibleTypingAdapter({
            scope,
            patcher,
            lookupTypingStart: () => ({module, key: "sendMessage"}),
            getSettings: () => ({enabled: true, allowlistChannelIds: []})
        });

        expect(wrongKey.start()).toBeFalse();
        expect(calls.patches).toBe(0);
        expect(module.startTyping("500")).toBe("typing:500");
    });

    test("owns reversible cleanup and stop is idempotent", () => {
        const {adapter, calls, module, originalTyping, scope} = createHarness();
        expect(adapter.start()).toBeTrue();
        expect(adapter.active).toBeTrue();
        expect(scope.counts()).toEqual({patch: 1});

        adapter.stop();
        adapter.stop();
        expect(adapter.active).toBeFalse();
        expect(module.startTyping).toBe(originalTyping);
        expect(calls.unpatches).toBe(1);
        expect(scope.counts()).toEqual({});

        expect(adapter.start()).toBeTrue();
        scope.dispose();
        expect(adapter.active).toBeFalse();
        expect(module.startTyping).toBe(originalTyping);
        expect(calls.unpatches).toBe(2);
    });

    test("duplicate start installs exactly one patch", () => {
        const {adapter, calls, scope} = createHarness();
        expect(adapter.start()).toBeTrue();
        expect(adapter.start()).toBeTrue();
        expect(calls.patches).toBe(1);
        expect(scope.counts()).toEqual({patch: 1});
    });
});
