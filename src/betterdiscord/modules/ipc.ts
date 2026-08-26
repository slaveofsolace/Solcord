import {ipcRenderer as ipc} from "electron";

import * as IPCEvents from "@common/constants/ipcevents";

import Events from "./emitter";
import type {DialogOptions} from "@common/types/ipc";
import {claimSoulCordTimelineBootstrap} from "../polyfill/remote";

// Capture the private invoke primitive before community plugins can patch the
// exported Electron shim. Capability-bearing calls must never perform a
// property lookup through a mutable renderer object after plugin startup.
const invokePrivate = ipc.invoke.bind(ipc);


export default new class IPCRenderer {

    constructor() {
        ipc.on(IPCEvents.NAVIGATE, () => Events.dispatch("navigate"));
        ipc.on(IPCEvents.MAXIMIZE, () => Events.dispatch("maximize"));
        ipc.on(IPCEvents.MINIMIZE, () => Events.dispatch("minimize"));
    }

    openDevTools() {
        return ipc.send(IPCEvents.OPEN_DEVTOOLS);
    }

    closeDevTools() {
        return ipc.send(IPCEvents.CLOSE_DEVTOOLS);
    }

    toggleDevTools() {
        return ipc.send(IPCEvents.TOGGLE_DEVTOOLS);
    }

    relaunch(args?: string[]) {
        return ipc.send(IPCEvents.RELAUNCH, args);
    }

    runScript(script: string) {
        return ipc.invoke(IPCEvents.RUN_SCRIPT, script);
    }

    openWindow(url: string, options: {windowOptions: object; closeOnUrl: boolean;}) {
        return ipc.invoke(IPCEvents.OPEN_WINDOW, url, options);
    }

    inspectElement() {
        return ipc.send(IPCEvents.INSPECT_ELEMENT);
    }

    setMinimumSize(width: number, height: number) {
        return ipc.send(IPCEvents.MINIMUM_SIZE, width, height);
    }

    setWindowSize(width: number, height: number) {
        return ipc.send(IPCEvents.WINDOW_SIZE, width, height);
    }

    stopDevtoolsWarning() {
        return ipc.send(IPCEvents.DEVTOOLS_WARNING);
    }

    openDialog(options: Partial<DialogOptions>) {
        return ipc.invoke(IPCEvents.OPEN_DIALOG, options);
    }

    openPath(path: string) {
        return ipc.send(IPCEvents.OPEN_PATH, path);
    }

    allowPreloadOverride = {
        async set(value: boolean) {
            await ipc.invoke(IPCEvents.SET_ALLOW_PRELOAD_OVERRIDE, value);
        },
        async get(): Promise<boolean> {
            return ipc.invoke(IPCEvents.GET_ALLOW_PRELOAD_OVERRIDE);
        },
        async toggle() {
            await ipc.invoke(IPCEvents.SET_ALLOW_PRELOAD_OVERRIDE, !await this.get());
        }
    };

    getActivityCompatibilityHealth() {
        return ipc.invoke(IPCEvents.GET_ACTIVITY_COMPATIBILITY);
    }

    claimSoulCordTimelineBootstrap() {
        return claimSoulCordTimelineBootstrap();
    }

    bootstrapTimeline(bootstrapCapability: string) {
        return invokePrivate(IPCEvents.TIMELINE_BOOTSTRAP, {bootstrapCapability}) as Promise<{capability: string;}>;
    }

    bindTimelineAccount(capability: string, accountId: string) {
        return invokePrivate(IPCEvents.TIMELINE_BIND, {capability, accountId}) as Promise<{capability: string;}>;
    }

    releaseTimelineAccount(capability: string) {
        return invokePrivate(IPCEvents.TIMELINE_RELEASE, {capability}) as Promise<{capability: string;}>;
    }

    getTimelineStatus(capability: string) {
        return invokePrivate(IPCEvents.TIMELINE_STATUS, {capability});
    }

    appendTimeline(capability: string, request: unknown) {
        return invokePrivate(IPCEvents.TIMELINE_APPEND, this.#timelineRequest(capability, request));
    }

    readTimeline(capability: string, request: unknown) {
        return invokePrivate(IPCEvents.TIMELINE_READ, this.#timelineRequest(capability, request));
    }

    clearTimeline(capability: string, request: unknown) {
        return invokePrivate(IPCEvents.TIMELINE_CLEAR, this.#timelineRequest(capability, request));
    }

    getFriendWatchStatus(capability: string) {
        return invokePrivate(IPCEvents.FRIEND_WATCH_STATUS, {capability});
    }

    appendFriendWatch(capability: string, request: unknown) {
        return invokePrivate(IPCEvents.FRIEND_WATCH_APPEND, this.#timelineRequest(capability, request));
    }

    readFriendWatch(capability: string, request: unknown) {
        return invokePrivate(IPCEvents.FRIEND_WATCH_READ, this.#timelineRequest(capability, request));
    }

    clearFriendWatch(capability: string, request: unknown) {
        return invokePrivate(IPCEvents.FRIEND_WATCH_CLEAR, this.#timelineRequest(capability, request));
    }

    getAudienceGuardStatus(capability: string) {
        return invokePrivate(IPCEvents.AUDIENCE_GUARD_STATUS, {capability});
    }

    readAudienceGuard(capability: string, request: unknown) {
        return invokePrivate(IPCEvents.AUDIENCE_GUARD_READ, this.#timelineRequest(capability, request));
    }

    writeAudienceGuard(capability: string, request: unknown) {
        return invokePrivate(IPCEvents.AUDIENCE_GUARD_WRITE, this.#timelineRequest(capability, request));
    }

    clearAudienceGuard(capability: string, request: unknown) {
        return invokePrivate(IPCEvents.AUDIENCE_GUARD_CLEAR, this.#timelineRequest(capability, request));
    }

    applySoulCordSetup(capability: string, request: unknown) {
        return invokePrivate(IPCEvents.SETUP_APPLY, this.#privateRequest(capability, request));
    }

    acknowledgeSoulCordSetup(capability: string, transactionId: string) {
        return invokePrivate(IPCEvents.SETUP_ACKNOWLEDGE, {capability, transactionId});
    }

    reconcileSoulCordSetup(capability: string, transactionIds: string[]) {
        return invokePrivate(IPCEvents.SETUP_RECONCILE, {capability, transactionIds});
    }

    rollbackSoulCordSetup(capability: string, transactionId: string) {
        return invokePrivate(IPCEvents.SETUP_ROLLBACK, {capability, transactionId});
    }

    auditSoulCordSetup(capability: string) {
        return invokePrivate(IPCEvents.SETUP_AUDIT, {capability});
    }

    previewSoulCordProviderArchive(capability: string, request: unknown) {
        return invokePrivate(IPCEvents.PROVIDER_ARCHIVE_PREVIEW, this.#privateRequest(capability, request));
    }

    applySoulCordProviderArchive(capability: string, previewId: string) {
        return invokePrivate(IPCEvents.PROVIDER_ARCHIVE_APPLY, {capability, previewId});
    }

    rollbackSoulCordProviderArchive(capability: string, transactionId: string) {
        return invokePrivate(IPCEvents.PROVIDER_ARCHIVE_ROLLBACK, {capability, transactionId});
    }

    readSoulCordTranslationCredential(capability: string, request: unknown) {
        return invokePrivate(IPCEvents.TRANSLATION_CREDENTIAL_READ, this.#timelineRequest(capability, request));
    }

    writeSoulCordTranslationCredential(capability: string, request: unknown) {
        return invokePrivate(IPCEvents.TRANSLATION_CREDENTIAL_WRITE, this.#timelineRequest(capability, request));
    }

    clearSoulCordTranslationCredential(capability: string, request: unknown) {
        return invokePrivate(IPCEvents.TRANSLATION_CREDENTIAL_CLEAR, this.#timelineRequest(capability, request));
    }

    getSoulCordLocalIdentityNotesStatus(capability: string) {
        return invokePrivate(IPCEvents.LOCAL_IDENTITY_NOTES_STATUS, {capability});
    }

    readSoulCordLocalIdentityNotes(capability: string) {
        return invokePrivate(IPCEvents.LOCAL_IDENTITY_NOTES_READ, {capability});
    }

    writeSoulCordLocalIdentityNote(capability: string, request: unknown) {
        return invokePrivate(IPCEvents.LOCAL_IDENTITY_NOTES_WRITE, this.#timelineRequest(capability, request));
    }

    removeSoulCordLocalIdentityNote(capability: string, subjectId: string) {
        return invokePrivate(IPCEvents.LOCAL_IDENTITY_NOTES_REMOVE, {capability, subjectId});
    }

    clearSoulCordLocalIdentityNotes(capability: string) {
        return invokePrivate(IPCEvents.LOCAL_IDENTITY_NOTES_CLEAR, {capability});
    }

    #timelineRequest(capability: string, request: unknown): Record<string, unknown> {
        if (!request || typeof request !== "object" || Array.isArray(request)) throw new TypeError("Invalid SoulCord timeline request.");
        const payload = request as Record<string, unknown>;
        if (Object.hasOwn(payload, "capability") || Object.hasOwn(payload, "accountId") || Object.hasOwn(payload, "accountScope")) throw new TypeError("Timeline payload cannot select its authority.");
        return {...payload, capability};
    }

    #privateRequest(capability: string, request: unknown): Record<string, unknown> {
        if (!request || typeof request !== "object" || Array.isArray(request)) throw new TypeError("Invalid SoulCord private request.");
        const payload = request as Record<string, unknown>;
        if (Object.hasOwn(payload, "capability")) throw new TypeError("SoulCord private payload cannot select its authority.");
        return {...payload, capability};
    }
};
