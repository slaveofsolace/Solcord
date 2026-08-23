import crypto from "crypto";

import {SOULCORD_RUNTIME_ADDONS, SOULCORD_RUNTIME_DEPENDENCIES, SOULCORD_RUNTIME_THEMES} from "@common/soulcord/addon-catalog.generated";


export type AddonIntegrityKind = "addon" | "dependency" | "theme";
export type AddonIntegrityState = "missing" | "match" | "mismatch" | "unreadable" | "unsafe" | "unavailable";

export interface AddonIntegrityRecord {
    kind: AddonIntegrityKind;
    name: string;
    status: AddonIntegrityState;
    reviewedSha256: string;
    installedSha256?: string;
}

export interface AddonIntegritySummary {
    total: number;
    match: number;
    missing: number;
    attention: number;
    unavailable: number;
}

export interface ReviewedExecutionCheck {
    reviewed: boolean;
    matches: boolean;
    name?: string;
    reviewedSha256?: string;
}

interface ReviewedExecutionCandidate {
    fileName: string;
    name: string;
    sourceSha256: string;
    declaredNames: readonly string[];
}

const SHA256 = /^[0-9a-f]{64}$/;
const MAX_AUDIT_RECORDS = 64;
const QUARANTINE_STATES = new Set<AddonIntegrityState>(["mismatch", "unreadable", "unsafe", "unavailable"]);

