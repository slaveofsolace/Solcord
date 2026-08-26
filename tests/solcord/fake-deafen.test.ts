import {describe, expect, test} from "bun:test";

import {
    applySolcordFakeDeafenConsentTransition,
    DISCORD_VOICE_STATE_UPDATE_OPCODE,
    normalizeVoiceStatePayload,
    SolcordFakeDeafenController,
    type SolcordFakeDeafenDependencies,
    type SolcordGatewaySocket,
    type SolcordVoiceStatePayload
} from "../../src/betterdiscord/modules/solcord/fake-deafen";

function harness() {
    let channelId: string | undefined = "123";
    let locallyDeafened = true;
    let unpatched = false;
    let failSend = false;
    const sent: Array<{opcode: number; payload: unknown;}> = [];
    const originalSend = (opcode: number, payload: unknown) => {
        if (failSend) throw new Error("synthetic send failure");
        sent.push({opcode, payload: structuredClone(payload)});
    };
    let socket: SolcordGatewaySocket = {send: originalSend};
    const dependencies: SolcordFakeDeafenDependencies = {
        getSocket: () => socket,
        getVoiceChannelId: () => channelId,
        isLocallyDeafened: () => locallyDeafened,
        toggleLocalDeafen: () => {
            locallyDeafened = !locallyDeafened;
            socket.send(DISCORD_VOICE_STATE_UPDATE_OPCODE, {guild_id: "456", channel_id: channelId!, self_mute: false, self_deaf: locallyDeafened});
        },
        patchSend: (target, observe) => {
            const original = target.send;
            target.send = function (...args: [number, unknown, ...unknown[]]) {
                observe(args);
                return original.apply(this, args);
            };
            return () => {
                target.send = original;
                unpatched = true;
            };
        }
    };
    return {
        dependencies,
        sent,
        get socket() {return socket;},
        set socket(value: SolcordGatewaySocket) {socket = value;},
        get channelId() {return channelId;},
        set channelId(value: string | undefined) {channelId = value;},
        get locallyDeafened() {return locallyDeafened;},
        set locallyDeafened(value: boolean) {locallyDeafened = value;},
        get unpatched() {return unpatched;},
        get failSend() {return failSend;},
        set failSend(value: boolean) {failSend = value;}
    };
}

const deafenedPayload = (): SolcordVoiceStatePayload => ({guild_id: "456", channel_id: "123", self_mute: false, self_deaf: true});

