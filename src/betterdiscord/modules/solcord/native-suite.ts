// SPDX-License-Identifier: Apache-2.0

import {
    SolcordAudioConsoleController,
    SolcordCallContextController,
    SolcordChannelGlanceController,
    SolcordComposerToolkitController,
    SolcordMotionStudioController,
    SolcordNotificationReviewController,
    SolcordPermissionLensController,
    SolcordLocalIdentityNotesController,
    SolcordPeopleSpacesController,
    SolcordTranslationDeskController,
    SolcordVoiceHealthController,
    SolcordVoiceNoteStudioController,
    SOLCORD_VOICE_NOTE_MAX_BYTES,
    SOLCORD_VOICE_NOTE_MAX_DURATION_MS,
    type SolcordCallSnapshot,
    type SolcordGlanceMessage,
    type SolcordTranslationProvider,
    type SolcordV2FeatureId,
    type SolcordVoiceHealthSample
} from "@common/solcord/v2-feature-models";
import {solcordNativeSuiteFeatureForAddon, type SolcordNativeSuiteFeature} from "@common/solcord/builtin-addons";

import {SolcordDisposalScope} from "./disposal";


export type SolcordNativeSuiteMaturity = "ready" | "unavailable";

export interface SolcordNativeSuiteStatus {
    id: SolcordNativeSuiteFeature | "permission-lens" | "voice-health" | "local-identity-notes";
    title: string;
    maturity: SolcordNativeSuiteMaturity;
    detail: string;
    enabledProviders: string[];
}

export interface SolcordNativeSuiteAdapter {
    currentCall?(): SolcordCallSnapshot | undefined;
    subscribeCall?(listener: () => void): () => void;
    setLocalVolume?(userId: string, percent: number): void;
    loadedChannelMessages?(channelId: string): SolcordGlanceMessage[] | undefined;
    notificationIds?(scope: "guild" | "mentions" | "all"): string[];
    markNotificationsRead?(scope: "guild" | "mentions" | "all", ids: readonly string[]): void;
    voiceHealthSample?(): SolcordVoiceHealthSample | undefined;
    prepareVoiceNoteUpload?(channelId: string, file: File): void;
    peopleState?: {pinnedDmIds: readonly string[]; hiddenGuildIds: readonly string[]; guildAliases: Readonly<Record<string, string>>;};
    savePeopleState?(state: {pinnedDmIds: readonly string[]; hiddenGuildIds: readonly string[]; guildAliases: Readonly<Record<string, string>>;}): void;
    focusChannelIds?: readonly string[];
    saveFocusChannelIds?(ids: readonly string[]): void;
    identityNotesAvailable?: boolean;
}

interface RecordingState {
    id: string;
    recorder: MediaRecorder;
    stream: MediaStream;
    chunks: Blob[];
    sizeBytes: number;
    startedAt: number;
    limitTimer?: ReturnType<typeof globalThis.setTimeout>;
    abortError?: Error;
    resourcesReleased?: boolean;
    blob?: Blob;
    url?: string;
}

const TITLES: Readonly<Record<SolcordNativeSuiteStatus["id"], string>> = Object.freeze({
    "privacy-controls": "Privacy Controls",
    "composer-toolkit": "Composer Toolkit",
    "call-context": "Call Context",
    "audio-console": "Audio Console",
    "voice-note-studio": "Voice Note Studio",
    "translation-desk": "Translation Desk",
    "people-and-spaces": "People and Spaces",
    "channel-glance": "Channel Glance",
    "notification-review": "Notification Review",
    "motion-studio": "Motion Studio",
    "permission-lens": "Permission Lens",
    "voice-health": "Voice Health",
    "local-identity-notes": "Local Identity Notes"
});

function enabledByFeature(addons: Readonly<Record<string, boolean>>): Map<SolcordNativeSuiteFeature, string[]> {
    const result = new Map<SolcordNativeSuiteFeature, string[]>();
    for (const [name, enabled] of Object.entries(addons)) {
        if (!enabled) continue;
        const feature = solcordNativeSuiteFeatureForAddon(name);
        if (!feature) continue;
        const providers = result.get(feature) ?? [];
        providers.push(name);
        result.set(feature, providers);
    }
    return result;
}

