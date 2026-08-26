// SPDX-License-Identifier: Apache-2.0

export type SolcordDomainDecision = "allow" | "warn" | "block";

export interface SolcordDomainMemoryRecord {
    protocol: "http:" | "https:";
    host: string;
    decision: SolcordDomainDecision;
    createdAt: number;
    expiresAt: number;
}

export interface SolcordDomainRisk {
    protocol?: "http:" | "https:";
    host?: string;
    restricted: boolean;
    reasons: string[];
}

const MAX_RECORDS = 512;
const MIN_TTL_MS = 60 * 60 * 1_000;
const MAX_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const PROTECTED_LABELS = ["discord", "github", "google", "microsoft", "paypal"];
const PROTECTED_DOMAINS: Record<string, string[]> = {
    discord: ["discord.com", "discord.gg"],
    github: ["github.com", "github.io"],
    google: ["google.com"],
    microsoft: ["microsoft.com"],
    paypal: ["paypal.com"]
};

function editDistanceAtMostOne(left: string, right: string): boolean {
    if (Math.abs(left.length - right.length) > 1) return false;
    let mismatches = 0;
    for (let i = 0, j = 0; i < left.length && j < right.length;) {
        if (left[i] === right[j]) {i++; j++; continue;}
        if (++mismatches > 1) return false;
        if (left.length > right.length) {i++;}
        else if (right.length > left.length) {j++;}
        else {i++; j++;}
    }
    return mismatches + Math.abs((left.length) - (right.length)) <= 1;
}

function normalizeHost(value: unknown): string | undefined {
    if (typeof value !== "string" || value.length > 253) return;
    const host = value.trim().toLowerCase().replace(/\.$/, "");
    if (!host || !/^[a-z0-9.-]+$/.test(host) || host.includes("..")) return;
    if (host.split(".").some(label => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) return;
    return host;
}

function isIpLiteral(host: string): boolean {
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return host.split(".").every(part => Number(part) <= 255);
    return host.startsWith("[") || host.includes(":");
}

function isLookalike(host: string): boolean {
    const labels = host.split(".");
    return PROTECTED_LABELS.some(protectedLabel => {
        const canonical = PROTECTED_DOMAINS[protectedLabel].some(domain => host === domain || host.endsWith(`.${domain}`));
        if (labels.includes(protectedLabel) && !canonical) return true;
        return labels.some(label => label !== protectedLabel && editDistanceAtMostOne(label, protectedLabel));
    });
}

export function inspectSolcordDomain(input: string): SolcordDomainRisk {
    let url: URL;
    try {url = new URL(input);}
    catch {return {restricted: true, reasons: ["The destination is not a complete URL."]};}
    if (url.protocol !== "https:" && url.protocol !== "http:") return {restricted: true, reasons: ["Only HTTP and HTTPS destinations can be reviewed."]};
    const protocol = url.protocol;
    const host = normalizeHost(url.hostname);
    if (!host) return {restricted: true, reasons: ["The destination host is malformed."]};
    const reasons: string[] = [];
    if (protocol === "http:") reasons.push("Unencrypted HTTP destination");
    if (url.username || url.password) reasons.push("Embedded credentials");
    if (host.startsWith("xn--") || host.includes(".xn--")) reasons.push("Punycode host");
    if (isIpLiteral(host)) reasons.push("IP-literal host");
    if (isLookalike(host)) reasons.push("Protected-name lookalike");
    return {protocol, host, restricted: reasons.length > 0, reasons};
}

function normalizeRecord(value: unknown, now: number): SolcordDomainMemoryRecord | undefined {
    if (!value || typeof value !== "object") return;
    const candidate = value as Record<string, unknown>;
    const host = normalizeHost(candidate.host);
    const protocol = candidate.protocol;
    const decision = candidate.decision;
    if (!host || (protocol !== "http:" && protocol !== "https:") || (decision !== "allow" && decision !== "warn" && decision !== "block")) return;
    if (!Number.isSafeInteger(candidate.createdAt) || !Number.isSafeInteger(candidate.expiresAt)) return;
    const createdAt = Number(candidate.createdAt);
    const expiresAt = Number(candidate.expiresAt);
    if (createdAt < 0 || expiresAt <= now || expiresAt - createdAt < MIN_TTL_MS || expiresAt - createdAt > MAX_TTL_MS) return;
    return {protocol, host, decision, createdAt, expiresAt};
}

export class SolcordDomainMemory {
    #records = new Map<string, SolcordDomainMemoryRecord>();

    constructor(value?: unknown, now = Date.now()) {
        if (!Array.isArray(value)) return;
        for (const raw of value.slice(-MAX_RECORDS)) {
            const record = normalizeRecord(raw, now);
            if (record) this.#records.set(`${record.protocol}//${record.host}`, record);
        }
    }

    remember(input: string, decision: SolcordDomainDecision, ttlMs: number, now = Date.now()): SolcordDomainMemoryRecord | undefined {
        const risk = inspectSolcordDomain(input);
        if (!risk.host || !risk.protocol || !Number.isFinite(ttlMs)) return;
        if (risk.restricted && decision === "allow") return;
        const boundedTtl = Math.max(MIN_TTL_MS, Math.min(MAX_TTL_MS, Math.round(ttlMs)));
        const record = {protocol: risk.protocol, host: risk.host, decision, createdAt: now, expiresAt: now + boundedTtl};
        const key = `${record.protocol}//${record.host}`;
        this.#records.delete(key);
        this.#records.set(key, record);
        while (this.#records.size > MAX_RECORDS) this.#records.delete(this.#records.keys().next().value!);
        return {...record};
    }

    decision(input: string, now = Date.now()): SolcordDomainMemoryRecord | undefined {
        const risk = inspectSolcordDomain(input);
        if (!risk.host || !risk.protocol) return;
        const key = `${risk.protocol}//${risk.host}`;
        const record = this.#records.get(key);
        if (!record) return;
        if (record.expiresAt <= now) {this.#records.delete(key); return;}
        if (risk.restricted && record.decision === "allow") return;
        return {...record};
    }

    forget(host: string): boolean {
        const normalized = normalizeHost(host);
        if (!normalized) return false;
        const httpsDeleted = this.#records.delete(`https://${normalized}`);
        const httpDeleted = this.#records.delete(`http://${normalized}`);
        return httpsDeleted || httpDeleted;
    }

    snapshot(now = Date.now()): SolcordDomainMemoryRecord[] {
        for (const [host, record] of this.#records) if (record.expiresAt <= now) this.#records.delete(host);
        return [...this.#records.values()].map(record => ({...record}));
    }
}
