// SPDX-License-Identifier: Apache-2.0

import {afterEach, describe, expect, test} from "bun:test";

import {
    readBoundedTranslationJson,
    SOLCORD_TRANSLATION_RESPONSE_MAX_BYTES,
    SolcordNativeSuiteController
} from "../../src/betterdiscord/modules/solcord/native-suite";
import {SolcordDisposalScope} from "../../src/betterdiscord/modules/solcord/disposal";
import {SOLCORD_VOICE_NOTE_MAX_BYTES, SOLCORD_VOICE_NOTE_MAX_DURATION_MS} from "../../src/common/solcord/v2-feature-models";

class TestMediaRecorder extends EventTarget {
    static failConstruction = false;
    static failStart = false;
    static instances: TestMediaRecorder[] = [];

    static isTypeSupported(): boolean {return false;}

    readonly mimeType: string;
    state: RecordingState = "inactive";

    constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        super();
        if (TestMediaRecorder.failConstruction) throw new Error("constructor failed");
        this.mimeType = options?.mimeType ?? "audio/webm;codecs=opus";
        TestMediaRecorder.instances.push(this);
    }

    start(): void {
        if (TestMediaRecorder.failStart) throw new Error("start failed");
        this.state = "recording";
    }

    stop(): void {
        if (this.state === "inactive") throw new Error("recorder is inactive");
        this.state = "inactive";
        this.dispatchEvent(new Event("stop"));
    }

    emitData(data: Blob): void {
        const event = new Event("dataavailable");
        Object.defineProperty(event, "data", {value: data});
        this.dispatchEvent(event);
    }
}

interface TestTrack extends MediaStreamTrack {stopCount: number;}

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
const originalMediaRecorder = Object.getOwnPropertyDescriptor(globalThis, "MediaRecorder");
const controllers: Array<{controller: SolcordNativeSuiteController; scope: SolcordDisposalScope;}> = [];

function testStream(): {stream: MediaStream; track: TestTrack;} {
    const track = {
        stopCount: 0,
        stop() {this.stopCount++;}
    } as TestTrack;
    return {track, stream: {getTracks: () => [track]} as unknown as MediaStream};
}

function installVoiceRuntime(getUserMedia: () => Promise<MediaStream>): void {
    Object.defineProperty(globalThis, "MediaRecorder", {configurable: true, value: TestMediaRecorder});
    Object.defineProperty(navigator, "mediaDevices", {configurable: true, value: {getUserMedia}});
}

function startController(): SolcordNativeSuiteController {
    const scope = new SolcordDisposalScope();
    const controller = new SolcordNativeSuiteController(scope, {VoiceMessages: true}, {});
    controller.start();
    controllers.push({controller, scope});
    return controller;
}

