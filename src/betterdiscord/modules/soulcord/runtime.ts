import Logger from "@common/logger";
import Store from "@stores/base";
import JsonStore from "@stores/json";
import IPC from "@modules/ipc";
import Patcher from "@modules/patcher";
import SettingsRenderer from "@ui/settings";
import {getStore} from "@webpack";

import type {SoulCordMaturity, SoulCordModuleHealth, SoulCordModuleId} from "./contracts";
import {SoulCordDisposalScope} from "./disposal";
import SoulCordSettings from "./store";
import PluginDoctor from "./doctor";
import {runStructuralProbes, type StructuralProbeResult} from "./drift";
import {inspectLink, type LinkInspection} from "./link-lens";
import {BoundedPerformanceSampler, type PerformanceSample} from "./performance";
import {evaluateCrashGuard, type CrashGuardDocument} from "./crash-guard";

interface ActivityCompatibilityHealth {
    status: "idle" | "healthy" | "attention";
    unrestrictedOverride: boolean;
    counters: Record<string, number>;
    events: Array<{sequence: number; timestamp: number; action: string; context: string; reason?: string; webContentsId?: number; packageFile?: string;}>;
}

const FEATURE_META: Record<SoulCordModuleId, {name: string; risk: SoulCordModuleHealth["risk"]; maturity: SoulCordMaturity; detail: string;}> = {
    "activity-bridge": {name: "Activity Bridge", risk: "standard", maturity: "ready", detail: "Waiting for the main-process compatibility ledger."},
    "plugin-doctor": {name: "Plugin Doctor + Addon Quarantine", risk: "standard", maturity: "ready", detail: "Monitoring local addon failures."},
    "drift-radar": {name: "Module Drift Radar / Patch Canary", risk: "standard", maturity: "preview", detail: "Validating structural contracts before volatile adapters patch Discord."},
    "performance-hud": {name: "Performance HUD", risk: "standard", maturity: "ready", detail: "Sampling local renderer measurements."},
    "workspace-profiles": {name: "Workspace Profiles", risk: "standard", maturity: "preview", detail: "SoulCord-owned profiles are local and rollback-backed; third-party addon execution is not enabled in V1."},
    "command-deck": {name: "Command Deck", risk: "standard", maturity: "ready", detail: "Local command palette; no message actions."},
    "link-lens": {name: "Link Lens + Invite Inspector", risk: "standard", maturity: "preview", detail: "Inspecting links and invite codes locally before suspicious navigation; invite metadata is not fetched in V1."},
    "stream-shield": {name: "Stream Shield + Screenshot Scrubber", risk: "standard", maturity: "preview", detail: "Manual shield is ready; Go Live detection is validated at runtime."},
    "settings-time-machine": {name: "Settings Time Machine + Update Ledger", risk: "standard", maturity: "ready", detail: "Bounded snapshots and migration records are active."},
    "accessibility-toolkit": {name: "Accessibility Toolkit", risk: "standard", maturity: "preview", detail: "Local reversible presentation controls."}
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
        for (const id of FEATURE_IDS) {
            if (this.#recoveryMode && id !== "plugin-doctor") {
                this.#setHealth(id, {status: "stopped", detail: "Held off by SoulCord startup recovery mode."});
                continue;
            }
            if (SoulCordSettings.module(id).enabled) await this.#startFeature(id);
        }
        this.#rootScope.timeout(() => {
            JsonStore.set("misc", "soulcordCrashGuard", {attempts: [], state: "stable", at: Date.now()} satisfies CrashGuardDocument);
        }, 30_000);
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

    async applyProfile(profileId: string): Promise<boolean> {
        const applied = SoulCordSettings.applyProfile(profileId);
        if (!applied) return false;
        await this.#synchronizeFeatures();
        return true;
    }

    async rollback(snapshotId: string): Promise<boolean> {
        const rolledBack = SoulCordSettings.rollback(snapshotId);
        if (!rolledBack) return false;
        await this.#synchronizeFeatures();
        return true;
    }

    previewSettingsImport(text: string): string[] | undefined {
        return SoulCordSettings.previewImport(text);
    }

    async importSettings(text: string): Promise<boolean> {
        if (!SoulCordSettings.importDocument(text)) return false;
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

    #download(filename: string, content: string, type: string): void {
        const url = URL.createObjectURL(new Blob([content], {type}));
        const anchor = document.createElement("a");
        anchor.download = filename;
        anchor.href = url;
        anchor.click();
        queueMicrotask(() => URL.revokeObjectURL(url));
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
                case "workspace-profiles": this.#setHealth(id, {detail: "Atomic SoulCord-only profile preview, snapshot, apply, and rollback are available; third-party addon execution stays out of V1."}); break;
                case "command-deck": this.#startCommandDeck(scope); break;
                case "link-lens": this.#startLinkLens(scope); break;
                case "stream-shield": this.#startStreamShield(scope); break;
                case "settings-time-machine": this.#setHealth(id, {detail: `${SoulCordSettings.snapshot().snapshots.length} bounded local snapshot(s); exports contain no secrets.`}); break;
                case "accessibility-toolkit": this.#startAccessibilityToolkit(scope); break;
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
            Logger.stacktrace("SoulCord", `${id} failed closed.`, error as Error);
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
            this.#setHealth("plugin-doctor", {detail: `${quarantined} quarantined addon(s); ${records.reduce((sum, record) => sum + record.failures.length, 0)} recent sanitized failure record(s).`});
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

    #startLinkLens(scope: SoulCordDisposalScope): void {
        scope.listen(document, "click", (event: Event) => {
            const mouse = event as MouseEvent;
            if (mouse.defaultPrevented || mouse.button !== 0) return;
            const anchor = mouse.composedPath().find(item => item instanceof HTMLAnchorElement) as HTMLAnchorElement | undefined;
            if (!anchor?.href) return;
            const inspection = inspectLink(anchor.href);
            const settings = SoulCordSettings.module("link-lens").values;
            if (!inspection.valid || (!inspection.requiresConfirmation && settings.confirmAllExternal !== true)) return;
            mouse.preventDefault();
            mouse.stopPropagation();
            const destination = settings.removeTrackers === false ? anchor.href : inspection.cleanedUrl!;
            this.#showLinkReview(scope, inspection, () => window.open(destination, "_blank", "noopener,noreferrer"));
        }, true);
    }

    #showLinkReview(scope: SoulCordDisposalScope, inspection: LinkInspection, onConfirm: () => void): void {
        const overlay = document.createElement("div");
        overlay.className = "soulcord-local-overlay";
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
        const dialog = document.createElement("div");
        dialog.className = "soulcord-local-dialog";
        dialog.setAttribute("role", "alertdialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-label", "Review link destination");
        dialog.append(textElement("h2", "Review link"));
        dialog.append(textElement("p", `Visible host: ${inspection.host ?? "invalid"}`));
        if (inspection.finalHost && inspection.finalHost !== inspection.host) dialog.append(textElement("p", `Declared final host: ${inspection.finalHost}`));
        const warnings = document.createElement("ul");
        for (const warning of inspection.warnings) warnings.append(textElement("li", warning));
        dialog.append(warnings);
        const actions = document.createElement("div");
        actions.className = "soulcord-dialog-actions";
        let release = () => overlay.remove();
        const close = () => release();
        actions.append(button("Cancel", close), button("Open reviewed link", () => {close(); onConfirm();}));
        dialog.append(actions);
        overlay.append(dialog);
        document.body.append(overlay);
        release = scope.own(() => {
            overlay.remove();
            if (previousFocus?.isConnected) previousFocus.focus();
        }, "element");
        overlay.addEventListener("keydown", event => handleDialogKeydown(event, dialog, close));
        dialog.querySelector<HTMLButtonElement>("button")?.focus();
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
