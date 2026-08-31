// SPDX-License-Identifier: Apache-2.0

export type SolcordStreamShieldRegion = "guilds" | "channels" | "dms" | "notifications" | "notes" | "account";

export interface SolcordStreamShieldSettings {
    redactGuilds: boolean;
    redactChannels: boolean;
    redactDMs: boolean;
    redactNotifications: boolean;
    redactNotes: boolean;
    redactAccount: boolean;
}

export interface SolcordStreamShieldResolution {
    active: boolean;
    requested: SolcordStreamShieldRegion[];
    resolved: SolcordStreamShieldRegion[];
    waiting: SolcordStreamShieldRegion[];
    drift: SolcordStreamShieldRegion[];
    tagged: number;
}

const TARGET_CLASS = "solcord-stream-redaction";
const TARGET_ATTRIBUTE = "data-solcord-stream-region";
const PROTECTED_SELECTOR = [
    ".solcord-control-center",
    ".solcord-local-overlay",
    ".solcord-layout-restore",
    "[class*=\"standardSidebarView_\"]",
    "[class*=\"contentRegion_\"]",
    "[class*=\"contentColumn_\"]"
].join(",");
const REGION_LIMIT = 12;

function label(element: Element): string {
    return `${element.getAttribute("aria-label") ?? ""} ${element.getAttribute("data-list-id") ?? ""}`.trim().toLowerCase();
}

function isProtected(element: Element): boolean {
    return Boolean(element.closest(PROTECTED_SELECTOR));
}

function bounded(elements: Iterable<Element>, limit = REGION_LIMIT): HTMLElement[] {
    const results: HTMLElement[] = [];
    for (const element of elements) {
        if (!(element instanceof HTMLElement) || isProtected(element) || results.includes(element)) continue;
        results.push(element);
        if (results.length >= limit) break;
    }
    return results;
}

function navigationRoot(element: Element): HTMLElement | undefined {
    const landmark = element.closest<HTMLElement>("nav,[role=\"navigation\"],aside");
    if (landmark && landmark !== document.body && !isProtected(landmark)) return landmark;
    return element instanceof HTMLElement && !isProtected(element) ? element : undefined;
}

function semanticLandmarks(root: ParentNode, terms: readonly string[]): HTMLElement[] {
    return bounded([...root.querySelectorAll<HTMLElement>("nav[aria-label],[role=\"navigation\"][aria-label],aside[aria-label]")]
        .filter(element => terms.some(term => label(element).includes(term))));
}

function listLandmarks(root: ParentNode, predicate: (value: string) => boolean): HTMLElement[] {
    return bounded([...root.querySelectorAll<HTMLElement>("[data-list-id]")]
        .filter(element => predicate(label(element)))
        .map(element => navigationRoot(element) ?? element));
}

function resolveGuilds(root: ParentNode): HTMLElement[] {
    const byList = listLandmarks(root, value => value === "guildsnav" || value.includes("guildsnav"));
    return byList.length ? byList : semanticLandmarks(root, ["servers", "guilds"]);
}

function resolveChannels(root: ParentNode): HTMLElement[] {
    const byList = listLandmarks(root, value => value.startsWith("channels") && !value.includes("private"));
    if (byList.length) return byList;
    return semanticLandmarks(root, ["channels"]).filter(element => !label(element).includes("direct message"));
}

function resolveDms(root: ParentNode): HTMLElement[] {
    const targets = [
        ...listLandmarks(root, value => value.includes("private-channel") || value.includes("direct-message")),
        ...semanticLandmarks(root, ["direct messages", "direct message"]),
        ...bounded([...root.querySelectorAll<HTMLElement>("header[aria-label]")].filter(element => label(element).includes("direct message")), 2)
    ];
    return bounded(targets);
}