describe("Solcord Fake Deafen", () => {
    test("tears down the live adapter when consent persistence fails", async () => {
        let failedClosed = 0;
        let synchronized = 0;

        const accepted = await applySolcordFakeDeafenConsentTransition({
            persist: () => {throw new Error("disk full");},
            synchronize: async () => {synchronized++;},
            failClosed: () => {failedClosed++;}
        });

        expect(accepted).toBeFalse();
        expect(failedClosed).toBe(1);
        expect(synchronized).toBe(0);
    });

    test("synchronizes only after consent persistence succeeds", async () => {
        const calls: string[] = [];

        const accepted = await applySolcordFakeDeafenConsentTransition({
            persist: () => {calls.push("persist");},
            synchronize: async () => {calls.push("synchronize");},
            failClosed: () => {calls.push("fail-closed");}
        });

        expect(accepted).toBeTrue();
        expect(calls).toEqual(["persist", "synchronize"]);
    });

    test("accepts only bounded Discord voice-state payloads", () => {
        expect(normalizeVoiceStatePayload(deafenedPayload())).toEqual(deafenedPayload());
        expect(normalizeVoiceStatePayload({channel_id: "../bad", self_mute: false, self_deaf: true})).toBeUndefined();
        expect(normalizeVoiceStatePayload({channel_id: "123", self_mute: false, self_deaf: "true"})).toBeUndefined();
        expect(normalizeVoiceStatePayload({channel_id: "123", self_mute: false, self_deaf: true, self_video: "yes"})).toBeUndefined();
    });

    test("arms only after a real deafened update, restores local audio, and resynchronizes on disarm", () => {
        const state = harness();
        const controller = new SolcordFakeDeafenController(state.dependencies);
        expect(controller.start()).toBeTrue();
        state.socket.send(DISCORD_VOICE_STATE_UPDATE_OPCODE, deafenedPayload());

        expect(controller.arm()).toBeTrue();
        expect(state.locallyDeafened).toBeFalse();
        expect((state.sent.at(-1)?.payload as SolcordVoiceStatePayload).self_deaf).toBeTrue();
        expect(controller.snapshot()).toEqual(expect.objectContaining({phase: "armed", armed: true, connected: true, capturedVoiceState: true}));

        expect(controller.disarm()).toBeTrue();
        expect((state.sent.at(-1)?.payload as SolcordVoiceStatePayload).self_deaf).toBeFalse();
        expect(controller.snapshot()).toEqual(expect.objectContaining({phase: "ready", armed: false}));
        controller.stop();
        expect(state.unpatched).toBeTrue();
        expect(controller.snapshot().phase).toBe("off");
    });

    test("refuses to invent a payload or arm while locally audible", () => {
        const state = harness();
        const controller = new SolcordFakeDeafenController(state.dependencies);
        controller.start();
        expect(controller.arm()).toBeFalse();
        expect(controller.snapshot().detail).toContain("No matching deafened voice-state update");

        state.socket.send(DISCORD_VOICE_STATE_UPDATE_OPCODE, deafenedPayload());
        state.locallyDeafened = false;
        expect(controller.arm()).toBeFalse();
        expect(controller.snapshot().detail).toContain("Deafen normally before arming");
    });

    test("fails closed on channel moves and malformed voice-state drift", () => {
        const state = harness();
        const controller = new SolcordFakeDeafenController(state.dependencies);
        controller.start();
        state.socket.send(DISCORD_VOICE_STATE_UPDATE_OPCODE, deafenedPayload());
        expect(controller.arm()).toBeTrue();

        state.channelId = "789";
        state.socket.send(DISCORD_VOICE_STATE_UPDATE_OPCODE, {guild_id: "456", channel_id: "789", self_mute: false, self_deaf: false});
        expect(controller.snapshot()).toEqual(expect.objectContaining({phase: "attention", armed: false}));
        expect((state.sent.at(-1)?.payload as SolcordVoiceStatePayload).self_deaf).toBeFalse();

        state.channelId = "123";
        state.locallyDeafened = true;
        state.socket.send(DISCORD_VOICE_STATE_UPDATE_OPCODE, deafenedPayload());
        expect(controller.arm()).toBeTrue();
        state.socket.send(DISCORD_VOICE_STATE_UPDATE_OPCODE, {channel_id: "123", self_mute: false, self_deaf: "drift"});
        expect(controller.snapshot()).toEqual(expect.objectContaining({phase: "attention", armed: false}));
    });

    test("removes its scoped patch when Discord replaces the gateway socket", () => {
        const state = harness();
        const controller = new SolcordFakeDeafenController(state.dependencies);
        controller.start();
        state.socket = {send() {}};
        expect(controller.validateOwnership()).toBeFalse();
        expect(state.unpatched).toBeTrue();
        expect(controller.snapshot()).toEqual(expect.objectContaining({phase: "attention", armed: false}));
    });

    test("preserves resynchronization attention when stop cannot restore server-visible state", () => {
        const state = harness();
        const controller = new SolcordFakeDeafenController(state.dependencies);
        controller.start();
        state.socket.send(DISCORD_VOICE_STATE_UPDATE_OPCODE, deafenedPayload());
        expect(controller.arm()).toBeTrue();
        state.failSend = true;

        expect(controller.stop()).toBeFalse();
        expect(state.unpatched).toBeTrue();
        expect(controller.snapshot()).toEqual(expect.objectContaining({phase: "attention", armed: false}));
        expect(controller.snapshot().detail).toContain("Toggle normal deafen once");
    });
});
