// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {
    DoNotTrackAdapter,
    resolveDiscordAnalyticsTrack,
    type AnalyticsMethodSpec,
    type AnalyticsPatchCallback,
    type DoNotTrackPatchAdapter,
    type DoNotTrackSettings,
    validateDiscordAnalyticsTrack
} from "../../src/betterdiscord/modules/soulcord/do-not-track";
import {SoulCordDisposalScope} from "../../src/betterdiscord/modules/soulcord/disposal";


type AnalyticsModule = Record<string, unknown> & {
    track(event: string, properties?: unknown): unknown;
    trackWithMetadata(event: string, properties?: unknown): unknown;
    sendMessage(channelId: string, content: string): unknown;
    reportCrash(error: Error): unknown;
};

function createHarness(initial: DoNotTrackSettings = {enabled: true}) {
    const calls = {
        track: [] as unknown[][],
        metadata: [] as unknown[][],
        messages: [] as unknown[][],
        crashes: [] as unknown[][],
        patches: [] as string[],
        unpatches: [] as string[],
        validations: [] as string[]
    };
    const originals = {
        track(this: unknown, ...args: unknown[]) {
            calls.track.push([this, ...args]);
            return `track:${String(args[0])}`;
        },
        trackWithMetadata(this: unknown, ...args: unknown[]) {
            calls.metadata.push([this, ...args]);
            return `metadata:${String(args[0])}`;
        },
        sendMessage(...args: unknown[]) {
            calls.messages.push(args);
            return `sent:${String(args[1])}`;
        },
        reportCrash(...args: unknown[]) {
            calls.crashes.push(args);
            return "reported";
        }
    };
    const module: AnalyticsModule = {...originals};
    const patcher: DoNotTrackPatchAdapter = {
        instead(_caller, target, key, callback: AnalyticsPatchCallback) {
            calls.patches.push(key);
            const original = target[key] as (...args: unknown[]) => unknown;
            const patched = function (this: unknown, ...args: unknown[]) {
                return callback(this, args, original);
            };
            target[key] = patched;
            return () => {
                if (target[key] !== patched) return;
                calls.unpatches.push(key);
                target[key] = original;
            };
        }
    };
    const methods: AnalyticsMethodSpec[] = ["track", "trackWithMetadata"].map(key => ({
        key,
        lookup: () => ({module, key}),
        validate: target => {
            calls.validations.push(key);
            return target.module === module && target.key === key;
        }
    }));
    const scope = new SoulCordDisposalScope();
    let settings: unknown = initial;
    const adapter = new DoNotTrackAdapter({scope, patcher, methods, getSettings: () => settings});
    return {
        adapter,
        calls,
        methods,
        module,
        originals,
        patcher,
        scope,
        setSettings: (next: unknown) => {settings = next;}
    };
}

