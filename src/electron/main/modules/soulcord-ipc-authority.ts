import crypto from "node:crypto";


const SOULCORD_APP_HOSTS = new Set(["discord.com", "canary.discord.com", "ptb.discord.com"]);
const ACCOUNT_ID = /^\d{1,32}$/;
const CAPABILITY = /^[a-zA-Z0-9_-]{43}$/;

interface TimelineBinding {
    bootstrapCapability?: Buffer;
    capability?: Buffer;
    accountScope?: string;
}

export interface TimelineAuthorizedRequest {
    accountScope: string;
    request: Record<string, unknown>;
}

export function isTrustedSoulCordIpcUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.port && !url.username && !url.password && SOULCORD_APP_HOSTS.has(url.hostname);
    }
    catch {return false;}
}

function senderId(value: unknown): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new TypeError("Invalid SoulCord IPC sender.");
    return value;
}

function accountScope(value: unknown): string {
    if (typeof value !== "string" || !ACCOUNT_ID.test(value)) throw new TypeError("Invalid SoulCord timeline account scope.");
    return value;
}

function decodeCapability(value: unknown): Buffer {
    if (typeof value !== "string" || !CAPABILITY.test(value)) throw new TypeError("Invalid SoulCord timeline capability.");
    const decoded = Buffer.from(value, "base64url");
    if (decoded.length !== 32) throw new TypeError("Invalid SoulCord timeline capability.");
    return decoded;
}

/**
 * Keeps the sensitive account selector in the main process after bootstrap.
 * Every later operation is authorized by a main-issued, per-WebContents token;
 * renderer payloads cannot select another account by supplying an account id.
 */
export class SoulCordTimelineIpcAuthority {
    #bindings = new Map<number, TimelineBinding>();

    bootstrap(rawSenderId: unknown): {bootstrapCapability: string;} {
        const id = senderId(rawSenderId);
        if (this.#bindings.has(id)) throw new Error("SoulCord timeline bootstrap already exists.");
        const bootstrapCapability = crypto.randomBytes(32);
        this.#bindings.set(id, {bootstrapCapability});
        return {bootstrapCapability: bootstrapCapability.toString("base64url")};
    }

    activate(rawSenderId: unknown, rawRequest: unknown): {capability: string;} {
        const id = senderId(rawSenderId);
        if (!rawRequest || typeof rawRequest !== "object" || Array.isArray(rawRequest)) throw new TypeError("Invalid SoulCord timeline bind request.");
        const request = rawRequest as Record<string, unknown>;
        const binding = this.#bindings.get(id);
        if (!binding?.bootstrapCapability || binding.capability) throw new Error("SoulCord timeline bootstrap is unavailable.");
        this.#assertToken(binding.bootstrapCapability, request.bootstrapCapability, "bootstrap");
        binding.bootstrapCapability.fill(0);
        binding.bootstrapCapability = undefined;

        const capability = crypto.randomBytes(32);
        binding.capability = capability;
        return {capability: capability.toString("base64url")};
    }

    bind(rawSenderId: unknown, rawRequest: unknown): {capability: string;} {
        const id = senderId(rawSenderId);
        if (!rawRequest || typeof rawRequest !== "object" || Array.isArray(rawRequest)) throw new TypeError("Invalid SoulCord timeline bind request.");
        const request = rawRequest as Record<string, unknown>;
        const binding = this.#activeBinding(id);
        this.#assertCapability(binding, request.capability);
        const scope = accountScope(request.accountId);
        const capability = this.#rotate(binding);
        binding.accountScope = scope;
        return {capability};
    }

    releaseAccount(rawSenderId: unknown, rawRequest: unknown): {capability: string;} {
        const id = senderId(rawSenderId);
        if (!rawRequest || typeof rawRequest !== "object" || Array.isArray(rawRequest)) throw new TypeError("Invalid SoulCord timeline release request.");
        const request = rawRequest as Record<string, unknown>;
        const binding = this.#activeBinding(id);
        this.#assertCapability(binding, request.capability);
        binding.accountScope = undefined;
        return {capability: this.#rotate(binding)};
    }

    authorize(rawSenderId: unknown, rawRequest: unknown, requireAccount = true): TimelineAuthorizedRequest {
        const id = senderId(rawSenderId);
        const binding = this.#activeBinding(id);
        if (!rawRequest || typeof rawRequest !== "object" || Array.isArray(rawRequest)) throw new TypeError("Invalid SoulCord timeline request.");
        const request = rawRequest as Record<string, unknown>;
        this.#assertCapability(binding, request.capability);
        if (Object.hasOwn(request, "accountId")) throw new TypeError("Timeline operations cannot select an account.");
        if (requireAccount && !binding.accountScope) throw new Error("SoulCord timeline account is not bound.");
        const {capability: _, ...payload} = request;
        return {accountScope: binding.accountScope ?? "", request: payload};
    }

    release(rawSenderId: unknown): void {
        const id = senderId(rawSenderId);
        const binding = this.#bindings.get(id);
        binding?.bootstrapCapability?.fill(0);
        binding?.capability?.fill(0);
        this.#bindings.delete(id);
    }

    #assertCapability(binding: TimelineBinding, rawCapability: unknown): void {
        if (!binding.capability) throw new Error("SoulCord timeline authority is not active.");
        this.#assertToken(binding.capability, rawCapability, "operation");
    }

    #assertToken(expected: Buffer, rawCapability: unknown, kind: string): void {
        const candidate = decodeCapability(rawCapability);
        try {
            if (!crypto.timingSafeEqual(expected, candidate)) throw new Error(`SoulCord timeline ${kind} capability was rejected.`);
        }
        finally {candidate.fill(0);}
    }

    #activeBinding(id: number): TimelineBinding {
        const binding = this.#bindings.get(id);
        if (!binding?.capability) throw new Error("SoulCord timeline authority is not active.");
        return binding;
    }

    #rotate(binding: TimelineBinding): string {
        binding.capability?.fill(0);
        const capability = crypto.randomBytes(32);
        binding.capability = capability;
        return capability.toString("base64url");
    }
}
