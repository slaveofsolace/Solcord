import {describe, expect, test} from "bun:test";

import {
    isSolcordObservableStore,
    normalizeSolcordVoiceStateIds,
    resolveSolcordLocalVolumeAction,
    resolveSolcordStreamingReaders,
    resolveSolcordVoiceChannelReader,
    resolveSolcordVoiceNoteCapture,
    resolveSolcordVoiceStateReader,
    SOLCORD_VOICE_DEPENDENCIES
} from "../../src/betterdiscord/modules/solcord/voice-adapter-capabilities";

const observable = {
    addChangeListener() {},
    removeChangeListener() {}
};
const USER_A = "12345678901234567";
const USER_B = "234567890123456789";
const CHANNEL = "345678901234567890";

describe("Solcord volatile voice adapter capabilities", () => {
    test("declares no external runtime library dependency", () => {
        expect(SOLCORD_VOICE_DEPENDENCIES.externalLibraries).toEqual([]);
        expect(SOLCORD_VOICE_DEPENDENCIES.discordStores).toContain("VoiceStateStore");
        expect(SOLCORD_VOICE_DEPENDENCIES.browserApis).toEqual(["MediaDevices.getUserMedia", "MediaRecorder"]);
    });

    test("normalizes reviewed voice-state container variants and rejects ambiguous non-empty data", () => {
        expect(normalizeSolcordVoiceStateIds(new Map([[USER_A, {userId: USER_A}], [USER_B, {user: {id: USER_B}}]]))).toEqual([USER_A, USER_B]);
        expect(normalizeSolcordVoiceStateIds(new Set([USER_A, USER_B]))).toEqual([USER_A, USER_B]);
        expect(normalizeSolcordVoiceStateIds([{user_id: USER_A}, {id: USER_B}])).toEqual([USER_A, USER_B]);
        expect(normalizeSolcordVoiceStateIds({[USER_A]: {selfMute: false}, [USER_B]: {userId: USER_B}})).toEqual([USER_A, USER_B]);
        expect(normalizeSolcordVoiceStateIds([])).toEqual([]);
        expect(normalizeSolcordVoiceStateIds([{selfMute: false}])).toBeUndefined();
        expect(normalizeSolcordVoiceStateIds(new Date())).toBeUndefined();
    });

    test("requires observable selected-channel and voice-state stores", () => {
        const selected = {...observable, channelId: CHANNEL, getVoiceChannelId() {return this.channelId;}};
        const selectedCapability = resolveSolcordVoiceChannelReader(selected);
        expect(selectedCapability.state).toBe("available");
        expect(selectedCapability.value?.()).toBe(CHANNEL);
        selected.channelId = "../bad";
        expect(() => selectedCapability.value?.()).toThrow("SelectedVoiceChannelShapeDrifted");

        const states = {...observable, getVoiceStatesForChannel: (channelId: string) => ({[channelId]: {userId: channelId}})};
        const stateCapability = resolveSolcordVoiceStateReader(states);
        expect(stateCapability.value?.(CHANNEL)).toEqual([CHANNEL]);
        expect(() => stateCapability.value?.("../bad")).toThrow("VoiceChannelIdInvalid");
        expect(resolveSolcordVoiceStateReader({getVoiceStatesForChannel: () => []}).state).toBe("unavailable");
        expect(isSolcordObservableStore(states)).toBeTrue();
    });

    test("supports both reviewed current-stream reader variants without treating drift as no viewers", () => {
        const current = {...observable, getCurrentUserActiveStream: () => ({id: "stream"}), getViewerIds: () => [USER_A]};
        const modern = resolveSolcordStreamingReaders(current);
        expect(modern.state).toBe("available");
        expect(modern.value?.viewerIds(modern.value.currentStream())).toEqual([USER_A]);

        const legacy = {...observable, getStreamerActiveStreamMetadata: () => ({id: "legacy"}), getViewerIds: () => new Set([USER_B])};
        expect(resolveSolcordStreamingReaders(legacy).value?.viewerIds({})).toEqual([USER_B]);

        const drifted = {...observable, getCurrentUserActiveStream: () => ({}), getViewerIds: () => [{viewer: "unknown"}]};
        expect(() => resolveSolcordStreamingReaders(drifted).value?.viewerIds({})).toThrow("StreamViewerSnapshotShapeDrifted");
    });

    test("bounds local volume and detects action ownership replacement before mutation", () => {
        const applied: Array<[string, number]> = [];
        const module = {setLocalVolume(userId: string, value: number) {applied.push([userId, value]);}};
        const capability = resolveSolcordLocalVolumeAction(module);
        expect(capability.state).toBe("available");
        capability.value?.apply(USER_A, 175);
        expect(applied).toEqual([[USER_A, 175]]);
        expect(() => capability.value?.apply("bad", 100)).toThrow("LocalVolumeUserIdInvalid");
        expect(() => capability.value?.apply(USER_A, 201)).toThrow("LocalVolumePercentInvalid");

        module.setLocalVolume = () => {};
        expect(capability.value?.validateOwnership()).toBeFalse();
        expect(() => capability.value?.apply(USER_A, 100)).toThrow("LocalVolumeActionOwnershipDrifted");
    });

    test("reports voice recording as available, never Ready, before permission and preview", () => {
        expect(resolveSolcordVoiceNoteCapture({mediaDevices: {getUserMedia() {}}, mediaRecorder: class {}})).toEqual(expect.objectContaining({state: "available", value: true}));
        expect(resolveSolcordVoiceNoteCapture({mediaDevices: {}, mediaRecorder: class {}}).state).toBe("unavailable");
        expect(resolveSolcordVoiceNoteCapture({mediaDevices: {getUserMedia() {}}, mediaRecorder: undefined}).state).toBe("unavailable");
    });
});
