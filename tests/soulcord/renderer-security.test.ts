import {describe, expect, test} from "bun:test";
import fs from "node:fs";
import path from "node:path";


const ROOT = path.resolve(import.meta.dir, "../..");
const source = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");

describe("SoulCord renderer security contracts", () => {
    test("claims the private capability before plugin inventory and enforces audit before every addon start", () => {
        const core = source("src/betterdiscord/modules/core.ts");
        const runtime = source("src/betterdiscord/modules/soulcord/runtime.ts");
        const runtimeStart = core.indexOf("await SoulCordRuntime.start()");
        const pluginInitialize = core.indexOf("PluginManager.initialize()");
        const pluginEnforce = core.indexOf("await SoulCordRuntime.enforceAddonIntegrityBeforeStart()", pluginInitialize);
        const pluginStart = core.indexOf("PluginManager.startAddons", pluginEnforce);
        const themeInitialize = core.indexOf("ThemeManager.initialize()");
        const themeEnforce = core.indexOf("await SoulCordRuntime.enforceAddonIntegrityBeforeStart()", themeInitialize);
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
        const runtime = source("src/betterdiscord/modules/soulcord/runtime.ts");
        const ipc = source("src/betterdiscord/modules/ipc.ts");
        expect(runtime).toContain("const TIMELINE_IPC = Object.freeze");
        expect(runtime).toContain("#privateCapability?: string");
        expect(runtime).toContain("#privateCapabilityQueue");
        expect(ipc).toContain("const invokePrivate = ipc.invoke.bind(ipc)");
        expect(ipc).toContain("return invokePrivate(IPCEvents.TIMELINE_APPEND");
        expect(ipc).toContain("return invokePrivate(IPCEvents.SETUP_APPLY");
        expect(runtime).not.toContain("IPC.appendTimeline({accountId");
        expect(runtime).not.toContain("IPC.readTimeline({accountId");
        expect(runtime).not.toContain("IPC.clearTimeline({accountId");
    });

    test("switches Timeline identity synchronously and discards events until the account is ready", () => {
        const runtime = source("src/betterdiscord/modules/soulcord/runtime.ts");
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
        const runtime = source("src/betterdiscord/modules/soulcord/runtime.ts");
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
        expect(exportTimeline.lastIndexOf("identityIsCurrent")).toBeLessThan(exportTimeline.indexOf("this.#download"));
    });

    test("bounds Timeline records, dedupe state, bulk expansion, and snapshots", () => {
        const timeline = source("src/betterdiscord/modules/soulcord/message-timeline.ts");
        const runtime = source("src/betterdiscord/modules/soulcord/runtime.ts");
        expect(timeline).toContain("records: 20_000");
        expect(timeline).toContain("seenEvents: 80_000");
        expect(timeline).toContain("editsPerRecord: 100");
        expect(timeline).toContain("estimatedStateBytes");
        expect(timeline).toContain("while (this.#messages.size > this.#limits.records");
        expect(timeline).toContain("while (this.#seenEvents.size > this.#limits.seenEvents)");
        expect(runtime).toContain("boundedTimelineMessageIds");
        expect(runtime).toContain("this.#timeline.snapshot(channelId, 250)");
    });

    test("requires a separate exact-file execution confirmation and emits no raw SoulCord stack", () => {
        const runtime = source("src/betterdiscord/modules/soulcord/runtime.ts");
        const panel = source("src/betterdiscord/ui/soulcord/panel.tsx");
        expect(panel).toContain("Third-party execution confirmation");
        expect(panel).toContain("Files to start or enable");
        expect(panel).toContain("Files to stop or disable");
        expect(panel).not.toContain("will not execute them automatically");
        expect(runtime).toContain("confirmedPlan?: ProfileAddonExecutionPlan");
        expect(runtime).not.toContain("Logger.stacktrace");
    });

    test("owns native review modals and closes them when Discord routes change", () => {
        const runtime = source("src/betterdiscord/modules/soulcord/runtime.ts");
        expect(runtime).toContain("release = scope.own(dispose, \"element\")");
        expect(runtime).toContain("releaseRouteTimer = scope.own(() => globalThis.clearInterval(routeTimer), \"interval\")");
        expect(runtime).toContain("if (window.location.href !== previousHref) release()");
        expect(runtime).toContain("Modals.ModalActions?.closeModal(modalKey)");
    });

    test("keeps clear and setup rollback claims conditional on complete typed results", () => {
        const runtime = source("src/betterdiscord/modules/soulcord/runtime.ts");
        const timelinePanel = source("src/betterdiscord/ui/soulcord/timeline.tsx");
        expect(runtime).toContain("result.complete && remaining === 0 ? \"complete\" : \"incomplete\"");
        expect(runtime).toContain("if (outcome.status === \"complete\")");
        expect(timelinePanel).toContain("SoulCordRuntime.clearTimeline(true)");
        expect(timelinePanel).toContain("Renderer history remains visible until cleanup is confirmed complete.");
        expect(runtime).toContain("result.complete && preserved === 0 && addonStatesRestored ? \"complete\" : \"partial\"");
    });
});