describe("SoulCord Do Not Track adapter", () => {
    test("resolves only the anchored Discord analytics export and exact track method", () => {
        const analytics = {track() {return "sent";}};
        const container = {"AnalyticEventConfigs": {APP_OPENED: {}}, "default": analytics};
        const target = resolveDiscordAnalyticsTrack(container);
        expect(target).toEqual({module: analytics, key: "track"});
        expect(target && validateDiscordAnalyticsTrack(container, target)).toBeTrue();

        expect(resolveDiscordAnalyticsTrack({"default": analytics})).toBeUndefined();
        expect(resolveDiscordAnalyticsTrack({"AnalyticEventConfigs": {}, "default": {send() {}}})).toBeUndefined();
        expect(target && validateDiscordAnalyticsTrack({...container, "default": {track() {}}}, target)).toBeFalse();
    });

    test("suppresses every independently validated outgoing analytics method", () => {
        const {adapter, calls, module, scope} = createHarness();
        expect(adapter.start()).toBeTrue();

        expect(module.track("APP_OPENED", {"private": "opaque"})).toBeUndefined();
        expect(module.trackWithMetadata("VOICE_CONNECTED", {"private": "opaque"})).toBeUndefined();
        expect(calls.track).toEqual([]);
        expect(calls.metadata).toEqual([]);
        expect(calls.validations).toEqual(["track", "trackWithMetadata"]);
        expect(scope.counts()).toEqual({patch: 2});
    });

    test("preserves this, arguments, and return values while disabled", () => {
        const {adapter, calls, module} = createHarness({enabled: false});
        expect(adapter.start()).toBeTrue();

        const receiver = {track: module.track};
        const properties = {answer: 42};
        expect(receiver.track("CONTROL", properties)).toBe("track:CONTROL");
        expect(calls.track).toEqual([[receiver, "CONTROL", properties]]);
    });

    test("never patches unrelated message, crash, or unknown functions", () => {
        const {adapter, calls, module, originals} = createHarness();
        expect(adapter.start()).toBeTrue();

        expect(module.sendMessage).toBe(originals.sendMessage);
        expect(module.reportCrash).toBe(originals.reportCrash);
        expect(module.sendMessage("123", "hello")).toBe("sent:hello");
        expect(module.reportCrash(new Error("synthetic"))).toBe("reported");
        expect(calls.messages).toHaveLength(1);
        expect(calls.crashes).toHaveLength(1);
        expect(calls.patches).toEqual(["track", "trackWithMetadata"]);
    });

    test("fails open before patching when a lookup is malformed or validation fails", () => {
        const {calls, module, originals, patcher, scope} = createHarness();
        const adapter = new DoNotTrackAdapter({
            scope,
            patcher,
            methods: [
                {key: "track", lookup: () => ({module, key: "sendMessage"}), validate: () => true},
                {key: "trackWithMetadata", lookup: () => ({module, key: "trackWithMetadata"}), validate: () => false}
            ],
            getSettings: () => ({enabled: true})
        });

        expect(adapter.start()).toBeFalse();
        expect(calls.patches).toEqual([]);
        expect(module.track).toBe(originals.track);
        expect(module.trackWithMetadata).toBe(originals.trackWithMetadata);
    });

    test("rolls back an earlier method when a later patch cannot be installed", () => {
        const {calls, methods, module, originals, scope} = createHarness();
        const patcher: DoNotTrackPatchAdapter = {
            instead(_caller, target, key, callback) {
                calls.patches.push(key);
                if (key === "trackWithMetadata") return null;
                const original = target[key] as (...args: unknown[]) => unknown;
                const patched = function (this: unknown, ...args: unknown[]) {
                    return callback(this, args, original);
                };
                target[key] = patched;
                return () => {
                    calls.unpatches.push(key);
                    target[key] = original;
                };
            }
        };
        const adapter = new DoNotTrackAdapter({scope, patcher, methods, getSettings: () => ({enabled: true})});

        expect(adapter.start()).toBeFalse();
        expect(calls.patches).toEqual(["track", "trackWithMetadata"]);
        expect(calls.unpatches).toEqual(["track"]);
        expect(module.track).toBe(originals.track);
        expect(module.trackWithMetadata).toBe(originals.trackWithMetadata);
        expect(scope.counts()).toEqual({});
    });

    test("fails open at call time when settings drift or throw", () => {
        const {adapter, calls, module, setSettings} = createHarness();
        expect(adapter.start()).toBeTrue();

        setSettings({enabled: "yes"});
        expect(module.track("MALFORMED")).toBe("track:MALFORMED");
        setSettings(new Proxy({}, {get() {throw new Error("settings drift");}}));
        expect(module.trackWithMetadata("THROWN")).toBe("metadata:THROWN");
        expect(calls.track).toHaveLength(1);
        expect(calls.metadata).toHaveLength(1);
    });

    test("rejects empty, duplicate, oversized, and malformed method lists", () => {
        const {calls, module, patcher, scope} = createHarness();
        const spec = {key: "track", lookup: () => ({module, key: "track"}), validate: () => true};
        const cases: unknown[] = [
            [],
            [spec, spec],
            Array.from({length: 9}, (_, index) => ({...spec, key: `track${index}`})),
            [{...spec, key: "not a method"}]
        ];

        for (const methods of cases) {
            const adapter = new DoNotTrackAdapter({
                scope,
                patcher,
                methods: methods as AnalyticsMethodSpec[],
                getSettings: () => ({enabled: true})
            });
            expect(adapter.start()).toBeFalse();
        }
        expect(calls.patches).toEqual([]);
    });

    test("owns reversible cleanup and duplicate start is idempotent", () => {
        const {adapter, calls, module, originals, scope} = createHarness();
        expect(adapter.start()).toBeTrue();
        expect(adapter.start()).toBeTrue();
        expect(calls.patches).toEqual(["track", "trackWithMetadata"]);

        adapter.stop();
        adapter.stop();
        expect(adapter.active).toBeFalse();
        expect(calls.unpatches).toEqual(["trackWithMetadata", "track"]);
        expect(module.track).toBe(originals.track);
        expect(module.trackWithMetadata).toBe(originals.trackWithMetadata);
        expect(scope.counts()).toEqual({});

        expect(adapter.start()).toBeTrue();
        scope.dispose();
        expect(adapter.active).toBeFalse();
        expect(module.track).toBe(originals.track);
        expect(module.trackWithMetadata).toBe(originals.trackWithMetadata);
    });
});
