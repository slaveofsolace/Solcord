const TRACKING_PARAMETERS = new Set([
    "fbclid", "gclid", "dclid", "igshid", "mc_cid", "mc_eid", "msclkid", "ref_src", "s_cid",
    "utm_campaign", "utm_content", "utm_id", "utm_medium", "utm_name", "utm_reader", "utm_source", "utm_term"
]);
const REDIRECT_PARAMETERS = ["redirect", "redirect_url", "redirect_uri", "target", "url"];
const INVITE_HOSTS = new Set(["discord.gg", "discord.com", "www.discord.com", "discordapp.com", "www.discordapp.com"]);

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

function safeUrl(value: string): URL | null {
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:" ? url : null;
    }
    catch {
        return null;
    }
}

function detectInvite(url: URL): string | undefined {
    if (!INVITE_HOSTS.has(url.hostname.toLowerCase())) return;
    const parts = url.pathname.split("/").filter(Boolean);
    const candidate = parts[0] === "invite" ? parts[1] : parts[0];
    return candidate && /^[\w-]{2,64}$/.test(candidate) ? candidate : undefined;
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
