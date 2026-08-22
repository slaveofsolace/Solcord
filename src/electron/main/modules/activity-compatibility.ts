import path from "node:path";

import type {PreloadAssignmentResult} from "./preload-policy";


export type ActivityCompatibilityAction =
    | "window-begin"
    | "window-ready"
    | "window-destroyed"
    | "preload-accepted"
    | "preload-rejected"
    | "preload-duplicate"
    | "renderer-injection"
    | "preload-error";

export interface ActivityCompatibilityEvent {
    sequence: number;
    timestamp: number;
    windowToken: number;
    webContentsId?: number;
    action: ActivityCompatibilityAction;
    context: "shell" | "overlay" | "editor" | "discord-window" | "unknown";
    reason?: string;
    candidateFile?: string;
    packageFile?: string;
}

export interface ActivityCompatibilityHealth {
    product: "SoulCord";
    policyVersion: 1;
    mode: "verified-discord-preload-once";
    unrestrictedOverride: boolean;
    status: "idle" | "healthy" | "attention";
    counters: {
        windowsBegun: number;
        windowsReady: number;
        windowsDestroyed: number;
        discordPreloadsAccepted: number;
        unrestrictedPreloadsAccepted: number;
        assignmentsRejected: number;
        duplicatesIgnored: number;
        rendererInjections: number;
        preloadErrors: number;
    };
    events: ActivityCompatibilityEvent[];
    privacy: "No URLs, tokens, message content, server names, or absolute paths are retained.";
}

interface WindowContext {
    token: number;
    kind: ActivityCompatibilityEvent["context"];
    packageFile?: string;
}

const MAX_EVENTS = 64;

function safeBasename(value: unknown): string | undefined {
    if (typeof value !== "string" || !value) return undefined;
    const normalized = value.replaceAll("\\", "/");
    const name = path.posix.basename(normalized);
    return name && name.length <= 96 ? name : undefined;
}

function classify(title: unknown, originalPreload: unknown): WindowContext["kind"] {
    const normalizedTitle = typeof title === "string" ? title.toLocaleLowerCase("en-US") : "";
    const preload = safeBasename(originalPreload)?.toLocaleLowerCase("en-US");
    if (normalizedTitle === "discord" && preload === "mainscreenpreload.js") return "shell";
    if (normalizedTitle.includes("overlay")) return "overlay";
    if (normalizedTitle.includes("editor")) return "editor";
    if (preload) return "discord-window";
    return "unknown";
}

class ActivityCompatibilityLedger {
    #sequence = 0;
    #windowToken = 0;
    #events: ActivityCompatibilityEvent[] = [];
    #contexts = new Map<number, WindowContext>();
    #unrestrictedOverride = false;
    #counters: ActivityCompatibilityHealth["counters"] = {
        windowsBegun: 0,
        windowsReady: 0,
        windowsDestroyed: 0,
        discordPreloadsAccepted: 0,
        unrestrictedPreloadsAccepted: 0,
        assignmentsRejected: 0,
        duplicatesIgnored: 0,
        rendererInjections: 0,
        preloadErrors: 0
    };

    beginWindow(title: unknown, originalPreload: unknown, packageRoot: unknown): number {
        const token = ++this.#windowToken;
        const context: WindowContext = {
            token,
            kind: classify(title, originalPreload),
            packageFile: safeBasename(packageRoot)
        };
        this.#contexts.set(token, context);
        this.#counters.windowsBegun++;
        this.#record(context, "window-begin");
        return token;
    }

    ready(token: number, webContentsId: number): void {
        const context = this.#contexts.get(token);
        if (!context) return;
        this.#counters.windowsReady++;
        this.#record(context, "window-ready", {webContentsId});
    }

    destroyed(token: number, webContentsId?: number): void {
        const context = this.#contexts.get(token);
        if (!context) return;
        this.#counters.windowsDestroyed++;
        this.#record(context, "window-destroyed", {webContentsId});
        this.#contexts.delete(token);
    }

    assignment(token: number, result: PreloadAssignmentResult, unrestrictedOverride: boolean): void {
        const context = this.#contexts.get(token);
        if (!context) return;
        this.#unrestrictedOverride = unrestrictedOverride;
        let action: ActivityCompatibilityAction;
        if (result.action === "accepted-discord") {
            action = "preload-accepted";
            this.#counters.discordPreloadsAccepted++;
        }
        else if (result.action === "accepted-unrestricted") {
            action = "preload-accepted";
            this.#counters.unrestrictedPreloadsAccepted++;
        }
        else if (result.action === "duplicate") {
            action = "preload-duplicate";
            this.#counters.duplicatesIgnored++;
        }
        else {
            action = "preload-rejected";
            this.#counters.assignmentsRejected++;
        }
        this.#record(context, action, {
            reason: result.action === "accepted-unrestricted" ? "unrestricted-compatibility-setting" : result.reason,
            candidateFile: result.candidateFile,
            packageFile: result.packageFile
        });
    }

    injection(token: number): void {
        const context = this.#contexts.get(token);
        if (!context) return;
        this.#counters.rendererInjections++;
        this.#record(context, "renderer-injection");
    }

    preloadError(token: number, error: unknown): void {
        const context = this.#contexts.get(token);
        if (!context) return;
        this.#counters.preloadErrors++;
        const reason = error instanceof Error ? error.name : "unknown-error";
        this.#record(context, "preload-error", {reason});
    }

    setUnrestrictedOverride(value: boolean): void {
        this.#unrestrictedOverride = value;
    }

    snapshot(): ActivityCompatibilityHealth {
        const status = this.#counters.preloadErrors || this.#counters.assignmentsRejected
            ? "attention"
            : this.#counters.windowsReady
                ? "healthy"
                : "idle";
        return {
            product: "SoulCord",
            policyVersion: 1,
            mode: "verified-discord-preload-once",
            unrestrictedOverride: this.#unrestrictedOverride,
            status,
            counters: {...this.#counters},
            events: this.#events.map(event => ({...event})),
            privacy: "No URLs, tokens, message content, server names, or absolute paths are retained."
        };
    }

    resetForTests(): void {
        this.#sequence = 0;
        this.#windowToken = 0;
        this.#events = [];
        this.#contexts.clear();
        this.#unrestrictedOverride = false;
        const counters = this.#counters;
        for (const key of Object.keys(counters) as Array<keyof ActivityCompatibilityHealth["counters"]>) counters[key] = 0;
    }

    #record(context: WindowContext, action: ActivityCompatibilityAction, extra: Partial<ActivityCompatibilityEvent> = {}): void {
        const event: ActivityCompatibilityEvent = {
            sequence: ++this.#sequence,
            timestamp: Date.now(),
            windowToken: context.token,
            action,
            context: context.kind,
            packageFile: context.packageFile,
            ...extra
        };
        this.#events.push(event);
        if (this.#events.length > MAX_EVENTS) this.#events.splice(0, this.#events.length - MAX_EVENTS);
    }
}

export default new ActivityCompatibilityLedger();
