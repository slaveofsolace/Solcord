import {describe, expect, test} from "bun:test";
import fs from "node:fs";
import path from "node:path";


const ROOT = path.resolve(import.meta.dir, "../..");
const source = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");

describe("Solcord renderer security contracts", () => {
    test("binds renderer injection to one main-process navigation boundary and the exact main frame", () => {
        const preload = source("src/electron/preload/index.ts");
        const ipc = source("src/electron/main/modules/ipc.ts");
        const betterDiscord = source("src/electron/main/modules/betterdiscord.ts");

        expect(preload).not.toContain("rendererDocumentGeneration");
        expect(preload).toContain("ipcRenderer.invoke(IPCEvents.RUN_RENDERER)");
        expect(ipc).not.toContain("isRendererDocumentGeneration");
        expect(ipc).toContain("BetterDiscord.injectRenderer(browserWindow, senderFrame)");
        expect(betterDiscord).toContain("new RendererDocumentInjectionGuard<Electron.WebContents>()");
        expect(betterDiscord).toContain("rendererOwner.on(\"did-navigate\", beginRendererDocument)");
        expect(betterDiscord).toContain("this.rendererDocuments.beginDocument(rendererOwner)");
        expect(betterDiscord).toContain("this.rendererDocuments.claim(webContents)");
        expect(betterDiscord).toContain("frame.executeJavaScript");
        expect(betterDiscord).not.toContain("injectedWebContents");
    });

    test("claims the private capability before plugin inventory and enforces audit before every addon start", () => {
        const core = source("src/betterdiscord/modules/core.ts");
        const runtime = source("src/betterdiscord/modules/solcord/runtime.ts");
        const runtimeStart = core.indexOf("await SolcordRuntime.start()");
        const pluginInitialize = core.indexOf("PluginManager.initialize()");
        const pluginEnforce = core.indexOf("await SolcordRuntime.enforceAddonIntegrityBeforeStart()", pluginInitialize);
        const pluginStart = core.indexOf("PluginManager.startAddons", pluginEnforce);
        const themeInitialize = core.indexOf("ThemeManager.initialize()");
        const themeEnforce = core.indexOf("await SolcordRuntime.enforceAddonIntegrityBeforeStart()", themeInitialize);
        const themeStart = core.indexOf("ThemeManager.startAddons", themeEnforce);

        expect(runtimeStart).toBeGreaterThanOrEqual(0);
        expect(runtimeStart).toBeLessThan(pluginInitialize);
        expect(pluginInitialize).toBeLessThan(pluginEnforce);
        expect(pluginEnforce).toBeLessThan(pluginStart);
        expect(themeInitialize).toBeLessThan(themeEnforce);
        expect(themeEnforce).toBeLessThan(themeStart);

        const startMethod = runtime.slice(runtime.indexOf("async start():"), runtime.indexOf("get recoveryMode"));
        expect(startMethod).toContain("await this.#bootstrapPrivateCapability()");
        expect(startMethod.indexOf("#bootstrapPrivateCapability")).toBeLessThan(startMethod.indexOf("for (const id of FEATURE_IDS)"));
    });

    test("captures private IPC methods before plugins and never passes account ids in storage payloads", () => {
        const runtime = source("src/betterdiscord/modules/solcord/runtime.ts");
        const ipc = source("src/betterdiscord/modules/ipc.ts");
        expect(runtime).toContain("const TIMELINE_IPC = Object.freeze");
        expect(runtime).toContain("#privateCapability?: string");
        expect(runtime).toContain("#privateCapabilityQueue");
        expect(ipc).toContain("const invokePrivate = ipc.invoke.bind(ipc)");
        expect(ipc).toContain("return invokePrivate(IPCEvents.TIMELINE_APPEND");
        expect(ipc).toContain("return invokePrivate(IPCEvents.SETUP_APPLY");
        expect(ipc).toContain("return invokePrivate(IPCEvents.SETUP_ACKNOWLEDGE");
        expect(ipc).toContain("return invokePrivate(IPCEvents.SETUP_RECONCILE");
        expect(runtime).not.toContain("IPC.appendTimeline({accountId");
        expect(runtime).not.toContain("IPC.readTimeline({accountId");
        expect(runtime).not.toContain("IPC.clearTimeline({accountId");
    });

    test("switches Timeline identity synchronously and discards events until the account is ready", () => {
        const runtime = source("src/betterdiscord/modules/solcord/runtime.ts");
        expect(runtime).toContain("userStore.addChangeListener(onAccountChange)");
        expect(runtime).toContain("timelineEventAccountMatches(accountId, current, accountReady)");
        expect(runtime).toContain("if (current !== accountId) void activateAccount()");
        expect(runtime).toContain("if (this.#boundTimelineAccountId !== current) throw new Error(\"TimelineAccountChangedBeforeAppend\")");
        expect(runtime).toContain("void this.#releaseTimelineAccount()");
        const activation = runtime.slice(runtime.indexOf("const activateAccount = async"), runtime.indexOf("const eventId =", runtime.indexOf("const activateAccount = async")));
        const clear = activation.indexOf("this.#timeline.clear()");
        const reset = activation.indexOf("this.#timelinePersistent = false", clear);
        const notify = activation.indexOf("this.#setHealth", reset);
        const firstAwait = activation.indexOf("await ");
        expect(clear).toBeGreaterThanOrEqual(0);
        expect(clear).toBeLessThan(reset);
        expect(reset).toBeLessThan(notify);
        expect(notify).toBeLessThan(firstAwait);
    });

    test("revalidates manual Timeline reads and clears before binding, before IPC, and before renderer effects", () => {
        const runtime = source("src/betterdiscord/modules/solcord/runtime.ts");
        const helper = runtime.slice(runtime.indexOf("#withTimelineAccount<T>"), runtime.indexOf("async #releaseTimelineAccount"));
        expect(helper).toContain("TimelineAccountChangedBeforeBinding");
        expect(helper).toContain("TimelineAccountChangedBeforeRequest");
        expect(helper).toContain("TimelineAccountChangedDuringRequest");

        const clear = runtime.slice(runtime.indexOf("async clearTimeline"), runtime.indexOf("async setTimelinePolicy"));
        expect(clear).toContain("const identity = this.#captureTimelineIdentity()");
        expect(clear).toContain("identityIsCurrent");
        expect(clear.indexOf("identityIsCurrent")).toBeLessThan(clear.indexOf("TIMELINE_IPC.clear"));
        expect(clear.lastIndexOf("identityIsCurrent")).toBeLessThan(clear.indexOf("this.#timeline.clear()"));

        const exportTimeline = runtime.slice(runtime.indexOf("async exportTimeline"), runtime.indexOf("previewSetup"));
        expect(exportTimeline).toContain("const identity = this.#captureTimelineIdentity()");
        expect(exportTimeline).toContain("identityIsCurrent");
        expect(exportTimeline).toContain("loaded.status !== \"complete\"");
        expect(exportTimeline).toContain("Export refused because the local read was incomplete");
        expect(exportTimeline.lastIndexOf("identityIsCurrent")).toBeLessThan(exportTimeline.indexOf("this.#download"));
    });

    test("clears Friend Watch synchronously across account changes and revalidates clear and export effects", () => {
        const runtime = source("src/betterdiscord/modules/solcord/runtime.ts");
        expect(runtime).toContain("#friendWatchAccountGuard = new TimelineAccountGuard()");
        expect(runtime).toContain("const {changed} = this.#observeFriendWatchIdentity");
        expect(runtime).toContain("if (changed) this.emitChange()");

        const observe = runtime.slice(runtime.indexOf("#observeFriendWatchIdentity"), runtime.indexOf("#friendWatchIdentityIsCurrent"));
        expect(observe.indexOf("this.#friendWatch.clear()")).toBeLessThan(observe.indexOf("return {identity, changed}"));

        const clear = runtime.slice(runtime.indexOf("async clearFriendWatch"), runtime.indexOf("async exportFriendWatch"));
        expect(clear).toContain("identityIsCurrent");
        expect(clear.indexOf("identityIsCurrent")).toBeLessThan(clear.indexOf("TIMELINE_IPC.friendClear"));
        expect(clear.lastIndexOf("identityIsCurrent")).toBeLessThan(clear.indexOf("this.#friendWatch.clear()"));

        const exportFriend = runtime.slice(runtime.indexOf("async exportFriendWatch"), runtime.indexOf("async exportTimeline"));
        expect(exportFriend).toContain("identityIsCurrent");
        expect(exportFriend.lastIndexOf("identityIsCurrent")).toBeGreaterThan(exportFriend.indexOf("this.#download"));

        const startFriend = runtime.slice(runtime.indexOf("async #startFriendWatch"), runtime.indexOf("async #startMessageTimeline"));
        expect(startFriend).toContain("type RelationshipActions = Record<\"removeRelationship\" | \"blockUser\" | \"unblockUser\"");
        expect(startFriend).toContain("getMutableRelationships?: () => unknown");
        expect(startFriend).toContain("typeof relationships?.getMutableRelationships === \"function\"");
        expect(startFriend).toContain("getByKeys<RelationshipActions>");
        expect(startFriend).toContain("Patcher.before(\"Solcord~FriendWatch\"");
        expect(startFriend).toContain("scope.own(unpatch, \"patch\")");
        expect(startFriend).toContain("scope.listen(window, \"online\", schedule)");
        expect(startFriend).toContain("scope.listen(document, \"visibilitychange\"");
        expect(startFriend).toContain("planSolcordFriendWatchNotices");
        expect(startFriend).not.toContain("fetch(");
    });

    test("surfaces partial Timeline reads and incomplete retention instead of claiming success", () => {
        const runtime = source("src/betterdiscord/modules/solcord/runtime.ts");
        expect(runtime).toContain("storageReadComplete = opened.loaded.status === \"complete\"");
        expect(runtime).toContain("The persistent read is partial");
        expect(runtime).toContain("if (result.retentionApplied === true) return");
        expect(runtime).toContain("Retention cleanup is incomplete; ambiguous encrypted residue remains and requires review.");
    });

    test("reconciles prepared setup files before features and acknowledges only after durable settings", () => {
        const runtime = source("src/betterdiscord/modules/solcord/runtime.ts");
        const setup = source("src/electron/main/modules/solcord-setup.ts");
        const startMethod = runtime.slice(runtime.indexOf("async start():"), runtime.indexOf("get recoveryMode"));
        expect(startMethod.indexOf("TIMELINE_IPC.reconcileSetup")).toBeLessThan(startMethod.indexOf("for (const id of FEATURE_IDS)"));
        const finish = runtime.slice(runtime.indexOf("async finishSetup"), runtime.indexOf("async rollbackLatestSetup"));
        expect(finish.indexOf("SolcordSettings.completeSetup")).toBeLessThan(finish.indexOf("TIMELINE_IPC.acknowledgeSetup"));
        expect(finish).toContain("SolcordSettings.abortSetupCompletion");
        expect(setup).toContain("this.#writeMarker(transactionId, \"prepared\"");
        expect(setup).toContain("knownTransactionIds.has(transactionId)");
    });

    test("journals exact addon filenames and binds provider migration to the sealed Finish plan", () => {
        const runtime = source("src/betterdiscord/modules/solcord/runtime.ts");
        const wizard = source("src/betterdiscord/ui/solcord/setup-wizard.tsx");
        const panel = source("src/betterdiscord/ui/solcord/panel.tsx");
        const finish = runtime.slice(runtime.indexOf("async finishSetup"), runtime.indexOf("async rollbackLatestSetup"));
        expect(finish).toContain("const priorAddonStates = captureExactAddonStates(PluginManager)");
        expect(finish).toContain("const priorThemeStates = captureExactAddonStates(ThemeManager)");
        expect(runtime).toContain("#requireProviderMigrationPlan");
        expect(runtime).toContain("#assertProviderMigrationIdentityCurrent");
        expect(runtime).toContain("#providerMigrationCandidates");
        expect(runtime).toContain("#setupAcceptsAddon");
        expect(runtime).toContain("createSolcordProviderMigrationPlan(PluginManager, this.#providerMigrationCandidates(draft), draft)");
        expect(runtime).toContain("if (enabled && guardedBuiltIn && !setupExecutable) return false");
        expect(runtime).toContain("!this.#setupAcceptsAddon(\"SplitLargeMessages\", split.mode)");
        expect(finish.indexOf("#requireProviderMigrationPlan")).toBeLessThan(finish.indexOf("#refreshAddonIntegrity"));
        expect(finish.lastIndexOf("#requireProviderMigrationPlan")).toBeLessThan(finish.indexOf("PluginManager.disableAddon(current.filename)"));
        expect(finish.indexOf("TIMELINE_IPC.applySetup")).toBeLessThan(finish.indexOf("PluginManager.disableAddon(current.filename)"));
        expect(finish.indexOf("PluginManager.disableAddon(current.filename)")).toBeLessThan(finish.indexOf("SolcordSettings.completeSetup"));
        expect(wizard).toContain("SolcordRuntime.finishSetup(draft, undefined, {migrateProviders: false})");
        expect(panel).toContain("SolcordRuntime.prepareProviderMigrationPlan(state.draft)");
        expect(panel).toContain("SolcordRuntime.finishSetup(state.draft, confirmedPlan)");
        expect(wizard).toContain("active community provider changed after review");
        const restore = runtime.slice(runtime.indexOf("async #restoreAddonStates"), runtime.indexOf("#communityAddonEnabled"));
        expect(restore).toContain("for (const [fileName, desired] of Object.entries(priorAddonStates))");
        expect(restore).toContain("PluginManager.resolveAddon(fileName)");
        expect(restore).toContain("Object.hasOwn(priorAddonStates, addon.filename)");
    });

    test("stands down the built-in when an owner re-enables a conflicting community provider", () => {
        const runtime = source("src/betterdiscord/modules/solcord/runtime.ts");
        expect(runtime).toContain("The community addon was re-enabled; Solcord stood down its built-in and left the owner file unchanged.");
        expect(runtime).toContain("conflict: true");
        expect(runtime).not.toContain("if (preferred === \"prefer-solcord\") PluginManager.disableAddon");
    });

    test("bounds Timeline records, dedupe state, bulk expansion, and snapshots", () => {
        const timeline = source("src/betterdiscord/modules/solcord/message-timeline.ts");
        const runtime = source("src/betterdiscord/modules/solcord/runtime.ts");
        expect(timeline).toContain("records: 20_000");
        expect(timeline).toContain("seenEvents: 80_000");
        expect(timeline).toContain("editsPerRecord: 100");
        expect(timeline).toContain("estimatedStateBytes");
        expect(timeline).toContain("while (this.#messages.size > this.#limits.records");
        expect(timeline).toContain("while (this.#seenEvents.size > this.#limits.seenEvents)");
        expect(runtime).toContain("boundedTimelineMessageIds");
        expect(runtime).toContain("this.#timeline.snapshot(channelId, 250)");
    });

    test("requires a separate exact-file execution confirmation and emits no raw Solcord stack", () => {
        const runtime = source("src/betterdiscord/modules/solcord/runtime.ts");
        const panel = source("src/betterdiscord/ui/solcord/panel.tsx");
        expect(panel).toContain("Third-party execution confirmation");
        expect(panel).toContain("Files to start or enable");
        expect(panel).toContain("Files to stop or disable");
        expect(panel).not.toContain("will not execute them automatically");
        expect(runtime).toContain("confirmedPlan?: ProfileAddonExecutionPlan");
        expect(runtime).not.toContain("Logger.stacktrace");
    });

    test("owns native review modals and closes them when Discord routes change", () => {
        const runtime = source("src/betterdiscord/modules/solcord/runtime.ts");
        expect(runtime).toContain("release = scope.own(dispose, \"element\")");
        expect(runtime).toContain("releaseRouteTimer = scope.own(() => globalThis.clearInterval(routeTimer), \"interval\")");
        expect(runtime).toContain("if (window.location.href !== previousHref) release()");
        expect(runtime).toContain("Modals.ModalActions?.closeModal(modalKey)");
        expect(runtime).toContain("productPreferences.safety.domainMemory === \"warn-only\"");
        expect(runtime).toContain("remembered?.decision === \"block\" ? onCancel : onConfirm");
    });

    test("keeps clear and setup rollback claims conditional on complete typed results", () => {
        const runtime = source("src/betterdiscord/modules/solcord/runtime.ts");
        const timelinePanel = source("src/betterdiscord/ui/solcord/timeline.tsx");
        expect(runtime).toContain("result.complete && remaining === 0 ? \"complete\" : \"incomplete\"");
        expect(runtime).toContain("if (outcome.status === \"complete\")");
        expect(timelinePanel).toContain("SolcordRuntime.clearTimeline(true)");
        expect(timelinePanel).toContain("Renderer history remains visible until cleanup is confirmed complete.");
        expect(runtime).toContain("result.complete && preserved === 0 && addonStatesRestored ? \"complete\" : \"partial\"");
    });

    test("keeps Stream Shield and Timeline copy within structural and storage evidence", () => {
        const runtime = source("src/betterdiscord/modules/solcord/runtime.ts");
        const timelinePanel = source("src/betterdiscord/ui/solcord/timeline.tsx");
        expect(runtime).toContain("structural Go Live store lookup connected; live transition acceptance is still pending");
        expect(runtime).not.toContain("verified Go Live store connected");
        expect(timelinePanel).toContain("Persistent segments are encrypted when secure storage is available");
        expect(timelinePanel).not.toContain("A private, encrypted journal");
        expect(timelinePanel).toContain("complete bounded local event set only when its read succeeds");
    });

    test("separates code maturity, running status, and the bounded profile payload", () => {
        const runtime = source("src/betterdiscord/modules/solcord/runtime.ts");
        const panel = source("src/betterdiscord/ui/solcord/panel.tsx");
        expect(panel).toContain("Ready means an implemented adapter passed its current startup validation");
        expect(panel).not.toContain("Ready modules are connected to Discord now");
        expect(panel).toContain("Profiles save Solcord module settings");
        expect(panel).toContain("They do not capture Timeline policy or curated-addon choices");
        expect(panel).toContain("Save module state");
        expect(panel).not.toContain("Save current state");
        expect(runtime).toContain("Profiles save module settings and optional exact addon states");
        expect(runtime).toContain("name: \"Module Drift Radar\"");
        expect(runtime).toContain("captured-fixture Patch Canary coverage is not implemented in V1");
        expect(runtime).not.toContain("name: \"Module Drift Radar / Patch Canary\"");
    });
});
