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
import {isSolcordDiscordSnowflake} from "./voice-adapter-capabilities";
import {
    SolcordLocalTranslationEngine,
    type SolcordLocalLanguageDetectorFactory,
    type SolcordLocalTranslationAvailability,
    type SolcordLocalTranslationSnapshot,
    type SolcordLocalTranslatorFactory
} from "./local-translation";


export type SolcordNativeSuiteMaturity = "off" | "needs-setup" | "ready" | "degraded" | "unsupported";

export interface SolcordNativeSuiteStatus {
    id: SolcordNativeSuiteFeature | "permission-lens" | "voice-health" | "local-identity-notes";
    title: string;
    maturity: SolcordNativeSuiteMaturity;
    detail: string;
    enabledProviders: string[];
}

export interface SolcordNativeMotionPolicy {
    effectiveMotion: "full" | "subtle" | "reduced";
    ambientEffects: boolean;
}

export interface SolcordNativeSuiteAdapter {
    onStatusChange?(): void;
    currentCall?(): SolcordCallSnapshot | undefined;
    currentChannelId?(): string | undefined;
    subscribeCall?(listener: () => void): () => void;
    setLocalVolume?(userId: string, percent: number): void;
    loadedChannelMessages?(channelId: string): SolcordGlanceMessage[] | undefined;
    notificationIds?(scope: "guild" | "mentions" | "all"): string[];
    markNotificationsRead?(scope: "guild" | "mentions" | "all", ids: readonly string[]): void;
    voiceHealthSample?(): SolcordVoiceHealthSample | undefined;
    voiceHealthInitialSample?: SolcordVoiceHealthSample;
    voiceHealthCapability?: "ready" | "available" | "unavailable";
    voiceHealthCapabilityDetail?: string;
    prepareVoiceNoteUpload?(channelId: string, file: File, metadata: {durationMs: number; waveform: readonly number[];}): void;
    saveVoiceNoteFile?(file: File): void;
    voiceNoteCaptureCapability?: "ready" | "available" | "degraded" | "unavailable";
    voiceNoteCaptureDetail?: string;
    localVolumeCapability?: "ready" | "available" | "degraded" | "unavailable";
    localVolumeCapabilityDetail?: string;
    voiceActivityAvailable?: boolean;
    spectatorsAvailable?: boolean;
    spectatorsReady?(): boolean;
    guildDetails?(guildId: string): {name?: string; ownerLabel?: string; memberCount?: number; createdAt?: number; joinedAt?: number; channelCount?: number; roleCount?: number; boostCount?: number; locale?: string;} | undefined;
    loadedFriends?(): Array<{id: string; label: string; status: "online" | "idle" | "dnd" | "offline" | "unknown"; relationship?: "friend" | "blocked" | "incoming" | "outgoing" | "ignored"; relationshipSince?: number; mutualGuildCount?: number;} >;
    dmUnreadCount?(channelId: string): number;
    dmLastMessageTimestamp?(channelId: string): number;
    dmCategory?(channelId: string): "friends" | "groups" | "bots" | "blocked" | "others";
    peopleState?: {pinnedDmIds: readonly string[]; hiddenGuildIds: readonly string[]; guildAliases: Readonly<Record<string, string>>; favoriteFriendIds: readonly string[]; hiddenFriendIds: readonly string[]; ignoredVoiceChannelIds?: readonly string[]; ignoredVoiceGuildIds?: readonly string[];};
    peopleStatePersistence?: "encrypted" | "session";
    savePeopleState?(state: {pinnedDmIds: readonly string[]; hiddenGuildIds: readonly string[]; guildAliases: Readonly<Record<string, string>>; favoriteFriendIds: readonly string[]; hiddenFriendIds: readonly string[]; ignoredVoiceChannelIds: readonly string[]; ignoredVoiceGuildIds: readonly string[];}): void;
    focusChannelIds?: readonly string[];
    saveFocusChannelIds?(ids: readonly string[]): void;
    identityNotesAvailable?: boolean;
    externalProvidersAllowed?(): boolean;
    localTranslationFactory?: SolcordLocalTranslatorFactory;
    localLanguageDetectorFactory?: SolcordLocalLanguageDetectorFactory;
    translationPreferences?: {provider: "off" | "local" | "deepl" | "libretranslate"; sourceLanguage: string; targetLanguage: string;};
    voiceHealthEnabled?: boolean;
    composerPreferences?: {counterWarningPercent: number; timestampFormat: "full" | "compact" | "iso";};
    timestampPreferences?: {chat: boolean; embeds: boolean; markup: boolean; auditLogs: boolean; chatTooltips: boolean; editedTooltips: boolean; markupTooltips: boolean;};
    peoplePreferences?: {showRelationshipDates: boolean; showMutualGuildCounts: boolean; pinIcon: boolean; pinUnreadAmount: boolean; pinChannelAmount: boolean; sortPinnedByRecent: boolean; serverHiderStreamOnly: boolean; pinCategories: {friends: boolean; groups: boolean; bots: boolean; blocked: boolean; others: boolean;};};
    voiceActivityPreferences?: {memberList: boolean; dmList: boolean; peopleList: boolean; highlightCurrentChannel: boolean; statusIcons: boolean; currentUser: boolean;};
    voiceActivityCurrentUserId?: string;
    currentVoiceContext?(): {channelId: string; guildId?: string;} | undefined;
    streamerModeActive?(): boolean;
    subscribeStreamerMode?(listener: () => void): () => void;
    voiceNotePreferences?: {downloadButton: boolean; stripMetadata: boolean;};
    notificationPreferences?: {includeDms: boolean; includeGuilds: boolean; includeMuted: boolean;};
    motionPreferences?: {effect: "off" | "signal" | "field" | "work-field" | "embers" | "snow" | "rain" | "stars"; particleCount: number; color: string; opacityPercent: number; speedPercent: number; starAngleDegrees: number; surfaces: {messages: boolean; channels: boolean; servers: boolean; members: boolean; modals: boolean; popouts: boolean; settings: boolean; tooltips: boolean; threads: boolean;};};
    motionPolicy?: SolcordNativeMotionPolicy;
}

export interface SolcordSpeakingStoreShape {
    getSpeakingUsers?(): unknown;
    getSpeakers?(): unknown;
}

export interface SolcordChangeStoreShape {
    addChangeListener(listener: () => void): void;
    removeChangeListener(listener: () => void): void;
}

export interface SolcordRelationshipStoreShape {
    getRelationships?(): unknown;
    getMutableRelationships?(): unknown;
}

/**
 * Discord has exposed the loaded relationship snapshot through both names.
 * Prefer the immutable reader, but accept the mutable-named reader strictly as
 * a read-only compatibility surface. The returned wrapper rejects arrays and
 * primitives so Better Friend List cannot advertise readiness on a drifted
 * store shape.
 */
export function resolveSolcordRelationshipReader(store: SolcordRelationshipStoreShape | undefined): (() => Map<unknown, unknown> | Readonly<Record<string, unknown>> | undefined) | undefined {
    const read = typeof store?.getRelationships === "function"
        ? store.getRelationships.bind(store)
        : typeof store?.getMutableRelationships === "function"
            ? store.getMutableRelationships.bind(store)
            : undefined;
    if (!read) return;
    return () => {
        try {
            const value = read();
            if (value instanceof Map) return value;
            if (value && typeof value === "object" && !Array.isArray(value)) return value as Readonly<Record<string, unknown>>;
        }
        catch {/* A drifting store stays unavailable instead of breaking navigation. */}
    };
}

const SOLCORD_VOICE_DOWNLOAD_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);

interface SolcordVoiceAnalysisContext {
    decodeAudioData(data: ArrayBuffer): Promise<{duration: number; numberOfChannels: number; getChannelData(channel: number): Float32Array;}>;
    close(): Promise<void>;
}

export async function analyzeSolcordVoiceNote(
    blob: Blob,
    contextFactory: (() => SolcordVoiceAnalysisContext) | undefined = typeof AudioContext === "function" ? () => new AudioContext() : undefined
): Promise<{durationMs?: number; waveform: readonly number[];}> {
    if (!contextFactory || blob.size < 1 || blob.size > SOLCORD_VOICE_NOTE_MAX_BYTES) return {waveform: Object.freeze([])};
    let context: SolcordVoiceAnalysisContext | undefined;
    try {
        context = contextFactory();
        const decoded = await context.decodeAudioData(await blob.arrayBuffer());
        const durationMs = Math.round(decoded.duration * 1_000);
        if (!Number.isFinite(durationMs) || durationMs < 1 || decoded.numberOfChannels < 1 || decoded.numberOfChannels > 32) return {waveform: Object.freeze([])};
        const channels = Array.from({length: decoded.numberOfChannels}, (_, index) => decoded.getChannelData(index));
        const length = Math.min(...channels.map(channel => channel.length));
        if (!Number.isSafeInteger(length) || length < 1) return {durationMs, waveform: Object.freeze([])};
        const bucketCount = Math.min(256, length);
        const peaks = Array.from({length: bucketCount}, (_, bucket) => {
            const start = Math.floor(bucket * length / bucketCount);
            const end = Math.max(start + 1, Math.floor((bucket + 1) * length / bucketCount));
            let peak = 0;
            for (const channel of channels) {
                for (let index = start; index < end; index++) peak = Math.max(peak, Math.abs(channel[index] ?? 0));
            }
            return Number.isFinite(peak) ? Math.min(1, peak) : 0;
        });
        const maximum = Math.max(...peaks, 0);
        const waveform = peaks.map(peak => maximum > 0 && peak > 0 ? Math.max(1, Math.round(peak / maximum * 255)) : 0);
        return {durationMs, waveform: Object.freeze(waveform)};
    }
    catch {return {waveform: Object.freeze([])};}
    finally {if (context) await context.close().catch(() => {});}
}

export function normalizeSolcordVoiceDownloadUrl(value: unknown): string | undefined {
    if (typeof value !== "string" || value.length > 4_096) return;
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return;
        if (!SOLCORD_VOICE_DOWNLOAD_HOSTS.has(url.hostname.toLowerCase()) || !url.pathname.startsWith("/attachments/") || url.pathname.includes("\\")) return;
        return url.toString();
    }
    catch {return;}
}

/**
 * Discord renamed SpeakingStore#getSpeakingUsers to getSpeakers in app-1.0.9255.
 * Resolve only these two reviewed, zero-argument store shapes and preserve the
 * store receiver. Unknown shapes remain unavailable instead of being guessed.
 */
export function resolveSolcordSpeakingReader(store: SolcordSpeakingStoreShape | undefined): (() => unknown) | undefined {
    if (typeof store?.getSpeakingUsers === "function") return () => store.getSpeakingUsers!();
    if (typeof store?.getSpeakers === "function") return () => store.getSpeakers!();
}

