import Logger from "@common/logger";
import Store from "@stores/base";
import JsonStore from "@stores/json";
import IPC from "@modules/ipc";
import Patcher from "@modules/patcher";
import PluginManager from "@modules/pluginmanager";
import ThemeManager from "@modules/thememanager";
import SettingsRenderer from "@ui/settings";
import Modals from "@ui/modals";
import {getByKeys, getLazyBySource, getStore, getWithKey} from "@webpack";

import type {SoulCordMaturity, SoulCordModuleHealth, SoulCordModuleId} from "./contracts";
import {SoulCordDisposalScope} from "./disposal";
import SoulCordSettings, {normalizeSetupDraft, SOULCORD_THEMES, type SoulCordImportPreview} from "./store";
import PluginDoctor from "./doctor";
import {runStructuralProbes, type StructuralProbeResult} from "./drift";
import {inspectLink, interceptLinkActivation, type LinkInspection} from "./link-lens";
import {BoundedPerformanceSampler, type PerformanceSample} from "./performance";
import {evaluateCrashGuard, type CrashGuardDocument} from "./crash-guard";
import {boundedTimelineMessageIds, channelIsInTimelineScope, MessageTimelineJournal, normalizeTimelineAccountId, TimelineAccountGuard, timelineEventAccountMatches, type TimelineAccountIdentity, type TimelineAttachmentMetadata, type TimelineEvent, type TimelineMessageState} from "./message-timeline";
import {splitLargeMessage} from "./message-splitter";
import {integrityBlocksExecution, integrityFailureReason, integrityRequiresQuarantine, normalizeIntegrityAudit, reviewBlocksEnable, summarizeIntegrity, unavailableIntegrityRecords, type AddonIntegrityKind, type AddonIntegrityRecord, type AddonIntegritySummary} from "./integrity";
import {SOULCORD_RUNTIME_ADDONS, SOULCORD_RUNTIME_DEPENDENCIES} from "@common/soulcord/addon-catalog.generated";

interface ActivityCompatibilityHealth {
    status: "idle" | "healthy" | "attention";
    unrestrictedOverride: boolean;
    counters: Record<string, number>;
    events: Array<{sequence: number; timestamp: number; action: string; context: string; reason?: string; webContentsId?: number; packageFile?: string;}>;
}

export interface AddonIntegrityStatus {
    checkedAt?: number;
    phase: "pending" | "startup" | "pre-setup" | "post-setup" | "pre-rollback" | "toggle" | "retry" | "failed";
    summary: AddonIntegritySummary;
    records: AddonIntegrityRecord[];
}

export interface ProfileAddonExecutionPlan {
    enablePlugins: string[];
    disablePlugins: string[];
    enableThemes: string[];
    disableThemes: string[];
}

export interface TimelineClearOutcome {
    status: "complete" | "incomplete" | "unavailable" | "failed";
    cleared: number;
    remaining: number;
    opaqueStores: number;
    requiresOpaqueRecovery: boolean;
}

export interface SetupRollbackOutcome {
    status: "complete" | "partial" | "unavailable" | "failed";
    removed: number;
    preserved: number;
}

const FEATURE_META: Record<SoulCordModuleId, {name: string; risk: SoulCordModuleHealth["risk"]; maturity: SoulCordMaturity; detail: string;}> = {
    "activity-bridge": {name: "Activity Bridge", risk: "standard", maturity: "ready", detail: "Waiting for the main-process compatibility ledger."},
    "plugin-doctor": {name: "Plugin Doctor + Addon Quarantine", risk: "standard", maturity: "ready", detail: "Monitoring local addon failures."},
    "drift-radar": {name: "Module Drift Radar / Patch Canary", risk: "standard", maturity: "preview", detail: "Validating structural contracts before volatile adapters patch Discord."},
    "performance-hud": {name: "Performance HUD", risk: "standard", maturity: "ready", detail: "Sampling local renderer measurements."},
    "workspace-profiles": {name: "Workspace Profiles", risk: "standard", maturity: "preview", detail: "Profiles are local and rollback-backed. Applying an opted-in third-party profile requires a separate execution confirmation."},
    "command-deck": {name: "Command Deck", risk: "standard", maturity: "ready", detail: "Local command palette; no message actions."},
    "link-lens": {name: "Link Lens + Invite Inspector", risk: "standard", maturity: "preview", detail: "Inspecting links and invite codes locally before suspicious navigation; invite metadata is not fetched in V1."},
    "stream-shield": {name: "Stream Shield + Screenshot Scrubber", risk: "standard", maturity: "preview", detail: "Manual shield is ready; Go Live detection is validated at runtime."},
    "settings-time-machine": {name: "Settings Time Machine + Update Ledger", risk: "standard", maturity: "ready", detail: "Bounded snapshots and migration records are active."},
    "accessibility-toolkit": {name: "Accessibility Toolkit", risk: "standard", maturity: "preview", detail: "Local reversible presentation controls."},
    "message-timeline": {name: "Message Timeline", risk: "experimental", maturity: "preview", detail: "Observed-message journal is disabled until setup consent is completed."}
};

const FEATURE_IDS = Object.keys(FEATURE_META) as SoulCordModuleId[];

function errorName(error: unknown): string {
    return error instanceof Error ? error.name.slice(0, 80) : typeof error;
}

function textElement(tag: string, text: string, className?: string): HTMLElement {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "soulcord-local-button";
    element.textContent = label;
    element.addEventListener("click", onClick);
    return element;
}

function handleDialogKeydown(event: KeyboardEvent, root: HTMLElement, close: () => void): void {
    if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...root.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])")]
        .filter(element => !(element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) || !element.disabled);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    }
    else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function countResources(scopes: Map<SoulCordModuleId, SoulCordDisposalScope>): number {
    let total = 0;
    for (const scope of scopes.values()) total += Object.values(scope.counts()).reduce((sum, value) => sum + value, 0);
    return total;
}

export function normalizeTimelineClearOutcome(value: unknown): TimelineClearOutcome {
    if (!value || typeof value !== "object") return {status: "failed", cleared: 0, remaining: 0, opaqueStores: 0, requiresOpaqueRecovery: false};
    const result = value as Record<string, unknown>;
    const cleared = typeof result.cleared === "number" && Number.isSafeInteger(result.cleared) && result.cleared >= 0 ? result.cleared : undefined;
    const remaining = typeof result.remaining === "number" && Number.isSafeInteger(result.remaining) && result.remaining >= 0 ? result.remaining : undefined;
    const opaqueStores = typeof result.opaqueStores === "number" && Number.isSafeInteger(result.opaqueStores) && result.opaqueStores >= 0 ? result.opaqueStores : undefined;
    if (cleared === undefined || remaining === undefined || opaqueStores === undefined || typeof result.complete !== "boolean" || typeof result.requiresOpaqueRecovery !== "boolean") {
        return {status: "failed", cleared: 0, remaining: 0, opaqueStores: 0, requiresOpaqueRecovery: false};
    }
    return {
        status: result.complete && remaining === 0 ? "complete" : "incomplete",
        cleared,
        remaining,
        opaqueStores,
        requiresOpaqueRecovery: result.requiresOpaqueRecovery
    };
}

export function normalizeSetupRollbackOutcome(value: unknown, addonStatesRestored: boolean): SetupRollbackOutcome {
    if (!value || typeof value !== "object") return {status: "failed", removed: 0, preserved: 0};
    const result = value as Record<string, unknown>;
    if (typeof result.complete !== "boolean" || !Array.isArray(result.removed) || !Array.isArray(result.preserved)) {
        return {status: "failed", removed: 0, preserved: 0};
    }
    const removed = result.removed.length;
    const preserved = result.preserved.length;
    return {status: result.complete && preserved === 0 && addonStatesRestored ? "complete" : "partial", removed, preserved};
}

const PRIVATE_CAPABILITY = /^[a-zA-Z0-9_-]{43}$/;
const TIMELINE_IPC = Object.freeze({
    claimBootstrap: IPC.claimSoulCordTimelineBootstrap.bind(IPC),
    bootstrap: IPC.bootstrapTimeline.bind(IPC),
    bindAccount: IPC.bindTimelineAccount.bind(IPC),
    releaseAccount: IPC.releaseTimelineAccount.bind(IPC),
    status: IPC.getTimelineStatus.bind(IPC),
    append: IPC.appendTimeline.bind(IPC),
    read: IPC.readTimeline.bind(IPC),
    clear: IPC.clearTimeline.bind(IPC),
    applySetup: IPC.applySoulCordSetup.bind(IPC),
    rollbackSetup: IPC.rollbackSoulCordSetup.bind(IPC),
    auditSetup: IPC.auditSoulCordSetup.bind(IPC)
});

