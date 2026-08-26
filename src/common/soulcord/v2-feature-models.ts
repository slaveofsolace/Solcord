// SPDX-License-Identifier: Apache-2.0

export type SoulCordV2FeatureId =
    | "composer-toolkit"
    | "call-context"
    | "audio-console"
    | "voice-note-studio"
    | "translation-desk"
    | "people-and-spaces"
    | "channel-glance"
    | "notification-review"
    | "motion-studio"
    | "permission-lens"
    | "voice-health"
    | "local-identity-notes";

export type SoulCordV2IntentKind =
    | "open-reply-composer"
    | "copy-split-parts"
    | "set-local-volume"
    | "begin-local-recording"
    | "upload-voice-note"
    | "translate-text"
    | "mark-notifications-read"
    | "write-encrypted-identity-note";

export interface SoulCordV2ActionIntent<T = Readonly<Record<string, unknown>>> {
    version: 1;
    id: string;
    kind: SoulCordV2IntentKind;
    feature: SoulCordV2FeatureId;
    createdAt: number;
    expiresAt: number;
    requiresAdapterExecution: true;
    payload: T;
    summary: string;
}

export interface SoulCordV2Disposable {
    readonly disposed: boolean;
    resourceCounts(): Readonly<Record<string, number>>;
    dispose(): void;
}

export interface SoulCordV2FeatureContract {
    id: SoulCordV2FeatureId;
    title: string;
    defaultEnabled: boolean;
    persistence: "none" | "ordinary-local" | "secure-local";
    boundaries: readonly string[];
}

const FEATURE_CONTRACTS: readonly SoulCordV2FeatureContract[] = [
    {id: "composer-toolkit", title: "Composer Toolkit", defaultEnabled: false, persistence: "ordinary-local", boundaries: ["preview-before-action", "never-send"]},
    {id: "call-context", title: "Call Context", defaultEnabled: false, persistence: "none", boundaries: ["observed-state-only", "never-join"]},
    {id: "audio-console", title: "Audio Console", defaultEnabled: false, persistence: "ordinary-local", boundaries: ["local-volume-only", "bounded-gain"]},
    {id: "voice-note-studio", title: "Voice Note Studio", defaultEnabled: false, persistence: "none", boundaries: ["user-gesture-recording", "preview-before-upload", "never-auto-upload"]},
    {id: "translation-desk", title: "Translation Desk", defaultEnabled: false, persistence: "secure-local", boundaries: ["provider-disclosure", "confirm-before-network", "never-send"]},
    {id: "people-and-spaces", title: "People and Spaces", defaultEnabled: false, persistence: "ordinary-local", boundaries: ["local-organization-only", "never-edit-server"]},
    {id: "channel-glance", title: "Channel Glance", defaultEnabled: false, persistence: "none", boundaries: ["loaded-store-only", "never-fetch", "never-mark-read"]},
    {id: "notification-review", title: "Notification Review", defaultEnabled: false, persistence: "none", boundaries: ["preview-before-action", "never-auto-read"]},
    {id: "motion-studio", title: "Motion Studio", defaultEnabled: false, persistence: "ordinary-local", boundaries: ["reduced-motion-first", "local-presentation-only"]},
    {id: "permission-lens", title: "Permission Lens", defaultEnabled: false, persistence: "none", boundaries: ["cached-permissions-only", "never-edit-permissions"]},
    {id: "voice-health", title: "Voice Health", defaultEnabled: false, persistence: "none", boundaries: ["bounded-sampling", "never-record-audio"]},
    {id: "local-identity-notes", title: "Local Identity Notes", defaultEnabled: false, persistence: "secure-local", boundaries: ["encrypted-storage-only", "no-plaintext-export"]}
];

export const SOULCORD_V2_FEATURE_CONTRACTS = Object.freeze(FEATURE_CONTRACTS.map(contract => Object.freeze({...contract, boundaries: Object.freeze([...contract.boundaries])})));

type Clock = () => number;

interface OwnedResource {
    kind: string;
    dispose(): void;
}

export class SoulCordV2Lifecycle implements SoulCordV2Disposable {
    #disposed = false;
    #resources: OwnedResource[] = [];