function normalizeIdentity(value: string): string {
    return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function declaredThemeName(content: string): string | undefined {
    return /^\s*\*\s*@name\s+(.+?)\s*$/m.exec(content)?.[1]?.trim();
}

const REVIEWED_PLUGINS: ReviewedExecutionCandidate[] = [...SOULCORD_RUNTIME_ADDONS, ...SOULCORD_RUNTIME_DEPENDENCIES].map(candidate => ({
    fileName: candidate.fileName,
    name: candidate.name,
    sourceSha256: candidate.sourceSha256,
    declaredNames: [candidate.name]
}));
const REVIEWED_THEMES: ReviewedExecutionCandidate[] = SOULCORD_RUNTIME_THEMES.map(candidate => ({
    fileName: candidate.fileName,
    name: candidate.name,
    sourceSha256: candidate.sourceSha256,
    declaredNames: [candidate.name, declaredThemeName(candidate.content)].filter((value): value is string => Boolean(value))
}));

const EXPECTED: AddonIntegrityRecord[] = [
    ...SOULCORD_RUNTIME_ADDONS.map(candidate => ({kind: "addon" as const, name: candidate.name, status: "unavailable" as const, reviewedSha256: candidate.sourceSha256})),
    ...SOULCORD_RUNTIME_DEPENDENCIES.map(candidate => ({kind: "dependency" as const, name: candidate.name, status: "unavailable" as const, reviewedSha256: candidate.sourceSha256})),
    ...SOULCORD_RUNTIME_THEMES.map(candidate => ({kind: "theme" as const, name: candidate.name, status: "unavailable" as const, reviewedSha256: candidate.sourceSha256}))
];

function recordKey(kind: AddonIntegrityKind, name: string): string {
    return `${kind}\0${name}`;
}

/**
 * Synchronous sink guard for live addon reloads. Startup and transaction
 * audits remain authoritative lifecycle checks, but reviewed bytes must also
 * match immediately before JavaScript evaluation or CSS injection.
 * Unreviewed owner files retain ordinary BetterDiscord behavior.
 */
export function checkReviewedExecution(kind: "plugin" | "theme", fileName: string, declaredName: string | undefined, content: string): ReviewedExecutionCheck {
    const candidates = kind === "theme" ? REVIEWED_THEMES : REVIEWED_PLUGINS;
    const exact = candidates.find(entry => entry.fileName === fileName);
    const normalizedFileName = normalizeIdentity(fileName);
    const normalizedDeclaredName = typeof declaredName === "string" ? normalizeIdentity(declaredName) : "";
    const actual = crypto.createHash("sha256").update(content, "utf8").digest("hex");
    const alias = exact ? undefined : candidates.find(entry => normalizeIdentity(entry.fileName) === normalizedFileName
        || (normalizedDeclaredName && entry.declaredNames.some(name => normalizeIdentity(name) === normalizedDeclaredName))
        || entry.sourceSha256 === actual);
    const candidate = exact ?? alias;
    if (!candidate) return {reviewed: false, matches: true};
    return {
        reviewed: true,
        // A file claiming a reviewed identity under any other basename is not
        // the transaction-owned artifact, even when its bytes happen to match.
        matches: Boolean(exact) && actual === candidate.sourceSha256,
        name: candidate.name,
        reviewedSha256: candidate.sourceSha256
    };
}

export function unavailableIntegrityRecords(): AddonIntegrityRecord[] {
    return EXPECTED.map(record => ({...record}));
}

export function normalizeIntegrityAudit(raw: unknown): AddonIntegrityRecord[] {
    const records = unavailableIntegrityRecords();
    if (!Array.isArray(raw) || raw.length > MAX_AUDIT_RECORDS) return records;

    const indices = new Map(records.map((record, index) => [recordKey(record.kind, record.name), index]));
    const seen = new Set<string>();
    for (const value of raw) {
        if (!value || typeof value !== "object") continue;
        const candidate = value as Partial<AddonIntegrityRecord>;
        if ((candidate.kind !== "addon" && candidate.kind !== "dependency" && candidate.kind !== "theme") || typeof candidate.name !== "string") continue;
        const key = recordKey(candidate.kind, candidate.name);
        const index = indices.get(key);
        if (index === undefined || seen.has(key)) continue;
        seen.add(key);
        const expected = records[index];
        if (candidate.reviewedSha256 !== expected.reviewedSha256 || !SHA256.test(candidate.reviewedSha256)) continue;
        if (candidate.status !== "missing" && candidate.status !== "match" && candidate.status !== "mismatch" && candidate.status !== "unreadable" && candidate.status !== "unsafe") continue;

        const installedSha256 = typeof candidate.installedSha256 === "string" && SHA256.test(candidate.installedSha256) ? candidate.installedSha256 : undefined;
        if (candidate.status === "match" && installedSha256 !== expected.reviewedSha256) continue;
        if (candidate.status === "mismatch" && (!installedSha256 || installedSha256 === expected.reviewedSha256)) continue;
        records[index] = {
            ...expected,
            status: candidate.status,
            ...((candidate.status === "match" || candidate.status === "mismatch") && installedSha256 ? {installedSha256} : {})
        };
    }
    return records;
}

export function integrityBlocksExecution(record: AddonIntegrityRecord | undefined): boolean {
    return !record || record.status !== "match";
}

export function reviewBlocksEnable(reviewed: {installable?: boolean;} | undefined, guardedBuiltIn = false): boolean {
    return !guardedBuiltIn && reviewed?.installable !== true;
}

export function integrityRequiresQuarantine(record: AddonIntegrityRecord | undefined): boolean {
    return Boolean(record && QUARANTINE_STATES.has(record.status));
}

export function integrityFailureReason(record: AddonIntegrityRecord): string | undefined {
    if (!integrityBlocksExecution(record)) return;
    return {
        mismatch: "Installed bytes differ from SoulCord's reviewed hash; the addon was disabled and quarantined.",
        unreadable: "Installed bytes could not be read safely; the addon was disabled and quarantined.",
        unsafe: "The installed addon path failed link and file safety checks; the addon was disabled and quarantined.",
        unavailable: "The integrity audit was unavailable or incomplete; the reviewed addon was kept off.",
        match: undefined,
        missing: undefined
    }[record.status];
}

export function summarizeIntegrity(records: readonly AddonIntegrityRecord[]): AddonIntegritySummary {
    return {
        total: records.length,
        match: records.filter(record => record.status === "match").length,
        missing: records.filter(record => record.status === "missing").length,
        attention: records.filter(record => record.status === "mismatch" || record.status === "unreadable" || record.status === "unsafe").length,
        unavailable: records.filter(record => record.status === "unavailable").length
    };
}
