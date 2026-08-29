// SPDX-License-Identifier: Apache-2.0

const TRACKING_PARAMETERS = new Set([
    "fbclid", "gclid", "dclid", "igshid", "mc_cid", "mc_eid", "msclkid", "ref_src", "s_cid",
    "utm_campaign", "utm_content", "utm_id", "utm_medium", "utm_name", "utm_reader", "utm_source", "utm_term"
]);
const REDIRECT_PARAMETERS = ["redirect", "redirect_url", "redirect_uri", "target", "url"];
const INVITE_SHORT_HOSTS = new Set(["discord.gg"]);
const DISCORD_WEB_HOSTS = new Set(["discord.com", "www.discord.com", "discordapp.com", "www.discordapp.com"]);

export interface LinkInspection {
    input: string;
    valid: boolean;
    protocol?: string;
    host?: string;
    finalHost?: string;
    cleanedUrl?: string;
    removedParameters: string[];
    warnings: string[];
    inviteCode?: string;
    requiresConfirmation: boolean;
}

export interface LinkActivationDecision {
    inspection: LinkInspection;
    action: "pass" | "review";
    destination?: string;
}

export interface LinkActivationAdapterOptions {
    currentHref?: string;
    confirmAllExternal: boolean;
    removeTrackers: boolean;
    review(inspection: LinkInspection, onConfirm: () => void, onCancel: () => void, onFailure: () => void): boolean | void;
    open(destination: string): void;
}

export type LinkReviewModalKey = string | number;

export interface LinkReviewModalCallbacks {
    onConfirm(): void;
    onCancel(): void;
    onClose(): void;
    onRenderError(): void;
}

export interface LinkReviewModalAdapter {
    open(callbacks: LinkReviewModalCallbacks): LinkReviewModalKey | undefined;
    close(key: LinkReviewModalKey): void;
}

export interface LinkReviewFocusTarget {
    readonly isConnected: boolean;
    focus(): void;
}

export interface LinkReviewLifecycleEnvironment {
    href(): string;
    activeElement(): LinkReviewFocusTarget | undefined;
    setInterval(callback: () => void, delay: number): unknown;
    clearInterval(handle: unknown): void;
    deferFocus?(callback: () => void): void;
}

export interface LinkReviewLifecycleActions {
    confirm(): void;
    cancel(): void;
    failure(): void;
}

export type LinkReviewOpenResult = "opened" | "busy" | "unavailable";

interface ActiveLinkReview {
    finish(reason: "confirm" | "cancel" | "failure", closeModal: boolean): void;
}

/** Owns exactly one native review modal and all of its route/focus cleanup. */
export class LinkReviewLifecycle {
    #active?: ActiveLinkReview;

    constructor(private readonly environment: LinkReviewLifecycleEnvironment) {}

