import {describe, expect, test} from "bun:test";

import {
    audienceGuardIdsFromVoiceStates,
    deniedAudienceMatches,
    normalizeAudienceGuardEntries,
    normalizeAudienceGuardPrivatePolicy,
    SolcordStreamAudienceGuard,
    SOLCORD_AUDIENCE_GUARD_PROMISE,
    type SolcordAudienceGuardAdapter,
    type SolcordAudienceGuardStatus
} from "../../src/betterdiscord/modules/solcord/stream-audience-guard";

class FakeAudienceAdapter implements SolcordAudienceGuardAdapter {
    accountId = "100";
    channelId = "200";
    stream: object | undefined;
    members: string[] = ["100"];
    viewers: string[] = [];
    stopCalls = 0;
    stopRejects = false;
    startDecision?: () => boolean;
    listener?: () => void;
    timers: Map<number, () => void> = new Map();
    nextTimer = 1;

    currentAccountId = () => this.accountId;
    currentVoiceChannelId = () => this.channelId;
    currentStream = () => this.stream;
    voiceMemberIds = () => this.members;
    viewerIds = () => this.viewers;
    stopOwnStream = () => {
        this.stopCalls++;
        if (this.stopRejects) return Promise.reject(new Error("synthetic stop failure"));
    };
    interceptStreamStart = (decide: () => boolean) => {
        this.startDecision = decide;
        return () => {this.startDecision = undefined;};
    };
    subscribe = (listener: () => void) => {
        this.listener = listener;
        return () => {this.listener = undefined;};
    };
    setTimer = (callback: () => void) => {
        const id = this.nextTimer++;
        this.timers.set(id, callback);
        return id;
    };
    clearTimer = (handle: unknown) => {this.timers.delete(handle as number);};

    emit(): void {this.listener?.();}
    runTimers(): void {
        for (const [id, callback] of [...this.timers]) {
            this.timers.delete(id);
            callback();
        }
    }
}

const MODES = {preventStart: true, stopOnJoin: true, stopOnWatch: false};
const DENIED = [{userId: "300", label: "Denied person"}];

describe("Solcord Stream Audience Guard", () => {
    test("normalizes a bounded private denylist without accepting malformed identifiers", () => {
        const entries = normalizeAudienceGuardEntries([
            {userId: "300", label: "  Friend\nname  "},
            {userId: "300", label: "duplicate"},
            {userId: "../bad", label: "bad"},
            ...Array.from({length: 110}, (_, index) => ({userId: String(index + 1_000)}))
        ]);

        expect(entries).toHaveLength(100);
        expect(entries[0]).toEqual({userId: "300", label: "Friend name"});
        expect(normalizeAudienceGuardPrivatePolicy({entries}).entries).toEqual(entries);
        expect(deniedAudienceMatches(new Set(["300"]), ["300", "300", "bad"])).toEqual(["300"]);
        expect(audienceGuardIdsFromVoiceStates(new Map([["300", {userId: "300"}], ["400", {user_id: "400"}]]))).toEqual(["300", "400"]);
    });

    test("starts ready and requires explicit per-call arming", () => {
        const adapter = new FakeAudienceAdapter();
        const statuses: SolcordAudienceGuardStatus[] = [];
        const guard = new SolcordStreamAudienceGuard(adapter, status => statuses.push(status));

        expect(guard.start()).toBeTrue();
        expect(guard.snapshot()).toEqual(expect.objectContaining({phase: "ready", armed: false, denylistCount: 0}));
        expect(adapter.startDecision?.()).toBeTrue();
        expect(guard.arm([], MODES)).toBeFalse();
        expect(guard.arm(DENIED, MODES)).toBeTrue();
        expect(guard.snapshot()).toEqual(expect.objectContaining({phase: "armed", armed: true, accountBound: true, channelBound: true, denylistCount: 1, detail: SOLCORD_AUDIENCE_GUARD_PROMISE}));
        expect(statuses.length).toBeGreaterThan(1);
    });

    test("prevents Go Live only when armed and a denied member is present", () => {
        const adapter = new FakeAudienceAdapter();
        const guard = new SolcordStreamAudienceGuard(adapter);
        guard.start();
        guard.arm(DENIED, MODES);

        expect(adapter.startDecision?.()).toBeTrue();
        adapter.members.push("300");
        expect(adapter.startDecision?.()).toBeFalse();
        expect(guard.snapshot()).toEqual(expect.objectContaining({phase: "blocked", lastTrigger: "prevent-start", detectedCount: 1}));

        guard.disarm();
        expect(adapter.startDecision?.()).toBeTrue();
    });

    test("stops once on a denied join and verifies the stream ended", async () => {
        const adapter = new FakeAudienceAdapter();
        const stream = {};
        adapter.stream = stream;
        const guard = new SolcordStreamAudienceGuard(adapter);
        guard.start();
        guard.arm(DENIED, MODES);

        adapter.members.push("300");
        adapter.emit();
        adapter.emit();
        await Promise.resolve();
        expect(adapter.stopCalls).toBe(1);
        expect(guard.snapshot()).toEqual(expect.objectContaining({phase: "stopping", lastTrigger: "stop-on-join"}));

        adapter.stream = undefined;
        adapter.runTimers();
        expect(guard.snapshot()).toEqual(expect.objectContaining({phase: "armed", armed: true, detectedCount: 0}));
    });

    test("warns about possible frame exposure and manual stopping when stop-on-watch cannot be verified", async () => {
        const adapter = new FakeAudienceAdapter();
        adapter.stream = {};
        adapter.viewers = ["300"];
        const guard = new SolcordStreamAudienceGuard(adapter);
        guard.start();
        guard.arm(DENIED, {preventStart: false, stopOnJoin: false, stopOnWatch: true});
        await Promise.resolve();

        expect(guard.snapshot().detail).toContain("Brief frame exposure cannot be ruled out");
        adapter.runTimers();
        expect(guard.snapshot()).toEqual(expect.objectContaining({phase: "attention", lastTrigger: "stop-on-watch"}));
        expect(guard.snapshot().detail).toContain("Stop sharing manually now");
    });

    test("disarms and clears private renderer state on account or channel drift", () => {
        const adapter = new FakeAudienceAdapter();
        const guard = new SolcordStreamAudienceGuard(adapter);
        guard.start();
        guard.arm(DENIED, MODES);

        adapter.accountId = "101";
        adapter.emit();
        expect(guard.snapshot()).toEqual(expect.objectContaining({phase: "ready", armed: false, accountBound: false, channelBound: false, denylistCount: 0}));

        guard.arm(DENIED, MODES);
        adapter.channelId = "201";
        adapter.emit();
        expect(guard.snapshot().armed).toBeFalse();
    });

    test("fails unavailable and disposes every owned adapter resource", () => {
        const adapter = new FakeAudienceAdapter();
        const guard = new SolcordStreamAudienceGuard(adapter);
        expect(guard.start()).toBeTrue();
        guard.arm(DENIED, MODES);
        guard.stop();
        expect(adapter.startDecision).toBeUndefined();
        expect(adapter.listener).toBeUndefined();
        expect(adapter.timers.size).toBe(0);
        expect(guard.snapshot()).toEqual(expect.objectContaining({phase: "off", available: false, armed: false, denylistCount: 0}));

        const malformed = {...adapter, subscribe: undefined} as unknown as SolcordAudienceGuardAdapter;
        const unavailable = new SolcordStreamAudienceGuard(malformed);
        expect(unavailable.start()).toBeFalse();
        expect(unavailable.snapshot().phase).toBe("unavailable");
    });
});