/** Subscribe atomically and retain any failed remover for teardown retry. */
export function subscribeSolcordChangeStores(scope: SolcordDisposalScope, stores: readonly SolcordChangeStoreShape[], listener: () => void): () => void {
    const subscribed: SolcordChangeStoreShape[] = [];
    try {
        for (const store of stores) {
            store.addChangeListener(listener);
            subscribed.push(store);
        }
    }
    catch (error) {
        const cleanupErrors: unknown[] = [];
        for (const store of subscribed.reverse()) {
            try {store.removeChangeListener(listener);}
            catch (cleanupError) {
                scope.own(() => store.removeChangeListener(listener), "listener");
                cleanupErrors.push(cleanupError);
            }
        }
        if (cleanupErrors.length) throw new AggregateError([error, ...cleanupErrors], "Call Context subscription and rollback failed; listener cleanup remains owned for retry.");
        throw error;
    }
    return () => {
        const cleanupErrors: unknown[] = [];
        for (const store of subscribed.slice().reverse()) {
            try {store.removeChangeListener(listener);}
            catch (error) {cleanupErrors.push(error);}
        }
        if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Call Context listener cleanup failed.");
    };
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

export type SolcordVoiceNotePhase = "idle" | "requesting-permission" | "recording" | "processing" | "preview-ready";

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

function composerCharacterCount(editor: HTMLElement): number {
    const stripPlaceholders = (value: string): string => value
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
        .replace(/\r\n?/g, "\n");
    const nodeText = stripPlaceholders(editor.textContent ?? "");

    // Discord keeps structural line breaks and zero-width placeholders in an
    // untouched rich-text editor. They are layout, not a user-authored draft.
    if (!nodeText.replace(/[\s\u00A0]/g, "")) return 0;

    const renderedText = typeof editor.innerText === "string" ? editor.innerText : nodeText;
    return stripPlaceholders(renderedText).length;
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
export const SOLCORD_VOICE_NOTE_STOP_TIMEOUT_MS = 2_000;

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
    readonly #providerReadiness = new Map<string, boolean>();
    readonly #providerAvailability = new Map<string, boolean>();
    readonly #timestampTitles = new Map<HTMLElement, string | null>();
    readonly #timestampText = new Map<HTMLElement, string>();
    readonly #peopleDomOriginals = new Map<HTMLElement, {display: string; order: string; ariaLabel: string | null; title: string | null;}>();
    #composer?: SolcordComposerToolkitController;
    #call?: SolcordCallContextController;
    #audio?: SolcordAudioConsoleController;
    #voiceNote?: SolcordVoiceNoteStudioController;
    #translation?: SolcordTranslationDeskController;
    #localTranslation?: SolcordLocalTranslationEngine;
    #people?: SolcordPeopleSpacesController;
    #glance?: SolcordChannelGlanceController;
    #notifications?: SolcordNotificationReviewController;
    #motion?: SolcordMotionStudioController;
    #permissions?: SolcordPermissionLensController;
    #identityNotes?: SolcordLocalIdentityNotesController;
    #voiceHealth?: SolcordVoiceHealthController;
    #reviewedVolumeUserId?: string;
    #audioActionProven = false;
    #callReaderDrifted = false;
    #callSubscriptionDrifted = false;
    #recording?: RecordingState;
    #voicePromptGeneration = 0;
    #voicePromptPending = false;
    #voicePreviewPending = false;
    readonly #voiceStateListeners = new Set<(phase: SolcordVoiceNotePhase) => void>();
    #translationEndpoints = new Map<string, string>();
    #focusIds: string[] = [];
    #releaseFocusObserver?: () => void;
    #glanceTooltip?: HTMLElement;
    #peopleSyncQueued = false;
    #statusNotificationQueued = false;
    #started = false;
    #disposed = false;

    constructor(scope: SolcordDisposalScope, addons: Readonly<Record<string, boolean>>, adapter: SolcordNativeSuiteAdapter) {
        this.#scope = scope;
        this.#adapter = adapter;
        this.#enabled = enabledByFeature(addons);
    }

    start(): void {
        if (this.#disposed) throw new Error("Solcord native suite is disposed.");
        if (this.#started) return;
        this.#started = true;
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
        this.#setStatus("local-identity-notes", this.#adapter.identityNotesAvailable ? "ready" : "unsupported", this.#adapter.identityNotesAvailable ? "Account-private notes are stored only after review through encrypted storage or an explicit session-only fallback." : "The private storage bridge is unavailable on this client build; there is no additional user setup to complete.", []);
    }

    statuses(): SolcordNativeSuiteStatus[] {
        return [...this.#status.values()].map(status => structuredClone(status));
    }

    providerReady(name: string): boolean {
        return this.#providerReadiness.get(name) === true;
    }

    providerAvailable(name: string): boolean {
        return this.#providerAvailability.get(name) === true;
    }

    currentChannelId(): string | undefined {
        return this.#adapter.currentChannelId?.();
    }

    callSummary() {
        return this.#call?.summary();
    }

    voiceHealthSummary() {
        return this.#voiceHealth?.summary();
    }

    previewLocalVolume(userId: string, currentPercent: number, targetPercent: number) {
        if (!this.#audio || !this.#adapter.setLocalVolume) throw new Error("Audio Console is unavailable.");
        const readiness = this.localVolumeReviewState(userId);
        if (!readiness.ready) throw new Error(readiness.detail);
        const preview = this.#audio.previewVolume(userId, currentPercent, targetPercent);
        this.#reviewedVolumeUserId = preview.userId;
        return preview;
    }

    applyReviewedLocalVolume(): void {
        if (!this.#audio || !this.#adapter.setLocalVolume) throw new Error("Audio Console is unavailable.");
        const reviewedUserId = this.#reviewedVolumeUserId;
        const readiness = this.localVolumeReviewState(reviewedUserId ?? "");
        if (!reviewedUserId || !readiness.ready) {
            this.#reviewedVolumeUserId = undefined;
            throw new Error(readiness.detail);
        }
        try {
            const intent = this.#audio.confirmVolume();
            if (intent.payload.userId !== reviewedUserId) throw new Error("The reviewed volume target changed before apply.");
            this.#adapter.setLocalVolume(intent.payload.userId, intent.payload.volumePercent);
            this.#audioActionProven = true;
            const providers = this.#enabled.get("audio-console") ?? [];
            this.#setProviderReady("BetterVolume", providers.includes("BetterVolume"));
            this.#setStatus("audio-console", this.#callSubscriptionDrifted ? "degraded" : "ready", this.#callSubscriptionDrifted
                ? "The reviewed local-volume change succeeded, but Discord's call-change listener drifted. Every later action still revalidates its participant at click time."
                : "A user-reviewed local playback-volume change succeeded for a participant in the current call.", providers);
        }
        finally {this.#reviewedVolumeUserId = undefined;}
    }

    localVolumeReviewState(userId: string): {ready: boolean; detail: string;} {
        if (!this.#audio || !this.#adapter.setLocalVolume) return {ready: false, detail: "Audio Console is unavailable on this Discord build."};
        if (!isSolcordDiscordSnowflake(userId)) return {ready: false, detail: "Enter a complete Discord user ID (17 to 20 digits)."};
        let call: SolcordCallSnapshot | undefined;
        try {call = this.#adapter.currentCall?.();}
        catch {return {ready: false, detail: "Discord's current-call reader drifted; Audio Console stayed off."};}
        if (!call) return {ready: false, detail: "Waiting for a connected call."};
        const participantIds = call.participantIds;
        if (!Array.isArray(participantIds) || participantIds.some(id => !isSolcordDiscordSnowflake(id))) {
            return {ready: false, detail: "Discord's current participant list could not be validated."};
        }
        if (!participantIds.includes(userId)) return {ready: false, detail: "That user is not in the current call."};
        return {ready: true, detail: "Ready to review a local playback-volume change for this call participant."};
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
        if (this.#adapter.externalProvidersAllowed?.() !== true) {
            throw new Error("Strict Privacy blocks external translation providers. Allow external providers in Privacy & Safety before translating.");
        }
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
    unpinDm(id: string): void {if (!this.#people) throw new Error("People and Spaces is unavailable."); this.#people.unpinDm(id); this.#savePeople();}
    hideGuild(id: string): void {if (!this.#people) throw new Error("People and Spaces is unavailable."); this.#people.hideGuild(id); this.#savePeople();}
    showGuild(id: string): void {if (!this.#people) throw new Error("People and Spaces is unavailable."); this.#people.showGuild(id); this.#savePeople();}
    aliasGuild(id: string, alias: string): void {if (!this.#people) throw new Error("People and Spaces is unavailable."); this.#people.aliasGuild(id, alias); this.#savePeople();}
    clearGuildAlias(id: string): void {if (!this.#people) throw new Error("People and Spaces is unavailable."); this.#people.clearGuildAlias(id); this.#savePeople();}
    favoriteFriend(id: string): void {if (!this.#people) throw new Error("People and Spaces is unavailable."); this.#people.favoriteFriend(id); this.#savePeople();}
    unfavoriteFriend(id: string): void {if (!this.#people) throw new Error("People and Spaces is unavailable."); this.#people.unfavoriteFriend(id); this.#savePeople();}
    hideFriend(id: string): void {if (!this.#people) throw new Error("People and Spaces is unavailable."); this.#people.hideFriend(id); this.#savePeople();}
    showFriend(id: string): void {if (!this.#people) throw new Error("People and Spaces is unavailable."); this.#people.showFriend(id); this.#savePeople();}
    ignoreVoiceChannel(id: string): void {if (!this.#people) throw new Error("People and Spaces is unavailable."); this.#people.ignoreVoiceChannel(id); this.#savePeople(); this.#renderCallPresence(Boolean(this.#call?.summary().connected));}
    includeVoiceChannel(id: string): void {if (!this.#people) throw new Error("People and Spaces is unavailable."); this.#people.includeVoiceChannel(id); this.#savePeople(); this.#renderCallPresence(Boolean(this.#call?.summary().connected));}
    ignoreVoiceGuild(id: string): void {if (!this.#people) throw new Error("People and Spaces is unavailable."); this.#people.ignoreVoiceGuild(id); this.#savePeople(); this.#renderCallPresence(Boolean(this.#call?.summary().connected));}
    includeVoiceGuild(id: string): void {if (!this.#people) throw new Error("People and Spaces is unavailable."); this.#people.includeVoiceGuild(id); this.#savePeople(); this.#renderCallPresence(Boolean(this.#call?.summary().connected));}
    currentVoiceContext() {return this.#adapter.currentVoiceContext?.();}
    peopleSnapshot() {return this.#people?.snapshot();}

    loadedFriendList(query = "", sort: "name" | "status" = "name", category: "visible" | "favorites" | "hidden" | "blocked" | "incoming" | "outgoing" | "ignored" = "visible"): Array<{id: string; label: string; status: "online" | "idle" | "dnd" | "offline" | "unknown"; relationship: "friend" | "blocked" | "incoming" | "outgoing" | "ignored"; favorite: boolean; hidden: boolean; relationshipSince?: number; mutualGuildCount?: number;}> {
        if (!this.#people || !this.#adapter.loadedFriends) throw new Error("Better Friend List is unavailable.");
        const normalizedQuery = query.trim().toLocaleLowerCase().slice(0, 80);
        const statusRank = {online: 0, idle: 1, dnd: 2, offline: 3, unknown: 4} as const;
        const state = this.#people.snapshot();
        const favorites = new Set(state.favoriteFriendIds);
        const hidden = new Set(state.hiddenFriendIds);
        const peoplePreferences = this.#adapter.peoplePreferences ?? {showRelationshipDates: true, showMutualGuildCounts: true, pinIcon: true, pinUnreadAmount: true, pinChannelAmount: true, sortPinnedByRecent: false, serverHiderStreamOnly: false, pinCategories: {friends: true, groups: true, bots: true, blocked: true, others: true}};
        return this.#adapter.loadedFriends().slice(0, 1_000)
            .map(friend => ({
                ...friend,
                relationshipSince: peoplePreferences.showRelationshipDates ? friend.relationshipSince : undefined,
                mutualGuildCount: peoplePreferences.showMutualGuildCounts ? friend.mutualGuildCount : undefined,
                relationship: friend.relationship ?? "friend" as const,
                favorite: favorites.has(friend.id),
                hidden: hidden.has(friend.id)
            }))
            .filter(friend => category === "favorites" ? friend.relationship === "friend" && friend.favorite
                : category === "hidden" ? friend.relationship === "friend" && friend.hidden
                    : category === "visible" ? friend.relationship === "friend" && !friend.hidden
                        : friend.relationship === category)
            .filter(friend => !normalizedQuery || friend.label.toLocaleLowerCase().includes(normalizedQuery))
            .sort((left, right) => Number(right.favorite) - Number(left.favorite) || (sort === "status"
                ? statusRank[left.status] - statusRank[right.status] || left.label.localeCompare(right.label, "en-US")
                : left.label.localeCompare(right.label, "en-US") || statusRank[left.status] - statusRank[right.status]));
    }

    localTranslationState(): Readonly<SolcordLocalTranslationSnapshot> {
        return this.#localTranslation?.snapshot() ?? Object.freeze({phase: "unsupported", progress: 0, queued: 0, completed: 0, failed: 0, canceled: 0, lastResult: "unavailable", containsPlaintext: false});
    }

    subscribeLocalTranslation(listener: (snapshot: Readonly<SolcordLocalTranslationSnapshot>) => void): () => void {
        return this.#localTranslation?.subscribe(listener) ?? (() => {});
    }

    localTranslationAvailability(sourceLanguage: string, targetLanguage: string, signal?: AbortSignal): Promise<SolcordLocalTranslationAvailability> {
        if (!this.#translation || !this.#localTranslation) return Promise.resolve("unavailable");
        return this.#localTranslation.availability(sourceLanguage, targetLanguage, signal);
    }

    translateLocally(sourceLanguage: string, targetLanguage: string, text: string, signal?: AbortSignal): Promise<string> {
        if (!this.#translation || !this.#localTranslation) return Promise.reject(new Error("On-device Translation Desk is unavailable."));
        return this.#localTranslation.translate(sourceLanguage, targetLanguage, text, signal);
    }

    cancelLocalTranslations(): void {
        this.#localTranslation?.cancelAll();
    }

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
        this.#synchronizeFocusChannels(normalized);
    }

    async beginVoiceNoteFromUserGesture(): Promise<{recordingId: string;}> {
        if (!this.#voiceNote || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder !== "function") throw new Error("Voice Note Studio is unavailable.");
        if (this.#voicePromptPending || this.#recording) throw new Error("A voice-note recording is already active.");
        const generation = ++this.#voicePromptGeneration;
        let stream: MediaStream | undefined;
        let recording: RecordingState | undefined;
        this.#voicePromptPending = true;
        this.#emitVoiceNotePhase();
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
            this.#emitVoiceNotePhase();
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
            if (generation === this.#voicePromptGeneration) {
                this.#voicePromptPending = false;
                this.#emitVoiceNotePhase();
            }
        }
    }

    stopVoiceNoteForPreview(): Promise<{recordingId: string; durationMs: number; sizeBytes: number; mime: "audio/ogg" | "audio/webm"; waveform: readonly number[]; url: string;}> {
        const recording = this.#recording;
        if (!recording || recording.recorder.state === "inactive" || !this.#voiceNote) return Promise.reject(new Error("No voice-note recording is active."));
        this.#clearVoiceNoteTimer(recording);
        this.#voicePreviewPending = true;
        this.#emitVoiceNotePhase();
        return new Promise((resolve, reject) => {
            let settled = false;
            let watchdog = 0;
            const cleanup = () => {
                globalThis.clearTimeout(watchdog);
                recording.recorder.removeEventListener("stop", finish);
                recording.recorder.removeEventListener("error", failFromRecorder);
            };
            const fail = (error: Error) => {
                if (settled) return;
                settled = true;
                cleanup();
                this.#abortVoiceNoteRecording(recording, error);
                reject(error);
            };
            const failFromRecorder = () => fail(recording.abortError ?? new Error("Voice-note recording failed while stopping."));
            const finish = async () => {
                if (settled) return;
                settled = true;
                cleanup();
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
                    const analysis = await analyzeSolcordVoiceNote(blob);
                    const durationMs = Math.max(200, Math.min(SOLCORD_VOICE_NOTE_MAX_DURATION_MS, analysis.durationMs ?? Date.now() - recording.startedAt));
                    const preview = this.#voiceNote!.attachPreview({recordingId: recording.id, durationMs, sizeBytes: blob.size, mime, waveform: analysis.waveform});
                    const providers = this.#enabled.get("voice-note-studio") ?? [];
                    const nativeHandoffReady = typeof this.#adapter.prepareVoiceNoteUpload === "function";
                    const localFileReady = typeof this.#adapter.saveVoiceNoteFile === "function";
                    this.#setProviderReady("VoiceMessages", providers.includes("VoiceMessages") && (nativeHandoffReady || localFileReady));
                    this.#setStatus("voice-note-studio", "ready", nativeHandoffReady
                        ? "A local recording produced a reviewed preview; Discord's normal composer handoff is ready and still requires an explicit send."
                        : "A local recording produced a reviewed preview. Save the local file explicitly, then attach it through Discord's ordinary composer.", providers);
                    this.#voicePreviewPending = false;
                    this.#emitVoiceNotePhase();
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
            recording.recorder.addEventListener("error", failFromRecorder, {once: true});
            watchdog = globalThis.setTimeout(() => fail(new Error("Voice-note recorder did not finish stopping.")), SOLCORD_VOICE_NOTE_STOP_TIMEOUT_MS) as unknown as number;
            try {recording.recorder.stop(); this.#emitVoiceNotePhase();}
            catch (error) {
                const failure = error instanceof Error ? error : new Error("Voice-note recording failed to stop.");
                fail(failure);
            }
        });
    }

    voiceNoteBlob(recordingId: string): Blob | undefined {
        return this.#recording?.id === recordingId ? this.#recording.blob : undefined;
    }

    voiceNotePhase(): SolcordVoiceNotePhase {
        if (this.#voicePromptPending) return "requesting-permission";
        if (!this.#recording) return "idle";
        if (this.#voicePreviewPending) return "processing";
        if (this.#recording.blob) return "preview-ready";
        return this.#recording.recorder.state === "inactive" ? "processing" : "recording";
    }

    subscribeVoiceNotePhase(listener: (phase: SolcordVoiceNotePhase) => void): () => void {
        this.#voiceStateListeners.add(listener);
        return () => this.#voiceStateListeners.delete(listener);
    }

    voiceNoteDeliveryMode(): "discord-composer" | "local-file" | "unavailable" {
        if (this.#adapter.prepareVoiceNoteUpload) return "discord-composer";
        if (this.#adapter.saveVoiceNoteFile) return "local-file";
        return "unavailable";
    }

    prepareReviewedVoiceNoteUpload(channelId: string): void {
        const recording = this.#recording;
        if (!recording?.blob || !this.#voiceNote || !this.#adapter.prepareVoiceNoteUpload) throw new Error("The reviewed voice note or native upload adapter is unavailable.");
        const intent = this.#voiceNote.confirmUpload(channelId);
        if (Date.now() > intent.expiresAt || intent.payload.recordingId !== recording.id) throw new Error("Voice-note upload confirmation expired.");
        const mime = intent.payload.mime === "audio/ogg" ? "audio/ogg" as const : "audio/webm" as const;
        const file = this.#reviewedVoiceNoteFile(recording, mime);
        this.#adapter.prepareVoiceNoteUpload(intent.payload.channelId, file, {durationMs: intent.payload.durationMs, waveform: intent.payload.waveform});
        this.#voiceNote.completeUpload(intent.payload.recordingId);
        this.cancelVoiceNote();
        this.#reviewedVolumeUserId = undefined;
    }

    saveReviewedVoiceNoteFile(): void {
        const recording = this.#recording;
        if (!recording?.blob || !this.#voiceNote || !this.#adapter.saveVoiceNoteFile) throw new Error("The reviewed voice note or local-file fallback is unavailable.");
        const mime = recording.blob.type === "audio/ogg" ? "audio/ogg" as const : "audio/webm" as const;
        this.#adapter.saveVoiceNoteFile(this.#reviewedVoiceNoteFile(recording, mime));
        this.#voiceNote.completeUpload(recording.id);
        this.cancelVoiceNote();
    }

    cancelVoiceNote(): void {
        ++this.#voicePromptGeneration;
        this.#voicePromptPending = false;
        this.#voicePreviewPending = false;
        const recording = this.#recording;
        if (recording) {
            this.#abortVoiceNoteRecording(recording, new Error("Voice-note recording was canceled."));
        }
        else {
            this.#voiceNote?.cancel();
            this.#emitVoiceNotePhase();
        }
    }

    dispose(): void {
        if (this.#disposed) return;
        this.#disposed = true;
        this.cancelVoiceNote();
        this.#translationEndpoints.clear();
        this.#localTranslation?.dispose();
        this.#localTranslation = undefined;
        this.#restorePeopleDom();
        this.#restoreTimestampTitles();
        this.#glanceTooltip?.remove();
        this.#glanceTooltip = undefined;
        for (const controller of [this.#composer, this.#call, this.#audio, this.#voiceNote, this.#translation, this.#people, this.#glance, this.#notifications, this.#motion, this.#permissions, this.#identityNotes, this.#voiceHealth]) {
            try {controller?.dispose();}
            catch {/* the owning Solcord scope still disposes every external resource */}
        }
        this.#status.clear();
        this.#providerReadiness.clear();
        this.#providerAvailability.clear();
        this.#voiceStateListeners.clear();
        this.#audioActionProven = false;
        this.#callReaderDrifted = false;
        this.#callSubscriptionDrifted = false;
        this.#statusNotificationQueued = false;
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

    #reviewedVoiceNoteFile(recording: RecordingState, mime: "audio/ogg" | "audio/webm"): File {
        const extension = mime === "audio/ogg" ? "ogg" : "webm";
        const name = this.#adapter.voiceNotePreferences?.stripMetadata === true ? `voice-note.${extension}` : `Solcord-voice-note-${Date.now().toString(36)}.${extension}`;
        return new File([recording.blob!], name, {type: mime});
    }

    #abortVoiceNoteRecording(recording: RecordingState, error: Error): void {
        if (recording.abortError) return;
        recording.abortError = error;
        this.#clearVoiceNoteTimer(recording);
        this.#voicePreviewPending = false;
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
        this.#emitVoiceNotePhase();
    }

    #emitVoiceNotePhase(): void {
        const phase = this.voiceNotePhase();
        for (const listener of this.#voiceStateListeners) {
            try {listener(phase);}
            catch {/* UI state listeners cannot interrupt recorder cleanup */}
        }
    }

    #startComposer(): void {
        const providers = this.#enabled.get("composer-toolkit") ?? [];
        this.#setProvidersReady(providers, false);
        if (!providers.length) return this.#setStatus("composer-toolkit", "off", "Turn on a Composer Toolkit feature to load its local controls.", []);
        this.#composer = new SolcordComposerToolkitController();
        const counterWarningPercent = Math.max(50, Math.min(100, Math.floor(this.#adapter.composerPreferences?.counterWarningPercent ?? 80)));
        const timestampFormat = this.#adapter.composerPreferences?.timestampFormat ?? "full";
        const timestampPreferences = this.#adapter.timestampPreferences ?? {chat: true, embeds: true, markup: true, auditLogs: true, chatTooltips: true, editedTooltips: true, markupTooltips: true};
        const timestampSurface = (element: HTMLElement): "embed" | "audit" | "edited" | "chat" | "markup" => {
            if (element.closest("[class*='embed']")) return "embed";
            if (element.closest("[class*='auditLog'], [class*='audit_log']")) return "audit";
            if (element.closest("[class*='edited']")) return "edited";
            if (element.closest("[class*='message']")) return "chat";
            return "markup";
        };
        const placeEnabled = (surface: ReturnType<typeof timestampSurface>): boolean => surface === "embed" ? timestampPreferences.embeds : surface === "audit" ? timestampPreferences.auditLogs : surface === "markup" ? timestampPreferences.markup : timestampPreferences.chat;
        const tooltipEnabled = (surface: ReturnType<typeof timestampSurface>): boolean => surface === "edited" ? timestampPreferences.editedTooltips : surface === "markup" ? timestampPreferences.markupTooltips : timestampPreferences.chatTooltips;
        const updateCounter = (counter: HTMLElement, text: string, warning: boolean, overLimit: boolean): void => {
            if (counter.textContent !== text) counter.textContent = text;
            const warningValue = String(warning);
            const overLimitValue = String(overLimit);
            if (counter.dataset.warning !== warningValue) counter.dataset.warning = warningValue;
            if (counter.dataset.overLimit !== overLimitValue) counter.dataset.overLimit = overLimitValue;
        };
        const sync = () => {
            if (providers.includes("CharCounter")) {
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
                    const length = composerCharacterCount(editor);
                    updateCounter(counter, `${length.toLocaleString("en-US")} / 2,000`, length >= 2_000 * (counterWarningPercent / 100), length > 2_000);
                }
                for (const field of document.querySelectorAll<HTMLTextAreaElement>("textarea[maxlength]")) {
                    const maximum = field.maxLength;
                    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 64_000) continue;
                    let counter = field.nextElementSibling instanceof HTMLElement && field.nextElementSibling.dataset.solcordInputCount === "true"
                        ? field.nextElementSibling
                        : undefined;
                    if (!counter) {
                        counter = document.createElement("span");
                        counter.dataset.solcordInputCount = "true";
                        counter.className = "solcord-input-count";
                        counter.setAttribute("aria-live", "polite");
                        field.insertAdjacentElement("afterend", counter);
                    }
                    const length = field.value.length;
                    updateCounter(counter, `${length.toLocaleString("en-US")} / ${maximum.toLocaleString("en-US")}`, length >= maximum * (counterWarningPercent / 100), length > maximum);
                }
            }
            if (!providers.includes("CompleteTimestamps")) return;
            for (const element of document.querySelectorAll<HTMLElement>("time[datetime]:not([data-solcord-complete-time])")) {
                const date = new Date(element.getAttribute("datetime") ?? "");
                if (!Number.isNaN(date.valueOf())) {
                    const surface = timestampSurface(element);
                    if (!placeEnabled(surface) && !tooltipEnabled(surface)) continue;
                    if (!this.#timestampTitles.has(element)) this.#timestampTitles.set(element, element.getAttribute("title"));
                    element.dataset.solcordCompleteTime = "true";
                    if (tooltipEnabled(surface)) {
                        element.title = timestampFormat === "iso"
                            ? date.toISOString()
                            : timestampFormat === "compact"
                                ? date.toLocaleString(undefined, {dateStyle: "short", timeStyle: "short"})
                                : date.toLocaleString(undefined, {dateStyle: "full", timeStyle: "long"});
                    }
                    if (placeEnabled(surface)) {
                        if (!this.#timestampText.has(element)) this.#timestampText.set(element, element.textContent ?? "");
                        element.textContent = timestampFormat === "iso"
                            ? date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC")
                            : date.toLocaleString(undefined, {dateStyle: timestampFormat === "compact" ? "short" : "medium", timeStyle: timestampFormat === "compact" ? "short" : "medium"});
                    }
                }
            }
        };
        const observer = new MutationObserver(sync);
        // Editor input events cover text changes. Observing every character-data mutation
        // also observes the counter's own text and can create a renderer-saturating loop.
        this.#scope.observe(observer, document.body, {childList: true, subtree: true});
        if (providers.includes("CharCounter")) this.#scope.listen(document, "input", sync);
        this.#scope.own(() => document.querySelectorAll("[data-solcord-composer-count],[data-solcord-input-count]").forEach(element => element.remove()), "element");
        this.#scope.own(() => this.#restoreTimestampTitles(), "element");
        sync();
        this.#setProviderReady("CharCounter", providers.includes("CharCounter"));
        this.#setProviderReady("CompleteTimestamps", providers.includes("CompleteTimestamps"));
        this.#setStatus("composer-toolkit", "ready", "Character count, complete local timestamps, guarded splitting, and native reply composition are active without sending.", providers);
    }

    #startCallContext(): void {
        const providers = this.#enabled.get("call-context") ?? [];
        this.#setProvidersReady(providers, false);
        if (!providers.length) {
            this.#setStatus("call-context", "off", "Turn on a Call Context feature to load it.", []);
            return;
        }
        if (!this.#adapter.currentCall || !this.#adapter.subscribeCall) {
            this.#callReaderDrifted = true;
            this.#setStatus("call-context", "unsupported", "This Discord build did not expose the required observable call stores.", providers);
            return;
        }
        this.#setProviderAvailable("CallTimeCounter", providers.includes("CallTimeCounter"));
        this.#setProviderAvailable("VoiceActivity", providers.includes("VoiceActivity") && this.#adapter.voiceActivityAvailable === true);
        this.#setProviderAvailable("ShowSpectators", providers.includes("ShowSpectators") && this.#adapter.spectatorsAvailable === true);
        this.#call = new SolcordCallContextController();
        this.#scope.own(() => document.querySelector("[data-solcord-call-badge]")?.remove(), "element");
        let releaseSubscription: (() => void) | undefined;
        let adapterFailed = false;
        const updateStatus = (connected: boolean) => {
            const callTimeReady = connected && providers.includes("CallTimeCounter");
            const voiceActivityReady = connected && providers.includes("VoiceActivity") && this.#adapter.voiceActivityAvailable === true;
            let spectatorsReady = false;
            if (connected && providers.includes("ShowSpectators") && this.#adapter.spectatorsAvailable === true) {
                try {spectatorsReady = this.#adapter.spectatorsReady?.() === true;}
                catch {spectatorsReady = false;}
            }
            this.#setProviderReady("CallTimeCounter", callTimeReady);
            this.#setProviderReady("VoiceActivity", voiceActivityReady);
            this.#setProviderReady("ShowSpectators", spectatorsReady);
            const unavailable = providers.filter(provider => this.#providerAvailability.get(provider) !== true);
            if (unavailable.length) {
                this.#setStatus("call-context", "degraded", `${unavailable.join(" and ")} could not validate its Discord adapter. The remaining call tools stay available.`, providers);
                return;
            }
            if (!connected) {
                this.#setStatus("call-context", "ready", "Ready — connect to a call to show duration, speaking, and viewer context.", providers);
                return;
            }
            const missing = providers.filter(provider => this.#providerReadiness.get(provider) !== true);
            this.#setStatus("call-context", "ready", missing.length
                ? `Ready — ${missing.join(" and ")} will appear when its matching speaking or stream-viewer context exists.`
                : "A live call snapshot proved duration, speaking presence, and exposed stream viewers using loaded stores only.", providers);
        };
        const sync = () => {
            if (adapterFailed) return;
            try {
                const value = this.#adapter.currentCall?.();
                if (value) this.#call?.observe(value);
                else this.#call?.clear();
                updateStatus(Boolean(value));
                this.#updateAudioConsoleCallState(value);
                this.#renderCallBadge(Boolean(value));
                this.#renderCallPresence(Boolean(value));
            }
            catch {
                adapterFailed = true;
                this.#callReaderDrifted = true;
                this.#setProvidersAvailable(providers, false);
                this.#setProvidersReady(providers, false);
                if (this.#audio) {
                    this.#setProviderAvailable("BetterVolume", false);
                    this.#setProviderReady("BetterVolume", false);
                    this.#setStatus("audio-console", "unsupported", "Discord's current-call reader drifted; Audio Console stopped without changing local playback.", this.#enabled.get("audio-console") ?? []);
                }
                try {releaseSubscription?.();}
                catch {/* The owning disposal scope retains cleanup ownership. */}
                releaseSubscription = undefined;
                this.#call?.clear();
                this.#renderCallBadge(false);
                this.#renderCallPresence(false);
                this.#setStatus("call-context", "unsupported", "Discord's live call snapshot drifted; Call Context stopped without affecting voice or navigation.", providers);
            }
        };
        try {
            const unsubscribe = this.#adapter.subscribeCall?.(sync);
            if (unsubscribe) releaseSubscription = this.#scope.own(unsubscribe, "listener");
            if (providers.includes("CallTimeCounter")) this.#scope.interval(() => this.#renderCallBadge(Boolean(this.#call?.summary().connected)), 1_000);
            if (providers.includes("VoiceActivity") && this.#adapter.voiceActivityAvailable) {
                const observer = new MutationObserver(() => this.#renderCallPresence(Boolean(this.#call?.summary().connected)));
                this.#scope.observe(observer, document.body, {childList: true, subtree: true});
                this.#scope.own(() => document.querySelectorAll("[data-solcord-voice-presence]").forEach(element => element.remove()), "element");
            }
            sync();
        }
        catch (error) {
            this.#callSubscriptionDrifted = true;
            let cleanupIncomplete = error instanceof AggregateError && error.message.includes("cleanup remains owned for retry");
            if (releaseSubscription) {
                try {releaseSubscription();}
                catch {cleanupIncomplete = true;}
            }
            this.#call = undefined;
            this.#setProvidersAvailable(providers, false);
            this.#setProvidersReady(providers, false);
            document.querySelector("[data-solcord-call-badge]")?.remove();
            this.#setStatus("call-context", cleanupIncomplete ? "degraded" : "unsupported", cleanupIncomplete
                ? "Call Context stayed off, but one listener cleanup is incomplete and remains owned for automatic retry."
                : "Discord's call-store subscription failed safely; unrelated Solcord tools remain available.", providers);
        }
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
        const totalSeconds = Math.floor(summary.elapsedMs / 1_000);
        const elapsed = `${String(Math.floor(totalSeconds / 3_600)).padStart(2, "0")}:${String(Math.floor(totalSeconds / 60) % 60).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
        const viewers = summary.viewerLabels.length ? ` · Watching: ${summary.viewerLabels.slice(0, 3).join(", ")}${summary.viewerLabels.length > 3 ? ` +${summary.viewerLabels.length - 3}` : ""}` : (summary.viewerCount ? ` · ${summary.viewerCount} watching` : "");
        badge.textContent = `${elapsed} · ${summary.participantCount} in call · ${summary.speakerCount} speaking${viewers}`;
        host.prepend(badge);
    }

    #renderCallPresence(connected: boolean): void {
        const existing = new Map<HTMLElement, HTMLElement>();
        for (const badge of document.querySelectorAll<HTMLElement>("[data-solcord-voice-presence]")) {
            const host = badge.parentElement;
            if (host) existing.set(host, badge);
            else badge.remove();
        }
        const removeUnused = (): void => existing.forEach(badge => badge.remove());
        if (!connected || !this.#providerReadiness.get("VoiceActivity")) return removeUnused();
        const summary = this.#call?.summary();
        if (!summary?.connected || !summary.participantIds.length) return removeUnused();
        const context = this.#adapter.currentVoiceContext?.();
        const peopleState = this.#people?.snapshot() ?? {
            ignoredVoiceChannelIds: this.#adapter.peopleState?.ignoredVoiceChannelIds ?? [],
            ignoredVoiceGuildIds: this.#adapter.peopleState?.ignoredVoiceGuildIds ?? []
        };
        if (context && (peopleState?.ignoredVoiceChannelIds.includes(context.channelId) || Boolean(context.guildId && peopleState?.ignoredVoiceGuildIds.includes(context.guildId)))) return removeUnused();
        const participants = new Set(summary.participantIds);
        const speakers = new Set(summary.speakerIds);
        const preferences = this.#adapter.voiceActivityPreferences ?? {memberList: true, dmList: true, peopleList: true, highlightCurrentChannel: true, statusIcons: true, currentUser: true};
        for (const host of document.querySelectorAll<HTMLElement>("[data-user-id], [data-list-item-id*='members-'], [data-list-item-id*='voice'], [data-list-item-id*='private-channels'], [data-list-item-id*='people']")) {
            const identity = host.dataset.userId ?? host.dataset.listItemId ?? "";
            const userId = identity.match(/(?:^|\D)(\d{1,32})(?:\D|$)/)?.[1];
            if (!userId || !participants.has(userId)) continue;
            const listIdentity = (host.dataset.listItemId ?? "").toLocaleLowerCase();
            const isMember = listIdentity.includes("members-") || Boolean(host.closest("[class*='membersWrap'], [class*='members_']"));
            const isDm = listIdentity.includes("private-channels") || Boolean(host.closest("[class*='privateChannels'], [class*='private_channels']"));
            const isPeople = listIdentity.includes("people") || Boolean(host.closest("[class*='peopleList'], [class*='people_list']"));
            if ((isMember && !preferences.memberList) || (isDm && !preferences.dmList) || (isPeople && !preferences.peopleList)) continue;
            if (userId === this.#adapter.voiceActivityCurrentUserId && !preferences.currentUser) continue;
            const speaking = speakers.has(userId);
            const presence = speaking && preferences.statusIcons ? "speaking" : "connected";
            const label = speaking && preferences.statusIcons ? "Speaking" : "In voice";
            const ariaLabel = speaking && preferences.statusIcons ? "Speaking in the current call" : "Connected to the current call";
            const badge = existing.get(host) ?? document.createElement("span");
            existing.delete(host);
            if (badge.dataset.solcordVoicePresence !== presence) badge.dataset.solcordVoicePresence = presence;
            const currentCall = String(preferences.highlightCurrentChannel);
            if (badge.dataset.currentCall !== currentCall) badge.dataset.currentCall = currentCall;
            if (badge.className !== "solcord-voice-presence") badge.className = "solcord-voice-presence";
            if (badge.textContent !== label) badge.textContent = label;
            if (badge.getAttribute("aria-label") !== ariaLabel) badge.setAttribute("aria-label", ariaLabel);
            if (!badge.isConnected) host.append(badge);
        }
        removeUnused();
    }

    #startAudioConsole(): void {
        const providers = this.#enabled.get("audio-console") ?? [];
        this.#setProvidersReady(providers, false);
        if (!providers.length) {
            this.#setStatus("audio-console", "off", "Turn on Audio Console to load local volume controls.", []);
            return;
        }
        this.#audio = new SolcordAudioConsoleController();
        const capability = this.#adapter.localVolumeCapability ?? (this.#adapter.setLocalVolume ? "available" : "unavailable");
        this.#setProviderReady("BetterVolume", false);
        if (capability === "unavailable" || !this.#adapter.currentCall) {
            this.#setStatus("audio-console", "unsupported", this.#adapter.localVolumeCapabilityDetail ?? "This Discord build did not expose a validated local-volume action.", providers);
            return;
        }
        if (this.#callReaderDrifted) {
            this.#setStatus("audio-console", "unsupported", "Discord's current-call reader already failed structural validation; Audio Console stayed off without changing local playback.", providers);
            return;
        }
        this.#setProviderAvailable("BetterVolume", providers.includes("BetterVolume"));
        let subscriptionDrifted = this.#callSubscriptionDrifted;
        const synchronize = () => {
            try {
                this.#setProviderAvailable("BetterVolume", providers.includes("BetterVolume"));
                this.#updateAudioConsoleCallState(this.#adapter.currentCall?.());
            }
            catch {
                this.#callReaderDrifted = true;
                this.#setProviderAvailable("BetterVolume", false);
                this.#setProviderReady("BetterVolume", false);
                this.#setStatus("audio-console", "unsupported", "Discord's current-call reader drifted; Audio Console stopped without changing local playback.", providers);
            }
        };
        if (!(this.#enabled.get("call-context")?.length) && this.#adapter.subscribeCall) {
            try {
                const unsubscribe = this.#adapter.subscribeCall(synchronize);
                if (unsubscribe) this.#scope.own(unsubscribe, "listener");
            }
            catch {
                subscriptionDrifted = true;
                this.#callSubscriptionDrifted = true;
            }
        }
        synchronize();
        if (subscriptionDrifted && this.#providerAvailability.get("BetterVolume") === true) {
            this.#setStatus("audio-console", "degraded", "Available with click-time validation — Discord's call-change subscription drifted, so every action rechecks the current participant before applying.", providers);
        }
    }

    #updateAudioConsoleCallState(call: SolcordCallSnapshot | undefined): void {
        if (!this.#audio || !this.#adapter.setLocalVolume) return;
        const providers = this.#enabled.get("audio-console") ?? [];
        if (!call) {
            this.#setProviderReady("BetterVolume", false);
            this.#setStatus("audio-console", "ready", "Ready — connect to a call and choose a participant before applying a local-volume change.", providers);
            return;
        }
        const participantIds = Array.isArray(call.participantIds) ? call.participantIds.filter(isSolcordDiscordSnowflake) : [];
        if (!participantIds.length) {
            this.#setProviderReady("BetterVolume", false);
            this.#setStatus("audio-console", "degraded", "Connected, but Discord did not expose a validated participant target for local playback controls.", providers);
            return;
        }
        this.#setProviderReady("BetterVolume", this.#audioActionProven);
        this.#setStatus("audio-console", "ready", this.#audioActionProven
            ? "A reviewed local playback-volume change succeeded; every later action still revalidates the current participant."
            : "Ready — enter a current participant's complete Discord user ID to review a local playback-volume change.", providers);
    }

    #startVoiceNoteStudio(): void {
        const providers = this.#enabled.get("voice-note-studio") ?? [];
        this.#setProvidersReady(providers, false);
        if (!providers.length) {
            this.#setStatus("voice-note-studio", "off", "Turn on Voice Note Studio to load recording controls.", []);
            return;
        }
        const captureCapability = this.#adapter.voiceNoteCaptureCapability ?? (typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder === "function" ? "available" : "unavailable");
        const recordingAvailable = captureCapability === "ready" || captureCapability === "available";
        const uploadAvailable = typeof this.#adapter.prepareVoiceNoteUpload === "function";
        const localSaveAvailable = typeof this.#adapter.saveVoiceNoteFile === "function";
        if (!recordingAvailable || (!uploadAvailable && !localSaveAvailable)) {
            const missing = [!recordingAvailable ? "recording APIs" : "", !uploadAvailable && !localSaveAvailable ? "a reviewed delivery handoff" : ""].filter(Boolean).join(" and ");
            this.#setStatus("voice-note-studio", "unsupported", `This Discord build did not expose ${missing}.`, providers);
            return;
        }
        this.#voiceNote = new SolcordVoiceNoteStudioController();
        this.#setProviderAvailable("VoiceMessages", providers.includes("VoiceMessages"));
        if (this.#adapter.voiceNotePreferences?.downloadButton !== false) this.#installVoiceDownloadLinks();
        this.#setProviderReady("VoiceMessages", providers.includes("VoiceMessages"));
        this.#setStatus("voice-note-studio", "ready", this.#adapter.voiceNoteCaptureDetail ?? (uploadAvailable
            ? "Ready — record, preview, cancel, then open Discord's ordinary upload composer. Sending is always explicit."
            : "Ready — record, preview, cancel, then save a local file to attach manually."), providers);
    }

    #installVoiceDownloadLinks(): void {
        const sync = () => {
            for (const audio of document.querySelectorAll<HTMLAudioElement>("audio[src]")) {
                const container = audio.closest<HTMLElement>("[class*='voiceMessage'], [class*='voice_message'], [data-solcord-voice-message]");
                if (!container || container.querySelector(":scope [data-solcord-voice-download]")) continue;
                const url = normalizeSolcordVoiceDownloadUrl(audio.currentSrc || audio.src);
                if (!url) continue;
                const anchor = document.createElement("a");
                anchor.dataset.solcordVoiceDownload = "true";
                anchor.className = "solcord-voice-download";
                anchor.href = url;
                anchor.download = "voice-message.ogg";
                anchor.textContent = "Download";
                anchor.setAttribute("aria-label", "Download this loaded voice message");
                anchor.addEventListener("click", event => event.stopPropagation());
                container.append(anchor);
            }
        };
        const observer = new MutationObserver(sync);
        this.#scope.observe(observer, document.body, {childList: true, subtree: true});
        this.#scope.style("solcord-voice-download", ".solcord-voice-download{display:inline-flex;align-items:center;min-height:24px;margin-inline-start:8px;padding:2px 7px;border-radius:4px;color:var(--interactive-normal);font-size:12px;font-weight:600;text-decoration:none}.solcord-voice-download:hover,.solcord-voice-download:focus-visible{background:var(--background-modifier-hover);color:var(--interactive-hover);text-decoration:none}.solcord-voice-download:focus-visible{outline:2px solid var(--focus-primary);outline-offset:2px}");
        this.#scope.own(() => document.querySelectorAll("[data-solcord-voice-download]").forEach(element => element.remove()), "element");
        sync();
    }

    #startTranslationDesk(): void {
        const providers = this.#enabled.get("translation-desk") ?? [];
        this.#setProvidersReady(providers, false);
        if (!providers.length) {
            this.#setStatus("translation-desk", "off", "Turn on Translation Desk to configure a provider.", []);
            return;
        }
        this.#translation = new SolcordTranslationDeskController();
        this.#localTranslation = new SolcordLocalTranslationEngine(this.#adapter.localTranslationFactory, this.#adapter.localLanguageDetectorFactory);
        this.#setProviderReady("Translator", providers.includes("Translator"));
        const local = this.#localTranslation.snapshot();
        const selected = this.#adapter.translationPreferences?.provider ?? "off";
        if (local.phase !== "unsupported") {
            this.#setStatus("translation-desk", selected === "local" ? "degraded" : "ready", selected === "local"
                ? "Local engine detected. Translation Desk checks the selected language pair before enabling a request."
                : selected === "off"
                    ? "Ready — provider off. The on-device engine is available; no provider runs until one is selected."
                    : "The selected external provider is ready for reviewed requests; the on-device engine remains available as the private option.", providers);
        }
        else {
            this.#setStatus("translation-desk", selected === "off" || selected === "deepl" || selected === "libretranslate" ? "ready" : "degraded", selected === "off"
                ? "Ready — provider off. This Discord/Electron build does not expose the local Translator API; no text will leave Discord unless an external provider is explicitly selected."
                : selected === "local"
                    ? "On-device translation is unsupported on this build. No external provider will run automatically."
                    : "The selected external provider is ready for reviewed requests and never receives text without confirmation.", providers);
        }
    }

    #startPeopleAndSpaces(): void {
        const providers = this.#enabled.get("people-and-spaces") ?? [];
        this.#setProvidersReady(providers, false);
        if (!providers.length) {
            this.#setStatus("people-and-spaces", "off", "Turn on a People and Spaces feature to load it.", []);
            return;
        }
        this.#people = new SolcordPeopleSpacesController();
        for (const id of this.#adapter.peopleState?.pinnedDmIds ?? []) this.#people.pinDm(id);
        for (const id of this.#adapter.peopleState?.hiddenGuildIds ?? []) this.#people.hideGuild(id);
        for (const [id, alias] of Object.entries(this.#adapter.peopleState?.guildAliases ?? {})) this.#people.aliasGuild(id, alias);
        for (const id of this.#adapter.peopleState?.favoriteFriendIds ?? []) this.#people.favoriteFriend(id);
        for (const id of this.#adapter.peopleState?.hiddenFriendIds ?? []) this.#people.hideFriend(id);
        for (const id of this.#adapter.peopleState?.ignoredVoiceChannelIds ?? []) this.#people.ignoreVoiceChannel(id);
        for (const id of this.#adapter.peopleState?.ignoredVoiceGuildIds ?? []) this.#people.ignoreVoiceGuild(id);
        const domProviders = providers.some(provider => ["PinDMs", "ServerHider", "EditServers", "ServerDetails"].includes(provider));
        if (domProviders) {
            if (providers.includes("PinDMs")) this.#scope.style("solcord-pinned-dm", "[data-solcord-pinned-dm='true']{position:relative}[data-solcord-pinned-dm='true']::after{content:'Pinned';position:absolute;inset-inline-end:8px;top:4px;padding:1px 5px;border:1px solid color-mix(in srgb,var(--solcord-accent,var(--brand-500)) 55%,transparent);border-radius:3px;color:var(--text-muted);font-size:9px;font-weight:700;letter-spacing:.04em;pointer-events:none}[data-solcord-pinned-dm='true'][data-solcord-pin-icon='false']::after{display:none}[data-solcord-pinned-unread]::before{content:attr(data-solcord-pinned-unread);position:absolute;inset-inline-end:4px;bottom:4px;min-width:15px;padding:1px 4px;border-radius:8px;background:var(--status-danger);color:white;font-size:9px;font-weight:700;text-align:center;pointer-events:none}[data-solcord-pinned-category-first='true']{margin-block-start:26px}[data-solcord-pinned-category-first='true']::before{content:attr(data-solcord-pinned-category-label);position:absolute;inset-inline:8px auto;top:-22px;color:var(--channels-default,var(--text-muted));font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;pointer-events:none}");
            const observer = new MutationObserver(() => this.#schedulePeopleDom());
            this.#scope.observe(observer, document.body, {childList: true, subtree: true});
            this.#scope.own(() => this.#restorePeopleDom(), "element");
            this.#applyPeopleDom();
        }
        if (providers.includes("ServerHider") && this.#adapter.peoplePreferences?.serverHiderStreamOnly && this.#adapter.subscribeStreamerMode) {
            this.#scope.own(this.#adapter.subscribeStreamerMode(() => this.#schedulePeopleDom()), "listener");
        }
        for (const provider of ["PinDMs", "ServerHider", "EditServers"] as const) this.#setProviderReady(provider, providers.includes(provider));
        this.#setProviderReady("ServerDetails", providers.includes("ServerDetails") && typeof this.#adapter.guildDetails === "function");
        this.#setProviderReady("BetterFriendList", providers.includes("BetterFriendList") && typeof this.#adapter.loadedFriends === "function");
        const missing = providers.filter(provider => !this.#providerReadiness.get(provider));
        this.#setStatus("people-and-spaces", missing.length ? "degraded" : "ready", missing.length
            ? `Local pins, hidden servers, aliases, and loaded server details are active; ${missing.join(" and ")} still needs a complete replacement.`
            : `Local pins, hidden servers, aliases, and loaded server details are active. ${this.#adapter.peopleStatePersistence === "encrypted" ? "Private account state is encrypted for restart persistence." : "Private account state is session-only because secure persistence is unavailable."}`, providers);
    }

    #savePeople(): void {
        const state = this.#people?.snapshot();
        if (state) {
            this.#adapter.savePeopleState?.(state);
            this.#applyPeopleDom();
        }
    }

    #rememberPeopleDom(element: HTMLElement): void {
        if (this.#peopleDomOriginals.has(element)) return;
        this.#peopleDomOriginals.set(element, {display: element.style.display, order: element.style.order, ariaLabel: element.getAttribute("aria-label"), title: element.getAttribute("title")});
    }

    #restorePeopleDom(): void {
        for (const [element, original] of this.#peopleDomOriginals) {
            element.style.display = original.display;
            element.style.order = original.order;
            if (original.ariaLabel === null) element.removeAttribute("aria-label");
            else element.setAttribute("aria-label", original.ariaLabel);
            if (original.title === null) element.removeAttribute("title");
            else element.setAttribute("title", original.title);
            delete element.dataset.solcordPinnedDm;
            delete element.dataset.solcordPinIcon;
            delete element.dataset.solcordPinnedUnread;
            delete element.dataset.solcordPinnedTotal;
            delete element.dataset.solcordPinnedCategory;
            delete element.dataset.solcordPinnedCategoryLabel;
            delete element.dataset.solcordPinnedCategoryFirst;
            delete element.dataset.solcordHiddenGuild;
            delete element.dataset.solcordGuildAlias;
        }
        this.#peopleDomOriginals.clear();
    }

    #applyPeopleDom(): void {
        if (!this.#people) return;
        const state = this.#people.snapshot();
        const peoplePreferences = this.#adapter.peoplePreferences ?? {showRelationshipDates: true, showMutualGuildCounts: true, pinIcon: true, pinUnreadAmount: true, pinChannelAmount: true, sortPinnedByRecent: false, serverHiderStreamOnly: false, pinCategories: {friends: true, groups: true, bots: true, blocked: true, others: true}};
        const recentPinnedIds = peoplePreferences.sortPinnedByRecent && this.#adapter.dmLastMessageTimestamp
            ? [...state.pinnedDmIds].sort((left, right) => this.#adapter.dmLastMessageTimestamp!(right) - this.#adapter.dmLastMessageTimestamp!(left))
            : state.pinnedDmIds;
        const categoryOrder = ["friends", "groups", "bots", "blocked", "others"] as const;
        const categoryLabels = {friends: "Friends", groups: "Group DMs", bots: "Bots", blocked: "Blocked", others: "Other DMs"} as const;
        const categoryRank = new Map(categoryOrder.map((category, index) => [category, index]));
        const categoryFor = (id: string) => this.#adapter.dmCategory?.(id) ?? "others" as const;
        const orderedPinnedIds = [...recentPinnedIds].sort((left, right) => (categoryRank.get(categoryFor(left)) ?? 99) - (categoryRank.get(categoryFor(right)) ?? 99));
        const pinned = new Map(orderedPinnedIds.map((id, index) => [id, index]));
        const firstPinnedByCategory = new Map<string, string>();
        for (const id of orderedPinnedIds) {
            const category = categoryFor(id);
            if (!firstPinnedByCategory.has(category)) firstPinnedByCategory.set(category, id);
        }
        const hidden = new Set(state.hiddenGuildIds);
        const hideServersNow = !peoplePreferences.serverHiderStreamOnly || this.#adapter.streamerModeActive?.() === true;
        this.#restorePeopleDom();
        for (const link of document.querySelectorAll<HTMLAnchorElement>("a[href^='/channels/']")) {
            const match = link.getAttribute("href")?.match(/^\/channels\/(@me|\d{1,32})(?:\/(\d{1,32}))?\/?$/);
            if (!match) continue;
            const [, scopeId, channelId] = match;
            const container = link.closest<HTMLElement>("li, [class*='listItem'], [class*='channel_']") ?? link;
            if (scopeId === "@me" && channelId && pinned.has(channelId)) {
                this.#rememberPeopleDom(container);
                container.dataset.solcordPinnedDm = "true";
                container.dataset.solcordPinIcon = String(peoplePreferences.pinIcon);
                const unread = peoplePreferences.pinUnreadAmount ? this.#adapter.dmUnreadCount?.(channelId) ?? 0 : 0;
                if (unread > 0) container.dataset.solcordPinnedUnread = String(Math.min(999, unread));
                if (peoplePreferences.pinChannelAmount && pinned.get(channelId) === 0) container.dataset.solcordPinnedTotal = String(pinned.size);
                container.style.order = String(-1_000 + pinned.get(channelId)!);
                const category = categoryFor(channelId);
                if (peoplePreferences.pinCategories[category]) {
                    container.dataset.solcordPinnedCategory = category;
                    container.dataset.solcordPinnedCategoryLabel = categoryLabels[category];
                    if (firstPinnedByCategory.get(category) === channelId) {
                        container.dataset.solcordPinnedCategoryFirst = "true";
                    }
                }
            }
            if (scopeId !== "@me" && hideServersNow && hidden.has(scopeId)) {
                this.#rememberPeopleDom(container);
                container.dataset.solcordHiddenGuild = "true";
                container.style.display = "none";
                continue;
            }
            if (scopeId === "@me") continue;
            const alias = state.guildAliases[scopeId];
            const details = this.#adapter.guildDetails?.(scopeId);
            if (!alias && !details) continue;
            this.#rememberPeopleDom(link);
            const label = alias || details?.name || link.getAttribute("aria-label") || "Server";
            const detail = [
                details?.memberCount === undefined ? "" : `${details.memberCount.toLocaleString("en-US")} members`,
                details?.channelCount === undefined ? "" : `${details.channelCount.toLocaleString("en-US")} channels`,
                details?.roleCount === undefined ? "" : `${details.roleCount.toLocaleString("en-US")} roles`,
                details?.boostCount === undefined ? "" : `${details.boostCount.toLocaleString("en-US")} boosts`,
                details?.ownerLabel ? `owner ${details.ownerLabel}` : "",
                details?.locale ? `language ${details.locale}` : "",
                details?.createdAt ? `created ${new Date(details.createdAt).toLocaleDateString()}` : "",
                details?.joinedAt ? `joined ${new Date(details.joinedAt).toLocaleDateString()}` : ""
            ].filter(Boolean).join(" · ");
            const fullLabel = detail ? `${label} · ${detail}` : label;
            link.setAttribute("aria-label", fullLabel);
            link.setAttribute("title", fullLabel);
            if (alias) link.dataset.solcordGuildAlias = alias;
        }
    }

    #schedulePeopleDom(): void {
        if (this.#peopleSyncQueued || this.#disposed) return;
        this.#peopleSyncQueued = true;
        queueMicrotask(() => {
            this.#peopleSyncQueued = false;
            if (!this.#disposed) this.#applyPeopleDom();
        });
    }

    #startChannelGlance(): void {
        const providers = this.#enabled.get("channel-glance") ?? [];
        this.#setProvidersReady(providers, false);
        if (!providers.length) {
            this.#setStatus("channel-glance", "off", "Turn on Channel Glance to load it.", []);
            return;
        }
        this.#glance = new SolcordChannelGlanceController();
        const available = typeof this.#adapter.loadedChannelMessages === "function";
        this.#setProviderReady("MessagePeek", providers.includes("MessagePeek") && available);
        if (available) this.#installChannelGlanceHover();
        this.#setStatus("channel-glance", available ? "ready" : "unsupported", available ? "Hover or focus a loaded channel to preview up to five cached messages without fetching or marking read." : "This Discord build did not expose a validated loaded-message store.", providers);
    }

    #installChannelGlanceHover(): void {
        this.#scope.style("solcord-channel-glance", ".solcord-channel-glance{position:fixed;z-index:10001;box-sizing:border-box;width:min(360px,calc(100vw - 24px));max-height:280px;overflow:hidden;padding:10px 12px;border:1px solid var(--border-normal,#4b4f58);border-radius:6px;background:var(--background-floating,#111214);color:var(--text-normal,#f2f3f5);box-shadow:0 12px 28px rgb(0 0 0 / 34%);pointer-events:none}.solcord-channel-glance strong,.solcord-channel-glance span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.solcord-channel-glance p{margin:0 0 8px}.solcord-channel-glance p:last-child{margin-bottom:0}.solcord-channel-glance small{color:var(--text-muted,#b5bac1)}");
        const channelTarget = (value: EventTarget | null): HTMLAnchorElement | undefined => {
            const link = value instanceof Element ? value.closest<HTMLAnchorElement>("a[href^='/channels/']") : null;
            return link?.getAttribute("href")?.match(/^\/channels\/(?:@me|\d{1,32})\/(\d{1,32})\/?$/) ? link : undefined;
        };
        const close = () => {this.#glanceTooltip?.remove(); this.#glanceTooltip = undefined;};
        const open = (link: HTMLAnchorElement) => {
            close();
            const channelId = link.getAttribute("href")!.match(/(\d{1,32})\/?$/)?.[1];
            if (!channelId) return;
            const loaded = this.#adapter.loadedChannelMessages?.(channelId);
            if (!Array.isArray(loaded) || !loaded.length) return;
            const messages = this.#glance?.showAlreadyLoaded(true, loaded.slice(-5)) ?? [];
            const tooltip = document.createElement("div");
            tooltip.dataset.solcordChannelGlance = "true";
            tooltip.className = "solcord-channel-glance";
            tooltip.setAttribute("role", "tooltip");
            for (const message of messages) {
                const row = document.createElement("p");
                const author = document.createElement("strong");
                const body = document.createElement("span");
                const time = document.createElement("small");
                author.textContent = message.authorLabel;
                body.textContent = message.text || "No text content";
                time.textContent = new Date(message.timestamp).toLocaleString();
                row.append(author, body, time);
                tooltip.append(row);
            }
            document.body.append(tooltip);
            const rect = link.getBoundingClientRect();
            const left = Math.min(Math.max(12, rect.right + 10), Math.max(12, window.innerWidth - 372));
            const top = Math.min(Math.max(12, rect.top), Math.max(12, window.innerHeight - Math.min(tooltip.offsetHeight || 220, 280) - 12));
            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
            this.#glanceTooltip = tooltip;
        };
        this.#scope.listen(document.body, "mouseover", event => {const link = channelTarget(event.target); if (link) open(link);});
        this.#scope.listen(document.body, "mouseout", event => {const link = channelTarget(event.target); const related = channelTarget((event as MouseEvent).relatedTarget); if (link && link !== related) close();});
        this.#scope.listen(document.body, "focusin", event => {const link = channelTarget(event.target); if (link) open(link);});
        this.#scope.listen(document.body, "focusout", event => {const link = channelTarget(event.target); const related = channelTarget((event as FocusEvent).relatedTarget); if (link && link !== related) close();});
        this.#scope.own(close, "element");
    }

    #startNotificationReview(): void {
        const providers = this.#enabled.get("notification-review") ?? [];
        this.#setProvidersReady(providers, false);
        if (!providers.length) {
            this.#setStatus("notification-review", "off", "Turn on Notification Review to load it.", []);
            return;
        }
        this.#notifications = new SolcordNotificationReviewController();
        const available = Boolean(this.#adapter.notificationIds && this.#adapter.markNotificationsRead);
        this.#setProviderReady("ReadAllNotificationsButton", providers.includes("ReadAllNotificationsButton") && available);
        this.#setStatus("notification-review", available ? "ready" : "unsupported", available ? "Preview the scope and count before one explicit mark-read action." : "This Discord build did not expose a complete read-state action.", providers);
    }

    #startMotionStudio(): void {
        const providers = this.#enabled.get("motion-studio") ?? [];
        this.#setProvidersReady(providers, false);
        if (!providers.length) {
            this.#setStatus("motion-studio", "off", "Turn on Motion Studio to load it.", []);
            return;
        }
        this.#motion = new SolcordMotionStudioController();
        const reducedByOs = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
        const policy = this.#adapter.motionPolicy ?? {
            effectiveMotion: reducedByOs ? "reduced" : "full",
            ambientEffects: !reducedByOs
        };
        const interactionMotionAllowed = policy.effectiveMotion !== "reduced";
        const ambientEffectsAllowed = interactionMotionAllowed && policy.ambientEffects;
        const settings = this.#motion.configure({
            reducedMotion: !interactionMotionAllowed,
            intensity: policy.effectiveMotion === "subtle" ? 0.28 : 0.45,
            durationMs: policy.effectiveMotion === "subtle" ? 120 : 160,
            effectsEnabled: interactionMotionAllowed && providers.includes("DiscordEffects")
        });
        const motionPreferences = this.#adapter.motionPreferences ?? {effect: "signal" as const, particleCount: 10, color: "#9fb8ff", opacityPercent: 42, speedPercent: 100, starAngleDegrees: -28, surfaces: {messages: true, channels: true, servers: true, members: true, modals: true, popouts: true, settings: true, tooltips: true, threads: true}};
        const surfaceSelectors = [
            motionPreferences.surfaces.messages && "#app-mount [id^='chat-messages-']",
            motionPreferences.surfaces.channels && "#app-mount [data-list-item-id*='channels___']",
            motionPreferences.surfaces.servers && "#app-mount [data-list-item-id*='guildsnav___']",
            motionPreferences.surfaces.members && "#app-mount [data-list-item-id*='members-']",
            motionPreferences.surfaces.modals && "#app-mount [role='dialog']",
            motionPreferences.surfaces.popouts && "#app-mount [class*='menu_'],#app-mount [class*='popout_']",
            motionPreferences.surfaces.settings && "#app-mount [class*='contentRegion_'] > [class*='contentColumn_']",
            motionPreferences.surfaces.tooltips && "#app-mount [role='tooltip']",
            motionPreferences.surfaces.threads && "#app-mount [class*='threadSidebar_']"
        ].filter((selector): selector is string => Boolean(selector)).join(",");
        if (providers.length && interactionMotionAllowed) this.#scope.style("solcord-native-motion", `:root{--solcord-native-motion:${settings.durationMs}ms}${surfaceSelectors ? `${surfaceSelectors}{animation:solcord-native-enter var(--solcord-native-motion) ease-out}` : ""}@keyframes solcord-native-enter{from{opacity:.72;transform:translateY(3px)}to{opacity:1;transform:none}}.solcord-interaction-effect{position:fixed;z-index:10002;width:18px;height:18px;margin:-9px;border:2px solid var(--solcord-effect-color,var(--solcord-accent,var(--brand-500)));border-radius:50%;pointer-events:none;animation:solcord-native-effect 420ms ease-out forwards}@keyframes solcord-native-effect{from{opacity:var(--solcord-effect-opacity,.42);transform:scale(.35)}to{opacity:0;transform:scale(1.8)}}.solcord-ambient-effect{position:fixed;inset:0;z-index:10000;overflow:hidden;pointer-events:none;contain:strict}.solcord-flow-field{width:100%;height:100%;opacity:var(--solcord-effect-opacity,.42);mix-blend-mode:screen;filter:saturate(.9) contrast(1.04)}html[data-solcord-mode='solcord-light'] .solcord-flow-field,.theme-light .solcord-flow-field{mix-blend-mode:multiply;filter:saturate(.72) contrast(.96)}.solcord-ambient-effect span{position:absolute;opacity:var(--solcord-effect-opacity,.42);will-change:transform,opacity}.solcord-ambient-effect[data-effect='snow'] span{top:-12px;width:6px;height:6px;border-radius:50%;background:var(--solcord-effect-color,var(--text-normal));animation:solcord-fall 9s linear infinite}.solcord-ambient-effect[data-effect='rain'] span{top:-24px;width:2px;height:18px;background:var(--solcord-effect-color,var(--text-muted));animation:solcord-fall 1.8s linear infinite}.solcord-ambient-effect[data-effect='embers'] span{bottom:-10px;width:3px;height:7px;border-radius:55% 45% 50% 50%;background:var(--solcord-effect-color,#ff755f);animation:solcord-rise 10s ease-in infinite;transform-origin:center}.solcord-ambient-effect[data-effect='embers'] span:nth-child(3n){width:2px;height:5px;opacity:calc(var(--solcord-effect-opacity,.42) * .72)}@keyframes solcord-fall{from{transform:translate3d(0,-4vh,0);opacity:0}10%{opacity:var(--solcord-effect-opacity,.42)}to{transform:translate3d(0,105vh,0);opacity:0}}@keyframes solcord-rise{from{transform:translate3d(0,4vh,0) rotate(0deg);opacity:0}14%{opacity:var(--solcord-effect-opacity,.42)}72%{opacity:calc(var(--solcord-effect-opacity,.42) * .7)}to{transform:translate3d(var(--solcord-ember-drift,18px),-108vh,0) rotate(190deg);opacity:0}}`);
        this.#setProviderReady("BetterAnimations", providers.includes("BetterAnimations"));
        this.#setProviderReady("DiscordEffects", providers.includes("DiscordEffects"));
        if (providers.includes("DiscordEffects") && interactionMotionAllowed && motionPreferences.effect === "signal") {
            this.#scope.listen(document, "click", event => {
                if (!(event instanceof MouseEvent) || !(event.target instanceof Element) || !event.target.closest("button,[role='button'],a")) return;
                const effect = document.createElement("span");
                effect.className = "solcord-interaction-effect";
                effect.dataset.solcordInteractionEffect = "true";
                effect.style.setProperty("--solcord-effect-color", motionPreferences.color);
                effect.style.setProperty("--solcord-effect-opacity", String(motionPreferences.opacityPercent / 100));
                effect.style.left = `${event.clientX}px`;
                effect.style.top = `${event.clientY}px`;
                document.body.append(effect);
                this.#scope.timeout(() => effect.remove(), 450);
            });
            this.#scope.own(() => document.querySelectorAll("[data-solcord-interaction-effect]").forEach(element => element.remove()), "element");
        }
        if (providers.includes("DiscordEffects") && ambientEffectsAllowed && ["field", "stars"].includes(motionPreferences.effect)) {
            this.#mountSolFlow(motionPreferences.opacityPercent, motionPreferences.speedPercent, motionPreferences.particleCount);
        }
        if (providers.includes("DiscordEffects") && ambientEffectsAllowed && motionPreferences.effect === "work-field") {
            this.#mountWorkField(motionPreferences.opacityPercent, motionPreferences.speedPercent, motionPreferences.particleCount, motionPreferences.color);
        }
        if (providers.includes("DiscordEffects") && ambientEffectsAllowed && ["snow", "rain", "embers"].includes(motionPreferences.effect)) {
            const container = document.createElement("div");
            container.className = "solcord-ambient-effect";
            container.style.zIndex = "0";
            container.dataset.solcordAmbientEffect = "true";
            container.dataset.effect = motionPreferences.effect;
            container.setAttribute("aria-hidden", "true");
            container.style.setProperty("--solcord-effect-color", motionPreferences.color);
            container.style.setProperty("--solcord-effect-opacity", String(motionPreferences.opacityPercent / 100));
            container.style.setProperty("--solcord-star-angle", `${motionPreferences.starAngleDegrees}deg`);
            const speedFactor = 100 / motionPreferences.speedPercent;
            for (let index = 0; index < Math.max(1, Math.min(24, motionPreferences.particleCount)); index++) {
                const particle = document.createElement("span");
                particle.style.setProperty("--i", String(index));
                particle.style.setProperty("--d", String((index * 7) % 11));
                particle.style.left = `${(index * 41 + 7) % 97}%`;
                particle.style.animationDelay = `${-((index * 0.73) % 5.5)}s`;
                particle.style.setProperty("--solcord-ember-drift", `${((index * 29) % 57) - 28}px`);
                const baseDuration = motionPreferences.effect === "rain" ? 1.2 + (index % 7) * 0.12 : motionPreferences.effect === "embers" ? 8 + (index % 7) : 7 + (index % 5);
                particle.style.animationDuration = `${Math.max(0.25, baseDuration * speedFactor).toFixed(2)}s`;
                container.append(particle);
            }
            document.body.append(container);
            this.#scope.own(() => container.remove(), "element");
        }
        const effectLabel: Readonly<Record<typeof motionPreferences.effect, string>> = {
            "off": "Off",
            "signal": "Signal",
            "field": "SOL Flow",
            "work-field": "Work Field",
            "embers": "Ember Drift",
            "snow": "Snow",
            "rain": "Rain",
            "stars": "SOL Flow"
        };
        const effectRequested = providers.includes("DiscordEffects") && motionPreferences.effect !== "off";
        const detail = !interactionMotionAllowed
            ? `${effectRequested ? `${effectLabel[motionPreferences.effect]} and interaction motion are` : "Interaction motion is"} off because reduced motion is active. No motion listeners, timers, canvases, or observers were started.`
            : effectRequested && motionPreferences.effect !== "signal" && !ambientEffectsAllowed
                ? `${policy.effectiveMotion === "subtle" ? "Subtle" : "Full"} interaction motion is active. ${effectLabel[motionPreferences.effect]} is off under the current performance policy.`
                : `${policy.effectiveMotion === "subtle" ? "Subtle" : "Full"} interaction motion is active${effectRequested ? ` with ${effectLabel[motionPreferences.effect]}` : ""}; every owned effect is removed on disable.`;
        this.#setStatus("motion-studio", "ready", detail, providers);
    }

    #mountSolFlow(opacityPercent: number, speedPercent: number, density: number): void {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", {alpha: true});
        if (!context) return;
        canvas.className = "solcord-ambient-effect solcord-flow-field";
        canvas.style.zIndex = "0";
        canvas.dataset.solcordAmbientEffect = "true";
        canvas.dataset.effect = "field";
        canvas.setAttribute("aria-hidden", "true");
        canvas.style.setProperty("--solcord-effect-opacity", String(Math.max(10, Math.min(100, opacityPercent)) / 100));
        document.body.append(canvas);
        this.#scope.own(() => canvas.remove(), "element");

        type FlowPair = {angle: number; radius: number; previousRadius: number; turn: number; previousTurn: number; speed: number; bend: number; phase: number; tint: number;};
        const pairs: FlowPair[] = [];
        const tau = Math.PI * 2;
        let width = 1;
        let height = 1;
        let exitRadius = 1;
        let frame = 0;
        let previousTime = 0;
        let stopped = false;
        const seed = (index: number, salt: number): number => {
            const value = Math.sin(index * 91.713 + salt * 37.117) * 43_758.5453;
            return value - Math.floor(value);
        };
        const reset = (pair: FlowPair, index: number, mature = false): void => {
            const progress = mature ? seed(index, 11) : seed(index, pair.phase + 2) * 0.035;
            pair.radius = progress * exitRadius;
            pair.previousRadius = pair.radius;
            pair.turn = seed(index, 13) * 0.18 - 0.09;
            pair.previousTurn = pair.turn;
        };
        const populate = (): void => {
            const count = width < 620 ? 16 : Math.max(18, Math.min(32, 16 + Math.round(density)));
            pairs.length = 0;
            for (let index = 0; index < count; index++) {
                const jitter = (seed(index, 1) - 0.5) * (tau / count) * 0.78;
                const pair: FlowPair = {
                    angle: (index / count) * tau + jitter,
                    radius: 0,
                    previousRadius: 0,
                    turn: 0,
                    previousTurn: 0,
                    speed: (11 + seed(index, 5) * 10) * Math.max(0.25, Math.min(3, speedPercent / 100)),
                    bend: (seed(index, 6) > 0.5 ? 1 : -1) * (0.025 + seed(index, 8) * 0.06),
                    phase: seed(index, 7) * tau,
                    tint: Math.floor(seed(index, 9) * 3)
                };
                reset(pair, index, true);
                pairs.push(pair);
            }
        };
        const resize = (): void => {
            const ratio = Math.min(globalThis.devicePixelRatio || 1, 1.5);
            width = Math.max(1, globalThis.innerWidth);
            height = Math.max(1, globalThis.innerHeight);
            exitRadius = Math.hypot(width, height) * 0.64;
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
            populate();
        };
        const palette = (): string[] => document.documentElement.dataset.solcordMode === "solcord-light" || document.querySelector(".theme-light")
            ? ["rgba(167,47,35,.30)", "rgba(49,91,74,.24)", "rgba(90,78,65,.18)"]
            : ["rgba(255,117,95,.34)", "rgba(118,168,145,.24)", "rgba(225,206,181,.16)"];
        const point = (pair: FlowPair, opposite: boolean, previous: boolean, time: number): [number, number, number] => {
            const radius = previous ? pair.previousRadius : pair.radius;
            const turn = previous ? pair.previousTurn : pair.turn;
            const wave = Math.sin(radius * 0.008 + pair.phase + time * 0.00014) * 0.28 + Math.sin(radius * 0.0036 - pair.phase * 0.6 - time * 0.00008) * 0.13;
            const angle = pair.angle + (opposite ? Math.PI : 0) + turn + wave;
            return [width * 0.5 + Math.cos(angle) * radius, height * 0.5 + Math.sin(angle) * radius, angle];
        };
        const stroke = (pair: FlowPair, index: number, opposite: boolean, colors: string[], time: number): void => {
            const [previousX, previousY] = point(pair, opposite, true, time);
            const [x, y, angle] = point(pair, opposite, false, time);
            const progress = Math.min(1, pair.radius / exitRadius);
            const alpha = Math.sin(progress * Math.PI) * Math.min(1, pair.radius / 72);
            const curve = (2.5 + seed(index, 15) * 4.6) * (opposite ? -1 : 1);
            context.globalAlpha = Math.max(0, alpha);
            context.strokeStyle = colors[pair.tint] ?? colors[0]!;
            context.lineWidth = pair.tint === 0 ? 1.1 : 0.76;
            context.beginPath();
            context.moveTo(previousX, previousY);
            context.quadraticCurveTo((previousX + x) * 0.5 - Math.sin(angle) * curve, (previousY + y) * 0.5 + Math.cos(angle) * curve, x, y);
            context.stroke();
        };
        const draw = (time: number): void => {
            if (stopped) return;
            frame = requestAnimationFrame(draw);
            if (document.hidden || time - previousTime < 32) return;
            const delta = Math.min(0.05, Math.max(0.001, (time - previousTime) / 1_000));
            previousTime = time;
            context.save();
            context.globalCompositeOperation = "destination-out";
            context.fillStyle = "rgba(0,0,0,.072)";
            context.fillRect(0, 0, width, height);
            context.restore();
            const colors = palette();
            pairs.forEach((pair, index) => {
                pair.previousRadius = pair.radius;
                pair.previousTurn = pair.turn;
                pair.radius += pair.speed * delta;
                pair.turn += pair.bend * delta;
                stroke(pair, index, false, colors, time);
                stroke(pair, index, true, colors, time);
                if (pair.radius >= exitRadius) reset(pair, index);
            });
            context.globalAlpha = 1;
        };
        resize();
        this.#scope.listen(globalThis, "resize", resize, {passive: true});
        frame = requestAnimationFrame(draw);
        this.#scope.own(() => {stopped = true; cancelAnimationFrame(frame);}, "timer");
    }

    #mountWorkField(opacityPercent: number, speedPercent: number, density: number, color: string): void {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", {alpha: true});
        if (!context) return;
        canvas.className = "solcord-ambient-effect solcord-flow-field";
        canvas.style.zIndex = "0";
        canvas.dataset.solcordAmbientEffect = "true";
        canvas.dataset.effect = "work-field";
        canvas.setAttribute("aria-hidden", "true");
        canvas.style.setProperty("--solcord-effect-opacity", String(Math.max(10, Math.min(100, opacityPercent)) / 100));
        document.body.append(canvas);
        this.#scope.own(() => canvas.remove(), "element");

        type Pulse = {x: number; y: number; startedAt: number;};
        const pointer = {x: 0.54, y: 0.46};
        const pointerTarget = {...pointer};
        const motionScale = Math.max(0.25, Math.min(3, speedPercent / 100));
        let pulse: Pulse | undefined;
        let pixelRatio = 1;
        let frame = 0;
        let lastDraw = -Infinity;
        let stopped = false;
        const fract = (value: number): number => value - Math.floor(value);
        const seeded = (column: number, row: number): number => fract(Math.sin(column * 91.73 + row * 37.19 + 4.17) * 18_731.737);
        const ease = (value: number): number => {
            const bounded = Math.max(0, Math.min(1, value));
            return bounded * bounded * (3 - 2 * bounded);
        };
        const rgb = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
        const baseColor = rgb ? [Number.parseInt(rgb[1]!, 16), Number.parseInt(rgb[2]!, 16), Number.parseInt(rgb[3]!, 16)] : [159, 184, 255];
        const resize = (): void => {
            pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 1.5);
            const width = Math.max(1, Math.round(globalThis.innerWidth * pixelRatio));
            const height = Math.max(1, Math.round(globalThis.innerHeight * pixelRatio));
            if (canvas.width === width && canvas.height === height) return;
            canvas.width = width;
            canvas.height = height;
            canvas.style.width = `${globalThis.innerWidth}px`;
            canvas.style.height = `${globalThis.innerHeight}px`;
        };
        const updatePointer: EventListener = (event): void => {
            const {clientX, clientY} = event as PointerEvent;
            pointerTarget.x = clientX / Math.max(1, globalThis.innerWidth);
            pointerTarget.y = clientY / Math.max(1, globalThis.innerHeight);
        };
        const startPulse: EventListener = (event): void => {
            const {clientX, clientY} = event as PointerEvent;
            pulse = {x: clientX / Math.max(1, globalThis.innerWidth), y: clientY / Math.max(1, globalThis.innerHeight), startedAt: performance.now()};
        };
        const draw = (timestamp: number): void => {
            resize();
            const width = canvas.width;
            const height = canvas.height;
            const aspect = width / height;
            const drift = timestamp * 0.000045 * motionScale;
            const spacing = Math.max(10, 20 - Math.min(24, density) * 0.38);
            const cellX = spacing * pixelRatio;
            const cellY = (spacing + 4) * pixelRatio;
            const columns = Math.ceil(width / cellX);
            const rows = Math.ceil(height / cellY);
            const pulseLife = pulse ? (timestamp - pulse.startedAt) / 1_850 : 2;
            if (pulseLife > 1) pulse = undefined;
            pointer.x += (pointerTarget.x - pointer.x) * 0.075;
            pointer.y += (pointerTarget.y - pointer.y) * 0.075;
            context.clearRect(0, 0, width, height);
            context.font = `${10.5 * pixelRatio}px "Fragment Mono",Consolas,monospace`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            for (let row = 1; row < rows; row++) {
                for (let column = 1; column < columns; column++) {
                    const nx = column / columns;
                    const ny = row / rows;
                    const dx = (nx - pointer.x) * aspect;
                    const dy = ny - pointer.y;
                    const proximity = Math.max(0, 1 - Math.hypot(dx, dy) / 0.34);
                    const field = Math.sin(nx * 10.7 + ny * 3.25 + drift * 2.1) + Math.cos(ny * 16.2 - nx * 4.4 - drift * 1.35) * 0.58 + Math.sin((nx + ny * 0.78) * 26.4 + drift * 0.63) * 0.24 + proximity * proximity * 0.72;
                    const ridge = 1 - Math.abs(Math.sin(field * 2.13));
                    const grain = seeded(column, row);
                    const base = ease((ridge - (0.885 + grain * 0.09)) / 0.08);
                    let wave = 0;
                    if (pulse && pulseLife >= 0 && pulseLife <= 1) {
                        const ring = Math.abs(Math.hypot((nx - pulse.x) * aspect, ny - pulse.y) - pulseLife * Math.hypot(aspect, 1) * 0.82);
                        wave = Math.exp(-(ring * ring) / 0.0048) * Math.pow(1 - pulseLife, 1.35);
                    }
                    const visibility = Math.max(base, wave * (0.45 + ridge * 0.55));
                    if (visibility < 0.035) continue;
                    const alpha = Math.min(0.82, 0.12 + visibility * 0.48 + wave * 0.26);
                    context.fillStyle = `rgba(${baseColor[0]},${baseColor[1]},${baseColor[2]},${alpha})`;
                    context.fillText(grain > 0.91 ? "+" : grain > 0.64 ? ":" : ".", column * cellX, row * cellY);
                }
            }
        };
        const render = (timestamp: number): void => {
            if (stopped) return;
            const interval = pulse ? 16 : 48;
            if (!document.hidden && timestamp - lastDraw >= interval) {
                draw(timestamp);
                lastDraw = timestamp;
            }
            frame = requestAnimationFrame(render);
        };
        resize();
        draw(performance.now());
        this.#scope.listen(globalThis, "resize", resize, {passive: true});
        this.#scope.listen(globalThis, "pointermove", updatePointer, {passive: true});
        this.#scope.listen(globalThis, "pointerdown", startPulse, {passive: true});
        frame = requestAnimationFrame(render);
        this.#scope.own(() => {stopped = true; cancelAnimationFrame(frame);}, "timer");
    }

    #startVoiceHealth(): void {
        if (!this.#adapter.voiceHealthEnabled) {
            this.#setStatus("voice-health", "off", "Turn on Voice Health to sample cached connection quality.", []);
            return;
        }
        this.#voiceHealth = new SolcordVoiceHealthController();
        if (this.#adapter.voiceHealthInitialSample) {this.#voiceHealth.add(this.#adapter.voiceHealthInitialSample);}
        if (this.#adapter.voiceHealthSample) {
            let missedSamples = 0;
            this.#scope.interval(() => {
                const sample = this.#adapter.voiceHealthSample?.();
                if (!sample) {
                    missedSamples++;
                    if (missedSamples >= 3) {
                        this.#setStatus("voice-health", "degraded", "Cached connection quality is temporarily unavailable; the call may be disconnected or the Discord adapter may have drifted. No network request or audio capture occurred.", []);
                    }
                    return;
                }
                missedSamples = 0;
                this.#voiceHealth?.add(sample);
                this.#setStatus("voice-health", "ready", "A bounded cached connection-quality sample was validated; Voice Health never records audio.", []);
            }, 5_000);
        }
        const capability = this.#adapter.voiceHealthCapability ?? (this.#adapter.voiceHealthInitialSample ? "ready" : this.#adapter.voiceHealthSample ? "available" : "unavailable");
        this.#setStatus("voice-health", capability === "ready" ? "ready" : capability === "available" ? "degraded" : "unsupported", this.#adapter.voiceHealthCapabilityDetail ?? (capability === "available" ? "Available — join a call to produce the first cached connection-quality sample." : "This Discord build did not expose a validated cached connection-quality reader."), []);
    }

    #startFocusChannels(): void {
        this.#synchronizeFocusChannels(this.#adapter.focusChannelIds ?? []);
    }

    #synchronizeFocusChannels(rawIds: readonly string[]): void {
        this.#focusIds = [...new Set(rawIds.map(id => safeToken(id)).slice(0, 100))];
        if (!this.#focusIds.length) {
            this.#releaseFocusObserver?.();
            this.#releaseFocusObserver = undefined;
            this.#clearFocusChannels();
            return;
        }
        if (!this.#releaseFocusObserver) {
            const observer = new MutationObserver(() => this.#applyFocusChannels(this.#focusIds));
            observer.observe(document.body, {childList: true, subtree: true});
            this.#releaseFocusObserver = this.#scope.own(() => {
                observer.disconnect();
                this.#releaseFocusObserver = undefined;
                this.#clearFocusChannels();
            }, "observer");
        }
        this.#applyFocusChannels(this.#focusIds);
    }

    #clearFocusChannels(): void {
        document.querySelectorAll("[data-solcord-focus-muted]").forEach(element => element.removeAttribute("data-solcord-focus-muted"));
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

    #restoreTimestampTitles(): void {
        for (const [element, title] of this.#timestampTitles) {
            delete element.dataset.solcordCompleteTime;
            if (title === null) element.removeAttribute("title");
            else element.setAttribute("title", title);
        }
        for (const [element, text] of this.#timestampText) element.textContent = text;
        this.#timestampTitles.clear();
        this.#timestampText.clear();
    }

    #setProviderReady(provider: string, ready: boolean): void {
        this.#providerReadiness.set(provider, ready);
    }

    #setProviderAvailable(provider: string, available: boolean): void {
        this.#providerAvailability.set(provider, available);
    }

    #setProvidersAvailable(providers: readonly string[], available: boolean): void {
        for (const provider of providers) this.#providerAvailability.set(provider, available);
    }

    #setProvidersReady(providers: readonly string[], ready: boolean): void {
        for (const provider of providers) this.#providerReadiness.set(provider, ready);
    }

    #setStatus(id: SolcordNativeSuiteStatus["id"], maturity: SolcordNativeSuiteMaturity, detail: string, providers: string[]): void {
        const next = {id, title: TITLES[id], maturity, detail, enabledProviders: [...providers]};
        const current = this.#status.get(id);
        if (current
            && current.maturity === next.maturity
            && current.detail === next.detail
            && current.enabledProviders.length === next.enabledProviders.length
            && current.enabledProviders.every((provider, index) => provider === next.enabledProviders[index])) return;
        this.#status.set(id, next);
        if (!this.#adapter.onStatusChange || this.#statusNotificationQueued) return;
        this.#statusNotificationQueued = true;
        queueMicrotask(() => {
            this.#statusNotificationQueued = false;
            if (!this.#disposed) this.#adapter.onStatusChange?.();
        });
    }
}

export const SOLCORD_NATIVE_SUITE_FEATURE_IDS: readonly SolcordV2FeatureId[] = Object.freeze([
    "composer-toolkit", "call-context", "audio-console", "voice-note-studio", "translation-desk", "people-and-spaces", "channel-glance", "notification-review", "motion-studio", "permission-lens", "voice-health", "local-identity-notes"
]);