    get active(): boolean {
        return Boolean(this.#active);
    }

    open(adapter: LinkReviewModalAdapter, actions: LinkReviewLifecycleActions): LinkReviewOpenResult {
        if (this.#active) return "busy";

        const previousHref = this.environment.href();
        const previousFocus = this.environment.activeElement();
        let key: LinkReviewModalKey | undefined;
        let interval: unknown;
        let finished = false;
        let closeWhenKeyIsKnown = false;
        let finishReason: "confirm" | "cancel" | "failure" | undefined;

        const restoreFocus = () => {
            try {
                if (previousFocus?.isConnected) previousFocus.focus();
            }
            catch {/* focus restoration is best-effort */}
        };
        const close = () => {
            if (key === undefined) {
                closeWhenKeyIsKnown = true;
                return;
            }
            try {adapter.close(key);}
            catch {/* modal drift must not retain ownership */}
        };
        const finish = (reason: "confirm" | "cancel" | "failure", closeModal: boolean) => {
            if (finished) return;
            finished = true;
            finishReason = reason;
            this.#active = undefined;
            if (interval !== undefined) {
                try {this.environment.clearInterval(interval);}
                catch {/* timer cleanup remains best-effort */}
                interval = undefined;
            }
            if (closeModal) close();
            restoreFocus();
            try {
                this.environment.deferFocus?.(() => {
                    if (!this.#active) restoreFocus();
                });
            }
            catch {/* deferred focus restoration is best-effort */}
            if (reason === "confirm") actions.confirm();
            else if (reason === "cancel") actions.cancel();
            else actions.failure();
        };
        const active: ActiveLinkReview = {finish};
        this.#active = active;

        try {
            key = adapter.open({
                onConfirm: () => finish("confirm", false),
                onCancel: () => finish("cancel", false),
                onClose: () => finish("cancel", false),
                onRenderError: () => finish("failure", true)
            });
        }
        catch {
            finish("failure", false);
            return "unavailable";
        }

        if (typeof key !== "string" && typeof key !== "number") {
            finish("failure", false);
            return "unavailable";
        }
        if (closeWhenKeyIsKnown) {
            try {adapter.close(key);}
            catch {/* ownership was already released */}
        }
        if (finished) return finishReason === "failure" ? "unavailable" : "opened";

        interval = this.environment.setInterval(() => {
            if (this.environment.href() !== previousHref) finish("cancel", true);
        }, 200);
        return "opened";
    }

    dispose(): void {
        this.#active?.finish("cancel", true);
    }
}

function safeUrl(value: string): URL | null {
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:" ? url : null;
    }
    catch {
        return null;
    }
}

export function detectInvite(url: URL): string | undefined {
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    const candidate = INVITE_SHORT_HOSTS.has(host)
        ? parts[0]
        : DISCORD_WEB_HOSTS.has(host) && parts[0]?.toLowerCase() === "invite"
            ? parts[1]
            : undefined;
    return candidate && /^[\w-]{2,64}$/.test(candidate) ? candidate : undefined;
}

export function isDiscordInternalNavigation(input: string, currentHref?: string): boolean {
    const target = safeUrl(input.trim());
    if (!target || detectInvite(target)) return false;

    const host = target.hostname.toLowerCase();
    if (DISCORD_WEB_HOSTS.has(host)) return true;

    const current = currentHref ? safeUrl(currentHref) : null;
    return Boolean(current && target.origin === current.origin);
}

export function shouldInterceptLink(input: string, inspection: LinkInspection, currentHref: string | undefined, confirmAllExternal: boolean): boolean {
    if (!inspection.valid || isDiscordInternalNavigation(input, currentHref)) return false;
    return inspection.requiresConfirmation || confirmAllExternal;
}

export function decideLinkActivation(input: string, currentHref: string | undefined, confirmAllExternal: boolean, removeTrackers: boolean): LinkActivationDecision {
    const inspection = inspectLink(input);
    if (!shouldInterceptLink(input, inspection, currentHref, confirmAllExternal)) return {inspection, action: "pass"};
    return {
        inspection,
        action: "review",
        destination: removeTrackers ? inspection.cleanedUrl ?? input : input
    };
}

export function interceptLinkActivation(
    thisObject: unknown,
    args: Array<{href?: string;} | Event | undefined>,
    original: (...args: any[]) => unknown,
    options: LinkActivationAdapterOptions
): unknown {
    const link = args[0] as {href?: string;} | undefined;
    if (!link?.href) return original.apply(thisObject, args);

    const decision = decideLinkActivation(link.href, options.currentHref, options.confirmAllExternal, options.removeTrackers);
    if (decision.action === "pass" || !decision.destination) return original.apply(thisObject, args);

    let settled = false;
    let originalReturn: unknown;
    const failOpen = () => {
        if (settled) return originalReturn;
        settled = true;
        originalReturn = original.apply(thisObject, args);
        return originalReturn;
    };
    const confirm = () => {
        if (settled) return;
        settled = true;
        options.open(decision.destination!);
    };
    const cancel = () => {settled = true;};

    let reviewed: boolean | void;
    try {reviewed = options.review(decision.inspection, confirm, cancel, failOpen);}
    catch {return failOpen();}
    if (reviewed === false) return failOpen();
    if (settled) return originalReturn;

    const event = args[1] as Event | undefined;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    return undefined;
}

export function inspectLink(input: string): LinkInspection {
    const url = safeUrl(input.trim());
    if (!url) return {input, valid: false, removedParameters: [], warnings: ["Only complete HTTP or HTTPS links are supported."], requiresConfirmation: true};

    const warnings: string[] = [];
    const removedParameters: string[] = [];
    const host = url.hostname.toLowerCase();
    if (host.startsWith("xn--") || host.includes(".xn--")) warnings.push("The host uses an internationalized punycode label; verify the spelling.");
    if ([...url.hostname].some(character => character.codePointAt(0)! > 0x7F)) warnings.push("The host contains non-ASCII characters that may resemble another domain.");
    if (url.username || url.password) warnings.push("The link contains embedded credentials.");
    if (url.protocol !== "https:") warnings.push("The link is not encrypted with HTTPS.");

    for (const key of [...url.searchParams.keys()]) {
        if (TRACKING_PARAMETERS.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
            removedParameters.push(key);
            url.searchParams.delete(key);
        }
    }

    let finalHost = host;
    for (const parameter of REDIRECT_PARAMETERS) {
        const nested = url.searchParams.get(parameter);
        if (!nested) continue;
        const nestedUrl = safeUrl(nested);
        if (!nestedUrl) continue;
        finalHost = nestedUrl.hostname.toLowerCase();
        warnings.push(`The link declares a redirect to ${finalHost}.`);
        break;
    }

    const inviteCode = detectInvite(url);
    if (inviteCode) warnings.push(`Discord invite code: ${inviteCode}. Membership and expiry are not fetched.`);
    if (removedParameters.length) warnings.push(`${removedParameters.length} known tracking parameter${removedParameters.length === 1 ? "" : "s"} can be removed.`);

    return {
        input,
        valid: true,
        protocol: url.protocol,
        host,
        finalHost,
        cleanedUrl: url.toString(),
        removedParameters,
        warnings,
        inviteCode,
        requiresConfirmation: warnings.length > 0 || finalHost !== host
    };
}
