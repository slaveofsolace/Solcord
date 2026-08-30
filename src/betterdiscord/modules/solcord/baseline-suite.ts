// SPDX-License-Identifier: Apache-2.0

import type {SolcordBaselinePreferences, SolcordLayoutRegion} from "@common/solcord/product";

import {SolcordDisposalScope} from "./disposal";

const MESSAGE_LINK = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/channels\/(?:@me|\d{1,32})\/(\d{1,32})\/(\d{1,32})(?:[/?#]|$)/i;
const REGION_CLASSES: Readonly<Record<SolcordLayoutRegion, string>> = Object.freeze({
    guilds: "solcord-layout-hide-guilds",
    channels: "solcord-layout-hide-channels",
    members: "solcord-layout-hide-members"
});

export interface SolcordLoadedMessage {
    id?: string;
    content?: string;
    author?: {globalName?: string; username?: string;};
    timestamp?: string | number | Date;
}

export interface SolcordBaselineSuiteAdapter {
    getLoadedMessage?(channelId: string, messageId: string): SolcordLoadedMessage | undefined;
}

export interface SolcordBaselineSuiteStatus {
    active: boolean;
    resources: Record<string, number>;
    enabled: string[];
    unavailable: string[];
}

export function parseLoadedDiscordMessageLink(value: string): {channelId: string; messageId: string;} | undefined {
    const match = MESSAGE_LINK.exec(value.trim());
    return match ? {channelId: match[1], messageId: match[2]} : undefined;
}

function scrollableAncestor(target: EventTarget | null): HTMLElement | undefined {
    let node = target instanceof HTMLElement ? target : undefined;
    while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (node.scrollHeight > node.clientHeight + 8 && /(auto|scroll)/.test(style.overflowY)) return node;
        node = node.parentElement ?? undefined;
    }
}

export class SolcordBaselineSuite {
    #scope?: SolcordDisposalScope;
    #status: SolcordBaselineSuiteStatus = {active: false, resources: {}, enabled: [], unavailable: []};

    constructor(private readonly adapter: SolcordBaselineSuiteAdapter) {}

    start(preferences: SolcordBaselinePreferences): SolcordBaselineSuiteStatus {
        this.stop();
        const scope = new SolcordDisposalScope();
        const enabled: string[] = [];
        const unavailable: string[] = [];
        this.#scope = scope;

        if (preferences.layoutCollapse) {
            enabled.push("Layout Collapse");
            this.#startLayout(scope, preferences.collapsedRegions);
        }
        if (preferences.embedControls) {
            enabled.push("Embed Controls");
            this.#startEmbedControls(scope);
        }
        if (preferences.crossPlatformAutoscroll) {
            enabled.push("Cross-platform Autoscroll");
            this.#startAutoscroll(scope);
        }
        if (preferences.messageLinkPreview) {
            if (this.adapter.getLoadedMessage) {
                enabled.push("Message Link Preview");
                this.#startMessageLinkPreview(scope);
            }
            else {unavailable.push("Message Link Preview: loaded message store unavailable");}
        }
        if (!enabled.length && !unavailable.length) {
            scope.dispose();
            this.#scope = undefined;
        }
        this.#status = {active: enabled.length > 0, resources: this.#scope?.counts() ?? {}, enabled, unavailable};
        return this.status();
    }

    status(): SolcordBaselineSuiteStatus {
        return structuredClone({...this.#status, resources: this.#scope?.counts() ?? {}});
    }

    stop(): void {
        const scope = this.#scope;
        this.#scope = undefined;
        try {scope?.dispose();}
        finally {this.#status = {active: false, resources: {}, enabled: [], unavailable: []};}
    }

    #startLayout(scope: SolcordDisposalScope, collapsed: readonly SolcordLayoutRegion[]): void {
        const root = document.documentElement;
        for (const region of collapsed) root.classList.add(REGION_CLASSES[region]);
        scope.own(() => root.classList.remove(...Object.values(REGION_CLASSES)), "style");
        scope.style("solcord-layout-collapse-runtime", `
            html.solcord-layout-hide-guilds [class*="guilds_"] { display: none !important; }
            html.solcord-layout-hide-channels [class*="sidebarList_"] { display: none !important; }
            html.solcord-layout-hide-members [class*="membersWrap_"] { display: none !important; }
        `);
    }

    #startEmbedControls(scope: SolcordDisposalScope): void {
        scope.style("solcord-embed-controls-runtime", `
            .solcord-embed-control { position: absolute; z-index: 1; top: 4px; right: 4px; min-width: 28px; min-height: 24px; color: var(--interactive-normal); background: var(--background-secondary-alt); border: 1px solid var(--border-subtle); border-radius: 4px; cursor: pointer; }
            .solcord-embed-host { position: relative !important; }
            .solcord-embed-host.solcord-embed-collapsed > :not(.solcord-embed-control) { display: none !important; }
        `);
        let frame = 0;
        const controls = new Map<HTMLButtonElement, EventListener>();
        const releaseDetachedControls = () => {
            for (const [button, listener] of controls) {
                if (button.isConnected) continue;
                button.removeEventListener("click", listener);
                controls.delete(button);
            }
        };
        const scan = () => {
            frame = 0;
            releaseDetachedControls();
            for (const candidate of document.querySelectorAll<HTMLElement>("[class*=\"embedWrapper_\"]")) {
                const message = candidate.closest("[id^=\"chat-messages-\"], [data-list-item-id^=\"chat-messages\"], [class*=\"messageListItem_\"]");
                if (!message || candidate.querySelector(":scope > .solcord-embed-control")) continue;
                candidate.classList.add("solcord-embed-host");
                const button = document.createElement("button");
                button.type = "button";
                button.className = "solcord-embed-control";
                button.textContent = "−";
                button.title = "Collapse this embed locally";
                button.setAttribute("aria-label", "Collapse this embed locally");
                const toggle: EventListener = event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const collapsed = candidate.classList.toggle("solcord-embed-collapsed");
                    button.textContent = collapsed ? "+" : "−";
                    button.title = collapsed ? "Expand this embed locally" : "Collapse this embed locally";
                    button.setAttribute("aria-label", button.title);
                };
                button.addEventListener("click", toggle);
                controls.set(button, toggle);
                candidate.prepend(button);
            }
        };
        const schedule = () => {if (!frame) frame = requestAnimationFrame(scan);};
        scan();
        const observer = new MutationObserver(schedule);
        scope.observe(observer, document.body, {childList: true, subtree: true});
        scope.own(() => {
            if (frame) cancelAnimationFrame(frame);
            for (const [button, listener] of controls) {
                button.removeEventListener("click", listener);
                button.remove();
            }
            controls.clear();
            for (const host of document.querySelectorAll(".solcord-embed-host")) host.classList.remove("solcord-embed-host", "solcord-embed-collapsed");
        }, "element");
    }

    #startAutoscroll(scope: SolcordDisposalScope): void {
        scope.style("solcord-autoscroll-runtime", "html.solcord-autoscroll-active, html.solcord-autoscroll-active * { cursor: ns-resize !important; }");
        let active: {element: HTMLElement; originY: number;} | undefined;
        let pointerY = 0;
        let frame = 0;
        const stop = () => {
            active = undefined;
            document.documentElement.classList.remove("solcord-autoscroll-active");
            if (frame) cancelAnimationFrame(frame);
            frame = 0;
        };
        const tick = () => {
            if (!active) return;
            const delta = pointerY - active.originY;
            if (Math.abs(delta) > 8) active.element.scrollBy({top: Math.sign(delta) * Math.min(42, Math.max(2, Math.abs(delta) / 5)), behavior: "auto"});
            frame = requestAnimationFrame(tick);
        };
        scope.listen(document, "mousedown", event => {
            const pointer = event as MouseEvent;
            if (pointer.button !== 1 || active) return;
            const element = scrollableAncestor(pointer.target);
            if (!element) return;
            pointer.preventDefault();
            active = {element, originY: pointer.clientY};
            pointerY = pointer.clientY;
            document.documentElement.classList.add("solcord-autoscroll-active");
            frame = requestAnimationFrame(tick);
        }, true);
        scope.listen(document, "mousemove", event => {pointerY = (event as MouseEvent).clientY;}, true);
        scope.listen(document, "mouseup", event => {if ((event as MouseEvent).button === 1) stop();}, true);
        scope.listen(window, "blur", stop);
        scope.listen(document, "keydown", event => {if ((event as KeyboardEvent).key === "Escape") stop();}, true);
        scope.own(stop, "other");
    }

    #startMessageLinkPreview(scope: SolcordDisposalScope): void {
        let preview: HTMLElement | undefined;
        const close = () => {preview?.remove(); preview = undefined;};
        scope.listen(document, "mouseover", event => {
            const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
            if (!anchor) return;
            const parsed = parseLoadedDiscordMessageLink(anchor.href);
            if (!parsed) return;
            const message = this.adapter.getLoadedMessage?.(parsed.channelId, parsed.messageId);
            if (!message) return;
            close();
            preview = document.createElement("aside");
            preview.className = "solcord-message-link-preview";
            preview.setAttribute("role", "status");
            const author = message.author?.globalName ?? message.author?.username ?? "Loaded message";
            const text = typeof message.content === "string" && message.content.trim() ? message.content.trim().slice(0, 420) : "No text content in the loaded record.";
            preview.append(Object.assign(document.createElement("strong"), {textContent: author}), Object.assign(document.createElement("p"), {textContent: text}));
            const rect = anchor.getBoundingClientRect();
            preview.style.left = `${Math.max(12, Math.min(window.innerWidth - 332, rect.left))}px`;
            preview.style.top = `${Math.max(12, Math.min(window.innerHeight - 180, rect.bottom + 8))}px`;
            document.body.append(preview);
        }, true);
        scope.listen(document, "mouseout", event => {
            const next = (event as MouseEvent).relatedTarget;
            if (next instanceof Node && preview?.contains(next)) return;
            close();
        }, true);
        scope.listen(window, "blur", close);
        scope.own(close, "element");
        scope.style("solcord-message-link-preview-runtime", `
            .solcord-message-link-preview { position: fixed; z-index: 10000; width: min(320px, calc(100vw - 24px)); padding: 10px 12px; color: var(--text-normal); background: var(--background-floating); border: 1px solid var(--border-subtle); border-radius: 6px; box-shadow: var(--elevation-high); pointer-events: none; }
            .solcord-message-link-preview strong { display: block; margin-bottom: 4px; }
            .solcord-message-link-preview p { margin: 0; color: var(--text-muted); line-height: 1.4; overflow-wrap: anywhere; }
        `);
    }
}