afterEach(() => {
    for (const {controller, scope} of controllers.splice(0)) {
        controller.dispose();
        scope.dispose();
    }
    TestMediaRecorder.failConstruction = false;
    TestMediaRecorder.failStart = false;
    TestMediaRecorder.instances.splice(0);
    if (originalMediaRecorder) Object.defineProperty(globalThis, "MediaRecorder", originalMediaRecorder);
    else Reflect.deleteProperty(globalThis, "MediaRecorder");
    if (originalMediaDevices) Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    else Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("Solcord native-suite security boundaries", () => {
    test("distinguishes disabled, setup-required, ready, and unsupported adapters", () => {
        const idleScope = new SolcordDisposalScope();
        const idle = new SolcordNativeSuiteController(idleScope, {}, {});
        idle.start();
        controllers.push({controller: idle, scope: idleScope});
        const idleStatus = Object.fromEntries(idle.statuses().map(item => [item.id, item.maturity]));
        expect(idleStatus["audio-console"]).toBe("off");
        expect(idleStatus["voice-health"]).toBe("unsupported");
        expect(idleStatus["permission-lens"]).toBe("ready");
        expect(idleStatus["local-identity-notes"]).toBe("needs-setup");
        expect(idle.providerReady("BetterVolume")).toBeFalse();

        const activeScope = new SolcordDisposalScope();
        const active = new SolcordNativeSuiteController(activeScope, {BetterVolume: true, Translator: true}, {
            currentChannelId: () => "123456",
            setLocalVolume: () => {}
        });
        active.start();
        controllers.push({controller: active, scope: activeScope});
        const activeStatus = Object.fromEntries(active.statuses().map(item => [item.id, item.maturity]));
        expect(activeStatus["audio-console"]).toBe("ready");
        expect(activeStatus["translation-desk"]).toBe("needs-setup");
        expect(active.providerReady("BetterVolume")).toBeTrue();
        expect(active.providerReady("Translator")).toBeTrue();
        expect(active.currentChannelId()).toBe("123456");
    });

    test("consumes translation JSON through a hard streamed-byte limit", async () => {
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(encoder.encode("{\"translated"));
                controller.enqueue(encoder.encode("Text\":\"hola\"}"));
                controller.close();
            }
        });
        await expect(readBoundedTranslationJson(new Response(body))).resolves.toEqual({translatedText: "hola"});

        const oversized = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array(SOLCORD_TRANSLATION_RESPONSE_MAX_BYTES + 1));
                controller.close();
            }
        });
        await expect(readBoundedTranslationJson(new Response(oversized, {headers: {"content-length": "1"}}))).rejects.toThrow("one MiB limit");
        await expect(readBoundedTranslationJson(new Response("{}", {headers: {"content-length": String(SOLCORD_TRANSLATION_RESPONSE_MAX_BYTES + 1)}}))).rejects.toThrow("one MiB limit");
    });

    test("cleans failed permission, recorder construction, and recorder start attempts before retry", async () => {
        const denied = testStream();
        const constructed = testStream();
        const failedStart = testStream();
        const retry = testStream();
        let attempt = 0;
        installVoiceRuntime(async () => {
            attempt++;
            if (attempt === 1) throw new Error("permission denied");
            if (attempt === 2) return constructed.stream;
            if (attempt === 3) return failedStart.stream;
            return retry.stream;
        });
        const controller = startController();

        await expect(controller.beginVoiceNoteFromUserGesture()).rejects.toThrow("permission denied");
        expect(denied.track.stopCount).toBe(0);

        TestMediaRecorder.failConstruction = true;
        await expect(controller.beginVoiceNoteFromUserGesture()).rejects.toThrow("constructor failed");
        expect(constructed.track.stopCount).toBe(1);

        TestMediaRecorder.failConstruction = false;
        TestMediaRecorder.failStart = true;
        await expect(controller.beginVoiceNoteFromUserGesture()).rejects.toThrow("start failed");
        expect(failedStart.track.stopCount).toBe(1);

        TestMediaRecorder.failStart = false;
        await expect(controller.beginVoiceNoteFromUserGesture()).resolves.toHaveProperty("recordingId");
        controller.cancelVoiceNote();
        expect(retry.track.stopCount).toBe(1);
    });

    test("cancels a pending permission prompt without letting its late result clear a retry", async () => {
        const late = testStream();
        const retry = testStream();
        let resolvePrompt!: (stream: MediaStream) => void;
        let attempt = 0;
        installVoiceRuntime(() => {
            attempt++;
            return attempt === 1 ? new Promise(resolve => {resolvePrompt = resolve;}) : Promise.resolve(retry.stream);
        });
        const controller = startController();

        const pending = controller.beginVoiceNoteFromUserGesture();
        controller.cancelVoiceNote();
        const current = await controller.beginVoiceNoteFromUserGesture();
        resolvePrompt(late.stream);
        await expect(pending).rejects.toThrow("permission request was canceled");
        expect(late.track.stopCount).toBe(1);

        controller.cancelVoiceNote();
        expect(retry.track.stopCount).toBe(1);
        expect(controller.voiceNoteBlob(current.recordingId)).toBeUndefined();
    });

    test("aborts and releases capture at the byte and duration boundaries", async () => {
        const oversized = testStream();
        const timedOut = testStream();
        const streams = [oversized.stream, timedOut.stream];
        installVoiceRuntime(async () => streams.shift()!);
        const controller = startController();

        await controller.beginVoiceNoteFromUserGesture();
        TestMediaRecorder.instances.at(-1)!.emitData({size: SOLCORD_VOICE_NOTE_MAX_BYTES + 1} as Blob);
        expect(oversized.track.stopCount).toBe(1);
        await expect(controller.stopVoiceNoteForPreview()).rejects.toThrow("No voice-note recording");

        const originalSetTimeout = globalThis.setTimeout;
        let limitCallback: (() => void) | undefined;
        Object.defineProperty(globalThis, "setTimeout", {
            configurable: true,
            value: ((callback: TimerHandler, delay?: number) => {
                if (delay === SOLCORD_VOICE_NOTE_MAX_DURATION_MS) {
                    limitCallback = callback as () => void;
                    return 1;
                }
                return originalSetTimeout(callback, delay);
            }) as typeof globalThis.setTimeout
        });
        try {
            await controller.beginVoiceNoteFromUserGesture();
            expect(limitCallback).toBeFunction();
            limitCallback!();
            expect(timedOut.track.stopCount).toBe(1);
            await expect(controller.stopVoiceNoteForPreview()).rejects.toThrow("No voice-note recording");
        }
        finally {Object.defineProperty(globalThis, "setTimeout", {configurable: true, writable: true, value: originalSetTimeout});}
    });
});
