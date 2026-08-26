// SPDX-License-Identifier: Apache-2.0

const BLOCKED_TAGS = new Set([
    "a", "button", "code", "form", "input", "label", "option", "pre", "select", "textarea"
]);

const BLOCKED_ROLES = new Set([
    "button", "checkbox", "combobox", "link", "menuitem", "option", "radio", "slider", "spinbutton", "switch", "textbox"
]);

export interface DoubleClickReplyTargetNode {
    tagName?: unknown;
    role?: unknown;
    contentEditable?: unknown;
    solcordOwned?: unknown;
}

export interface DoubleClickReplyContext {
    eventType: unknown;
    button: unknown;
    detail: unknown;
    altKey?: unknown;
    ctrlKey?: unknown;
    metaKey?: unknown;
    shiftKey?: unknown;
    hasSelection: unknown;
    ancestors: readonly DoubleClickReplyTargetNode[];
    message: {
        messageId: unknown;
        channelId: unknown;
    } | null;
}

export interface DoubleClickReplyTarget {
    messageId: string;
    channelId: string;
}

export type DoubleClickReplyIgnoreReason =
    | "malformed-context"
    | "not-double-primary-click"
    | "modified-click"
    | "text-selected"
    | "blocked-target"
    | "not-message"
    | "invalid-message-identity";

export type DoubleClickReplyDecision =
    | {action: "ignore"; reason: DoubleClickReplyIgnoreReason;}
    | {action: "reply"; target: DoubleClickReplyTarget;};

export interface DoubleClickReplyAdapter {
    validate(): boolean;
    installDoubleClickListener(listener: (event: unknown) => void): () => void;
    inspect(event: unknown): DoubleClickReplyContext | null;
    requestReply(target: DoubleClickReplyTarget): void;
}

function isObject(value: unknown): value is Record<PropertyKey, unknown> {
    return typeof value === "object" && value !== null;
}

export function isDiscordSnowflake(value: unknown): value is string {
    if (typeof value !== "string" || !/^\d{17,20}$/.test(value)) return false;
    try {return BigInt(value) > 0n;}
    catch {return false;}
}

function isBlockedNode(value: unknown): boolean {
    if (!isObject(value)) return true;
    if (value.solcordOwned === true) return true;

    const tagName = typeof value.tagName === "string" ? value.tagName.trim().toLowerCase() : "";
    const role = typeof value.role === "string" ? value.role.trim().toLowerCase() : "";
    if (BLOCKED_TAGS.has(tagName) || BLOCKED_ROLES.has(role)) return true;

    return value.contentEditable === true || value.contentEditable === "" || value.contentEditable === "true";
}

function decideContext(context: unknown): DoubleClickReplyDecision {
    if (!isObject(context)) return {action: "ignore", reason: "malformed-context"};
    if (context.eventType !== "dblclick" || context.button !== 0 || context.detail !== 2) {
        return {action: "ignore", reason: "not-double-primary-click"};
    }
    if (context.altKey === true || context.ctrlKey === true || context.metaKey === true || context.shiftKey === true) {
        return {action: "ignore", reason: "modified-click"};
    }
    if (context.hasSelection !== false) return {action: "ignore", reason: context.hasSelection === true ? "text-selected" : "malformed-context"};
    if (!Array.isArray(context.ancestors)) return {action: "ignore", reason: "malformed-context"};
    if (context.ancestors.some(isBlockedNode)) return {action: "ignore", reason: "blocked-target"};
    if (!isObject(context.message)) return {action: "ignore", reason: "not-message"};

    const {messageId, channelId} = context.message;
    if (!isDiscordSnowflake(messageId) || !isDiscordSnowflake(channelId)) {
        return {action: "ignore", reason: "invalid-message-identity"};
    }

    return {action: "reply", target: {messageId, channelId}};
}

export function decideDoubleClickReply(context: unknown): DoubleClickReplyDecision {
    try {return decideContext(context);}
    catch {return {action: "ignore", reason: "malformed-context"};}
}

function isAdapter(value: unknown): value is DoubleClickReplyAdapter {
    if (!isObject(value)) return false;
    return typeof value.validate === "function"
        && typeof value.installDoubleClickListener === "function"
        && typeof value.inspect === "function"
        && typeof value.requestReply === "function";
}

export class DoubleClickReplyFeature {
    #adapter: unknown;
    #dispose: (() => void) | undefined;
    #active = false;

    public constructor(adapter: unknown) {
        this.#adapter = adapter;
    }

    public get running(): boolean {
        return this.#active;
    }

    public start(): boolean {
        if (this.#active) return true;
        if (!isAdapter(this.#adapter)) return false;

        const adapter = this.#adapter;
        try {
            if (adapter.validate() !== true) return false;
            const dispose = adapter.installDoubleClickListener(event => {
                if (!this.#active) return;
                try {
                    const decision = decideDoubleClickReply(adapter.inspect(event));
                    if (decision.action === "reply") adapter.requestReply(decision.target);
                }
                catch {
                    // Discord adapters are volatile. A lookup failure must never turn into an action.
                }
            });
            if (typeof dispose !== "function") return false;
            this.#dispose = dispose;
            this.#active = true;
            return true;
        }
        catch {
            this.#dispose = undefined;
            this.#active = false;
            return false;
        }
    }

    public stop(): void {
        const dispose = this.#dispose;
        this.#dispose = undefined;
        this.#active = false;
        try {dispose?.();}
        catch {
            // Teardown is best-effort, while the inactive guard remains fail closed.
        }
    }
}
