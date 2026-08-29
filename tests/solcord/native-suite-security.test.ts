// SPDX-License-Identifier: Apache-2.0

import {afterEach, describe, expect, test} from "bun:test";

import {
    readBoundedTranslationJson,
    resolveSolcordSpeakingReader,
    SOLCORD_TRANSLATION_RESPONSE_MAX_BYTES,
    SOLCORD_VOICE_NOTE_STOP_TIMEOUT_MS,
    SolcordNativeSuiteController,
    subscribeSolcordChangeStores
} from "../../src/betterdiscord/modules/solcord/native-suite";
import {SolcordDisposalScope} from "../../src/betterdiscord/modules/solcord/disposal";
import {SOLCORD_VOICE_NOTE_MAX_BYTES, SOLCORD_VOICE_NOTE_MAX_DURATION_MS} from "../../src/common/solcord/v2-feature-models";

class TestMediaRecorder extends EventTarget {
    static failConstruction = false;
    static failStart = false;
    static suppressStopEvent = false;
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
        if (!TestMediaRecorder.suppressStopEvent) this.dispatchEvent(new Event("stop"));
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
const originalFetch = globalThis.fetch;
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
    const controller = new SolcordNativeSuiteController(scope, {VoiceMessages: true}, {prepareVoiceNoteUpload: () => {}});
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
    TestMediaRecorder.suppressStopEvent = false;
    TestMediaRecorder.instances.splice(0);
    if (originalMediaRecorder) Object.defineProperty(globalThis, "MediaRecorder", originalMediaRecorder);
    else Reflect.deleteProperty(globalThis, "MediaRecorder");
    if (originalMediaDevices) Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    else Reflect.deleteProperty(navigator, "mediaDevices");
    globalThis.fetch = originalFetch;
});