function resolveNotifications(root: ParentNode): HTMLElement[] {
    const semantic = [...root.querySelectorAll<HTMLElement>("[role=\"alert\"],[role=\"status\"],[aria-live]")]
        .filter(element => {
            if (isProtected(element)) return false;
            const identity = `${label(element)} ${element.className}`.toLowerCase();
            return identity.includes("toast") || identity.includes("notification") || element.getAttribute("role") === "alert";
        });
    const classEvidence = root.querySelectorAll<HTMLElement>("[class*=\"toast_\"],[class*=\"notification_\"]");
    return bounded([...semantic, ...classEvidence]);
}

function resolveNotes(root: ParentNode): HTMLElement[] {
    const controls = [...root.querySelectorAll<HTMLElement>("textarea,input,[contenteditable=\"true\"]")]
        .filter(element => {
            const identity = `${label(element)} ${element.getAttribute("placeholder") ?? ""}`.toLowerCase();
            return identity.includes("note") && !isProtected(element);
        });
    return bounded(controls.map(element => element.closest<HTMLElement>("[class*=\"note_\"],section,fieldset") ?? element));
}

function resolveAccount(root: ParentNode): HTMLElement[] {
    const direct = [...root.querySelectorAll<HTMLElement>("[aria-label]")]
        .filter(element => {
            const identity = label(element);
            return !isProtected(element) && (identity.includes("user area") || identity.includes("account panel"));
        });
    const settingsButtons = [...root.querySelectorAll<HTMLElement>("button[aria-label],[role=\"button\"][aria-label]")]
        .filter(element => !isProtected(element) && label(element).includes("user settings"));
    const inferred = settingsButtons.flatMap(button => {
        let candidate = button.parentElement;
        for (let depth = 0; candidate && candidate !== document.body && depth < 7; depth++, candidate = candidate.parentElement) {
            const companion = [...candidate.querySelectorAll<HTMLElement>("button[aria-label],[role=\"button\"][aria-label]")]
                .some(element => {
                    const identity = label(element);
                    return identity.includes("mute") || identity.includes("deafen");
                });
            if (companion) return [candidate];
        }
        return [];
    });
    const panels = bounded([...direct, ...inferred], 2);
    const identities = panels.flatMap(container => {
        const explicit = [...container.querySelectorAll<HTMLElement>("[class*=\"avatar_\"],[class*=\"avatarWrapper_\"],[class*=\"nameTag_\"],[class*=\"username_\"]")]
            .filter(element => !element.closest("button,[role=\"button\"]"));
        if (explicit.length) return explicit;
        return [...container.children].filter((child): child is HTMLElement => child instanceof HTMLElement && !child.matches("button,[role=\"button\"]") && !child.querySelector("button,[role=\"button\"]"));
    });
    return bounded(identities, 8);
}

const RESOLVERS: Record<SolcordStreamShieldRegion, (root: ParentNode) => HTMLElement[]> = {
    guilds: resolveGuilds,
    channels: resolveChannels,
    dms: resolveDms,
    notifications: resolveNotifications,
    notes: resolveNotes,
    account: resolveAccount
};

function possibleUnverifiedEvidence(root: ParentNode, region: SolcordStreamShieldRegion): boolean {
    const selectors: Record<SolcordStreamShieldRegion, string> = {
        guilds: "[class*=\"guilds_\"],[class*=\"guild_\"]",
        channels: "[class*=\"sidebarList_\"],[class*=\"channelName_\"]",
        dms: "[class*=\"privateChannels_\"],[class*=\"privateChannel_\"]",
        notifications: "[class*=\"toast_\"],[class*=\"notification_\"]",
        notes: "[class*=\"note_\"],[class*=\"userInfoSection_\"]",
        account: "[class*=\"panels_\"],[class*=\"accountProfile_\"]"
    };
    return [...root.querySelectorAll(selectors[region])].some(element => !isProtected(element));
}

export function normalizeSolcordStreamShieldSettings(values: Record<string, unknown>): SolcordStreamShieldSettings {
    return {
        redactGuilds: values.redactGuilds === true,
        redactChannels: values.redactChannels === true,
        redactDMs: values.redactDMs === true,
        redactNotifications: values.redactNotifications === true,
        redactNotes: values.redactNotes === true,
        redactAccount: values.redactAccount === true
    };
}

