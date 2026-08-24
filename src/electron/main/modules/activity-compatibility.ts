// SPDX-License-Identifier: Apache-2.0

import path from "node:path";

import type {PreloadAssignmentResult} from "./preload-policy";


export type ActivityCompatibilityAction =
    | "window-begin"
    | "window-ready"
    | "window-construction-failed"
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
    policyVersion: 2;
    mode: "verified-discord-preload-once";
    unrestrictedOverride: boolean;
    status: "idle" | "healthy" | "attention";
    counters: {
        windowsBegun: number;
        windowsReady: number;
        windowConstructionFailures: number;
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
export const ACTIVITY_COMPATIBILITY_MAX_SERIALIZED_BYTES = 32 * 1024;

const SAFE_PRELOAD_FILES = new Map([
    ["mainscreenpreload.js", "mainScreenPreload.js"],
    ["activitypreload.js", "activityPreload.js"],
    ["overlaypreload.js", "overlayPreload.js"],
    ["preload.js", "preload.js"]
]);
const SAFE_PACKAGE_FILES = new Map([
    ["core.asar", "core.asar"],
    ["app.asar", "app.asar"]
]);
const SAFE_ERROR_NAMES = new Set(["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError", "EvalError", "AggregateError"]);
const SAFE_REASONS = new Set([
    "accepted-same-package",
    "invalid-original",
    "invalid-candidate",
    "invalid-discord-root",
    "mixed-path-flavor",
    "untrusted-original",
    "different-package",
    "unsupported-package",
    "assignment-limit",
    "unsupported-extension",
    "canonicalization-failed",
    "canonical-root-mismatch",
    "unrestricted-compatibility-setting",
    ...SAFE_ERROR_NAMES,
    "unknown-error"
]);

function safeBasename(value: unknown): string | undefined {
    if (typeof value !== "string" || !value) return undefined;
    const normalized = value.replaceAll("\\", "/");
    const name = path.posix.basename(normalized);
    return name && name.length <= 96 ? name : undefined;
}

function safePreloadFile(value: unknown): string | undefined {
    const basename = safeBasename(value)?.toLocaleLowerCase("en-US");
    if (!basename) return undefined;
    return SAFE_PRELOAD_FILES.get(basename) ?? (/\.(?:cjs|mjs|js)$/.test(basename) ? "other-preload.js" : undefined);
}

function safePackageFile(value: unknown): string | undefined {
    const basename = safeBasename(value)?.toLocaleLowerCase("en-US");
    if (!basename) return undefined;
    return SAFE_PACKAGE_FILES.get(basename) ?? (basename.endsWith(".asar") ? "other.asar" : undefined);
}

function safeErrorName(error: unknown): string {
    return error instanceof Error && SAFE_ERROR_NAMES.has(error.name) ? error.name : "unknown-error";
}

function safeReason(value: unknown): string | undefined {
    return typeof value === "string" && SAFE_REASONS.has(value) ? value : undefined;
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
        windowConstructionFailures: 0,
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
            packageFile: safePackageFile(packageRoot)
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

    constructionFailed(token: number, error: unknown): void {
        const context = this.#contexts.get(token);
        if (!context) return;
        this.#counters.windowConstructionFailures++;
        this.#record(context, "window-construction-failed", {
            reason: safeErrorName(error)
        });
        this.#contexts.delete(token);
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
            candidateFile: safePreloadFile(result.candidateFile),
            packageFile: safePackageFile(result.packageFile)
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
        const reason = safeErrorName(error);
        this.#record(context, "preload-error", {reason});
    }

    setUnrestrictedOverride(value: boolean): void {
        this.#unrestrictedOverride = value;
    }

    snapshot(): ActivityCompatibilityHealth {
        const status = this.#unrestrictedOverride
            || this.#counters.unrestrictedPreloadsAccepted
            || this.#counters.preloadErrors
            || this.#counters.assignmentsRejected
            || this.#counters.windowConstructionFailures
            ? "attention"
            : this.#counters.discordPreloadsAccepted
                ? "healthy"
                : "idle";
        return {
            product: "SoulCord",
            policyVersion: 2,
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
            ...(Number.isSafeInteger(extra.webContentsId) && Number(extra.webContentsId) > 0 ? {webContentsId: extra.webContentsId} : {}),
            ...(safeReason(extra.reason) ? {reason: safeReason(extra.reason)} : {}),
            ...(safePreloadFile(extra.candidateFile) ? {candidateFile: safePreloadFile(extra.candidateFile)} : {}),
            ...(safePackageFile(extra.packageFile ?? context.packageFile) ? {packageFile: safePackageFile(extra.packageFile ?? context.packageFile)} : {})
        };
        this.#events.push(event);
        while (this.#events.length > MAX_EVENTS
            || Buffer.byteLength(JSON.stringify(this.#events), "utf8") > ACTIVITY_COMPATIBILITY_MAX_SERIALIZED_BYTES) this.#events.shift();
    }
}

export default new ActivityCompatibilityLedger();