describe("Solcord native-suite security boundaries", () => {
    test("supports both reviewed SpeakingStore method generations and rejects unknown shapes", () => {
        const legacy = {calls: 0, getSpeakingUsers() {this.calls++; return ["legacy"];}};
        const current = {calls: 0, getSpeakers() {this.calls++; return ["current"];}};

        expect(resolveSolcordSpeakingReader(legacy)?.()).toEqual(["legacy"]);
        expect(legacy.calls).toBe(1);
        expect(resolveSolcordSpeakingReader(current)?.()).toEqual(["current"]);
        expect(current.calls).toBe(1);
        expect(resolveSolcordSpeakingReader({})).toBeUndefined();
        expect(resolveSolcordSpeakingReader(undefined)).toBeUndefined();
    });

    test("distinguishes disabled, setup-required, ready, and unsupported adapters", () => {
        let idleReads = 0;
        let idleSubscriptions = 0;
        const idleScope = new SolcordDisposalScope();
        const idle = new SolcordNativeSuiteController(idleScope, {}, {
            currentCall: () => {idleReads++; return undefined;},
            subscribeCall: () => {idleSubscriptions++; return () => {};}
        });
        idle.start();
        controllers.push({controller: idle, scope: idleScope});
        const idleStatus = Object.fromEntries(idle.statuses().map(item => [item.id, item.maturity]));
        expect(idleStatus["audio-console"]).toBe("off");
        expect(idleStatus["voice-health"]).toBe("off");
        expect(idleStatus["permission-lens"]).toBe("ready");
        expect(idleStatus["local-identity-notes"]).toBe("needs-setup");
        expect(idle.providerReady("BetterVolume")).toBeFalse();
        expect(idleReads).toBe(0);
        expect(idleSubscriptions).toBe(0);
        expect(idleScope.counts().observer).toBeUndefined();

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

        let activeReads = 0;
        let activeSubscriptions = 0;
        let activeUnsubscribes = 0;
        const callHost = document.createElement("div");
        callHost.className = "panels_test";
        document.body.append(callHost);
        const callScope = new SolcordDisposalScope();
        const call = new SolcordNativeSuiteController(callScope, {CallTimeCounter: true}, {
            currentCall: () => {activeReads++; return {channelId: "123456", connectedAt: Date.now(), participantCount: 2, speakerCount: 1, viewerCount: 0};},
            subscribeCall: () => {activeSubscriptions++; return () => {activeUnsubscribes++;};},
            saveFocusChannelIds: () => {}
        });
        call.start();
        controllers.push({controller: call, scope: callScope});
        expect(activeReads).toBe(1);
        expect(activeSubscriptions).toBe(1);
        expect(callHost.querySelector("[data-solcord-call-badge]")).not.toBeNull();
        call.setFocusChannels([]);
        expect(callHost.querySelector("[data-solcord-call-badge]")).not.toBeNull();
        call.dispose();
        callScope.dispose();
        expect(activeUnsubscribes).toBe(1);
        expect(callHost.querySelector("[data-solcord-call-badge]")).toBeNull();
        callHost.remove();

        const optionalScope = new SolcordDisposalScope();
        const optional = new SolcordNativeSuiteController(optionalScope, {}, {
            voiceHealthEnabled: true,
            voiceHealthSample: () => ({timestamp: Date.now(), rttMs: 25, jitterMs: 2, packetLossPercent: 0}),
            focusChannelIds: ["12345"],
            saveFocusChannelIds: () => {}
        });
        optional.start();
        controllers.push({controller: optional, scope: optionalScope});
        expect(Object.fromEntries(optional.statuses().map(item => [item.id, item.maturity]))["voice-health"]).toBe("ready");
        expect(optionalScope.counts()).toEqual(expect.objectContaining({interval: 1, observer: 1}));
        optional.setFocusChannels([]);
        expect(optionalScope.counts().observer).toBeUndefined();
    });

    test("isolates a Call Context subscription failure from unrelated native tools", () => {
        let registrations = 0;
        let rollbacks = 0;
        const scope = new SolcordDisposalScope();
        const controller = new SolcordNativeSuiteController(scope, {CallTimeCounter: true, BetterVolume: true}, {
            currentCall: () => ({channelId: "123456", connectedAt: Date.now(), participantCount: 2, speakerCount: 1, viewerCount: 0}),
            subscribeCall: () => {
                registrations++;
                rollbacks++;
                throw new Error("second store rejected subscription");
            },
            setLocalVolume: () => {}
        });
        controller.start();
        controllers.push({controller, scope});
        const statuses = Object.fromEntries(controller.statuses().map(item => [item.id, item.maturity]));
        expect(registrations).toBe(1);
        expect(rollbacks).toBe(1);
        expect(statuses["call-context"]).toBe("unsupported");
        expect(statuses["audio-console"]).toBe("ready");
    });

    test("retries a listener removal that failed during partial Call Context subscription rollback", () => {
        const scope = new SolcordDisposalScope();
        let removalAttempts = 0;
        const listener = () => {};
        const first = {
            addChangeListener() {},
            removeChangeListener() {
                removalAttempts++;
                if (removalAttempts === 1) throw new Error("temporary remover failure");
            }
        };
        const second = {
            addChangeListener() {throw new Error("second store rejected subscription");},
            removeChangeListener() {}
        };

        expect(() => subscribeSolcordChangeStores(scope, [first, second], listener)).toThrow("cleanup remains owned for retry");
        expect(scope.counts()).toEqual({listener: 1});
        expect(() => scope.dispose()).not.toThrow();
        expect(removalAttempts).toBe(2);
        expect(scope.counts()).toEqual({});
    });

    test("releases Call Context immediately when the initial store snapshot fails", () => {
        const scope = new SolcordDisposalScope();
        let reads = 0;
        let removals = 0;
        let listener: (() => void) | undefined;
        const controller = new SolcordNativeSuiteController(scope, {CallTimeCounter: true, BetterVolume: true}, {
            currentCall: () => {reads++; throw new Error("invalid snapshot");},
            subscribeCall: callback => {
                listener = callback;
                return () => {removals++; listener = undefined;};
            },
            setLocalVolume: () => {}
        });

        controller.start();
        controllers.push({controller, scope});
        const statuses = Object.fromEntries(controller.statuses().map(item => [item.id, item.maturity]));
        expect(statuses["call-context"]).toBe("unsupported");
        expect(statuses["audio-console"]).toBe("ready");
        expect(removals).toBe(1);
        expect(scope.counts().listener).toBeUndefined();
        expect(listener).toBeUndefined();
        expect(reads).toBe(1);
    });

    test("requires both recording APIs and the reviewed Discord upload handoff before Voice Note Studio is ready", () => {
        installVoiceRuntime(async () => testStream().stream);

        const missingUploadScope = new SolcordDisposalScope();
        const missingUpload = new SolcordNativeSuiteController(missingUploadScope, {VoiceMessages: true}, {});
        missingUpload.start();
        controllers.push({controller: missingUpload, scope: missingUploadScope});
        expect(missingUpload.statuses().find(item => item.id === "voice-note-studio")?.maturity).toBe("unsupported");
        expect(missingUpload.providerReady("VoiceMessages")).toBeFalse();

        const readyScope = new SolcordDisposalScope();
        const ready = new SolcordNativeSuiteController(readyScope, {VoiceMessages: true}, {prepareVoiceNoteUpload: () => {}});
        ready.start();
        controllers.push({controller: ready, scope: readyScope});
        expect(ready.statuses().find(item => item.id === "voice-note-studio")?.maturity).toBe("ready");
        expect(ready.providerReady("VoiceMessages")).toBeTrue();
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

    test("blocks external translation traffic under Strict Privacy and permits only the reviewed approved path", async () => {
        let fetchCalls = 0;
        globalThis.fetch = (async () => {
            fetchCalls++;
            return new Response(JSON.stringify({translatedText: "hola"}), {status: 200, headers: {"content-type": "application/json"}});
        }) as unknown as typeof fetch;

        const blockedScope = new SolcordDisposalScope();
        const blocked = new SolcordNativeSuiteController(blockedScope, {Translator: true}, {externalProvidersAllowed: () => false});
        blocked.start();
        controllers.push({controller: blocked, scope: blockedScope});
        const blockedPreview = blocked.previewTranslation("libretranslate", "https://translate.example/v1", "en", "es", "hello");
        await expect(blocked.executeReviewedTranslation(blockedPreview.id)).rejects.toThrow("Strict Privacy blocks external translation providers");
        expect(fetchCalls).toBe(0);

        const allowedScope = new SolcordDisposalScope();
        const allowed = new SolcordNativeSuiteController(allowedScope, {Translator: true}, {externalProvidersAllowed: () => true});
        allowed.start();
        controllers.push({controller: allowed, scope: allowedScope});
        const allowedPreview = allowed.previewTranslation("libretranslate", "https://translate.example/v1", "en", "es", "hello");
        await expect(allowed.executeReviewedTranslation(allowedPreview.id)).resolves.toBe("hola");
        expect(fetchCalls).toBe(1);
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

    test("retains a reviewed voice note when Discord's upload handoff fails and permits an explicit retry", async () => {
        const capture = testStream();
        installVoiceRuntime(async () => capture.stream);
        let attempts = 0;
        const scope = new SolcordDisposalScope();
        const controller = new SolcordNativeSuiteController(scope, {VoiceMessages: true}, {
            prepareVoiceNoteUpload: () => {
                attempts++;
                if (attempts === 1) throw new Error("upload composer unavailable");
            }
        });
        controller.start();
        controllers.push({controller, scope});

        const recording = await controller.beginVoiceNoteFromUserGesture();
        TestMediaRecorder.instances.at(-1)!.emitData(new Blob(["voice"]));
        await controller.stopVoiceNoteForPreview();
        expect(() => controller.prepareReviewedVoiceNoteUpload("123456")).toThrow("upload composer unavailable");
        expect(controller.voiceNoteBlob(recording.recordingId)).toBeInstanceOf(Blob);
        expect(() => controller.prepareReviewedVoiceNoteUpload("123456")).not.toThrow();
        expect(attempts).toBe(2);
        expect(controller.voiceNoteBlob(recording.recordingId)).toBeUndefined();
        expect(capture.track.stopCount).toBe(1);
    });

    test("bounds a recorder that becomes inactive without emitting a stop event", async () => {
        const capture = testStream();
        installVoiceRuntime(async () => capture.stream);
        const controller = startController();
        await controller.beginVoiceNoteFromUserGesture();
        TestMediaRecorder.suppressStopEvent = true;
        const originalSetTimeout = globalThis.setTimeout;
        let watchdog: (() => void) | undefined;
        Object.defineProperty(globalThis, "setTimeout", {
            configurable: true,
            value: ((callback: TimerHandler, delay?: number) => {
                if (delay === SOLCORD_VOICE_NOTE_STOP_TIMEOUT_MS) {
                    watchdog = callback as () => void;
                    return 2;
                }
                return originalSetTimeout(callback, delay);
            }) as typeof globalThis.setTimeout
        });
        try {
            const pending = controller.stopVoiceNoteForPreview();
            expect(watchdog).toBeFunction();
            watchdog!();
            await expect(pending).rejects.toThrow("did not finish stopping");
            expect(capture.track.stopCount).toBe(1);
        }
        finally {Object.defineProperty(globalThis, "setTimeout", {configurable: true, writable: true, value: originalSetTimeout});}
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
