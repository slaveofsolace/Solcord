// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {
    SolcordAudioConsoleController,
    SolcordCallContextController,
    SolcordChannelGlanceController,
    SolcordComposerToolkitController,
    SolcordLocalIdentityNotesController,
    SolcordMotionStudioController,
    SolcordNotificationReviewController,
    SolcordPeopleSpacesController,
    SolcordPermissionLensController,
    SolcordTranslationDeskController,
    SolcordV2Lifecycle,
    SolcordVoiceHealthController,
    SolcordVoiceNoteStudioController,
    SOLCORD_VOICE_NOTE_MAX_BYTES,
    SOLCORD_V2_FEATURE_CONTRACTS
} from "../../src/common/solcord/v2-feature-models";

describe("Solcord V2 clean-room feature models", () => {
    test("publishes twelve bounded, default-off contracts with explicit safety boundaries", () => {
        expect(SOLCORD_V2_FEATURE_CONTRACTS.map(contract => contract.id)).toEqual([
            "composer-toolkit", "call-context", "audio-console", "voice-note-studio", "translation-desk", "people-and-spaces",
            "channel-glance", "notification-review", "motion-studio", "permission-lens", "voice-health", "local-identity-notes"
        ]);
        expect(SOLCORD_V2_FEATURE_CONTRACTS.every(contract => !contract.defaultEnabled && contract.boundaries.length >= 2)).toBeTrue();
        expect(Object.isFrozen(SOLCORD_V2_FEATURE_CONTRACTS)).toBeTrue();
    });

    test("owns resources explicitly, reports them, and tears down in reverse order", () => {
        const lifecycle = new SolcordV2Lifecycle();
        const events: string[] = [];
        lifecycle.own("listener", () => events.push("listener"));
        lifecycle.own("timer", () => events.push("timer"));
        expect(lifecycle.resourceCounts()).toEqual({listener: 1, timer: 1});
        lifecycle.dispose();
        lifecycle.dispose();
        expect(events).toEqual(["timer", "listener"]);
        expect(lifecycle.resourceCounts()).toEqual({});
        expect(() => lifecycle.assertActive()).toThrow("disposed");
    });

    test("Composer Toolkit previews bounded parts and emits non-sending adapter intents", () => {
        const controller = new SolcordComposerToolkitController(() => 1_000);
        const preview = controller.previewDraft("a".repeat(400), 200);
        expect(preview).toEqual({id: "composer:1", characterCount: 400, parts: ["a".repeat(200), "a".repeat(200)], sendRequired: true});
        const copy = controller.confirmCopy(preview.id);
        expect(copy).toMatchObject({kind: "copy-split-parts", requiresAdapterExecution: true, payload: {parts: ["a".repeat(200), "a".repeat(200)]}});
        expect(JSON.stringify(copy)).not.toContain("send-message");
        expect(controller.confirmReply("123456789")).toMatchObject({kind: "open-reply-composer", payload: {messageId: "123456789"}});
        expect(() => controller.previewDraft("x".repeat(64_001))).toThrow("exceeds");
    });

    test("Call Context and Audio Console remain local, consistent, and bounded", () => {
        const calls = new SolcordCallContextController();
        calls.observe({channelId: "100", connectedAt: 1_000, participantCount: 5, speakerCount: 2, viewerCount: 1});
        expect(calls.summary(2_500)).toEqual({connected: true, elapsedMs: 1_500, participantCount: 5, speakerCount: 2, viewerCount: 1, participantIds: [], speakerIds: [], viewerLabels: []});
        expect(() => calls.observe({channelId: "100", connectedAt: 1_000, participantCount: 2, speakerCount: 3, viewerCount: 1})).toThrow("inconsistent");

        const audio = new SolcordAudioConsoleController(() => 2_000);
        audio.previewVolume("123456789012345678", 100, 135);
        expect(audio.confirmVolume()).toMatchObject({kind: "set-local-volume", payload: {userId: "123456789012345678", volumePercent: 135, localOnly: true}});
        expect(() => audio.previewVolume("123", 100, 135)).toThrow("complete Discord user ID");
        expect(() => audio.previewVolume("123456789012345678", 100, 201)).toThrow("between 0 and 200");
    });

    test("Voice Note Studio requires gesture, local preview, then a separate expiring upload intent", () => {
        const voice = new SolcordVoiceNoteStudioController(() => 3_000);
        expect(() => voice.beginFromUserGesture(false)).toThrow("user gesture");
        const begin = voice.beginFromUserGesture(true);
        expect(begin).toMatchObject({kind: "begin-local-recording", payload: {localOnly: true}});
        voice.attachPreview({recordingId: "recording-1", durationMs: 2_500, sizeBytes: 50_000, mime: "audio/webm", waveform: [0, 64, 255]});
        const upload = voice.confirmUpload("300");
        expect(upload).toMatchObject({kind: "upload-voice-note", expiresAt: 18_000, payload: {channelId: "300", recordingId: "recording-1", sizeBytes: 50_000}});
        expect(voice.confirmUpload("300")).toMatchObject({kind: "upload-voice-note", payload: {recordingId: "recording-1"}});
        voice.completeUpload("recording-1");
        expect(() => voice.confirmUpload("300")).toThrow("Preview");

        voice.beginFromUserGesture(true);
        expect(() => voice.attachPreview({recordingId: "recording-2", durationMs: 2_500, sizeBytes: SOLCORD_VOICE_NOTE_MAX_BYTES + 1, mime: "audio/webm", waveform: []})).toThrow("Recording size");
        expect(() => voice.beginFromUserGesture(true)).not.toThrow();
    });

    test("Translation Desk discloses the exact host and cannot perform unreviewed or insecure network work", () => {
        const translation = new SolcordTranslationDeskController(() => 4_000);
        expect(() => translation.preview("libretranslate", "http://translate.example", "en", "es", "hello")).toThrow("HTTPS");
        expect(() => translation.preview("libretranslate", "https://token@translate.example", "en", "es", "hello")).toThrow("credential-free");
        const preview = translation.preview("libretranslate", "https://translate.example/api", "en", "es", "hello");
        expect(preview.disclosure).toContain("translate.example");
        expect(preview.disclosure).toContain("not be inserted or sent");
        const intent = translation.confirm(preview.id);
        expect(intent).toMatchObject({kind: "translate-text", requiresAdapterExecution: true, payload: {provider: "libretranslate", providerHost: "translate.example", text: "hello"}});
        expect(() => translation.confirm(preview.id)).toThrow("missing or expired");
    });

    test("People and Spaces and Channel Glance operate only on bounded local or already-loaded state", () => {
        const people = new SolcordPeopleSpacesController();
        people.pinDm("400");
        people.hideGuild("500");
        people.aliasGuild("500", "Workshop");
        people.favoriteFriend("600");
        people.hideFriend("700");
        people.ignoreVoiceChannel("800");
        people.ignoreVoiceGuild("900");
        expect(people.snapshot()).toEqual({pinnedDmIds: ["400"], hiddenGuildIds: ["500"], guildAliases: {500: "Workshop"}, favoriteFriendIds: ["600"], hiddenFriendIds: ["700"], ignoredVoiceChannelIds: ["800"], ignoredVoiceGuildIds: ["900"]});
        people.unpinDm("400");
        people.showGuild("500");
        people.clearGuildAlias("500");
        people.unfavoriteFriend("600");
        people.showFriend("700");
        people.includeVoiceChannel("800");
        people.includeVoiceGuild("900");
        expect(people.snapshot()).toEqual({pinnedDmIds: [], hiddenGuildIds: [], guildAliases: {}, favoriteFriendIds: [], hiddenFriendIds: [], ignoredVoiceChannelIds: [], ignoredVoiceGuildIds: []});

        const glance = new SolcordChannelGlanceController();
        expect(() => glance.showAlreadyLoaded(false, [])).toThrow("cannot fetch");
        expect(glance.showAlreadyLoaded(true, [{id: "600", authorLabel: "Ada", text: "loaded locally", timestamp: 10}])).toHaveLength(1);
        expect(() => glance.showAlreadyLoaded(true, Array.from({length: 6}, (_, index) => ({id: String(index + 1), authorLabel: "A", text: "B", timestamp: index})))).toThrow("five loaded");
        glance.dispose();
        expect(() => glance.showAlreadyLoaded(true, [])).toThrow("disposed");
    });

    test("Notification Review never marks read until a reviewed intent is explicitly requested", () => {
        let now = 5_000;
        const notifications = new SolcordNotificationReviewController(() => now);
        const emptyPreview = notifications.preview("guild", []);
        expect(emptyPreview.count).toBe(0);
        expect(() => notifications.confirm(emptyPreview.id)).toThrow("No reviewed notifications");
        expect(() => notifications.confirm(emptyPreview.id)).toThrow("missing or stale");

        const preview = notifications.preview("mentions", ["700", "700", "701"]);
        expect(preview).toEqual({id: "notification:2", scope: "mentions", notificationIds: ["700", "701"], count: 2});
        now = 15_001;
        expect(() => notifications.confirm(preview.id)).toThrow("expired");
        expect(() => notifications.confirm(preview.id)).toThrow("missing or stale");

        const freshPreview = notifications.preview("mentions", ["700", "701"]);
        expect(notifications.confirm(freshPreview.id)).toMatchObject({kind: "mark-notifications-read", payload: {scope: "mentions", notificationIds: ["700", "701"]}});
        expect(() => notifications.confirm(freshPreview.id)).toThrow("missing or stale");
    });

    test("Motion, permissions, and voice health respect accessibility, cache, and sampling limits", () => {
        const motion = new SolcordMotionStudioController();
        expect(motion.configure({reducedMotion: true, intensity: 1, durationMs: 800, effectsEnabled: true})).toEqual({reducedMotion: true, intensity: 0, durationMs: 0, effectsEnabled: false});

        const permissions = new SolcordPermissionLensController();
        expect(() => permissions.explainFromCache(false, ["STREAM"])).toThrow("cannot fetch");
        expect(permissions.explainFromCache(true, ["STREAM"])[0]).toEqual({permission: "STREAM", explanation: "Broadcast video or screen content."});

        const health = new SolcordVoiceHealthController();
        for (let index = 0; index < 130; index++) health.add({timestamp: index, rttMs: 20, jitterMs: 5, packetLossPercent: 1});
        expect(health.summary()).toEqual({sampleCount: 120, averageRttMs: 20, averageJitterMs: 5, averagePacketLossPercent: 1});
    });

    test("Local Identity Notes expose no plaintext through normal export and require secure-store execution", () => {
        const notes = new SolcordLocalIdentityNotesController(() => 6_000);
        notes.preview({subjectId: "800", text: "Met through the accessibility group.", tags: ["friend", "friend", "a11y"]});
        expect(notes.redactedExport()).toEqual({version: 1, pendingNoteCount: 1, containsPlaintext: false});
        expect(JSON.stringify(notes.redactedExport())).not.toContain("accessibility group");
        expect(notes.confirmSecureWrite("800")).toMatchObject({kind: "write-encrypted-identity-note", payload: {subjectId: "800", tags: ["friend", "a11y"], storage: "secure-only"}});
        expect(notes.redactedExport().pendingNoteCount).toBe(0);
    });
});
