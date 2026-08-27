// SPDX-License-Identifier: Apache-2.0

export type SolcordBaselineCapabilityId =
    | "layout-collapse"
    | "media-shelf"
    | "embed-controls"
    | "cross-platform-autoscroll"
    | "message-link-preview";

export type SolcordBaselineCapabilityStatus = "scaffold" | "adapter-review" | "runtime-acceptance" | "ready";

export interface SolcordBaselineCapability {
    id: SolcordBaselineCapabilityId;
    title: string;
    summary: string;
    inspiration: Readonly<{name: string; url: string;}>;
    performanceOrder: number;
    defaultEnabled: false;
    loading: "lazy";
    disabledRuntimeCost: "none";
    status: SolcordBaselineCapabilityStatus;
    requiredAdapters: readonly string[];
    boundaries: readonly string[];
    networkAccess: false;
    accountActions: false;
}

const CAPABILITIES: readonly SolcordBaselineCapability[] = [
    {
        id: "layout-collapse",
        title: "Layout Collapse",
        summary: "Optional, individually collapsible Discord regions with keyboard-safe restore controls.",
        inspiration: {name: "CollapsibleUI", url: "https://betterdiscord.app/plugins/CollapsibleUI"},
        performanceOrder: 1,
        defaultEnabled: false,
        loading: "lazy",
        disabledRuntimeCost: "none",
        status: "ready",
        requiredAdapters: ["layout-region-registry", "visibility-state-store"],
        boundaries: ["presentation-only", "never-remove-content", "restore-always-visible"],
        networkAccess: false,
        accountActions: false
    },
    {
        id: "embed-controls",
        title: "Embed Controls",
        summary: "Per-message collapse controls that preserve Discord's original embed tree and state.",
        inspiration: {name: "CollapseEmbeds", url: "https://betterdiscord.app/plugins/CollapseEmbeds"},
        performanceOrder: 2,
        defaultEnabled: false,
        loading: "lazy",
        disabledRuntimeCost: "none",
        status: "ready",
        requiredAdapters: ["message-embed-renderer", "message-identity"],
        boundaries: ["local-presentation-only", "no-message-mutation", "no-history-fetch"],
        networkAccess: false,
        accountActions: false
    },
    {
        id: "cross-platform-autoscroll",
        title: "Cross-platform Autoscroll",
        summary: "Middle-click autoscroll for supported desktop platforms without polling the document.",
        inspiration: {name: "AutoScroll", url: "https://betterdiscord.app/plugins/AutoScroll"},
        performanceOrder: 3,
        defaultEnabled: false,
        loading: "lazy",
        disabledRuntimeCost: "none",
        status: "ready",
        requiredAdapters: ["active-scroller-resolver", "pointer-lifecycle"],
        boundaries: ["user-gesture-only", "one-active-scroller", "teardown-on-navigation"],
        networkAccess: false,
        accountActions: false
    },
    {
        id: "media-shelf",
        title: "Media Shelf",
        summary: "Local folders and labels for already-saved GIFs, stickers, and emoji references.",
        inspiration: {name: "ImageFolder", url: "https://betterdiscord.app/plugins/ImageFolder"},
        performanceOrder: 4,
        defaultEnabled: false,
        loading: "lazy",
        disabledRuntimeCost: "none",
        status: "ready",
        requiredAdapters: ["expression-picker", "local-media-index"],
        boundaries: ["local-index-only", "no-background-downloads", "bounded-metadata"],
        networkAccess: false,
        accountActions: false
    },
    {
        id: "message-link-preview",
        title: "Message Link Preview",
        summary: "Preview Discord message links only when the target message is already available to the client.",
        inspiration: {name: "PeekMessageLinks", url: "https://betterdiscord.app/plugins/PeekMessageLinks"},
        performanceOrder: 5,
        defaultEnabled: false,
        loading: "lazy",
        disabledRuntimeCost: "none",
        status: "ready",
        requiredAdapters: ["message-link-parser", "loaded-message-store"],
        boundaries: ["loaded-store-only", "never-fetch", "never-bypass-permissions"],
        networkAccess: false,
        accountActions: false
    }
];

export const SOLCORD_BASELINE_CAPABILITIES = Object.freeze(CAPABILITIES.map(capability => Object.freeze({
    ...capability,
    inspiration: Object.freeze({...capability.inspiration}),
    requiredAdapters: Object.freeze([...capability.requiredAdapters]),
    boundaries: Object.freeze([...capability.boundaries])
})));

export function getSolcordBaselineCapability(id: SolcordBaselineCapabilityId): SolcordBaselineCapability {
    const capability = SOLCORD_BASELINE_CAPABILITIES.find(candidate => candidate.id === id);
    if (!capability) throw new Error(`Unknown Solcord baseline capability: ${id}`);
    return capability;
}