function safeToken(value: string, maximumLength = 32): string {
    if (!new RegExp(`^[0-9A-Za-z._:-]{1,${maximumLength}}$`).test(value)) throw new Error("Solcord action identifier is invalid.");
    return value;
}

function hasUnsafeControl(value: string): boolean {
    return [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

function stopMediaStreamTracks(stream: MediaStream): void {
    try {
        for (const track of stream.getTracks()) {
            try {track.stop();}
            catch {/* continue releasing every captured track */}
        }
    }
    catch {/* a malformed stream must not prevent controller cleanup */}
}

export const SOLCORD_TRANSLATION_RESPONSE_MAX_BYTES = 1024 * 1024;

export async function readBoundedTranslationJson(response: Response): Promise<unknown> {
    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > SOLCORD_TRANSLATION_RESPONSE_MAX_BYTES) {
        await response.body?.cancel().catch(() => {});
        throw new Error("Translation response exceeded the one MiB limit.");
    }
    if (!response.body) throw new Error("Translation provider returned an invalid response.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", {fatal: true});
    let size = 0;
    let text = "";
    try {
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > SOLCORD_TRANSLATION_RESPONSE_MAX_BYTES) {
                await reader.cancel().catch(() => {});
                throw new Error("Translation response exceeded the one MiB limit.");
            }
            text += decoder.decode(value, {stream: true});
        }
        text += decoder.decode();
    }
    catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
    }
    finally {reader.releaseLock();}
    return JSON.parse(text);
}

export class SolcordNativeSuiteController {
    readonly #scope: SolcordDisposalScope;
    readonly #adapter: SolcordNativeSuiteAdapter;
    readonly #enabled: Map<SolcordNativeSuiteFeature, string[]>;
    readonly #status = new Map<SolcordNativeSuiteStatus["id"], SolcordNativeSuiteStatus>();
    #composer?: SolcordComposerToolkitController;
    #call?: SolcordCallContextController;
    #audio?: SolcordAudioConsoleController;
    #voiceNote?: SolcordVoiceNoteStudioController;
    #translation?: SolcordTranslationDeskController;
    #people?: SolcordPeopleSpacesController;
    #glance?: SolcordChannelGlanceController;
    #notifications?: SolcordNotificationReviewController;
    #motion?: SolcordMotionStudioController;
    #permissions?: SolcordPermissionLensController;
    #identityNotes?: SolcordLocalIdentityNotesController;
    #voiceHealth?: SolcordVoiceHealthController;
    #recording?: RecordingState;
    #voicePromptGeneration = 0;
    #voicePromptPending = false;
    #translationEndpoints = new Map<string, string>();
    #disposed = false;

    constructor(scope: SolcordDisposalScope, addons: Readonly<Record<string, boolean>>, adapter: SolcordNativeSuiteAdapter) {
        this.#scope = scope;
        this.#adapter = adapter;
        this.#enabled = enabledByFeature(addons);
    }