function requestedRegions(settings: SolcordStreamShieldSettings): SolcordStreamShieldRegion[] {
    return [
        ...(settings.redactGuilds ? ["guilds" as const] : []),
        ...(settings.redactChannels ? ["channels" as const] : []),
        ...(settings.redactDMs ? ["dms" as const] : []),
        ...(settings.redactNotifications ? ["notifications" as const] : []),
        ...(settings.redactNotes ? ["notes" as const] : []),
        ...(settings.redactAccount ? ["account" as const] : [])
    ];
}

export class SolcordStreamShieldDom {
    #root: ParentNode;
    #tagged = new Set<HTMLElement>();

    constructor(root: ParentNode = document) {
        this.#root = root;
    }

    reconcile(active: boolean, settings: SolcordStreamShieldSettings): SolcordStreamShieldResolution {
        const requested = requestedRegions(settings);
        const targets = new Map<SolcordStreamShieldRegion, HTMLElement[]>();
        if (active) {
            for (const region of requested) targets.set(region, RESOLVERS[region](this.#root));
        }
        const next = new Set([...targets.values()].flat());
        for (const element of this.#tagged) {
            if (next.has(element)) continue;
            element.classList.remove(TARGET_CLASS);
            element.removeAttribute(TARGET_ATTRIBUTE);
        }
        for (const [region, elements] of targets) {
            for (const element of elements) {
                element.classList.add(TARGET_CLASS);
                const previous = element.getAttribute(TARGET_ATTRIBUTE)?.split(" ").filter(Boolean) ?? [];
                element.setAttribute(TARGET_ATTRIBUTE, [...new Set([...previous, region])].sort().join(" "));
            }
        }
        this.#tagged = next;
        if (!active) return {active: false, requested, resolved: [], waiting: requested, drift: [], tagged: 0};
        const resolved = requested.filter(region => (targets.get(region)?.length ?? 0) > 0);
        const waiting = requested.filter(region => !resolved.includes(region) && !possibleUnverifiedEvidence(this.#root, region));
        const drift = requested.filter(region => !resolved.includes(region) && possibleUnverifiedEvidence(this.#root, region));
        return {active, requested, resolved, waiting, drift, tagged: next.size};
    }

    dispose(): void {
        for (const element of this.#tagged) {
            element.classList.remove(TARGET_CLASS);
            element.removeAttribute(TARGET_ATTRIBUTE);
        }
        this.#tagged.clear();
        if (this.#root instanceof Document) {
            for (const element of this.#root.querySelectorAll<HTMLElement>(`.${TARGET_CLASS}`)) {
                element.classList.remove(TARGET_CLASS);
                element.removeAttribute(TARGET_ATTRIBUTE);
            }
        }
    }
}

export function describeSolcordStreamShieldResolution(result: SolcordStreamShieldResolution, automaticAvailable: boolean, source: "preview" | "manual" | "stream" | "ready"): string {
    const automatic = automaticAvailable ? "Automatic Go Live detection has a structural store match; live transition acceptance remains pending." : "Automatic Go Live detection is unavailable; preview and manual mode still work.";
    if (!result.active) return `Shield ready. ${automatic}`;
    const mode = source === "preview" ? "Preview" : source === "manual" ? "Manual shield" : "Go Live shield";
    const coverage = `${result.resolved.length}/${result.requested.length} requested region${result.requested.length === 1 ? "" : "s"} verified; ${result.tagged} bounded target${result.tagged === 1 ? "" : "s"} redacted.`;
    const drift = result.drift.length ? ` Selector drift left ${result.drift.join(", ")} unchanged.` : "";
    const waiting = result.waiting.length ? ` Waiting for ${result.waiting.join(", ")} on the current route.` : "";
    return `${mode} active. ${coverage}${drift}${waiting} ${automatic}`;
}
