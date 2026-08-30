import {describe, expect, test} from "bun:test";

import {
    audienceGuardIdsFromVoiceStates,
    audienceGuardHealthMaturity,
    deniedAudienceMatches,
    isAudienceGuardStartAction,
    isAudienceGuardStopAction,
    normalizeAudienceGuardEntries,
    normalizeAudienceGuardPrivatePolicy,
    SolcordStreamAudienceGuard,
    SOLCORD_AUDIENCE_GUARD_PROMISE,
    type SolcordAudienceGuardAdapter,
    type SolcordAudienceGuardStatus
} from "../../src/betterdiscord/modules/solcord/stream-audience-guard";

class FakeAudienceAdapter implements SolcordAudienceGuardAdapter {
    accountId = "111111111111111111";
    channelId = "222222222222222222";
    stream: object | undefined;
    members: string[] = ["111111111111111111"];
    viewers: string[] = [];
    stopCalls = 0;
    stopRejects = false;
    subscribeThrows = false;
    releaseStartThrows = false;
    releaseSubscriptionThrows = false;
    accountThrows = false;
    membersThrow = false;
    viewersThrow = false;
    streamThrows = false;
    startDecision?: () => boolean;
    listener?: () => void;
    timers: Map<number, () => void> = new Map();
    nextTimer = 1;