    start(): void {
        if (this.#disposed) throw new Error("Solcord native suite is disposed.");
        this.#startComposer();
        this.#startCallContext();
        this.#startAudioConsole();
        this.#startVoiceNoteStudio();
        this.#startTranslationDesk();
        this.#startPeopleAndSpaces();
        this.#startChannelGlance();
        this.#startNotificationReview();
        this.#startMotionStudio();
        this.#startVoiceHealth();
        this.#permissions = new SolcordPermissionLensController();
        this.#setStatus("permission-lens", "ready", "Explains cached Discord permission names without editing or fetching permission state.", []);
        this.#startFocusChannels();
        this.#identityNotes = new SolcordLocalIdentityNotesController();
        this.#setStatus("local-identity-notes", this.#adapter.identityNotesAvailable ? "ready" : "unavailable", this.#adapter.identityNotesAvailable ? "Account-private notes are written only after review through encrypted storage or an explicit session-only fallback." : "Encrypted Local Identity Notes remain off until the private storage adapter validates.", []);
    }

    statuses(): SolcordNativeSuiteStatus[] {
        return [...this.#status.values()].map(status => structuredClone(status));
    }

    providerReady(name: string): boolean {
        const feature = solcordNativeSuiteFeatureForAddon(name);
        return Boolean(feature && this.#status.get(feature)?.maturity === "ready");
    }

    callSummary() {
        return this.#call?.summary();
    }

    voiceHealthSummary() {
        return this.#voiceHealth?.summary();
    }

    previewLocalVolume(userId: string, currentPercent: number, targetPercent: number) {
        if (!this.#audio || !this.#adapter.setLocalVolume) throw new Error("Audio Console is unavailable.");
        return this.#audio.previewVolume(userId, currentPercent, targetPercent);
    }

    applyReviewedLocalVolume(): void {
        if (!this.#audio || !this.#adapter.setLocalVolume) throw new Error("Audio Console is unavailable.");
        const intent = this.#audio.confirmVolume();
        this.#adapter.setLocalVolume(intent.payload.userId, intent.payload.volumePercent);
    }

    previewLoadedChannel(channelId: string) {
        if (!this.#glance || !this.#adapter.loadedChannelMessages) throw new Error("Channel Glance is unavailable.");
        const loaded = this.#adapter.loadedChannelMessages(safeToken(channelId));
        return this.#glance.showAlreadyLoaded(Array.isArray(loaded), loaded ?? []);
    }

    previewNotifications(scope: "guild" | "mentions" | "all") {
        if (!this.#notifications || !this.#adapter.notificationIds) throw new Error("Notification Review is unavailable.");
        return this.#notifications.preview(scope, this.#adapter.notificationIds(scope));
    }

    applyReviewedNotifications(previewId: string): void {
        if (!this.#notifications || !this.#adapter.markNotificationsRead) throw new Error("Notification Review is unavailable.");
        const intent = this.#notifications.confirm(previewId);
        this.#adapter.markNotificationsRead(intent.payload.scope, intent.payload.notificationIds);
    }

    previewTranslation(provider: SolcordTranslationProvider, endpoint: string | undefined, source: string, target: string, text: string) {
        if (!this.#translation) throw new Error("Translation Desk is unavailable.");
        const preview = this.#translation.preview(provider, endpoint, source, target, text);
        this.#translationEndpoints.set(preview.id, provider === "deepl" ? "https://api-free.deepl.com/v2/translate" : new URL(endpoint!).toString());
        return preview;
    }

    confirmTranslation(previewId: string) {
        if (!this.#translation) throw new Error("Translation Desk is unavailable.");
        return this.#translation.confirm(previewId);
    }

    async executeReviewedTranslation(previewId: string, credential = ""): Promise<string> {
        const endpoint = this.#translationEndpoints.get(previewId);
        this.#translationEndpoints.delete(previewId);
        if (!endpoint) throw new Error("Translation endpoint review expired.");
        const intent = this.confirmTranslation(previewId);
        if (Date.now() > intent.expiresAt) throw new Error("Translation confirmation expired.");
        if (intent.payload.provider === "deepl" && (!credential || credential.length > 512 || hasUnsafeControl(credential))) throw new Error("A valid DeepL credential is required.");
        const controller = new AbortController();
        const timeout = globalThis.setTimeout(() => controller.abort(), 15_000);
        try {
            const headers = new Headers({"content-type": "application/json"});
            if (intent.payload.provider === "deepl") headers.set("authorization", `DeepL-Auth-Key ${credential}`);
            const response = await fetch(endpoint, {
                method: "POST",
                headers,
                redirect: "error",
                signal: controller.signal,
                body: JSON.stringify(intent.payload.provider === "deepl"
                    ? {text: [intent.payload.text], source_lang: intent.payload.sourceLanguage === "auto" ? undefined : intent.payload.sourceLanguage, target_lang: intent.payload.targetLanguage}
                    : {q: intent.payload.text, source: intent.payload.sourceLanguage, target: intent.payload.targetLanguage, format: "text", ...(credential ? {api_key: credential} : {})})
            });
            if (!response.ok) throw new Error(`Translation provider returned HTTP ${response.status}.`);
            const value = await readBoundedTranslationJson(response) as {translations?: Array<{text?: unknown;}>; translatedText?: unknown;};
            const translated = intent.payload.provider === "deepl" ? value.translations?.[0]?.text : value.translatedText;
            if (typeof translated !== "string" || translated.length > 64_000) throw new Error("Translation provider returned an invalid response.");
            return translated;
        }
        finally {globalThis.clearTimeout(timeout);}
    }

    pinDm(id: string): void {if (!this.#people) throw new Error("People and Spaces is unavailable."); this.#people.pinDm(id); this.#savePeople();}
    hideGuild(id: string): void {if (!this.#people) throw new Error("People and Spaces is unavailable."); this.#people.hideGuild(id); this.#savePeople();}
    aliasGuild(id: string, alias: string): void {if (!this.#people) throw new Error("People and Spaces is unavailable."); this.#people.aliasGuild(id, alias); this.#savePeople();}
    peopleSnapshot() {return this.#people?.snapshot();}

    composerProof(text: string) {
        if (!this.#composer) throw new Error("Composer Proof is unavailable.");
        const preview = this.#composer.previewDraft(text);
        const warnings = [
            ...(text.length > 2_000 ? [`Draft needs ${preview.parts.length} reviewed parts.`] : []),
            ...(/@(everyone|here)\b/i.test(text) ? ["Draft contains a broad mention."] : []),
            ...(((text.match(/```/g) ?? []).length % 2) ? ["Draft has an unclosed code block."] : [])
        ];
        return {characterCount: preview.characterCount, partCount: preview.parts.length, warnings};
    }

    timeMarkup(timestampMs: number, style: "t" | "T" | "d" | "D" | "f" | "F" | "R"): string {
        if (!Number.isFinite(timestampMs) || timestampMs < 0 || timestampMs > 8_640_000_000_000_000) throw new Error("Time Composer received an invalid date.");
        if (!(["t", "T", "d", "D", "f", "F", "R"] as const).includes(style)) throw new Error("Time Composer style is invalid.");
        return `<t:${Math.floor(timestampMs / 1_000)}:${style}>`;
    }

    explainCachedPermissions(permissionNames: readonly string[]) {
        if (!this.#permissions) throw new Error("Permission Lens is unavailable.");
        return this.#permissions.explainFromCache(true, permissionNames);
    }

    reviewIdentityNote(subjectId: string, text: string, tags: readonly string[]) {
        if (!this.#identityNotes || !this.#adapter.identityNotesAvailable) throw new Error("Local Identity Notes are unavailable.");
        return this.#identityNotes.preview({subjectId, text, tags});
    }

    confirmIdentityNote(subjectId: string) {
        if (!this.#identityNotes || !this.#adapter.identityNotesAvailable) throw new Error("Local Identity Notes are unavailable.");
        return this.#identityNotes.confirmSecureWrite(subjectId);
    }

    setFocusChannels(ids: readonly string[]): void {
        if (!this.#adapter.saveFocusChannelIds) throw new Error("Focus Channels is unavailable.");
        const normalized = [...new Set(ids.map(id => safeToken(id)).slice(0, 100))];
        this.#adapter.saveFocusChannelIds(normalized);
        this.#applyFocusChannels(normalized);
    }

    async beginVoiceNoteFromUserGesture(): Promise<{recordingId: string;}> {
        if (!this.#voiceNote || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder !== "function") throw new Error("Voice Note Studio is unavailable.");
        if (this.#voicePromptPending || this.#recording) throw new Error("A voice-note recording is already active.");
        const generation = ++this.#voicePromptGeneration;
        let stream: MediaStream | undefined;
        let recording: RecordingState | undefined;
        this.#voicePromptPending = true;
        try {
            this.#voiceNote.beginFromUserGesture(true);
            stream = await navigator.mediaDevices.getUserMedia({audio: true});
            if (this.#disposed || generation !== this.#voicePromptGeneration) throw new Error("Voice-note permission request was canceled.");
            const mime = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus") ? "audio/ogg;codecs=opus" : "audio/webm;codecs=opus";
            const recorder = new MediaRecorder(stream, {mimeType: mime});
            recording = {id: `voice-note-${Date.now().toString(36)}`, recorder, stream, chunks: [], sizeBytes: 0, startedAt: Date.now()};
            recorder.addEventListener("dataavailable", event => {
                if (!event.data.size || recording!.abortError) return;
                const sizeBytes = recording!.sizeBytes + event.data.size;
                if (sizeBytes > SOLCORD_VOICE_NOTE_MAX_BYTES) {
                    this.#abortVoiceNoteRecording(recording!, new Error("Voice-note recording exceeded the 25 MiB limit."));
                    return;
                }
                recording!.sizeBytes = sizeBytes;
                recording!.chunks.push(event.data);
            });
            recorder.addEventListener("error", () => this.#abortVoiceNoteRecording(recording!, new Error("Voice-note recording failed.")));
            this.#recording = recording;
            recorder.start(250);
            recording.limitTimer = globalThis.setTimeout(() => this.#abortVoiceNoteRecording(recording!, new Error("Voice-note recording reached the ten minute limit.")), SOLCORD_VOICE_NOTE_MAX_DURATION_MS);
            return {recordingId: recording.id};
        }
        catch (error) {
            const failure = error instanceof Error ? error : new Error("Voice-note recording failed.");
            if (recording) {
                this.#abortVoiceNoteRecording(recording, failure);
            }
            else {
                if (stream) {
                    stopMediaStreamTracks(stream);
                }
                if (generation === this.#voicePromptGeneration) {
                    this.#voiceNote.cancel();
                }
            }
            throw failure;
        }
        finally {
            if (generation === this.#voicePromptGeneration) this.#voicePromptPending = false;
        }
    }

    stopVoiceNoteForPreview(): Promise<{recordingId: string; durationMs: number; sizeBytes: number; mime: "audio/ogg" | "audio/webm"; url: string;}> {
        const recording = this.#recording;
        if (!recording || recording.recorder.state === "inactive" || !this.#voiceNote) return Promise.reject(new Error("No voice-note recording is active."));
        this.#clearVoiceNoteTimer(recording);
        return new Promise((resolve, reject) => {
            const finish = () => {
                if (recording.abortError) {
                    reject(recording.abortError);
                    return;
                }
                try {
                    const mime = recording.recorder.mimeType.startsWith("audio/ogg") ? "audio/ogg" as const : "audio/webm" as const;
                    const blob = new Blob(recording.chunks, {type: mime});
                    if (blob.size > SOLCORD_VOICE_NOTE_MAX_BYTES) throw new Error("Voice-note recording exceeded the 25 MiB limit.");
                    recording.blob = blob;
                    recording.chunks.splice(0);
                    recording.url = URL.createObjectURL(blob);
                    const durationMs = Math.max(200, Date.now() - recording.startedAt);
                    const preview = this.#voiceNote!.attachPreview({recordingId: recording.id, durationMs, sizeBytes: blob.size, mime});
                    resolve({...preview, url: recording.url});
                }
                catch (error) {
                    const failure = error instanceof Error ? error : new Error("Voice-note preview failed.");
                    this.#abortVoiceNoteRecording(recording, failure);
                    reject(failure);
                }
                finally {this.#releaseVoiceNoteResources(recording);}
            };
            recording.recorder.addEventListener("stop", finish, {once: true});
            try {recording.recorder.stop();}
            catch (error) {
                const failure = error instanceof Error ? error : new Error("Voice-note recording failed to stop.");
                this.#abortVoiceNoteRecording(recording, failure);
                reject(failure);
            }
        });
    }

    voiceNoteBlob(recordingId: string): Blob | undefined {
        return this.#recording?.id === recordingId ? this.#recording.blob : undefined;
    }

    prepareReviewedVoiceNoteUpload(channelId: string): void {
        const recording = this.#recording;
        if (!recording?.blob || !this.#voiceNote || !this.#adapter.prepareVoiceNoteUpload) throw new Error("The reviewed voice note or native upload adapter is unavailable.");
        const intent = this.#voiceNote.confirmUpload(channelId);
        if (Date.now() > intent.expiresAt || intent.payload.recordingId !== recording.id) throw new Error("Voice-note upload confirmation expired.");
        const extension = intent.payload.mime === "audio/ogg" ? "ogg" : "webm";
        const file = new File([recording.blob], `Solcord-voice-note-${Date.now().toString(36)}.${extension}`, {type: intent.payload.mime});
        this.#adapter.prepareVoiceNoteUpload(intent.payload.channelId, file);
        this.cancelVoiceNote();
    }

    cancelVoiceNote(): void {
        ++this.#voicePromptGeneration;
        this.#voicePromptPending = false;
        const recording = this.#recording;
        if (recording) this.#abortVoiceNoteRecording(recording, new Error("Voice-note recording was canceled."));
        else this.#voiceNote?.cancel();
    }

    dispose(): void {
        if (this.#disposed) return;
        this.#disposed = true;
        this.cancelVoiceNote();
        this.#translationEndpoints.clear();
        for (const controller of [this.#composer, this.#call, this.#audio, this.#voiceNote, this.#translation, this.#people, this.#glance, this.#notifications, this.#motion, this.#permissions, this.#identityNotes, this.#voiceHealth]) {
            try {controller?.dispose();}
            catch {/* the owning Solcord scope still disposes every external resource */}
        }
        this.#status.clear();
    }

    #clearVoiceNoteTimer(recording: RecordingState): void {
        if (recording.limitTimer === undefined) return;
        globalThis.clearTimeout(recording.limitTimer);
        recording.limitTimer = undefined;
    }

    #releaseVoiceNoteResources(recording: RecordingState): void {
        if (recording.resourcesReleased) return;
        recording.resourcesReleased = true;
        stopMediaStreamTracks(recording.stream);
    }

    #abortVoiceNoteRecording(recording: RecordingState, error: Error): void {
        if (recording.abortError) return;
        recording.abortError = error;
        this.#clearVoiceNoteTimer(recording);
        if (this.#recording === recording) this.#recording = undefined;
        this.#voiceNote?.cancel();
        try {if (recording.recorder.state !== "inactive") recording.recorder.stop();}
        catch {/* tracks and retained buffers are still released below */}
        this.#releaseVoiceNoteResources(recording);
        recording.chunks.splice(0);
        recording.blob = undefined;
        if (recording.url) {
            URL.revokeObjectURL(recording.url);
            recording.url = undefined;
        }
    }

    #startComposer(): void {
        const providers = this.#enabled.get("composer-toolkit") ?? [];
        if (!providers.length) return this.#setStatus("composer-toolkit", "ready", "Composer Toolkit is off until one of its built-in controls is selected.", []);
        this.#composer = new SolcordComposerToolkitController();
        const sync = () => {
            const editors = document.querySelectorAll<HTMLElement>("[role='textbox'][contenteditable='true']");
            for (const editor of editors) {
                if (!editor.closest("[class*='channelTextArea']")) continue;
                const host = editor.closest<HTMLElement>("[class*='channelTextArea']");
                if (!host) continue;
                let counter = host.querySelector<HTMLElement>("[data-solcord-composer-count]");
                if (!counter) {
                    counter = document.createElement("span");
                    counter.dataset.solcordComposerCount = "true";
                    counter.className = "solcord-composer-count";
                    counter.setAttribute("aria-live", "polite");
                    host.append(counter);
                }
                const length = (editor.innerText || editor.textContent || "").length;
                counter.textContent = `${length.toLocaleString("en-US")} / 2,000`;
                counter.dataset.overLimit = String(length > 2_000);
            }
            for (const element of document.querySelectorAll<HTMLElement>("time[datetime]:not([data-solcord-complete-time])")) {
                const date = new Date(element.getAttribute("datetime") ?? "");
                if (!Number.isNaN(date.valueOf())) {
                    element.dataset.solcordCompleteTime = "true";
                    element.title = date.toLocaleString(undefined, {dateStyle: "full", timeStyle: "long"});
                }
            }
        };
        const observer = new MutationObserver(sync);
        this.#scope.observe(observer, document.body, {childList: true, subtree: true, characterData: true});
        this.#scope.own(() => document.querySelectorAll("[data-solcord-composer-count]").forEach(element => element.remove()), "element");
        sync();
        this.#setStatus("composer-toolkit", "ready", "Character count, complete local timestamps, guarded splitting, and native reply composition are active without sending.", providers);
    }

    #startCallContext(): void {
        const providers = this.#enabled.get("call-context") ?? [];
        this.#call = new SolcordCallContextController();
        const sync = () => {
            const value = this.#adapter.currentCall?.();
            if (value) this.#call?.observe(value);
            this.#renderCallBadge(Boolean(value));
        };
        const unsubscribe = this.#adapter.subscribeCall?.(sync);
        if (unsubscribe) this.#scope.own(unsubscribe, "listener");
        sync();
        this.#setStatus("call-context", providers.length && this.#adapter.currentCall ? "ready" : "unavailable", providers.length ? "Call duration, participant/speaker counts, and exposed stream-viewer counts use current loaded stores only." : "Call Context is off.", providers);
    }

    #renderCallBadge(connected: boolean): void {
        document.querySelector("[data-solcord-call-badge]")?.remove();
        if (!connected) return;
        const summary = this.#call?.summary();
        if (!summary?.connected) return;
        const host = document.querySelector<HTMLElement>("[class*='panels']");
        if (!host) return;
        const badge = document.createElement("div");
        badge.dataset.solcordCallBadge = "true";
        badge.className = "solcord-call-badge";
        badge.setAttribute("role", "status");
        badge.textContent = `${summary.participantCount} in call · ${summary.speakerCount} speaking${summary.viewerCount ? ` · ${summary.viewerCount} watching` : ""}`;
        host.prepend(badge);
    }

    #startAudioConsole(): void {
        const providers = this.#enabled.get("audio-console") ?? [];
        this.#audio = new SolcordAudioConsoleController();
        this.#setStatus("audio-console", providers.length && this.#adapter.setLocalVolume ? "ready" : "unavailable", providers.length ? "Bounded 0–200% local playback changes require a reviewed explicit action." : "Audio Console is off.", providers);
    }

    #startVoiceNoteStudio(): void {
        const providers = this.#enabled.get("voice-note-studio") ?? [];
        this.#voiceNote = new SolcordVoiceNoteStudioController();
        const available = typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder === "function";
        this.#setStatus("voice-note-studio", providers.length && available ? "ready" : "unavailable", providers.length ? "Record, stop, preview, cancel, and reviewed file handoff are available only from explicit controls." : "Voice Note Studio is off.", providers);
    }

    #startTranslationDesk(): void {
        const providers = this.#enabled.get("translation-desk") ?? [];
        this.#translation = new SolcordTranslationDeskController();
        this.#setStatus("translation-desk", providers.length ? "ready" : "unavailable", providers.length ? "No provider is active by default. Text leaves Discord only after endpoint disclosure and confirmation." : "Translation Desk is off.", providers);
    }

    #startPeopleAndSpaces(): void {
        const providers = this.#enabled.get("people-and-spaces") ?? [];
        this.#people = new SolcordPeopleSpacesController();
        for (const id of this.#adapter.peopleState?.pinnedDmIds ?? []) this.#people.pinDm(id);
        for (const id of this.#adapter.peopleState?.hiddenGuildIds ?? []) this.#people.hideGuild(id);
        for (const [id, alias] of Object.entries(this.#adapter.peopleState?.guildAliases ?? {})) this.#people.aliasGuild(id, alias);
        this.#setStatus("people-and-spaces", providers.length ? "ready" : "unavailable", providers.length ? "Pins, hidden-server choices, sorting, and aliases are local-only; no server profile is edited." : "People and Spaces is off.", providers);
    }

    #savePeople(): void {
        const state = this.#people?.snapshot();
        if (state) this.#adapter.savePeopleState?.(state);
    }

    #startChannelGlance(): void {
        const providers = this.#enabled.get("channel-glance") ?? [];
        this.#glance = new SolcordChannelGlanceController();
        this.#setStatus("channel-glance", providers.length && this.#adapter.loadedChannelMessages ? "ready" : "unavailable", providers.length ? "Shows at most five already-loaded messages and never fetches history or marks read." : "Channel Glance is off.", providers);
    }

    #startNotificationReview(): void {
        const providers = this.#enabled.get("notification-review") ?? [];
        this.#notifications = new SolcordNotificationReviewController();
        const available = Boolean(this.#adapter.notificationIds && this.#adapter.markNotificationsRead);
        this.#setStatus("notification-review", providers.length && available ? "ready" : "unavailable", providers.length ? "Scope and item count are previewed before one explicit mark-read action." : "Notification Review is off.", providers);
    }

    #startMotionStudio(): void {
        const providers = this.#enabled.get("motion-studio") ?? [];
        this.#motion = new SolcordMotionStudioController();
        const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
        const settings = this.#motion.configure({reducedMotion: reduced, intensity: 0.45, durationMs: 160, effectsEnabled: providers.includes("DiscordEffects")});
        if (providers.length && !settings.reducedMotion) this.#scope.style("solcord-native-motion", `:root{--solcord-native-motion:${settings.durationMs}ms} #app-mount [role="dialog"],#app-mount [class*="menu_"]{animation:solcord-native-enter var(--solcord-native-motion) ease-out}@keyframes solcord-native-enter{from{opacity:.72;transform:translateY(3px)}to{opacity:1;transform:none}}`);
        this.#setStatus("motion-studio", providers.length ? "ready" : "unavailable", settings.reducedMotion ? "Windows or Discord reduced motion is active; optional effects are suppressed." : "Bounded local transitions are active and fully removed on disable.", providers);
    }

    #startVoiceHealth(): void {
        this.#voiceHealth = new SolcordVoiceHealthController();
        if (this.#adapter.voiceHealthSample) this.#scope.interval(() => {const sample = this.#adapter.voiceHealthSample?.(); if (sample) this.#voiceHealth?.add(sample);}, 5_000);
        this.#setStatus("voice-health", this.#adapter.voiceHealthSample ? "ready" : "unavailable", "Keeps at most 120 connection-quality samples and never records audio.", []);
    }

    #startFocusChannels(): void {
        const apply = () => this.#applyFocusChannels(this.#adapter.focusChannelIds ?? []);
        const observer = new MutationObserver(apply);
        this.#scope.observe(observer, document.body, {childList: true, subtree: true});
        this.#scope.own(() => document.querySelectorAll("[data-solcord-focus-muted]").forEach(element => element.removeAttribute("data-solcord-focus-muted")), "element");
        this.#scope.own(() => document.querySelector("[data-solcord-call-badge]")?.remove(), "element");
        apply();
    }

    #applyFocusChannels(rawIds: readonly string[]): void {
        const ids = new Set(rawIds.map(id => safeToken(id)));
        for (const item of document.querySelectorAll<HTMLElement>("[data-list-item-id*='channels___'], [data-list-item-id*='channel_']")) {
            const identity = item.dataset.listItemId ?? "";
            const match = identity.match(/(\d{5,32})(?!.*\d)/);
            if (!ids.size || !match || ids.has(match[1])) item.removeAttribute("data-solcord-focus-muted");
            else item.dataset.solcordFocusMuted = "true";
        }
    }

    #setStatus(id: SolcordNativeSuiteStatus["id"], maturity: SolcordNativeSuiteMaturity, detail: string, providers: string[]): void {
        this.#status.set(id, {id, title: TITLES[id], maturity, detail, enabledProviders: [...providers]});
    }
}

export const SOLCORD_NATIVE_SUITE_FEATURE_IDS: readonly SolcordV2FeatureId[] = Object.freeze([
    "composer-toolkit", "call-context", "audio-console", "voice-note-studio", "translation-desk", "people-and-spaces", "channel-glance", "notification-review", "motion-studio", "permission-lens", "voice-health", "local-identity-notes"
]);