class SoulCordRuntimeStore extends Store {
    #initialized = false;
    #started = false;
    #recoveryMode = false;
    #rootScope = new SoulCordDisposalScope();
    #scopes = new Map<SoulCordModuleId, SoulCordDisposalScope>();
    #health = new Map<SoulCordModuleId, SoulCordModuleHealth>();
    #activityHealth?: ActivityCompatibilityHealth;
    #driftResults: StructuralProbeResult[] = [];
    #sampler = new BoundedPerformanceSampler();
    #lastPerformanceSample?: PerformanceSample;
    #linkReviewOpen = false;
    #timeline = new MessageTimelineJournal();
    #timelinePersistent = false;
    #curatedScope = new SoulCordDisposalScope();
    #splitReviewOpen = false;
    #integrityQueue = Promise.resolve();
    #privateCapability?: string;
    #privateCapabilityQueue: Promise<void> = Promise.resolve();
    #boundTimelineAccountId?: string;
    #timelineAccountGuard = new TimelineAccountGuard();
    #integrity: AddonIntegrityStatus = {
        phase: "pending",
        records: unavailableIntegrityRecords(),
        summary: summarizeIntegrity(unavailableIntegrityRecords())
    };

    initialize(): void {
        if (this.#initialized) return;
        this.#initialized = true;
        SoulCordSettings.initialize();
        PluginDoctor.initialize();
        this.#recoveryMode = this.#initializeCrashGuard();
        for (const id of FEATURE_IDS) {
            const meta = FEATURE_META[id];
            this.#health.set(id, {
                id,
                name: meta.name,
                risk: meta.risk,
                maturity: meta.maturity,
                status: "stopped",
                failures: [],
                resources: {},
                detail: meta.detail
            });
        }
        const markClean = () => JsonStore.set("misc", "soulcordCrashGuard", {attempts: [], state: "clean", at: Date.now()} satisfies CrashGuardDocument);
        this.#rootScope.listen(window, "beforeunload", markClean);
    }

    async start(): Promise<void> {
        if (this.#started) return;
        this.#started = true;
        await this.#bootstrapPrivateCapability();
        for (const id of FEATURE_IDS) {
            if (this.#recoveryMode && id !== "plugin-doctor") {
                this.#setHealth(id, {status: "stopped", detail: "Held off by SoulCord startup recovery mode."});
                continue;
            }
            if (SoulCordSettings.module(id).enabled) await this.#startFeature(id);
        }
        this.#synchronizeCuratedAdapters();
        this.#rootScope.timeout(() => {
            JsonStore.set("misc", "soulcordCrashGuard", {attempts: [], state: "stable", at: Date.now()} satisfies CrashGuardDocument);
        }, 30_000);
    }

    async enforceAddonIntegrityBeforeStart(): Promise<void> {
        await this.#refreshAddonIntegrity("startup");
    }

    async #bootstrapPrivateCapability(): Promise<void> {
        let bootstrapCapability: string | undefined;
        try {
            bootstrapCapability = await TIMELINE_IPC.claimBootstrap();
            if (!PRIVATE_CAPABILITY.test(bootstrapCapability)) throw new Error("SoulCordBootstrapCapabilityInvalid");
            const result = await TIMELINE_IPC.bootstrap(bootstrapCapability);
            if (!PRIVATE_CAPABILITY.test(result?.capability)) throw new Error("SoulCordPrivateCapabilityInvalid");
            this.#privateCapability = result.capability;
            this.#boundTimelineAccountId = undefined;
        }
        catch (error) {
            this.#privateCapability = undefined;
            this.#boundTimelineAccountId = undefined;
            this.#setHealth("message-timeline", {maturity: "preview", detail: `Private storage capability stayed unavailable (${errorName(error)}); Timeline and setup mutations remain fail-closed.`});
        }
        finally {
            bootstrapCapability = undefined;
        }
    }

    #withPrivateCapability<T>(operation: (capability: string) => Promise<T>): Promise<T> {
        const run = async () => {
            const capability = this.#privateCapability;
            if (!capability || !PRIVATE_CAPABILITY.test(capability)) throw new Error("SoulCordPrivateCapabilityUnavailable");
            return operation(capability);
        };
        const result = this.#privateCapabilityQueue.then(run, run);
        this.#privateCapabilityQueue = result.then(() => undefined, () => undefined);
        return result;
    }

    #withTimelineAccount<T>(accountId: string, operation: (capability: string) => Promise<T>, identityIsCurrent: () => boolean = () => true): Promise<T> {
        return this.#withPrivateCapability(async capability => {
            if (!identityIsCurrent()) throw new Error("TimelineAccountChangedBeforeBinding");
            let activeCapability = capability;
            if (this.#boundTimelineAccountId !== accountId) {
                try {
                    const rotated = await TIMELINE_IPC.bindAccount(capability, accountId);
                    if (!PRIVATE_CAPABILITY.test(rotated?.capability)) throw new Error("SoulCordTimelineBindingInvalid");
                    activeCapability = rotated.capability;
                    this.#privateCapability = activeCapability;
                    this.#boundTimelineAccountId = accountId;
                }
                catch (error) {
                    this.#privateCapability = undefined;
                    this.#boundTimelineAccountId = undefined;
                    throw error;
                }
            }
            if (!identityIsCurrent()) throw new Error("TimelineAccountChangedBeforeRequest");
            const result = await operation(activeCapability);
            if (!identityIsCurrent()) throw new Error("TimelineAccountChangedDuringRequest");
            return result;
        });
    }

    #currentTimelineAccountId(): string | undefined {
        const userStore = getStore("UserStore") as {getCurrentUser?: () => {id?: string;} | undefined;} | undefined;
        return normalizeTimelineAccountId(userStore?.getCurrentUser?.()?.id);
    }

    #captureTimelineIdentity(): TimelineAccountIdentity {
        return this.#timelineAccountGuard.observe(this.#currentTimelineAccountId());
    }

    #timelineIdentityIsCurrent(identity: TimelineAccountIdentity): boolean {
        return this.#timelineAccountGuard.matches(identity, this.#currentTimelineAccountId());
    }

    async #releaseTimelineAccount(): Promise<void> {
        if (!this.#privateCapability || !this.#boundTimelineAccountId) return;
        try {
            await this.#withPrivateCapability(async capability => {
                const rotated = await TIMELINE_IPC.releaseAccount(capability);
                if (!PRIVATE_CAPABILITY.test(rotated?.capability)) throw new Error("SoulCordTimelineReleaseInvalid");
                this.#privateCapability = rotated.capability;
                this.#boundTimelineAccountId = undefined;
            });
        }
        catch {
            this.#privateCapability = undefined;
            this.#boundTimelineAccountId = undefined;
        }
    }

    get recoveryMode(): boolean {
        return this.#recoveryMode;
    }

    health(): SoulCordModuleHealth[] {
        return FEATURE_IDS.map(id => structuredClone(this.#health.get(id)!));
    }

    activityHealth(): ActivityCompatibilityHealth | undefined {
        return this.#activityHealth ? structuredClone(this.#activityHealth) : undefined;
    }

    driftResults(): StructuralProbeResult[] {
        return structuredClone(this.#driftResults);
    }

    performanceSamples(): PerformanceSample[] {
        return this.#sampler.snapshot();
    }

    integrityStatus(): AddonIntegrityStatus {
        return structuredClone(this.#integrity);
    }

    timelineEntries(channelId?: string): TimelineMessageState[] {
        return this.#timeline.snapshot(channelId, 250);
    }

    timelineStatus(): ReturnType<MessageTimelineJournal["status"]> & {persistent: boolean;} {
        return {...this.#timeline.status(), persistent: this.#timelinePersistent};
    }

    timelineCurrentChannel(): {eligible: boolean; included: boolean;} {
        const selectedChannelStore = getStore("SelectedChannelStore") as {getChannelId?: () => string | undefined;} | undefined;
        const channelStore = getStore("ChannelStore") as {getChannel?: (id: string) => {id?: string; guild_id?: string; type?: number;} | undefined;} | undefined;
        const channelId = selectedChannelStore?.getChannelId?.();
        const channel = typeof channelId === "string" ? channelStore?.getChannel?.(channelId) : undefined;
        const eligible = Boolean(channel && typeof channel.id === "string" && /^\d{1,32}$/.test(channel.id) && typeof channel.guild_id === "string");
        return {eligible, included: eligible && SoulCordSettings.snapshot().timelinePolicy.serverChannelIds.includes(channel!.id!)};
    }

    async setCurrentChannelInTimeline(included: boolean): Promise<boolean> {
        const selectedChannelStore = getStore("SelectedChannelStore") as {getChannelId?: () => string | undefined;} | undefined;
        const channelStore = getStore("ChannelStore") as {getChannel?: (id: string) => {id?: string; guild_id?: string;} | undefined;} | undefined;
        const channelId = selectedChannelStore?.getChannelId?.();
        const channel = typeof channelId === "string" ? channelStore?.getChannel?.(channelId) : undefined;
        if (!channel || typeof channel.id !== "string" || !/^\d{1,32}$/.test(channel.id) || typeof channel.guild_id !== "string") return false;
        const current = SoulCordSettings.snapshot().timelinePolicy;
        const serverChannelIds = included ? [...new Set([...current.serverChannelIds, channel.id])] : current.serverChannelIds.filter(id => id !== channel.id);
        await this.setTimelinePolicy({...current, scope: serverChannelIds.length ? "selected-channels" : "dm-only", serverChannelIds});
        return true;
    }

    async clearTimeline(clearOpaqueStores = false): Promise<TimelineClearOutcome> {
        const identity = this.#captureTimelineIdentity();
        if (!identity.accountId) return {status: "unavailable", cleared: 0, remaining: 0, opaqueStores: 0, requiresOpaqueRecovery: false};
        const identityIsCurrent = () => this.#timelineIdentityIsCurrent(identity);
        try {
            const raw = await this.#withTimelineAccount(identity.accountId, capability => TIMELINE_IPC.clear(capability, {
                policy: SoulCordSettings.snapshot().timelinePolicy,
                clearOpaqueStores
            }), identityIsCurrent);
            if (!identityIsCurrent()) return {status: "failed", cleared: 0, remaining: 0, opaqueStores: 0, requiresOpaqueRecovery: false};
            const outcome = normalizeTimelineClearOutcome(raw);
            if (outcome.status === "complete") {
                if (!identityIsCurrent()) return {status: "failed", cleared: 0, remaining: 0, opaqueStores: 0, requiresOpaqueRecovery: false};
                this.#timeline.clear();
                this.emitChange();
            }
            return outcome;
        }
        catch {
            return {status: "failed", cleared: 0, remaining: 0, opaqueStores: 0, requiresOpaqueRecovery: false};
        }
    }

    async setTimelinePolicy(value: Partial<import("./contracts").SoulCordTimelinePolicy>): Promise<void> {
        const current = SoulCordSettings.snapshot().timelinePolicy;
        SoulCordSettings.setTimelinePolicy({...current, ...value});
        await this.#synchronizeFeatures();
    }

    async exportTimeline(): Promise<boolean> {
        const identity = this.#captureTimelineIdentity();
        if (!identity.accountId) return false;
        const identityIsCurrent = () => this.#timelineIdentityIsCurrent(identity);
        const policy = SoulCordSettings.snapshot().timelinePolicy;
        let loaded: {events?: TimelineEvent[]; persistent?: boolean;};
        try {
            loaded = await this.#withTimelineAccount(identity.accountId, capability => TIMELINE_IPC.read(capability, {policy}), identityIsCurrent) as {events?: TimelineEvent[]; persistent?: boolean;};
        }
        catch {return false;}
        if (!identityIsCurrent()) return false;
        const payload = {
            format: "soulcord-private-message-timeline",
            version: 1,
            exportedAt: new Date().toISOString(),
            scope: policy.scope,
            retention: policy.retention,
            content: policy.content,
            persistent: loaded.persistent === true,
            limitations: ["Observed by this running client only", "No API backfill", "No offline recovery", "No hidden-channel access"],
            events: Array.isArray(loaded.events) ? loaded.events : []
        };
        if (!identityIsCurrent()) return false;
        this.#download(`soulcord-timeline-${new Date().toISOString().slice(0, 10)}.json`, `${JSON.stringify(payload, null, 2)}\n`, "application/json");
        return true;
    }

    previewSetup(rawDraft: unknown): string[] {
        return SoulCordSettings.previewSetup(rawDraft);
    }

    async finishSetup(rawDraft: unknown): Promise<{transactionId: string; enabled: string[]; quarantined: Array<{name: string; reason: string;}>;}> {
        await this.#refreshAddonIntegrity("pre-setup");
        const draft = normalizeSetupDraft(rawDraft);
        const stagedAddons = draft.selectedAddons.filter(name => name !== "SplitLargeMessages" || draft.addonModes[name] !== "guarded");
        const priorAddonStates = Object.fromEntries(SOULCORD_RUNTIME_ADDONS.map(candidate => [candidate.name, PluginManager.isEnabled(candidate.fileName)]));
        const priorThemeStates = Object.fromEntries(SOULCORD_THEMES.map(theme => [theme.fileName, ThemeManager.isEnabled(theme.fileName)]));
        const transaction = await this.#withPrivateCapability(capability => TIMELINE_IPC.applySetup(capability, {selectedAddons: stagedAddons, selectedTheme: draft.selectedTheme})) as {transactionId: string;};
        const results: Record<string, {enabled: boolean; reviewedSha256?: string; quarantineReason?: string;}> = {};
        const enabled: string[] = [];
        const quarantined: Array<{name: string; reason: string;}> = [];
        const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

        try {
            const integrity = await this.#refreshAddonIntegrity("post-setup");
            const selectedCandidates = stagedAddons.map(name => SOULCORD_RUNTIME_ADDONS.find(candidate => candidate.name === name)!);
            const requiredDependencies = new Set(selectedCandidates.flatMap(candidate => [...candidate.dependencies]));
            const selectedTheme = SOULCORD_THEMES.find(theme => theme.id === draft.selectedTheme)!;
            const requiredRecords = [
                ...selectedCandidates.map(candidate => integrity.find(record => record.kind === "addon" && record.name === candidate.name)),
                ...[...requiredDependencies].map(name => integrity.find(record => record.kind === "dependency" && record.name === name)),
                integrity.find(record => record.kind === "theme" && record.name === selectedTheme.name)
            ];
            if (requiredRecords.some(record => record?.status !== "match")) throw new Error("SetupIntegrityValidationFailed");

            for (const name of draft.selectedAddons) {
                const candidate = SOULCORD_RUNTIME_ADDONS.find(entry => entry.name === name)!;
                if (name === "SplitLargeMessages" && draft.addonModes[name] === "guarded") {
                    results[name] = {enabled: true, reviewedSha256: candidate.sourceSha256};
                    enabled.push(name);
                    continue;
                }
                if (reducedMotion && (name === "DiscordEffects" || name === "BetterAnimations")) {
                    const reason = "Held because Windows or Discord reduced motion is active.";
                    results[name] = {enabled: false, reviewedSha256: candidate.sourceSha256, quarantineReason: reason};
                    quarantined.push({name, reason});
                    continue;
                }
                if (PluginDoctor.isQuarantined(name)) {
                    const reason = "Plugin Doctor quarantine requires an explicit successful retry before setup can enable this addon.";
                    results[name] = {enabled: false, reviewedSha256: candidate.sourceSha256, quarantineReason: reason};
                    quarantined.push({name, reason});
                    continue;
                }
                if (!await this.#waitForAddon(PluginManager, candidate.fileName)) {
                    const reason = "The verified file did not load before the bounded setup deadline.";
                    PluginDoctor.quarantine(name, reason);
                    results[name] = {enabled: false, reviewedSha256: candidate.sourceSha256, quarantineReason: reason};
                    quarantined.push({name, reason});
                    continue;
                }
                if (PluginManager.isEnabled(candidate.fileName)) PluginManager.disableAddon(candidate.fileName);
                const started = PluginManager.enableAddon(candidate.fileName) === true || PluginManager.isEnabled(candidate.fileName);
                await new Promise(resolve => globalThis.setTimeout(resolve, 150));
                if (!started || PluginDoctor.isQuarantined(name) || !PluginManager.isEnabled(candidate.fileName)) {
                    const reason = "Startup validation failed; the addon was disabled and quarantined.";
                    if (PluginManager.isEnabled(candidate.fileName)) PluginManager.disableAddon(candidate.fileName);
                    PluginDoctor.quarantine(name, reason);
                    results[name] = {enabled: false, reviewedSha256: candidate.sourceSha256, quarantineReason: reason};
                    quarantined.push({name, reason});
                    continue;
                }
                results[name] = {enabled: true, reviewedSha256: candidate.sourceSha256};
                enabled.push(name);
            }

            for (const theme of SOULCORD_THEMES) {
                if (theme.fileName !== selectedTheme.fileName && ThemeManager.isEnabled(theme.fileName)) ThemeManager.disableAddon(theme.fileName);
            }
            if (!await this.#waitForAddon(ThemeManager, selectedTheme.fileName)) throw new Error("SelectedThemeLoadTimeout");
            if (!ThemeManager.isEnabled(selectedTheme.fileName) && ThemeManager.enableAddon(selectedTheme.fileName) !== true && !ThemeManager.isEnabled(selectedTheme.fileName)) throw new Error("SelectedThemeStartFailed");

            SoulCordSettings.completeSetup(draft, results, {id: transaction.transactionId, priorAddonStates, priorThemeStates});
            await this.#synchronizeFeatures();
            this.#synchronizeCuratedAdapters();
            return {transactionId: transaction.transactionId, enabled, quarantined};
        }
        catch (error) {
            const statesRestored = await this.#restoreAddonStates(priorAddonStates, priorThemeStates);
            const rollback = await this.#withPrivateCapability(capability => TIMELINE_IPC.rollbackSetup(capability, transaction.transactionId));
            if (normalizeSetupRollbackOutcome(rollback, statesRestored).status !== "complete") throw new Error("SetupFailedRollbackIncomplete");
            throw error;
        }
    }

    async rollbackLatestSetup(): Promise<SetupRollbackOutcome> {
        await this.#refreshAddonIntegrity("pre-rollback");
        const transaction = SoulCordSettings.latestSetupTransaction();
        if (!transaction) return {status: "unavailable", removed: 0, preserved: 0};
        const statesRestored = await this.#restoreAddonStates(transaction.priorAddonStates, transaction.priorThemeStates);
        let rollback: unknown;
        try {rollback = await this.#withPrivateCapability(capability => TIMELINE_IPC.rollbackSetup(capability, transaction.id));}
        catch {return {status: "failed", removed: 0, preserved: 0};}
        const outcome = normalizeSetupRollbackOutcome(rollback, statesRestored);
        if (outcome.status === "failed") return outcome;
        if (!SoulCordSettings.rollback(transaction.snapshotId)) return {...outcome, status: "failed"};
        SoulCordSettings.reopenOnboarding();
        await this.#synchronizeFeatures();
        this.#synchronizeCuratedAdapters();
        return outcome;
    }

    async setCuratedAddonEnabled(name: string, enabled: boolean): Promise<boolean> {
        const candidate = SOULCORD_RUNTIME_ADDONS.find(entry => entry.name === name);
        if (!candidate) return false;
        const integrity = await this.#refreshAddonIntegrity("toggle");
        const integrityRecord = integrity.find(record => record.kind === "addon" && record.name === name);
        const state = SoulCordSettings.snapshot().curatedAddons[name];
        const guardedBuiltIn = name === "SplitLargeMessages" && state?.mode === "guarded";
        const guardedWithoutCommunityFile = guardedBuiltIn && integrityRecord?.status === "missing";
        const dependenciesVerified = candidate.dependencies.every(dependencyName => integrity.some(record => record.kind === "dependency" && record.name === dependencyName && record.status === "match"));
        if (enabled && reviewBlocksEnable(candidate, guardedBuiltIn)) return false;
        if (enabled && ((!guardedWithoutCommunityFile && (integrityRecord?.status !== "match" || !dependenciesVerified)) || PluginDoctor.isQuarantined(name))) return false;
        if (guardedBuiltIn) {
            SoulCordSettings.setCuratedAddonEnabled(name, enabled);
            this.#synchronizeCuratedAdapters();
            return true;
        }
        if (!PluginManager.isLoaded(candidate.fileName)) return false;
        const succeeded = enabled
            ? PluginManager.enableAddon(candidate.fileName) === true || PluginManager.isEnabled(candidate.fileName)
            : PluginManager.disableAddon(candidate.fileName) === true || !PluginManager.isEnabled(candidate.fileName);
        SoulCordSettings.setCuratedAddonEnabled(name, succeeded ? enabled : false, succeeded ? undefined : "Runtime toggle failed; Plugin Doctor kept the addon off.");
        if (succeeded && enabled) PluginDoctor.recordSuccessfulStart(name);
        return succeeded;
    }

    async retryQuarantinedAddon(addonId: string): Promise<boolean> {
        const integrity = await this.#refreshAddonIntegrity("retry");
        const candidate = SOULCORD_RUNTIME_ADDONS.find(entry => entry.name === addonId || entry.fileName === addonId);
        const dependency = SOULCORD_RUNTIME_DEPENDENCIES.find(entry => entry.name === addonId || entry.fileName === addonId);
        if (candidate || dependency) {
            const kind: AddonIntegrityKind = candidate ? "addon" : "dependency";
            const name = (candidate ?? dependency)!.name;
            const record = integrity.find(entry => entry.kind === kind && entry.name === name);
            const state = candidate ? SoulCordSettings.snapshot().curatedAddons[candidate.name] : undefined;
            const guardedBuiltIn = candidate?.name === "SplitLargeMessages" && state?.mode === "guarded";
            const guardedWithoutCommunityFile = guardedBuiltIn && record?.status === "missing";
            const dependenciesVerified = !candidate || candidate.dependencies.every(dependencyName => integrity.some(entry => entry.kind === "dependency" && entry.name === dependencyName && entry.status === "match"));
            if (candidate && reviewBlocksEnable(candidate, guardedBuiltIn)) return false;
            if (dependency && reviewBlocksEnable(dependency)) return false;
            if (!guardedWithoutCommunityFile && (record?.status !== "match" || !dependenciesVerified)) return false;
            const reviewed = candidate ?? dependency!;
            const clearedName = PluginDoctor.clearQuarantine(name);
            const clearedFile = PluginDoctor.clearQuarantine(reviewed.fileName);
            if (!clearedName && !clearedFile) return false;
            const succeeded = candidate
                ? await this.setCuratedAddonEnabled(candidate.name, true)
                : PluginManager.isLoaded(dependency!.fileName) && (PluginManager.enableAddon(dependency!.fileName) === true || PluginManager.isEnabled(dependency!.fileName));
            if (succeeded) PluginDoctor.recordSuccessfulStart(name);
            else PluginDoctor.quarantine(name, "Manual retry failed; the addon remains disabled.");
            return succeeded;
        }

        const addon = PluginManager.resolveAddon(addonId);
        if (!addon || !PluginDoctor.clearQuarantine(addonId)) return false;
        const succeeded = PluginManager.enableAddon(addon.filename) === true || PluginManager.isEnabled(addon.filename);
        if (succeeded) PluginDoctor.recordSuccessfulStart(addonId);
        else PluginDoctor.quarantine(addonId, "Manual retry failed; the addon remains disabled.");
        return succeeded;
    }

    async setEnabled(id: SoulCordModuleId, enabled: boolean): Promise<void> {
        SoulCordSettings.setEnabled(id, enabled);
        if (!this.#started) return;
        if (enabled) await this.#startFeature(id);
        else this.#stopFeature(id);
    }

    async setValue(id: SoulCordModuleId, key: string, value: unknown): Promise<void> {
        SoulCordSettings.setValue(id, key, value);
        if (!this.#started || !SoulCordSettings.module(id).enabled) return;
        this.#stopFeature(id);
        await this.#startFeature(id);
    }

    saveProfile(name: string, includeThirdPartyAddons = false) {
        const plugins = includeThirdPartyAddons ? this.#enabledAddonFiles(PluginManager) : [];
        const themes = includeThirdPartyAddons ? this.#enabledAddonFiles(ThemeManager) : [];
        return SoulCordSettings.saveProfile(name, plugins, themes);
    }

    previewProfile(profileId: string): string[] {
        const profile = SoulCordSettings.profile(profileId);
        if (!profile) return [];
        const changes = SoulCordSettings.previewProfile(profileId);
        if (!profile.includesThirdPartyAddons) return changes;
        const desiredPlugins = new Set(profile.selectedPlugins);
        const desiredThemes = new Set(profile.selectedThemes);
        for (const addon of PluginManager.addonList) {
            const desired = desiredPlugins.has(addon.filename);
            if (PluginManager.isEnabled(addon.filename) !== desired) changes.push(`plugin ${addon.filename}: ${desired ? "enable" : "disable"}`);
        }
        for (const theme of ThemeManager.addonList) {
            const desired = desiredThemes.has(theme.filename);
            if (ThemeManager.isEnabled(theme.filename) !== desired) changes.push(`theme ${theme.filename}: ${desired ? "enable" : "disable"}`);
        }
        return changes;
    }

    profileAddonExecutionPlan(profileId: string): ProfileAddonExecutionPlan | undefined {
        const profile = SoulCordSettings.profile(profileId);
        if (!profile?.includesThirdPartyAddons) return;
        const desiredPlugins = new Set(profile.selectedPlugins);
        const desiredThemes = new Set(profile.selectedThemes);
        const plan: ProfileAddonExecutionPlan = {enablePlugins: [], disablePlugins: [], enableThemes: [], disableThemes: []};
        for (const addon of PluginManager.addonList) {
            const enabled = PluginManager.isEnabled(addon.filename);
            if (desiredPlugins.has(addon.filename) && !enabled) plan.enablePlugins.push(addon.filename);
            else if (!desiredPlugins.has(addon.filename) && enabled) plan.disablePlugins.push(addon.filename);
        }
        for (const theme of ThemeManager.addonList) {
            const enabled = ThemeManager.isEnabled(theme.filename);
            if (desiredThemes.has(theme.filename) && !enabled) plan.enableThemes.push(theme.filename);
            else if (!desiredThemes.has(theme.filename) && enabled) plan.disableThemes.push(theme.filename);
        }
        for (const values of Object.values(plan) as string[][]) values.sort((left: string, right: string) => left.localeCompare(right));
        return plan;
    }

    async applyProfile(profileId: string, confirmedPlan?: ProfileAddonExecutionPlan): Promise<boolean> {
        await this.#refreshAddonIntegrity("toggle");
        const profile = SoulCordSettings.profile(profileId);
        if (!profile) return false;
        if (profile.includesThirdPartyAddons) {
            const currentPlan = this.profileAddonExecutionPlan(profileId);
            const matchesConfirmation = currentPlan && confirmedPlan && (Object.keys(currentPlan) as Array<keyof ProfileAddonExecutionPlan>).every(key =>
                currentPlan[key].length === confirmedPlan[key].length && currentPlan[key].every((fileName, index) => fileName === confirmedPlan[key][index])
            );
            if (!matchesConfirmation) return false;
        }
        const pluginStates = Object.fromEntries(PluginManager.addonList.map(addon => [addon.filename, PluginManager.isEnabled(addon.filename)]));
        const themeStates = Object.fromEntries(ThemeManager.addonList.map(addon => [addon.filename, ThemeManager.isEnabled(addon.filename)]));
        const snapshot = SoulCordSettings.capture(`Before applying ${profile.name}`, {
            plugins: Object.entries(pluginStates).filter(([, enabled]) => enabled).map(([fileName]) => fileName),
            themes: Object.entries(themeStates).filter(([, enabled]) => enabled).map(([fileName]) => fileName)
        });
        if (!SoulCordSettings.applyProfile(profileId, false)) return false;
        try {
            if (profile.includesThirdPartyAddons) {
                await this.#applyAddonSelection(PluginManager, new Set(profile.selectedPlugins));
                await this.#applyAddonSelection(ThemeManager, new Set(profile.selectedThemes));
            }
            await this.#synchronizeFeatures();
            return true;
        }
        catch {
            await this.#restoreCompleteAddonStates(PluginManager, pluginStates);
            await this.#restoreCompleteAddonStates(ThemeManager, themeStates);
            SoulCordSettings.rollback(snapshot.id);
            await this.#synchronizeFeatures();
            return false;
        }
    }

    async rollback(snapshotId: string): Promise<boolean> {
        const snapshot = SoulCordSettings.snapshotById(snapshotId);
        const rolledBack = SoulCordSettings.rollback(snapshotId);
        if (!rolledBack) return false;
        let addonsRestored = true;
        if (snapshot?.activePlugins) {
            const active = new Set(snapshot.activePlugins);
            addonsRestored = await this.#restoreCompleteAddonStates(PluginManager, Object.fromEntries(PluginManager.addonList.map(addon => [addon.filename, active.has(addon.filename)]))) && addonsRestored;
        }
        if (snapshot?.activeThemes) {
            const active = new Set(snapshot.activeThemes);
            addonsRestored = await this.#restoreCompleteAddonStates(ThemeManager, Object.fromEntries(ThemeManager.addonList.map(addon => [addon.filename, active.has(addon.filename)]))) && addonsRestored;
        }
        await this.#synchronizeFeatures();
        return addonsRestored;
    }

    previewSettingsImport(text: string): SoulCordImportPreview | undefined {
        return SoulCordSettings.previewImport(text);
    }

    async importSettings(text: string, expectedFingerprint: string): Promise<boolean> {
        if (!SoulCordSettings.importDocument(text, expectedFingerprint)) return false;
        await this.#synchronizeFeatures();
        return true;
    }

    async leaveRecoveryMode(): Promise<void> {
        if (!this.#recoveryMode) return;
        this.#recoveryMode = false;
        JsonStore.set("misc", "soulcordCrashGuard", {attempts: [], state: "stable", at: Date.now()} satisfies CrashGuardDocument);
        await this.#synchronizeFeatures();
    }

    openCommandDeck(): void {
        const scope = this.#scopes.get("command-deck");
        if (!scope || scope.disposed) return;
        const existing = document.querySelector<HTMLElement>(".soulcord-command-deck");
        if (existing) return existing.focus();
        const overlay = document.createElement("div");
        overlay.className = "soulcord-local-overlay soulcord-command-deck";
        overlay.tabIndex = -1;
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
        const dialog = document.createElement("div");
        dialog.className = "soulcord-local-dialog";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-label", "SoulCord Command Deck");
        dialog.append(textElement("h2", "Command Deck"), textElement("p", "Local SoulCord actions only. This palette cannot send, join, upload, or authorize."));
        const search = document.createElement("input");
        search.type = "search";
        search.placeholder = "Filter commands";
        search.setAttribute("aria-label", "Filter commands");
        const list = document.createElement("div");
        list.className = "soulcord-command-list";
        dialog.append(search, list);
        overlay.append(dialog);
        document.body.append(overlay);
        const release = scope.own(() => {
            overlay.remove();
            if (previousFocus?.isConnected) previousFocus.focus();
        }, "element");
        const cleanup = () => release();
        const commands = [
            {name: "Open SoulCord Suite", run: () => SettingsRenderer.openSettingsPage("soulcord")},
            {
                name: "Toggle Stream Shield",
                run: () => {
                const current = SoulCordSettings.module("stream-shield").values.manualActive === true;
                void this.setValue("stream-shield", "manualActive", !current);
                }
            },
            {name: "Capture settings snapshot", run: () => SoulCordSettings.capture("Command Deck snapshot")},
            {name: "Refresh Activity Bridge", run: () => void this.#refreshActivityHealth()}
        ];
        const render = () => {
            list.replaceChildren();
            const query = search.value.trim().toLowerCase();
            for (const command of commands.filter(item => item.name.toLowerCase().includes(query))) {
                list.append(button(command.name, () => {cleanup(); command.run();}));
            }
        };
        search.addEventListener("input", render);
        overlay.addEventListener("mousedown", event => {if (event.target === overlay) cleanup();});
        overlay.addEventListener("keydown", event => handleDialogKeydown(event, dialog, cleanup));
        render();
        search.focus();
    }

    inspectLink(input: string): LinkInspection {
        return inspectLink(input);
    }

    exportDiagnostics(): void {
        const document = SoulCordSettings.snapshot();
        const diagnostics = {
            format: "soulcord-sanitized-diagnostics",
            version: 1,
            generatedAt: new Date().toISOString(),
            privacy: "No tokens, message content, server names, account identifiers, or local paths are included.",
            recoveryMode: this.#recoveryMode,
            modules: this.health(),
            activityCompatibility: this.activityHealth(),
            drift: this.driftResults(),
            performance: this.performanceSamples().slice(-12),
            addonDoctor: PluginDoctor.snapshot(),
            addonIntegrity: this.integrityStatus(),
            settings: {
                schemaVersion: document.schemaVersion,
                consentVersion: document.consentVersion,
                enabledModules: Object.fromEntries(Object.entries(document.modules).map(([id, setting]) => [id, setting.enabled])),
                snapshotCount: document.snapshots.length,
                updateLedger: document.updateLedger.map(({at, kind, version}) => ({at, kind, version}))
            }
        };
        this.#download("soulcord-diagnostics.json", `${JSON.stringify(diagnostics, null, 2)}\n`, "application/json");
    }

    exportSettings(): void {
        this.#download("soulcord-settings.json", SoulCordSettings.exportDocument(), "application/json");
    }

    #refreshAddonIntegrity(phase: Exclude<AddonIntegrityStatus["phase"], "pending" | "failed">): Promise<AddonIntegrityRecord[]> {
        const run = async () => {
            let records: AddonIntegrityRecord[];
            let resolvedPhase: AddonIntegrityStatus["phase"] = phase;
            try {
                records = normalizeIntegrityAudit(await this.#withPrivateCapability(capability => TIMELINE_IPC.auditSetup(capability)));
            }
            catch {
                records = unavailableIntegrityRecords();
                resolvedPhase = "failed";
            }
            this.#integrity = {
                checkedAt: Date.now(),
                phase: resolvedPhase,
                summary: summarizeIntegrity(records),
                records
            };
            this.#enforceAddonIntegrity(records);
            this.emitChange();
            return structuredClone(records);
        };
        const result = this.#integrityQueue.then(run, run);
        this.#integrityQueue = result.then(() => undefined, () => undefined);
        return result;
    }

    #enforceAddonIntegrity(records: readonly AddonIntegrityRecord[]): void {
        const doctorRecords = new Map(PluginDoctor.snapshot().map(record => [record.addonId, record]));
        const quarantine = (name: string, reason: string) => {
            if (doctorRecords.get(name)?.quarantineReason === reason) return;
            PluginDoctor.quarantine(name, reason);
            doctorRecords.set(name, PluginDoctor.snapshot().find(record => record.addonId === name)!);
        };
        const disablePlugin = (fileName: string, label: string) => {
            try {
                if (PluginManager.isEnabled(fileName)) PluginManager.disableAddon(fileName);
            }
            catch {Logger.warn("SoulCord", `Integrity enforcement could not stop ${label}; it remains quarantined.`);}
        };

        for (const record of records) {
            if (!integrityBlocksExecution(record)) continue;
            if (record.status === "missing") {
                if (record.kind === "addon") {
                    const candidate = SOULCORD_RUNTIME_ADDONS.find(entry => entry.name === record.name);
                    if (candidate) disablePlugin(candidate.fileName, candidate.name);
                }
                else if (record.kind === "dependency") {
                    const dependency = SOULCORD_RUNTIME_DEPENDENCIES.find(entry => entry.name === record.name);
                    if (dependency) {
                        for (const candidate of SOULCORD_RUNTIME_ADDONS.filter(entry => entry.dependencies.some(name => String(name) === dependency.name))) disablePlugin(candidate.fileName, candidate.name);
                    }
                }
                continue;
            }
            const reason = integrityFailureReason(record)!;
            if (record.kind === "addon") {
                const candidate = SOULCORD_RUNTIME_ADDONS.find(entry => entry.name === record.name);
                if (!candidate) continue;
                const configured = SoulCordSettings.snapshot().curatedAddons[candidate.name];
                const guardedBuiltIn = candidate.name === "SplitLargeMessages" && configured?.mode === "guarded";
                if (guardedBuiltIn && record.status === "unavailable") continue;
                const installed = Boolean(PluginManager.resolveAddon(candidate.fileName));
                if (record.status === "unavailable" && !installed && configured?.enabled !== true) continue;
                disablePlugin(candidate.fileName, candidate.name);
                if (integrityRequiresQuarantine(record)) {
                    quarantine(candidate.name, reason);
                    try {SoulCordSettings.setCuratedAddonEnabled(candidate.name, false, reason);}
                    catch {Logger.warn("SoulCord", `Integrity enforcement could not persist the disabled state for ${candidate.name}.`);}
                }
                continue;
            }

            if (record.kind === "dependency") {
                const dependency = SOULCORD_RUNTIME_DEPENDENCIES.find(entry => entry.name === record.name);
                if (!dependency) continue;
                const dependents = SOULCORD_RUNTIME_ADDONS.filter(candidate => candidate.dependencies.some(name => String(name) === dependency.name));
                const dependencyInstalled = Boolean(PluginManager.resolveAddon(dependency.fileName));
                const dependentActive = dependents.some(candidate => PluginManager.isEnabled(candidate.fileName) || SoulCordSettings.snapshot().curatedAddons[candidate.name]?.enabled === true);
                if (record.status === "unavailable" && !dependencyInstalled && !dependentActive) continue;
                for (const candidate of dependents) disablePlugin(candidate.fileName, candidate.name);
                disablePlugin(dependency.fileName, dependency.name);
                if (integrityRequiresQuarantine(record)) {
                    quarantine(dependency.name, reason);
                    for (const candidate of dependents) {
                        const dependentReason = `Dependency ${dependency.name} failed integrity validation; this addon was disabled and quarantined.`;
                        quarantine(candidate.name, dependentReason);
                        try {SoulCordSettings.setCuratedAddonEnabled(candidate.name, false, dependentReason);}
                        catch {Logger.warn("SoulCord", `Integrity enforcement could not persist the disabled state for ${candidate.name}.`);}
                    }
                }
                continue;
            }

            const theme = SOULCORD_THEMES.find(entry => entry.name === record.name);
            if (!theme || (record.status === "unavailable" && !ThemeManager.isEnabled(theme.fileName))) continue;
            try {if (ThemeManager.isEnabled(theme.fileName)) ThemeManager.disableAddon(theme.fileName);}
            catch {Logger.warn("SoulCord", `Integrity enforcement could not stop the reviewed theme ${theme.name}.`);}
        }
    }

    #download(filename: string, content: string, type: string): void {
        const url = URL.createObjectURL(new Blob([content], {type}));
        const anchor = document.createElement("a");
        anchor.download = filename;
        anchor.href = url;
        anchor.click();
        queueMicrotask(() => URL.revokeObjectURL(url));
    }

    #enabledAddonFiles(manager: {addonList: Array<{filename: string;}>; isEnabled(id: string): boolean;}): string[] {
        return manager.addonList.filter(addon => manager.isEnabled(addon.filename)).map(addon => addon.filename);
    }

    #reviewedAddonHeld(fileName: string): boolean {
        const reviewed = SOULCORD_RUNTIME_ADDONS.find(candidate => candidate.fileName === fileName) ?? SOULCORD_RUNTIME_DEPENDENCIES.find(dependency => dependency.fileName === fileName);
        if (!reviewed) return false;
        const kind: AddonIntegrityKind = "dependencies" in reviewed ? "addon" : "dependency";
        const record = this.#integrity.records.find(entry => entry.kind === kind && entry.name === reviewed.name);
        return integrityBlocksExecution(record) || PluginDoctor.isQuarantined(reviewed.name) || PluginDoctor.isQuarantined(reviewed.fileName);
    }

    #reviewedAddonBlockedForEnable(fileName: string): boolean {
        const reviewed = SOULCORD_RUNTIME_ADDONS.find(candidate => candidate.fileName === fileName) ?? SOULCORD_RUNTIME_DEPENDENCIES.find(dependency => dependency.fileName === fileName);
        if (!reviewed) return false;
        return reviewBlocksEnable(reviewed) || this.#reviewedAddonHeld(fileName);
    }

    async #applyAddonSelection(manager: {addonList: Array<{filename: string;}>; isEnabled(id: string): boolean; enableAddon(id: string): boolean | undefined; disableAddon(id: string): boolean | undefined;}, desiredFiles: ReadonlySet<string>): Promise<void> {
        for (const addon of [...manager.addonList]) {
            const desired = desiredFiles.has(addon.filename);
            const current = manager.isEnabled(addon.filename);
            if (current === desired) continue;
            if (desired && this.#reviewedAddonBlockedForEnable(addon.filename)) throw new Error("AddonReviewHeld");
            if (desired) manager.enableAddon(addon.filename);
            else manager.disableAddon(addon.filename);
            if (manager.isEnabled(addon.filename) !== desired) throw new Error("AddonProfileApplyFailed");
            await new Promise(resolve => globalThis.setTimeout(resolve, 25));
        }
    }

    async #restoreCompleteAddonStates(manager: {addonList: Array<{filename: string;}>; isEnabled(id: string): boolean; enableAddon(id: string): boolean | undefined; disableAddon(id: string): boolean | undefined;}, states: Record<string, boolean>): Promise<boolean> {
        let complete = true;
        for (const addon of [...manager.addonList]) {
            const desired = states[addon.filename] === true;
            if (manager.isEnabled(addon.filename) === desired) continue;
            if (desired && this.#reviewedAddonHeld(addon.filename)) {
                complete = false;
                continue;
            }
            try {
                if (desired) manager.enableAddon(addon.filename);
                else manager.disableAddon(addon.filename);
            }
            catch {complete = false;}
            if (manager.isEnabled(addon.filename) !== desired) complete = false;
        }
        return complete;
    }

    async #waitForAddon(manager: {isLoaded(id: string): boolean;}, fileName: string, timeoutMs = 8_000): Promise<boolean> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (manager.isLoaded(fileName)) return true;
            await new Promise(resolve => globalThis.setTimeout(resolve, 100));
        }
        return manager.isLoaded(fileName);
    }

    async #restoreAddonStates(priorAddonStates: Record<string, boolean>, priorThemeStates: Record<string, boolean>): Promise<boolean> {
        let complete = true;
        for (const candidate of SOULCORD_RUNTIME_ADDONS) {
            const desired = priorAddonStates[candidate.name] === true;
            if (!await this.#waitForAddon(PluginManager, candidate.fileName, 1_000)) {
                if (desired) complete = false;
                continue;
            }
            const current = PluginManager.isEnabled(candidate.fileName);
            if (desired && !current && !this.#reviewedAddonHeld(candidate.fileName)) PluginManager.enableAddon(candidate.fileName);
            else if (!desired && current) PluginManager.disableAddon(candidate.fileName);
            if (PluginManager.isEnabled(candidate.fileName) !== desired) complete = false;
        }
        for (const theme of SOULCORD_THEMES) {
            const desired = priorThemeStates[theme.fileName] === true;
            if (!await this.#waitForAddon(ThemeManager, theme.fileName, 1_000)) {
                if (desired) complete = false;
                continue;
            }
            const current = ThemeManager.isEnabled(theme.fileName);
            if (desired && !current) ThemeManager.enableAddon(theme.fileName);
            else if (!desired && current) ThemeManager.disableAddon(theme.fileName);
            if (ThemeManager.isEnabled(theme.fileName) !== desired) complete = false;
        }
        return complete;
    }

    #synchronizeCuratedAdapters(): void {
        this.#curatedScope.dispose();
        this.#curatedScope = new SoulCordDisposalScope();
        const scope = this.#curatedScope;
        const split = SoulCordSettings.snapshot().curatedAddons.SplitLargeMessages;
        if (!split?.enabled || split.mode !== "guarded") return;
        scope.listen(window, "keydown", (rawEvent: Event) => {
            const event = rawEvent as KeyboardEvent;
            if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing || event.repeat) return;
            const target = event.target instanceof HTMLElement ? event.target : undefined;
            const editor = target?.closest<HTMLElement>("[role='textbox'][contenteditable='true']");
            if (!editor || !editor.closest("[class*='channelTextArea']")) return;
            const content = editor.innerText || editor.textContent || "";
            if (content.length <= 2_000) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            this.#showGuardedSplitReview(scope, content);
        }, true);
    }

    #showGuardedSplitReview(scope: SoulCordDisposalScope, content: string): void {
        if (this.#splitReviewOpen) return;
        const preview = splitLargeMessage(content, 2_000, 1_200);
        if (preview.parts.length < 2) return;
        this.#splitReviewOpen = true;
        const summaries = preview.parts.map((part, index) => {
            const sample = part.slice(0, 140).replace(/[`*_~|]/g, " ").replace(/\s+/g, " ");
            return `Part ${index + 1}/${preview.parts.length} · ${part.length} characters · ${sample}${part.length > 140 ? "…" : ""}`;
        });
        if (typeof Modals.ModalActions?.closeModal !== "function") {
            this.#splitReviewOpen = false;
            return;
        }
        const previousHref = window.location.href;
        let finished = false;
        let modalKey: string | number | undefined;
        let routeTimer = 0;
        let release = () => {};
        let releaseRouteTimer = () => {};
        const dispose = () => {
            releaseRouteTimer();
            const shouldClose = !finished;
            finished = true;
            this.#splitReviewOpen = false;
            if (shouldClose && (typeof modalKey === "string" || typeof modalKey === "number")) Modals.ModalActions?.closeModal(modalKey);
        };
        const finish = () => {
            if (finished) return;
            finished = true;
            release();
        };
        try {
            const openedModal = Modals.showConfirmationModal("Guarded message split", [
                `${preview.parts.length} parts · ${preview.delayMs} ms planned spacing · ${preview.totalDelayMs} ms total delay.`,
                "SoulCord will not send automatically. Confirm to copy the ordered parts, then review and send each part yourself.",
                ...summaries
            ], {
                key: "soulcord-guarded-split-review",
                confirmText: "Copy ordered parts",
                cancelText: "Keep editing",
                onConfirm: () => {
                    finish();
                    void navigator.clipboard.writeText(preview.parts.join("\n\n--- SoulCord part break ---\n\n")).catch(() => Logger.warn("SoulCord", "Guarded splitter clipboard write was unavailable."));
                },
                onCancel: finish,
                onClose: finish
            });
            modalKey = typeof openedModal === "string" || typeof openedModal === "number" ? openedModal : "soulcord-guarded-split-review";
            release = scope.own(dispose, "element");
            if (scope.disposed) return;
            routeTimer = globalThis.setInterval(() => {
                if (window.location.href !== previousHref) release();
            }, 200) as unknown as number;
            releaseRouteTimer = scope.own(() => globalThis.clearInterval(routeTimer), "interval");
        }
        catch {
            dispose();
        }
    }

    async #synchronizeFeatures(): Promise<void> {
        for (const id of FEATURE_IDS) {
            const shouldRun = !this.#recoveryMode || id === "plugin-doctor";
            const enabled = SoulCordSettings.module(id).enabled && shouldRun;
            if (enabled) {
                this.#stopFeature(id);
                await this.#startFeature(id);
            }
            else {
                this.#stopFeature(id);
            }
        }
    }

    async #startFeature(id: SoulCordModuleId): Promise<void> {
        if (this.#scopes.has(id)) return;
        const scope = new SoulCordDisposalScope();
        this.#scopes.set(id, scope);
        const start = performance.now();
        this.#setHealth(id, {status: "starting", detail: "Starting validated adapter."});
        try {
            switch (id) {
                case "activity-bridge": await this.#startActivityBridge(scope); break;
                case "plugin-doctor": this.#startPluginDoctor(scope); break;
                case "drift-radar": this.#startDriftRadar(scope); break;
                case "performance-hud": this.#startPerformanceHud(scope); break;
                case "workspace-profiles": this.#setHealth(id, {detail: "Profile preview, snapshot, apply, and rollback are available. Opted-in third-party plugins execute only after a separate action-time confirmation."}); break;
                case "command-deck": this.#startCommandDeck(scope); break;
                case "link-lens": await this.#startLinkLens(scope); break;
                case "stream-shield": this.#startStreamShield(scope); break;
                case "settings-time-machine": this.#setHealth(id, {detail: `${SoulCordSettings.snapshot().snapshots.length} bounded local snapshot(s); exports contain no secrets.`}); break;
                case "accessibility-toolkit": this.#startAccessibilityToolkit(scope); break;
                case "message-timeline": await this.#startMessageTimeline(scope); break;
            }
            this.#setHealth(id, {
                status: "active",
                startupDurationMs: Math.round((performance.now() - start) * 10) / 10,
                lastSuccessfulValidation: Date.now(),
                resources: scope.counts()
            });
        }
        catch (error) {
            this.#scopes.delete(id);
            try {
                scope.dispose();
            }
            catch (cleanupError) {
                Logger.warn("SoulCord", `${id} cleanup after failed start reported ${errorName(cleanupError)}.`);
            }
            const health = this.#health.get(id)!;
            const failures = [...health.failures, {at: Date.now(), phase: "start", errorName: errorName(error)}].slice(-10);
            const recent = failures.filter(item => Date.now() - item.at <= 10 * 60 * 1_000);
            const quarantined = recent.length >= 3;
            this.#setHealth(id, {
                status: quarantined ? "quarantined" : "failed",
                failures,
                quarantineReason: quarantined ? "Three adapter failures within ten minutes; manual retry required." : undefined,
                detail: `Adapter failed closed with ${errorName(error)}.`,
                resources: {}
            });
            Logger.warn("SoulCord", `${id} failed closed with ${errorName(error)}.`);
        }
    }

    #stopFeature(id: SoulCordModuleId): void {
        const scope = this.#scopes.get(id);
        if (!scope) {
            if (this.#health.has(id) && this.#health.get(id)!.status !== "quarantined") this.#setHealth(id, {status: "stopped", resources: {}});
            return;
        }
        this.#scopes.delete(id);
        try {
            scope.dispose();
            this.#setHealth(id, {status: "stopped", resources: {}, detail: "Stopped; all owned resources released."});
        }
        catch (error) {
            this.#setHealth(id, {status: "failed", resources: {}, detail: `Cleanup reported ${errorName(error)}.`});
        }
    }

    async #startActivityBridge(scope: SoulCordDisposalScope): Promise<void> {
        await this.#refreshActivityHealth();
        scope.interval(() => void this.#refreshActivityHealth(), 10_000);
    }

    async #refreshActivityHealth(): Promise<void> {
        try {
            const health = await IPC.getActivityCompatibilityHealth() as ActivityCompatibilityHealth;
            const validStatus = health?.status === "idle" || health?.status === "healthy" || health?.status === "attention";
            const validCounters = health?.counters && Object.values(health.counters).every(value => Number.isSafeInteger(value) && value >= 0);
            const validEvents = Array.isArray(health?.events) && health.events.length <= 64 && health.events.every(event =>
                Number.isSafeInteger(event.sequence)
                && Number.isFinite(event.timestamp)
                && typeof event.action === "string"
                && typeof event.context === "string"
            );
            if (!validStatus || typeof health.unrestrictedOverride !== "boolean" || !validCounters || !validEvents) throw new TypeError("InvalidActivityHealth");
            this.#activityHealth = health;
            this.#setHealth("activity-bridge", {
                maturity: "ready",
                detail: health.unrestrictedOverride
                    ? "The legacy unrestricted preload override is ON; disable it before Activity testing."
                    : health.status === "healthy" || health.status === "idle"
                    ? "Restricted same-package preload policy is active; no compatibility exceptions are currently rejected."
                    : "The compatibility ledger needs review; no unrestricted override was enabled."
            });
        }
        catch (error) {
            this.#setHealth("activity-bridge", {maturity: "preview", detail: `Main-process ledger unavailable (${errorName(error)}); policy remains fail-closed.`});
        }
        this.emitChange();
    }

    #startPluginDoctor(scope: SoulCordDisposalScope): void {
        const update = () => {
            const records = PluginDoctor.snapshot();
            const quarantined = records.filter(record => record.quarantinedAt).length;
            const integrity = this.#integrity.summary;
            this.#setHealth("plugin-doctor", {detail: `${quarantined} quarantined addon(s); ${records.reduce((sum, record) => sum + record.failures.length, 0)} recent sanitized failure record(s). Integrity: ${integrity.match} verified, ${integrity.missing} not staged, ${integrity.attention + integrity.unavailable} held for review.`});
        };
        PluginDoctor.addChangeListener(update);
        scope.own(() => PluginDoctor.removeChangeListener(update), "listener");
        update();
    }

    #startDriftRadar(scope: SoulCordDisposalScope): void {
        const validate = () => {
            const userStore = getStore("UserStore") as {getCurrentUser?: () => unknown;} | undefined;
            this.#driftResults = runStructuralProbes([
                {id: "renderer-dom", description: "document root", validate: () => document.documentElement instanceof HTMLElement},
                {id: "webpack-runtime", description: "Discord webpack chunk array", validate: () => Array.isArray((globalThis as typeof globalThis & {webpackChunkdiscord_app?: unknown;}).webpackChunkdiscord_app)},
                {id: "current-user-store", description: "UserStore.getCurrentUser", validate: () => typeof userStore?.getCurrentUser === "function"},
                {id: "patcher", description: "reversible patch registry", validate: () => Array.isArray(Patcher.patches)}
            ]);
            const failed = this.#driftResults.filter(result => !result.ok).length;
            this.#setHealth("drift-radar", {detail: failed ? `${failed} structural probe(s) unavailable; volatile adapters validate their own lookup and fail closed.` : "All core structural probes passed."});
        };
        validate();
        scope.interval(validate, 60_000);
    }

    #startPerformanceHud(scope: SoulCordDisposalScope): void {
        const settings = SoulCordSettings.module("performance-hud");
        const seconds = Number(settings.values.sampleSeconds) || 5;
        this.#sampler.begin();
        let overlay: HTMLElement | undefined;
        if (settings.values.showOverlay === true) {
            overlay = scope.element(textElement("output", "SoulCord: measuring…", "soulcord-performance-overlay"));
            overlay.setAttribute("aria-live", "off");
        }
        const sample = () => {
            this.#lastPerformanceSample = this.#sampler.sample(seconds * 1_000, countResources(this.#scopes));
            if (overlay) overlay.textContent = `SoulCord · lag ${this.#lastPerformanceSample.eventLoopLagMs} ms · ${this.#lastPerformanceSample.ownedResources} owned resources`;
            this.#setHealth("performance-hud", {detail: `Last event-loop lag ${this.#lastPerformanceSample.eventLoopLagMs} ms; ${this.#lastPerformanceSample.ownedResources} SoulCord-owned resources. No optimization claim is inferred.`});
        };
        scope.interval(sample, seconds * 1_000);
        sample();
    }

    #startCommandDeck(scope: SoulCordDisposalScope): void {
        scope.listen(window, "keydown", (event: Event) => {
            const keyboard = event as KeyboardEvent;
            if (keyboard.ctrlKey && keyboard.altKey && !keyboard.shiftKey && keyboard.key.toLowerCase() === "k") {
                keyboard.preventDefault();
                this.openCommandDeck();
            }
        }, true);
        this.#setHealth("command-deck", {detail: "Ready at Ctrl+Alt+K with local-only actions."});
    }

    async #startLinkLens(scope: SoulCordDisposalScope): Promise<void> {
        const target = await getLazyBySource([".trackAnnouncementMessageLinkClicked("]);
        const [module, key] = getWithKey((candidate) => String(candidate).includes(".trackAnnouncementMessageLinkClicked("), {target});
        if (!module || typeof key !== "string" || typeof module[key] !== "function") throw new Error("LinkActivationAdapterUnavailable");

        const unpatch = Patcher.instead("SoulCord~LinkLens", module, key, (thisObject, args, original) => {
            const values = SoulCordSettings.module("link-lens").values;
            return interceptLinkActivation(thisObject, args as Array<{href?: string;} | Event | undefined>, original, {
                currentHref: window.location.href,
                confirmAllExternal: values.confirmAllExternal === true,
                removeTrackers: values.removeTrackers !== false,
                review: (inspection, onConfirm) => this.#showLinkReview(scope, inspection, onConfirm),
                open: destination => window.open(destination, "_blank", "noopener,noreferrer")
            });
        }, {forcePatch: false});
        if (!unpatch) throw new Error("LinkActivationPatchRejected");
        scope.own(unpatch, "patch");
        this.#setHealth("link-lens", {maturity: "ready", detail: "Native external-link activation adapter is attached. Internal Discord navigation is never intercepted."});
    }

    #showLinkReview(scope: SoulCordDisposalScope, inspection: LinkInspection, onConfirm: () => void): boolean {
        if (this.#linkReviewOpen) return true;
        if (scope.disposed || typeof Modals.ModalActions?.closeModal !== "function") return false;
        this.#linkReviewOpen = true;
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
        const previousHref = window.location.href;
        let finished = false;
        let modalKey: string | number | undefined;
        let routeTimer = 0;
        let release = () => {};
        let releaseRouteTimer = () => {};
        const dispose = () => {
            releaseRouteTimer();
            const shouldClose = !finished;
            finished = true;
            this.#linkReviewOpen = false;
            if (shouldClose && (typeof modalKey === "string" || typeof modalKey === "number")) Modals.ModalActions?.closeModal(modalKey);
            if (previousFocus?.isConnected) previousFocus.focus();
        };
        const finish = () => {
            if (finished) return;
            finished = true;
            release();
        };
        const warnings = inspection.warnings.length
            ? inspection.warnings.map(warning => `• ${warning}`)
            : ["• No local warning rules matched; review is enabled for every external link."];
        const content = [
            `Visible host: **${inspection.host ?? "invalid"}**`,
            ...(inspection.finalHost && inspection.finalHost !== inspection.host ? [`Declared final host: **${inspection.finalHost}**`] : []),
            ...warnings
        ];
        try {
            const openedModal = Modals.showConfirmationModal("Review external link", content, {
                key: "soulcord-link-review",
                confirmText: "Open reviewed link",
                cancelText: "Cancel",
                onConfirm: () => {finish(); onConfirm();},
                onCancel: finish,
                onClose: finish
            });
            modalKey = typeof openedModal === "string" || typeof openedModal === "number" ? openedModal : "soulcord-link-review";
            release = scope.own(dispose, "element");
            if (scope.disposed) return false;
            routeTimer = globalThis.setInterval(() => {
                if (window.location.href !== previousHref) release();
            }, 200) as unknown as number;
            releaseRouteTimer = scope.own(() => globalThis.clearInterval(routeTimer), "interval");
            return true;
        }
        catch {
            dispose();
            return false;
        }
    }

    #startStreamShield(scope: SoulCordDisposalScope): void {
        const root = document.documentElement;
        const settings = SoulCordSettings.module("stream-shield").values;
        const streamStore = getStore("ApplicationStreamingStore") as {
            addChangeListener?: (listener: () => void) => void;
            removeChangeListener?: (listener: () => void) => void;
            getCurrentUserActiveStream?: () => unknown;
            getStreamerActiveStreamMetadata?: () => unknown;
        } | undefined;
        const getter = typeof streamStore?.getCurrentUserActiveStream === "function"
            ? () => streamStore.getCurrentUserActiveStream?.()
            : typeof streamStore?.getStreamerActiveStreamMetadata === "function"
                ? () => streamStore.getStreamerActiveStreamMetadata?.()
                : undefined;
        const sync = () => {
            const automatic = Boolean(getter?.());
            const active = settings.manualActive === true || settings.previewActive === true || automatic;
            root.classList.toggle("soulcord-stream-shield", active);
            root.classList.toggle("soulcord-stream-preview", settings.previewActive === true);
            this.#setHealth("stream-shield", {
                maturity: getter ? "ready" : "preview",
                detail: `${active ? "Shield active" : "Shield ready"}; ${getter ? "verified Go Live store connected" : "manual hotkey only because no validated Go Live store was found"}.`
            });
        };
        const redactions: string[] = [];
        if (settings.redactGuilds === true) redactions.push("[class*=\"guildName\"]", "[class*=\"guildIcon\"]");
        if (settings.redactChannels === true) redactions.push("[class*=\"channelName\"]");
        if (settings.redactDMs === true) redactions.push("[class*=\"privateChannels\"] [class*=\"name\"]", "[class*=\"privateChannels\"] [class*=\"avatar\"]");
        if (settings.redactNotifications === true) redactions.push("[class*=\"notification\"] [class*=\"content\"]", "[class*=\"toast\"]");
        if (settings.redactNotes === true) redactions.push("[class*=\"userInfoSection\"] [class*=\"note\"]", "[class*=\"note\"] textarea");
        if (settings.redactAccount === true) redactions.push("[class*=\"accountProfile\"]", "[class*=\"panels\"] [class*=\"nameTag\"]", "[class*=\"panels\"] [class*=\"avatar\"]");
        const selector = redactions.map(item => `.soulcord-stream-shield ${item}`).join(",\n");
        scope.style("soulcord-stream-shield-style", `
            ${selector || ".soulcord-stream-shield [data-soulcord-no-redactions]"} {filter: blur(9px) saturate(0) !important; user-select: none !important;}
            .soulcord-stream-preview::after {content: "STREAM SHIELD PREVIEW"; position: fixed; inset: 12px 12px auto auto; z-index: 2147483647; padding: 6px 9px; color: #161819; background: #f4b860; font: 700 11px/1 sans-serif; letter-spacing: .08em; border-radius: 3px;}
        `);
        scope.own(() => {
            root.classList.remove("soulcord-stream-shield", "soulcord-stream-preview");
        }, "other");
        if (getter && typeof streamStore?.addChangeListener === "function") {
            streamStore.addChangeListener(sync);
            scope.own(() => streamStore.removeChangeListener?.(sync), "listener");
        }
        scope.listen(window, "keydown", (event: Event) => {
            const keyboard = event as KeyboardEvent;
            if (!keyboard.ctrlKey || !keyboard.altKey || !keyboard.shiftKey || keyboard.key.toLowerCase() !== "s") return;
            keyboard.preventDefault();
            void this.setValue("stream-shield", "manualActive", settings.manualActive !== true);
        }, true);
        sync();
    }

    #startAccessibilityToolkit(scope: SoulCordDisposalScope): void {
        const values = SoulCordSettings.module("accessibility-toolkit").values;
        const rules: string[] = [
            `.soulcord-keyboard-focus :focus-visible {outline: 2px solid #4ecdc4 !important; outline-offset: 2px !important;}`
        ];
        document.documentElement.classList.add("soulcord-keyboard-focus");
        scope.own(() => document.documentElement.classList.remove("soulcord-keyboard-focus"), "other");
        if (values.reducedMotion === true) rules.push(`html.soulcord-keyboard-focus *, html.soulcord-keyboard-focus *::before, html.soulcord-keyboard-focus *::after {animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important;}`);
        if (values.roleContrast === true) rules.push(`[class*="roleColor"] {text-shadow: 0 0 1px currentColor, 0 0 2px var(--background-base-lowest) !important;}`);
        const width = Number(values.readingWidth) || 0;
        if (width >= 480) rules.push(`[class*="messagesWrapper"] [class*="messageListItem"] {max-width: ${Math.min(width, 1_200)}px;}`);
        if (values.readingRuler === true) rules.push(`[class*="messageListItem"]:focus-within, [class*="messageListItem"]:hover {background: color-mix(in srgb, #4ecdc4 10%, transparent) !important;}`);
        scope.style("soulcord-accessibility-style", rules.join("\n"));
    }

    async #startMessageTimeline(scope: SoulCordDisposalScope): Promise<void> {
        type Dispatcher = {subscribe(type: string, callback: (payload: Record<string, unknown>) => void): void; unsubscribe(type: string, callback: (payload: Record<string, unknown>) => void): void; dispatch(payload: unknown): void;};
        type Channel = {id?: string; type?: number; guild_id?: string;};
        const dispatcher = getByKeys<Dispatcher>(["subscribe", "unsubscribe", "dispatch"]);
        const channelStore = getStore("ChannelStore") as {getChannel?: (id: string) => Channel | undefined;} | undefined;
        const userStore = getStore("UserStore") as {
            getCurrentUser?: () => {id?: string;} | undefined;
            addChangeListener?: (callback: () => void) => void;
            removeChangeListener?: (callback: () => void) => void;
        } | undefined;
        if (!dispatcher || typeof dispatcher.subscribe !== "function" || typeof dispatcher.unsubscribe !== "function" || typeof channelStore?.getChannel !== "function") {
            throw new Error("TimelineAdapterUnavailable");
        }

        const policy = SoulCordSettings.snapshot().timelinePolicy;
        this.#timelinePersistent = false;
        let accountId: string | undefined;
        let accountGeneration = -1;
        let accountInitialized = false;
        let accountReady = false;

        const updateHealth = () => {
            const status = this.#timeline.status();
            this.#setHealth("message-timeline", {
                maturity: "ready",
                detail: `${status.records} observed message record(s); ${status.deleted} deleted and ${status.edited} edited. ${this.#timelinePersistent ? "AES-256-GCM persistence is active through safeStorage." : "Session-only mode is active."}`
            });
            this.emitChange();
        };

        const currentAccountId = () => normalizeTimelineAccountId(userStore?.getCurrentUser?.()?.id);
        const activateAccount = async () => {
            const identity = this.#timelineAccountGuard.observe(currentAccountId());
            const valid = identity.accountId;
            if (accountInitialized && valid === accountId && identity.generation === accountGeneration) return;
            accountInitialized = true;
            accountId = valid;
            accountReady = false;
            accountGeneration = identity.generation;
            const generation = identity.generation;
            this.#timeline.clear();
            this.#timelinePersistent = false;
            this.#setHealth("message-timeline", {
                maturity: "preview",
                detail: accountId ? "Switching to an isolated Timeline account store; prior-account rows were removed before storage I/O." : "Waiting for a validated current-account scope; no messages are retained."
            });
            if (!accountId) {
                await this.#releaseTimelineAccount();
                const currentIdentity = this.#timelineAccountGuard.observe(currentAccountId());
                if (scope.disposed || generation !== accountGeneration || currentIdentity.generation !== generation || currentIdentity.accountId !== undefined) return;
                this.#timelinePersistent = false;
                this.#setHealth("message-timeline", {maturity: "preview", detail: "Waiting for a validated current-account scope; no messages are retained."});
                return;
            }
            const targetAccountId = accountId;
            const targetIdentity: TimelineAccountIdentity = {accountId: targetAccountId, generation};
            const identityIsCurrent = () => this.#timelineAccountGuard.matches(targetIdentity, currentAccountId());
            try {
                const opened = await this.#withTimelineAccount(targetAccountId, async capability => {
                    const storage = await TIMELINE_IPC.status(capability) as {persistent?: boolean; sessionOnly?: boolean;};
                    if (!identityIsCurrent()) throw new Error("TimelineAccountChangedBeforeRead");
                    const loaded = await TIMELINE_IPC.read(capability, {policy}) as {events?: TimelineEvent[]; persistent?: boolean;};
                    return {storage, loaded};
                }, identityIsCurrent);
                if (scope.disposed || generation !== accountGeneration || !identityIsCurrent()) return;
                this.#timelinePersistent = policy.retention !== "session" && opened.storage.persistent === true && opened.loaded.persistent === true;
                this.#timeline.hydrate(Array.isArray(opened.loaded.events) ? opened.loaded.events : [], policy);
                accountReady = true;
                updateHealth();
            }
            catch (error) {
                if (scope.disposed || generation !== accountGeneration || !identityIsCurrent()) return;
                this.#timelinePersistent = false;
                accountReady = true;
                this.#setHealth("message-timeline", {maturity: "preview", detail: `Persistent timeline opened in fail-closed session mode (${errorName(error)}).`});
            }
        };

        const eventId = (kind: TimelineEvent["kind"]) => {
            const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 16) ?? Math.random().toString(36).slice(2, 18);
            return `${kind}-${Date.now().toString(36)}-${random}`;
        };
        const scopedChannel = (channelId: unknown): channelId is string => typeof channelId === "string" && /^\d{1,32}$/.test(channelId) && channelIsInTimelineScope(channelStore.getChannel!(channelId), policy);
        const attachmentMetadata = (value: unknown): TimelineAttachmentMetadata[] | undefined => {
            if (policy.content === "text-only" || !Array.isArray(value)) return;
            return value.flatMap(item => {
                if (!item || typeof item !== "object") return [];
                const attachment = item as Record<string, unknown>;
                const name = typeof attachment.filename === "string" ? attachment.filename : typeof attachment.name === "string" ? attachment.name : undefined;
                if (!name) return [];
                return [{
                    name: name.slice(0, 260),
                    ...(typeof attachment.content_type === "string" ? {contentType: attachment.content_type.slice(0, 160)} : {}),
                    ...(typeof attachment.size === "number" && Number.isSafeInteger(attachment.size) && attachment.size >= 0 ? {size: attachment.size} : {})
                }];
            }).slice(0, 20);
        };
        const persist = (event: TimelineEvent) => {
            const current = currentAccountId();
            if (!timelineEventAccountMatches(accountId, current, accountReady)) {
                if (current !== accountId) void activateAccount();
                return;
            }
            if (!this.#timeline.apply(event, policy)) return;
            updateHealth();
            void this.#withPrivateCapability(capability => {
                if (this.#boundTimelineAccountId !== current) throw new Error("TimelineAccountChangedBeforeAppend");
                return TIMELINE_IPC.append(capability, {events: [event], policy});
            }).catch(error => {
                this.#timelinePersistent = false;
                this.#setHealth("message-timeline", {maturity: "preview", detail: `A timeline segment failed closed (${errorName(error)}); renderer memory remains session-only.`});
            });
        };

        const onCreate = (payload: Record<string, unknown>) => {
            const message = payload.message as Record<string, unknown> | undefined;
            const messageId = message?.id;
            const channelId = message?.channel_id ?? message?.channelId;
            if (typeof messageId !== "string" || !/^\d{1,32}$/.test(messageId) || !scopedChannel(channelId)) return;
            const author = message?.author as Record<string, unknown> | undefined;
            const authorLabel = typeof author?.global_name === "string" ? author.global_name : typeof author?.username === "string" ? author.username : undefined;
            persist({
                eventId: eventId("create"),
                kind: "create",
                observedAt: Date.now(),
                messageId,
                channelId,
                ...(authorLabel ? {authorLabel: authorLabel.slice(0, 160)} : {}),
                content: typeof message?.content === "string" ? message.content : "",
                ...(attachmentMetadata(message?.attachments) ? {attachments: attachmentMetadata(message?.attachments)} : {})
            });
        };
        const onUpdate = (payload: Record<string, unknown>) => {
            const message = payload.message as Record<string, unknown> | undefined;
            const messageId = message?.id;
            const channelId = message?.channel_id ?? message?.channelId;
            if (typeof messageId !== "string" || !/^\d{1,32}$/.test(messageId) || !scopedChannel(channelId)) return;
            persist({
                eventId: eventId("edit"),
                kind: "edit",
                observedAt: Date.now(),
                messageId,
                channelId,
                ...(typeof message?.content === "string" ? {content: message.content} : {}),
                ...(attachmentMetadata(message?.attachments) ? {attachments: attachmentMetadata(message?.attachments)} : {})
            });
        };
        const onDelete = (payload: Record<string, unknown>) => {
            const messageId = payload.id ?? payload.messageId;
            const channelId = payload.channelId ?? payload.channel_id;
            if (typeof messageId !== "string" || !/^\d{1,32}$/.test(messageId) || !scopedChannel(channelId)) return;
            persist({eventId: eventId("delete"), kind: "delete", observedAt: Date.now(), messageId, channelId});
        };
        const onBulkDelete = (payload: Record<string, unknown>) => {
            const channelId = payload.channelId ?? payload.channel_id;
            if (!scopedChannel(channelId)) return;
            const ids = boundedTimelineMessageIds(Array.isArray(payload.ids) ? payload.ids : payload.messageIds);
            for (const messageId of ids) persist({eventId: eventId("bulk-delete"), kind: "bulk-delete", observedAt: Date.now(), messageId, channelId});
        };

        const subscriptions: Array<[string, (payload: Record<string, unknown>) => void]> = [
            ["MESSAGE_CREATE", onCreate],
            ["MESSAGE_UPDATE", onUpdate],
            ["MESSAGE_DELETE", onDelete],
            ["MESSAGE_DELETE_BULK", onBulkDelete]
        ];
        for (const [type, callback] of subscriptions) {
            dispatcher.subscribe(type, callback);
            scope.own(() => dispatcher.unsubscribe(type, callback), "listener");
        }
        if (typeof userStore?.addChangeListener === "function" && typeof userStore.removeChangeListener === "function") {
            const onAccountChange = () => {
                this.#timelineAccountGuard.observe(currentAccountId());
                void activateAccount();
            };
            userStore.addChangeListener(onAccountChange);
            scope.own(() => userStore.removeChangeListener?.(onAccountChange), "listener");
        }
        scope.interval(() => void activateAccount(), 5_000);
        scope.own(() => {
            accountId = undefined;
            accountGeneration = -1;
            accountInitialized = false;
            accountReady = false;
            this.#timeline.clear();
            this.#timelinePersistent = false;
            void this.#releaseTimelineAccount();
        }, "cache");
        await activateAccount();
    }

    #initializeCrashGuard(now = Date.now()): boolean {
        const raw = JsonStore.get("misc", "soulcordCrashGuard") as Partial<CrashGuardDocument> | undefined;
        const result = evaluateCrashGuard(raw, now);
        JsonStore.set("misc", "soulcordCrashGuard", result.next);
        return result.recovery;
    }

    #setHealth(id: SoulCordModuleId, update: Partial<SoulCordModuleHealth>): void {
        const current = this.#health.get(id);
        if (!current) return;
        this.#health.set(id, {...current, ...update});
        this.emitChange();
    }
}

export default new SoulCordRuntimeStore();