    get disposed(): boolean {return this.#disposed;}

    assertActive(): void {
        if (this.#disposed) throw new Error("This SoulCord V2 controller has been disposed.");
    }

    own(kind: string, dispose: () => void): () => void {
        this.assertActive();
        if (!safeToken(kind, 48)) throw new Error("Resource kind is invalid.");
        const resource = {kind, dispose};
        this.#resources.push(resource);
        return () => {
            const index = this.#resources.indexOf(resource);
            if (index < 0) return;
            this.#resources.splice(index, 1);
            resource.dispose();
        };
    }

    resourceCounts(): Readonly<Record<string, number>> {
        const counts: Record<string, number> = {};
        for (const resource of this.#resources) counts[resource.kind] = (counts[resource.kind] ?? 0) + 1;
        return Object.freeze(counts);
    }

    dispose(): void {
        if (this.#disposed) return;
        this.#disposed = true;
        const errors: unknown[] = [];
        for (const resource of this.#resources.splice(0).reverse()) {
            try {resource.dispose();}
            catch (error) {errors.push(error);}
        }
        if (errors.length) throw new AggregateError(errors, "SoulCord V2 controller cleanup failed.");
    }
}

function safeToken(value: string, maximumLength: number): boolean {
    return value.length > 0 && value.length <= maximumLength && /^[A-Za-z0-9._:-]+$/.test(value);
}

function requireToken(value: string, label: string, maximumLength = 120): string {
    if (!safeToken(value, maximumLength)) throw new Error(`${label} is invalid.`);
    return value;
}

function hasUnsafeTextControl(value: string): boolean {
    return [...value].some(character => {
        const code = character.charCodeAt(0);
        return code === 0 || code === 8 || code === 11 || code === 12 || code === 127;
    });
}

function boundedText(value: string, maximumLength: number, label: string): string {
    if (typeof value !== "string" || value.length > maximumLength || hasUnsafeTextControl(value)) {
        throw new Error(`${label} is invalid or exceeds ${maximumLength} characters.`);
    }
    return value;
}

function boundedInteger(value: number, minimum: number, maximum: number, label: string): number {
    if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
    return value;
}

function boundedNumber(value: number, minimum: number, maximum: number, label: string): number {
    if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
    return value;
}

class IntentFactory {
    #sequence = 0;
    constructor(private readonly clock: Clock) {}

    create<T extends Readonly<Record<string, unknown>>>(feature: SoulCordV2FeatureId, kind: SoulCordV2IntentKind, payload: T, summary: string, ttlMs = 30_000): SoulCordV2ActionIntent<T> {
        const createdAt = this.clock();
        this.#sequence++;
        return Object.freeze({
            version: 1 as const,
            id: `${feature}:${createdAt}:${this.#sequence}`,
            kind,
            feature,
            createdAt,
            expiresAt: createdAt + ttlMs,
            requiresAdapterExecution: true as const,
            payload: Object.freeze({...payload}),
            summary: boundedText(summary, 240, "Action summary")
        });
    }
}

export interface SoulCordComposerPreview {
    id: string;
    characterCount: number;
    parts: readonly string[];
    sendRequired: true;
}

export class SoulCordComposerToolkitController implements SoulCordV2Disposable {
    readonly #lifecycle = new SoulCordV2Lifecycle();
    readonly #intents: IntentFactory;
    readonly #previews = new Map<string, SoulCordComposerPreview>();
    #sequence = 0;

    constructor(clock: Clock = Date.now) {this.#intents = new IntentFactory(clock);}
    get disposed(): boolean {return this.#lifecycle.disposed;}
    resourceCounts(): Readonly<Record<string, number>> {return this.#lifecycle.resourceCounts();}

    previewDraft(text: string, partLimit = 2_000): SoulCordComposerPreview {
        this.#lifecycle.assertActive();
        boundedText(text, 64_000, "Draft");
        boundedInteger(partLimit, 200, 4_000, "Part limit");
        const parts: string[] = [];
        for (let offset = 0; offset < text.length; offset += partLimit) parts.push(text.slice(offset, offset + partLimit));
        if (!parts.length) parts.push("");
        if (parts.length > 32) throw new Error("Draft would exceed the 32-part preview limit.");
        const preview = Object.freeze({id: `composer:${++this.#sequence}`, characterCount: text.length, parts: Object.freeze(parts), sendRequired: true as const});
        if (this.#previews.size === 8) this.#previews.delete(this.#previews.keys().next().value!);
        this.#previews.set(preview.id, preview);
        return preview;
    }

    confirmCopy(previewId: string): SoulCordV2ActionIntent<{parts: readonly string[];}> {
        this.#lifecycle.assertActive();
        const preview = this.#previews.get(previewId);
        if (!preview) throw new Error("Composer preview is missing or expired.");
        this.#previews.delete(previewId);
        return this.#intents.create("composer-toolkit", "copy-split-parts", {parts: preview.parts}, `Copy ${preview.parts.length} reviewed part(s).`);
    }

    confirmReply(messageId: string): SoulCordV2ActionIntent<{messageId: string;}> {
        this.#lifecycle.assertActive();
        return this.#intents.create("composer-toolkit", "open-reply-composer", {messageId: requireToken(messageId, "Message ID", 32)}, "Open a reply composer without sending.");
    }

    dispose(): void {this.#previews.clear(); this.#lifecycle.dispose();}
}

export interface SoulCordCallSnapshot {
    channelId: string;
    connectedAt: number;
    participantCount: number;
    speakerCount: number;
    viewerCount: number;
}

export class SoulCordCallContextController implements SoulCordV2Disposable {
    readonly #lifecycle = new SoulCordV2Lifecycle();
    #current?: Readonly<SoulCordCallSnapshot>;
    get disposed(): boolean {return this.#lifecycle.disposed;}
    resourceCounts(): Readonly<Record<string, number>> {return this.#lifecycle.resourceCounts();}

    observe(snapshot: SoulCordCallSnapshot): Readonly<SoulCordCallSnapshot> {
        this.#lifecycle.assertActive();
        const normalized = Object.freeze({
            channelId: requireToken(snapshot.channelId, "Channel ID", 32),
            connectedAt: boundedInteger(snapshot.connectedAt, 0, Number.MAX_SAFE_INTEGER, "Connected time"),
            participantCount: boundedInteger(snapshot.participantCount, 0, 500, "Participant count"),
            speakerCount: boundedInteger(snapshot.speakerCount, 0, 500, "Speaker count"),
            viewerCount: boundedInteger(snapshot.viewerCount, 0, 500, "Viewer count")
        });
        if (normalized.speakerCount > normalized.participantCount || normalized.viewerCount > normalized.participantCount) throw new Error("Call counts are inconsistent.");
        this.#current = normalized;
        return normalized;
    }

    summary(now = Date.now()): Readonly<{connected: boolean; elapsedMs: number; participantCount: number; speakerCount: number; viewerCount: number;}> {
        this.#lifecycle.assertActive();
        if (!this.#current) return Object.freeze({connected: false, elapsedMs: 0, participantCount: 0, speakerCount: 0, viewerCount: 0});
        return Object.freeze({connected: true, elapsedMs: Math.max(0, now - this.#current.connectedAt), participantCount: this.#current.participantCount, speakerCount: this.#current.speakerCount, viewerCount: this.#current.viewerCount});
    }

    dispose(): void {this.#current = undefined; this.#lifecycle.dispose();}
}

export class SoulCordAudioConsoleController implements SoulCordV2Disposable {
    readonly #lifecycle = new SoulCordV2Lifecycle();
    readonly #intents: IntentFactory;
    #preview?: Readonly<{userId: string; currentPercent: number; targetPercent: number;}>;
    constructor(clock: Clock = Date.now) {this.#intents = new IntentFactory(clock);}
    get disposed(): boolean {return this.#lifecycle.disposed;}
    resourceCounts(): Readonly<Record<string, number>> {return this.#lifecycle.resourceCounts();}

    previewVolume(userId: string, currentPercent: number, targetPercent: number): Readonly<{userId: string; currentPercent: number; targetPercent: number;}> {
        this.#lifecycle.assertActive();
        this.#preview = Object.freeze({userId: requireToken(userId, "User ID", 32), currentPercent: boundedNumber(currentPercent, 0, 200, "Current volume"), targetPercent: boundedNumber(targetPercent, 0, 200, "Target volume")});
        return this.#preview;
    }

    confirmVolume(): SoulCordV2ActionIntent<{userId: string; volumePercent: number; localOnly: true;}> {
        this.#lifecycle.assertActive();
        if (!this.#preview) throw new Error("Review a local volume change first.");
        const preview = this.#preview;
        this.#preview = undefined;
        return this.#intents.create("audio-console", "set-local-volume", {userId: preview.userId, volumePercent: preview.targetPercent, localOnly: true}, `Set local playback volume to ${preview.targetPercent}%.`);
    }

    dispose(): void {this.#preview = undefined; this.#lifecycle.dispose();}
}

export interface SoulCordVoiceNotePreview {
    recordingId: string;
    durationMs: number;
    sizeBytes: number;
    mime: "audio/ogg" | "audio/webm";
}

export const SOULCORD_VOICE_NOTE_MAX_DURATION_MS = 600_000;
export const SOULCORD_VOICE_NOTE_MAX_BYTES = 25 * 1024 * 1024;

export class SoulCordVoiceNoteStudioController implements SoulCordV2Disposable {
    readonly #lifecycle = new SoulCordV2Lifecycle();
    readonly #intents: IntentFactory;
    #recording = false;
    #preview?: Readonly<SoulCordVoiceNotePreview>;
    constructor(clock: Clock = Date.now) {this.#intents = new IntentFactory(clock);}
    get disposed(): boolean {return this.#lifecycle.disposed;}
    resourceCounts(): Readonly<Record<string, number>> {return this.#lifecycle.resourceCounts();}

    beginFromUserGesture(userGesture: boolean): SoulCordV2ActionIntent<{localOnly: true;}> {
        this.#lifecycle.assertActive();
        if (!userGesture) throw new Error("Voice recording requires a direct user gesture.");
        if (this.#recording) throw new Error("A voice-note recording is already active.");
        this.#recording = true;
        return this.#intents.create("voice-note-studio", "begin-local-recording", {localOnly: true}, "Begin a local recording; no upload is authorized.", 10_000);
    }

    attachPreview(value: SoulCordVoiceNotePreview): Readonly<SoulCordVoiceNotePreview> {
        this.#lifecycle.assertActive();
        if (!this.#recording) throw new Error("No user-started recording is active.");
        try {
            const preview = Object.freeze({
                recordingId: requireToken(value.recordingId, "Recording ID"),
                durationMs: boundedInteger(value.durationMs, 200, SOULCORD_VOICE_NOTE_MAX_DURATION_MS, "Recording duration"),
                sizeBytes: boundedInteger(value.sizeBytes, 1, SOULCORD_VOICE_NOTE_MAX_BYTES, "Recording size"),
                mime: value.mime
            });
            if (preview.mime !== "audio/ogg" && preview.mime !== "audio/webm") throw new Error("Voice-note MIME type is unsupported.");
            this.#recording = false;
            this.#preview = preview;
            return preview;
        }
        catch (error) {
            this.cancel();
            throw error;
        }
    }

    confirmUpload(channelId: string): SoulCordV2ActionIntent<{channelId: string; recordingId: string; sizeBytes: number; mime: string;}> {
        this.#lifecycle.assertActive();
        if (!this.#preview) throw new Error("Preview a voice note before authorizing upload.");
        const preview = this.#preview;
        this.#preview = undefined;
        return this.#intents.create("voice-note-studio", "upload-voice-note", {channelId: requireToken(channelId, "Channel ID", 32), recordingId: preview.recordingId, sizeBytes: preview.sizeBytes, mime: preview.mime}, `Upload the reviewed ${Math.ceil(preview.durationMs / 1_000)} second voice note.`, 15_000);
    }

    cancel(): void {this.#recording = false; this.#preview = undefined;}
    dispose(): void {this.cancel(); this.#lifecycle.dispose();}
}

export type SoulCordTranslationProvider = "deepl" | "libretranslate";

export interface SoulCordTranslationPreview {
    id: string;
    provider: SoulCordTranslationProvider;
    providerHost: string;
    sourceLanguage: string;
    targetLanguage: string;
    text: string;
    disclosure: string;
}

export class SoulCordTranslationDeskController implements SoulCordV2Disposable {
    readonly #lifecycle = new SoulCordV2Lifecycle();
    readonly #intents: IntentFactory;
    readonly #previews = new Map<string, SoulCordTranslationPreview>();
    #sequence = 0;
    constructor(clock: Clock = Date.now) {this.#intents = new IntentFactory(clock);}
    get disposed(): boolean {return this.#lifecycle.disposed;}
    resourceCounts(): Readonly<Record<string, number>> {return this.#lifecycle.resourceCounts();}

    preview(provider: SoulCordTranslationProvider, endpoint: string | undefined, sourceLanguage: string, targetLanguage: string, text: string): SoulCordTranslationPreview {
        this.#lifecycle.assertActive();
        boundedText(text, 16_000, "Translation text");
        const source = requireToken(sourceLanguage, "Source language", 16);
        const target = requireToken(targetLanguage, "Target language", 16);
        let providerHost = "api-free.deepl.com";
        if (provider === "libretranslate") {
            let url: URL;
            try {url = new URL(endpoint ?? "");}
            catch {throw new Error("LibreTranslate requires a valid HTTPS endpoint.");}
            if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("LibreTranslate requires a credential-free HTTPS endpoint URL.");
            providerHost = url.host.toLowerCase();
        }
        else if (provider !== "deepl") {throw new Error("Translation provider is unsupported.");}
        const preview = Object.freeze({id: `translation:${++this.#sequence}`, provider, providerHost, sourceLanguage: source, targetLanguage: target, text, disclosure: `The reviewed text will be sent to ${providerHost}. It will not be inserted or sent to Discord automatically.`});
        if (this.#previews.size === 4) this.#previews.delete(this.#previews.keys().next().value!);
        this.#previews.set(preview.id, preview);
        return preview;
    }

    confirm(previewId: string): SoulCordV2ActionIntent<{provider: SoulCordTranslationProvider; providerHost: string; sourceLanguage: string; targetLanguage: string; text: string;}> {
        this.#lifecycle.assertActive();
        const preview = this.#previews.get(previewId);
        if (!preview) throw new Error("Translation preview is missing or expired.");
        this.#previews.delete(previewId);
        return this.#intents.create("translation-desk", "translate-text", {provider: preview.provider, providerHost: preview.providerHost, sourceLanguage: preview.sourceLanguage, targetLanguage: preview.targetLanguage, text: preview.text}, `Send reviewed text to ${preview.providerHost} for translation.`, 15_000);
    }

    dispose(): void {this.#previews.clear(); this.#lifecycle.dispose();}
}

export interface SoulCordPeopleSpacesSnapshot {
    pinnedDmIds: readonly string[];
    hiddenGuildIds: readonly string[];
    guildAliases: Readonly<Record<string, string>>;
}

export class SoulCordPeopleSpacesController implements SoulCordV2Disposable {
    readonly #lifecycle = new SoulCordV2Lifecycle();
    readonly #pinnedDmIds = new Set<string>();
    readonly #hiddenGuildIds = new Set<string>();
    readonly #guildAliases = new Map<string, string>();
    get disposed(): boolean {return this.#lifecycle.disposed;}
    resourceCounts(): Readonly<Record<string, number>> {return this.#lifecycle.resourceCounts();}

    pinDm(id: string): void {this.#lifecycle.assertActive(); if (this.#pinnedDmIds.size >= 100 && !this.#pinnedDmIds.has(id)) throw new Error("Pinned DM limit reached."); this.#pinnedDmIds.add(requireToken(id, "DM ID", 32));}
    hideGuild(id: string): void {this.#lifecycle.assertActive(); if (this.#hiddenGuildIds.size >= 200 && !this.#hiddenGuildIds.has(id)) throw new Error("Hidden server limit reached."); this.#hiddenGuildIds.add(requireToken(id, "Guild ID", 32));}
    aliasGuild(id: string, alias: string): void {this.#lifecycle.assertActive(); if (this.#guildAliases.size >= 200 && !this.#guildAliases.has(id)) throw new Error("Server alias limit reached."); this.#guildAliases.set(requireToken(id, "Guild ID", 32), boundedText(alias.trim(), 48, "Server alias"));}

    snapshot(): Readonly<SoulCordPeopleSpacesSnapshot> {
        this.#lifecycle.assertActive();
        return Object.freeze({pinnedDmIds: Object.freeze([...this.#pinnedDmIds]), hiddenGuildIds: Object.freeze([...this.#hiddenGuildIds]), guildAliases: Object.freeze(Object.fromEntries(this.#guildAliases))});
    }

    dispose(): void {this.#pinnedDmIds.clear(); this.#hiddenGuildIds.clear(); this.#guildAliases.clear(); this.#lifecycle.dispose();}
}

export interface SoulCordGlanceMessage {
    id: string;
    authorLabel: string;
    text: string;
    timestamp: number;
}

export class SoulCordChannelGlanceController implements SoulCordV2Disposable {
    readonly #lifecycle = new SoulCordV2Lifecycle();
    #messages: ReadonlyArray<Readonly<SoulCordGlanceMessage>> = [];
    get disposed(): boolean {return this.#lifecycle.disposed;}
    resourceCounts(): Readonly<Record<string, number>> {return this.#lifecycle.resourceCounts();}

    showAlreadyLoaded(alreadyLoaded: boolean, messages: readonly SoulCordGlanceMessage[]): ReadonlyArray<Readonly<SoulCordGlanceMessage>> {
        this.#lifecycle.assertActive();
        if (!alreadyLoaded) throw new Error("Channel Glance cannot fetch or backfill messages.");
        if (messages.length > 5) throw new Error("Channel Glance is limited to five loaded messages.");
        this.#messages = Object.freeze(messages.map(message => Object.freeze({id: requireToken(message.id, "Message ID", 32), authorLabel: boundedText(message.authorLabel, 80, "Author label"), text: boundedText(message.text, 2_000, "Message preview"), timestamp: boundedInteger(message.timestamp, 0, Number.MAX_SAFE_INTEGER, "Message timestamp")})));
        return this.#messages;
    }

    clear(): void {this.#messages = [];}
    dispose(): void {this.clear(); this.#lifecycle.dispose();}
}

export interface SoulCordNotificationPreview {
    id: string;
    scope: "guild" | "mentions" | "all";
    notificationIds: readonly string[];
    count: number;
}

export class SoulCordNotificationReviewController implements SoulCordV2Disposable {
    readonly #lifecycle = new SoulCordV2Lifecycle();
    readonly #intents: IntentFactory;
    readonly #clock: Clock;
    #preview?: SoulCordNotificationPreview;
    #previewExpiresAt = 0;
    #sequence = 0;
    constructor(clock: Clock = Date.now) {this.#clock = clock; this.#intents = new IntentFactory(clock);}
    get disposed(): boolean {return this.#lifecycle.disposed;}
    resourceCounts(): Readonly<Record<string, number>> {return this.#lifecycle.resourceCounts();}

    preview(scope: SoulCordNotificationPreview["scope"], notificationIds: readonly string[]): SoulCordNotificationPreview {
        this.#lifecycle.assertActive();
        if (!(["guild", "mentions", "all"] as const).includes(scope)) throw new Error("Notification scope is invalid.");
        if (notificationIds.length > 500) throw new Error("Notification review is limited to 500 items.");
        const ids = [...new Set(notificationIds.map(id => requireToken(id, "Notification ID", 64)))];
        this.#preview = Object.freeze({id: `notification:${++this.#sequence}`, scope, notificationIds: Object.freeze(ids), count: ids.length});
        this.#previewExpiresAt = this.#clock() + 10_000;
        return this.#preview;
    }

    confirm(previewId: string): SoulCordV2ActionIntent<{scope: SoulCordNotificationPreview["scope"]; notificationIds: readonly string[];}> {
        this.#lifecycle.assertActive();
        if (!this.#preview || this.#preview.id !== previewId) throw new Error("Notification preview is missing or stale.");
        if (this.#clock() > this.#previewExpiresAt) {
            this.#preview = undefined;
            this.#previewExpiresAt = 0;
            throw new Error("Notification preview expired; review the current notification set again.");
        }
        const preview = this.#preview;
        this.#preview = undefined;
        this.#previewExpiresAt = 0;
        return this.#intents.create("notification-review", "mark-notifications-read", {scope: preview.scope, notificationIds: preview.notificationIds}, `Mark ${preview.count} reviewed notification(s) as read.`, 10_000);
    }

    dispose(): void {this.#preview = undefined; this.#previewExpiresAt = 0; this.#lifecycle.dispose();}
}

export interface SoulCordMotionSettings {
    reducedMotion: boolean;
    intensity: number;
    durationMs: number;
    effectsEnabled: boolean;
}

export class SoulCordMotionStudioController implements SoulCordV2Disposable {
    readonly #lifecycle = new SoulCordV2Lifecycle();
    #settings: Readonly<SoulCordMotionSettings> = Object.freeze({reducedMotion: false, intensity: 0.5, durationMs: 180, effectsEnabled: false});
    get disposed(): boolean {return this.#lifecycle.disposed;}
    resourceCounts(): Readonly<Record<string, number>> {return this.#lifecycle.resourceCounts();}

    configure(settings: SoulCordMotionSettings): Readonly<SoulCordMotionSettings> {
        this.#lifecycle.assertActive();
        const reducedMotion = Boolean(settings.reducedMotion);
        this.#settings = Object.freeze({
            reducedMotion,
            intensity: reducedMotion ? 0 : boundedNumber(settings.intensity, 0, 1, "Motion intensity"),
            durationMs: reducedMotion ? 0 : boundedInteger(settings.durationMs, 0, 800, "Motion duration"),
            effectsEnabled: reducedMotion ? false : Boolean(settings.effectsEnabled)
        });
        return this.#settings;
    }

    dispose(): void {this.#settings = Object.freeze({reducedMotion: true, intensity: 0, durationMs: 0, effectsEnabled: false}); this.#lifecycle.dispose();}
}

const PERMISSION_COPY: Readonly<Record<string, string>> = Object.freeze({
    VIEW_CHANNEL: "See the channel and its visible history.",
    CONNECT: "Join the voice channel.",
    STREAM: "Broadcast video or screen content.",
    SEND_MESSAGES: "Send messages in the channel.",
    MANAGE_CHANNELS: "Edit the channel and its permission overwrites."
});

export class SoulCordPermissionLensController implements SoulCordV2Disposable {
    readonly #lifecycle = new SoulCordV2Lifecycle();
    get disposed(): boolean {return this.#lifecycle.disposed;}
    resourceCounts(): Readonly<Record<string, number>> {return this.#lifecycle.resourceCounts();}

    explainFromCache(fromCache: boolean, permissionNames: readonly string[]): ReadonlyArray<Readonly<{permission: string; explanation: string;}>> {
        this.#lifecycle.assertActive();
        if (!fromCache) throw new Error("Permission Lens cannot fetch permissions.");
        if (permissionNames.length > 100) throw new Error("Permission Lens input is too large.");
        return Object.freeze([...new Set(permissionNames)].map(permission => {
            const normalized = requireToken(permission, "Permission", 64).toUpperCase();
            return Object.freeze({permission: normalized, explanation: PERMISSION_COPY[normalized] ?? "Discord permission recognized locally; review native channel settings for details."});
        }));
    }

    dispose(): void {this.#lifecycle.dispose();}
}

export interface SoulCordVoiceHealthSample {
    timestamp: number;
    rttMs: number;
    jitterMs: number;
    packetLossPercent: number;
}

export class SoulCordVoiceHealthController implements SoulCordV2Disposable {
    readonly #lifecycle = new SoulCordV2Lifecycle();
    readonly #samples: Array<Readonly<SoulCordVoiceHealthSample>> = [];
    get disposed(): boolean {return this.#lifecycle.disposed;}
    resourceCounts(): Readonly<Record<string, number>> {return this.#lifecycle.resourceCounts();}

    add(sample: SoulCordVoiceHealthSample): void {
        this.#lifecycle.assertActive();
        this.#samples.push(Object.freeze({timestamp: boundedInteger(sample.timestamp, 0, Number.MAX_SAFE_INTEGER, "Sample timestamp"), rttMs: boundedNumber(sample.rttMs, 0, 60_000, "RTT"), jitterMs: boundedNumber(sample.jitterMs, 0, 60_000, "Jitter"), packetLossPercent: boundedNumber(sample.packetLossPercent, 0, 100, "Packet loss")}));
        if (this.#samples.length > 120) this.#samples.shift();
    }

    summary(): Readonly<{sampleCount: number; averageRttMs: number; averageJitterMs: number; averagePacketLossPercent: number;}> {
        this.#lifecycle.assertActive();
        const count = this.#samples.length;
        if (!count) return Object.freeze({sampleCount: 0, averageRttMs: 0, averageJitterMs: 0, averagePacketLossPercent: 0});
        const sum = (key: "rttMs" | "jitterMs" | "packetLossPercent") => this.#samples.reduce((total, sample) => total + sample[key], 0) / count;
        return Object.freeze({sampleCount: count, averageRttMs: sum("rttMs"), averageJitterMs: sum("jitterMs"), averagePacketLossPercent: sum("packetLossPercent")});
    }

    dispose(): void {this.#samples.splice(0); this.#lifecycle.dispose();}
}

export interface SoulCordLocalIdentityNote {
    subjectId: string;
    text: string;
    tags: readonly string[];
}

export class SoulCordLocalIdentityNotesController implements SoulCordV2Disposable {
    readonly #lifecycle = new SoulCordV2Lifecycle();
    readonly #intents: IntentFactory;
    readonly #notes = new Map<string, Readonly<SoulCordLocalIdentityNote>>();
    constructor(clock: Clock = Date.now) {this.#intents = new IntentFactory(clock);}
    get disposed(): boolean {return this.#lifecycle.disposed;}
    resourceCounts(): Readonly<Record<string, number>> {return this.#lifecycle.resourceCounts();}

    preview(note: SoulCordLocalIdentityNote): Readonly<SoulCordLocalIdentityNote> {
        this.#lifecycle.assertActive();
        if (this.#notes.size >= 500 && !this.#notes.has(note.subjectId)) throw new Error("Local identity note limit reached.");
        const tags = [...new Set(note.tags.map(tag => boundedText(tag.trim(), 24, "Identity tag")))];
        if (tags.length > 8) throw new Error("A local identity note supports at most eight tags.");
        const normalized = Object.freeze({subjectId: requireToken(note.subjectId, "Subject ID", 32), text: boundedText(note.text, 280, "Identity note"), tags: Object.freeze(tags)});
        this.#notes.set(normalized.subjectId, normalized);
        return normalized;
    }

    confirmSecureWrite(subjectId: string): SoulCordV2ActionIntent<{subjectId: string; note: string; tags: readonly string[]; storage: "secure-only";}> {
        this.#lifecycle.assertActive();
        const note = this.#notes.get(subjectId);
        if (!note) throw new Error("Review an identity note before storing it.");
        this.#notes.delete(subjectId);
        return this.#intents.create("local-identity-notes", "write-encrypted-identity-note", {subjectId: note.subjectId, note: note.text, tags: note.tags, storage: "secure-only"}, "Write one reviewed note through SoulCord secure storage.");
    }

    redactedExport(): Readonly<{version: 1; pendingNoteCount: number; containsPlaintext: false;}> {
        this.#lifecycle.assertActive();
        return Object.freeze({version: 1 as const, pendingNoteCount: this.#notes.size, containsPlaintext: false as const});
    }

    dispose(): void {this.#notes.clear(); this.#lifecycle.dispose();}
}