    currentAccountId = () => {if (this.accountThrows) throw new Error("synthetic account drift"); return this.accountId;};
    currentVoiceChannelId = () => this.channelId;
    currentStream = () => {if (this.streamThrows) throw new Error("synthetic stream drift"); return this.stream;};
    voiceMemberIds = () => {if (this.membersThrow) throw new Error("synthetic voice-state drift"); return this.members;};
    viewerIds = () => {if (this.viewersThrow) throw new Error("synthetic viewer drift"); return this.viewers;};
    stopOwnStream = () => {
        this.stopCalls++;
        if (this.stopRejects) return Promise.reject(new Error("synthetic stop failure"));
    };
    interceptStreamStart = (decide: () => boolean) => {
        this.startDecision = decide;
        return () => {
            if (this.releaseStartThrows) throw new Error("synthetic start cleanup failure");
            this.startDecision = undefined;
        };
    };
    subscribe = (listener: () => void) => {
        if (this.subscribeThrows) throw new Error("synthetic subscription drift");
        this.listener = listener;
        return () => {
            if (this.releaseSubscriptionThrows) throw new Error("synthetic subscription cleanup failure");
            this.listener = undefined;
        };
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
const DENIED_ID = "333333333333333333";
const OTHER_ID = "444444444444444444";
const DENIED = [{userId: DENIED_ID, label: "Denied person"}];

describe("Solcord Stream Audience Guard", () => {
    test("keeps a deliberate off state distinct from adapter unavailability", () => {
        expect(audienceGuardHealthMaturity({phase: "off"})).toBe("preview");
        expect(audienceGuardHealthMaturity({phase: "ready"})).toBe("preview");
        expect(audienceGuardHealthMaturity({phase: "unavailable"})).toBe("unavailable");
    });
    test("recognizes the current native stream actions without accepting loose name matches", () => {
        function start(user?: unknown, source?: unknown) {
            const action = "startStreamWithSource";
            if (!user) return [false, "no user or channel", action];
            if (!source) return [false, "no source", action];
            return [false, "no permission", action];
        }
        function stop() {
            return ["getCurrentUserActiveStream", "arguments.length>0", "null!=t"];
        }
        expect(isAudienceGuardStartAction(start)).toBeTrue();
        expect(isAudienceGuardStopAction(stop)).toBeTrue();
        expect(isAudienceGuardStartAction(function startStream() {})).toBeFalse();
        expect(isAudienceGuardStopAction(function getCurrentUserActiveStream() {})).toBeFalse();
    });

    test("normalizes a bounded private denylist without accepting malformed identifiers", () => {
        const entries = normalizeAudienceGuardEntries([
            {userId: DENIED_ID, label: "  Friend\nname  "},
            {userId: DENIED_ID, label: "duplicate"},
            {userId: "../bad", label: "bad"},
            ...Array.from({length: 110}, (_, index) => ({userId: (10_000_000_000_000_000n + BigInt(index)).toString()}))
        ]);

        expect(entries).toHaveLength(100);
        expect(entries[0]).toEqual({userId: DENIED_ID, label: "Friend name"});
        expect(normalizeAudienceGuardPrivatePolicy({entries}).entries).toEqual(entries);
        expect(deniedAudienceMatches(new Set([DENIED_ID]), [DENIED_ID, DENIED_ID, "bad"])).toEqual([DENIED_ID]);
        expect(audienceGuardIdsFromVoiceStates(new Map([[DENIED_ID, {userId: DENIED_ID}], [OTHER_ID, {user_id: OTHER_ID}]]))).toEqual([DENIED_ID, OTHER_ID]);
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

    test("does not offer per-call arming while disconnected", () => {
        const adapter = new FakeAudienceAdapter();
        const guard = new SolcordStreamAudienceGuard(adapter);
        guard.start();
        adapter.channelId = "";

        expect(guard.armReadiness(DENIED, MODES)).toEqual({ready: false, detail: "Join a voice call to arm Audience Guard."});
        expect(guard.arm(DENIED, MODES)).toBeFalse();
        expect(guard.snapshot()).toEqual(expect.objectContaining({phase: "ready", armed: false, channelBound: false}));
    });

    test("prevents Go Live only when armed and a denied member is present", () => {
        const adapter = new FakeAudienceAdapter();
        const guard = new SolcordStreamAudienceGuard(adapter);
        guard.start();
        guard.arm(DENIED, MODES);

        expect(adapter.startDecision?.()).toBeTrue();
        adapter.members.push(DENIED_ID);
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

        adapter.members.push(DENIED_ID);
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
        adapter.viewers = [DENIED_ID];
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

        adapter.accountId = "555555555555555555";
        adapter.emit();
        expect(guard.snapshot()).toEqual(expect.objectContaining({phase: "ready", armed: false, accountBound: false, channelBound: false, denylistCount: 0}));

        guard.arm(DENIED, MODES);
        adapter.channelId = "666666666666666666";
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

    test("rolls back start interception when observation subscription fails", () => {
        const adapter = new FakeAudienceAdapter();
        adapter.subscribeThrows = true;
        const guard = new SolcordStreamAudienceGuard(adapter);

        expect(guard.start()).toBeFalse();
        expect(adapter.startDecision).toBeUndefined();
        expect(adapter.listener).toBeUndefined();
        expect(guard.snapshot()).toEqual(expect.objectContaining({phase: "unavailable", available: false, armed: false}));

        adapter.subscribeThrows = false;
        expect(guard.start()).toBeTrue();
    });

    test("retains failed adapter cleanup for an exact retry and never installs a duplicate", () => {
        const adapter = new FakeAudienceAdapter();
        const guard = new SolcordStreamAudienceGuard(adapter);
        expect(guard.start()).toBeTrue();
        adapter.releaseStartThrows = true;
        adapter.releaseSubscriptionThrows = true;

        expect(() => guard.stop()).toThrow(AggregateError);
        expect(adapter.startDecision).toBeDefined();
        expect(adapter.listener).toBeDefined();
        expect(guard.snapshot()).toEqual(expect.objectContaining({phase: "unavailable", available: false, armed: false}));
        expect(guard.start()).toBeFalse();

        adapter.releaseStartThrows = false;
        adapter.releaseSubscriptionThrows = false;
        expect(() => guard.stop()).not.toThrow();
        expect(adapter.startDecision).toBeUndefined();
        expect(adapter.listener).toBeUndefined();
        expect(guard.snapshot().phase).toBe("off");
        expect(guard.start()).toBeTrue();
    });

    test("blocks start on membership drift and reports active-stream observation drift truthfully", () => {
        const adapter = new FakeAudienceAdapter();
        const guard = new SolcordStreamAudienceGuard(adapter);
        guard.start();
        guard.arm(DENIED, MODES);

        adapter.membersThrow = true;
        expect(adapter.startDecision?.()).toBeFalse();
        expect(guard.snapshot()).toEqual(expect.objectContaining({phase: "attention", armed: true}));
        expect(guard.snapshot().detail).toContain("could not validate call membership");

        adapter.membersThrow = false;
        adapter.stream = {};
        adapter.streamThrows = true;
        adapter.emit();
        expect(guard.snapshot()).toEqual(expect.objectContaining({phase: "attention", armed: true}));
        expect(guard.snapshot().detail).toContain("Stop sharing manually");
    });

    test("never treats a failed viewer read as an empty safe viewer list", () => {
        const adapter = new FakeAudienceAdapter();
        adapter.stream = {};
        const guard = new SolcordStreamAudienceGuard(adapter);
        guard.start();
        guard.arm(DENIED, {preventStart: false, stopOnJoin: false, stopOnWatch: true});
        adapter.viewersThrow = true;
        adapter.emit();

        expect(adapter.stopCalls).toBe(0);
        expect(guard.snapshot()).toEqual(expect.objectContaining({phase: "attention", armed: true}));
        expect(guard.snapshot().detail).toContain("could not validate the viewer list");
    });
});
