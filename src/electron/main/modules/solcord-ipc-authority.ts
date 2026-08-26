import crypto from "node:crypto";


const SOLCORD_APP_HOSTS = new Set([
    "discord.com",
    "discordapp.com",
    "canary.discord.com",
    "canary.discordapp.com",
    "ptb.discord.com",
    "ptb.discordapp.com"
]);
const ACCOUNT_ID = /^\d{1,32}$/;
const CAPABILITY = /^[a-zA-Z0-9_-]{43}$/;

interface TimelineBinding {
    bootstrapCapability?: Buffer;
    capability?: Buffer;
    accountScope?: string;
    generation: number;
}

export interface TimelineAuthorizedRequest {
    accountScope: string;
    generation: number;
    request: Record<string, unknown>;
}

export function isTrustedSolcordIpcUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.port && !url.username && !url.password && SOLCORD_APP_HOSTS.has(url.hostname);
    }
    catch {return false;}
}

function senderId(value: unknown): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new TypeError("Invalid Solcord IPC sender.");
    return value;
}

function accountScope(value: unknown): string {
    if (typeof value !== "string" || !ACCOUNT_ID.test(value)) throw new TypeError("Invalid Solcord timeline account scope.");
    return value;
}

function decodeCapability(value: unknown): Buffer {
    if (typeof value !== "string" || !CAPABILITY.test(value)) throw new TypeError("Invalid Solcord timeline capability.");
    const decoded = Buffer.from(value, "base64url");
    if (decoded.length !== 32) throw new TypeError("Invalid Solcord timeline capability.");
    return decoded;
}

/**
 * Keeps the sensitive account selector in the main process after bootstrap.
 * Every later operation is authorized by a main-issued, per-WebContents token;
 * renderer payloads cannot select another account by supplying an account id.
 */
export class SolcordTimelineIpcAuthority {
    #bindings = new Map<number, TimelineBinding>();

    bootstrap(rawSenderId: unknown): {bootstrapCapability: string;} {
        const id = senderId(rawSenderId);
        if (this.#bindings.has(id)) throw new Error("Solcord timeline bootstrap already exists.");
        const bootstrapCapability = crypto.randomBytes(32);
        this.#bindings.set(id, {bootstrapCapability, generation: 0});
        return {bootstrapCapability: bootstrapCapability.toString("base64url")};
    }

    activate(rawSenderId: unknown, rawRequest: unknown): {capability: string;} {
        const id = senderId(rawSenderId);
        if (!rawRequest || typeof rawRequest !== "object" || Array.isArray(rawRequest)) throw new TypeError("Invalid Solcord timeline bind request.");
        const request = rawRequest as Record<string, unknown>;
        const binding = this.#bindings.get(id);
        if (!binding?.bootstrapCapability || binding.capability) throw new Error("Solcord timeline bootstrap is unavailable.");
        this.#assertToken(binding.bootstrapCapability, request.bootstrapCapability, "bootstrap");
        binding.bootstrapCapability.fill(0);
        binding.bootstrapCapability = undefined;

        const capability = crypto.randomBytes(32);
        binding.capability = capability;
        return {capability: capability.toString("base64url")};
    }

    bind(rawSenderId: unknown, rawRequest: unknown): {capability: string;} {
        const id = senderId(rawSenderId);
        if (!rawRequest || typeof rawRequest !== "object" || Array.isArray(rawRequest)) throw new TypeError("Invalid Solcord timeline bind request.");
        const request = rawRequest as Record<string, unknown>;
        const binding = this.#activeBinding(id);
        this.#assertCapability(binding, request.capability);
        const scope = accountScope(request.accountId);
        const capability = this.#rotate(binding);
        binding.accountScope = scope;
        binding.generation++;
        return {capability};
    }

    releaseAccount(rawSenderId: unknown, rawRequest: unknown): {capability: string;} {
        const id = senderId(rawSenderId);
        if (!rawRequest || typeof rawRequest !== "object" || Array.isArray(rawRequest)) throw new TypeError("Invalid Solcord timeline release request.");
        const request = rawRequest as Record<string, unknown>;
        const binding = this.#activeBinding(id);
        this.#assertCapability(binding, request.capability);
        binding.accountScope = undefined;
        binding.generation++;
        return {capability: this.#rotate(binding)};
    }

    authorize(rawSenderId: unknown, rawRequest: unknown, requireAccount = true): TimelineAuthorizedRequest {
        const id = senderId(rawSenderId);
        const binding = this.#activeBinding(id);
        if (!rawRequest || typeof rawRequest !== "object" || Array.isArray(rawRequest)) throw new TypeError("Invalid Solcord timeline request.");
        const request = rawRequest as Record<string, unknown>;
        this.#assertCapability(binding, request.capability);
        if (Object.hasOwn(request, "accountId") || Object.hasOwn(request, "accountScope")) throw new TypeError("Timeline operations cannot select an account.");
        if (requireAccount && !binding.accountScope) throw new Error("Solcord timeline account is not bound.");
        const {capability: _, ...payload} = request;
        return {accountScope: binding.accountScope ?? "", generation: binding.generation, request: payload};
    }

    assertCurrent(rawSenderId: unknown, authorized: TimelineAuthorizedRequest): void {
        const binding = this.#activeBinding(senderId(rawSenderId));
        if (binding.generation !== authorized.generation || (binding.accountScope ?? "") !== authorized.accountScope) {
            throw new Error("Solcord account binding changed during the private operation.");
        }
    }

    release(rawSenderId: unknown): void {
        const id = senderId(rawSenderId);
        const binding = this.#bindings.get(id);
        binding?.bootstrapCapability?.fill(0);
        binding?.capability?.fill(0);
        this.#bindings.delete(id);
    }

    #assertCapability(binding: TimelineBinding, rawCapability: unknown): void {
        if (!binding.capability) throw new Error("Solcord timeline authority is not active.");
        this.#assertToken(binding.capability, rawCapability, "operation");
    }

    #assertToken(expected: Buffer, rawCapability: unknown, kind: string): void {
        const candidate = decodeCapability(rawCapability);
        try {
            if (!crypto.timingSafeEqual(expected, candidate)) throw new Error(`Solcord timeline ${kind} capability was rejected.`);
        }
        finally {candidate.fill(0);}
    }

    #activeBinding(id: number): TimelineBinding {
        const binding = this.#bindings.get(id);
        if (!binding?.capability) throw new Error("Solcord timeline authority is not active.");
        return binding;
    }

    #rotate(binding: TimelineBinding): string {
        binding.capability?.fill(0);
        const capability = crypto.randomBytes(32);
        binding.capability = capability;
        return capability.toString("base64url");
    }
}
