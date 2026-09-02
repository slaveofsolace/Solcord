// SPDX-License-Identifier: Apache-2.0

import crypto from "crypto";
import fs from "fs";
import path from "path";

const INTENT_VERSION = 1;
const MAX_ATTEMPTS = 3;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_FILE_BYTES = 8 * 1_024;
const HEX_32 = /^[0-9a-f]{32}$/;
const HEX_40 = /^[0-9a-f]{40}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const DISCORD_VERSION = /^\d+(?:\.\d+){1,3}$/;
const CHANNELS = new Set(["Stable", "PTB", "Canary"]);

interface FirstSetupIntentDocument {
    Version: number;
    IntentId: string;
    Purpose: "first-setup";
    Channel: string;
    DiscordVersion: string;
    SourceCommit: string;
    ArtifactSha256: string;
    CreatedAtUtc: string;
    Attempts: number;
}

interface InstallReceiptDocument {
    SourceCommit: string;
    ArtifactSha256: string;
    Channel: string;
    DiscordVersion: string;
}

export interface SolcordFirstSetupClaim {
    pending: boolean;
    intentId?: string;
    attempts?: number;
    reason?: "absent" | "invalid" | "stale" | "mismatch" | "attempt-limit";
}

type IntentDependencies = {
    betterDiscordRoot(): string;
    now(): number;
    randomId(): string;
};

const defaults: Omit<IntentDependencies, "betterDiscordRoot"> = {
    now: () => Date.now(),
    randomId: () => crypto.randomBytes(8).toString("hex")
};

function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function readBoundedJson(file: string): Record<string, unknown> | undefined {
    let stat: fs.Stats;
    try {stat = fs.lstatSync(file);}
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_FILE_BYTES) throw new TypeError("SolcordFirstSetupFileInvalid");
    return record(JSON.parse(fs.readFileSync(file, "utf8")));
}

function normalizeIntent(value: unknown, now: number): {intent?: FirstSetupIntentDocument; reason?: "invalid" | "stale";} {
    const source = record(value);
    if (!source) return {reason: "invalid"};
    const created = typeof source.CreatedAtUtc === "string" ? Date.parse(source.CreatedAtUtc) : NaN;
    const intent: FirstSetupIntentDocument = {
        Version: source.Version as number,
        IntentId: source.IntentId as string,
        Purpose: source.Purpose as "first-setup",
        Channel: source.Channel as string,
        DiscordVersion: source.DiscordVersion as string,
        SourceCommit: source.SourceCommit as string,
        ArtifactSha256: source.ArtifactSha256 as string,
        CreatedAtUtc: source.CreatedAtUtc as string,
        Attempts: source.Attempts as number
    };
    if (intent.Version !== INTENT_VERSION
        || intent.Purpose !== "first-setup"
        || typeof intent.IntentId !== "string" || !HEX_32.test(intent.IntentId)
        || typeof intent.Channel !== "string" || !CHANNELS.has(intent.Channel)
        || typeof intent.DiscordVersion !== "string" || !DISCORD_VERSION.test(intent.DiscordVersion)
        || typeof intent.SourceCommit !== "string" || !HEX_40.test(intent.SourceCommit)
        || typeof intent.ArtifactSha256 !== "string" || !HEX_64.test(intent.ArtifactSha256)
        || typeof intent.CreatedAtUtc !== "string" || !Number.isFinite(created)
        || !Number.isSafeInteger(intent.Attempts) || intent.Attempts < 0 || intent.Attempts > MAX_ATTEMPTS) return {reason: "invalid"};
    if (created > now + 5 * 60 * 1_000 || now - created > MAX_AGE_MS) return {reason: "stale"};
    return {intent};
}

function normalizeReceipt(value: unknown): InstallReceiptDocument | undefined {
    const source = record(value);
    if (!source
        || typeof source.Channel !== "string" || !CHANNELS.has(source.Channel)
        || typeof source.DiscordVersion !== "string" || !DISCORD_VERSION.test(source.DiscordVersion)
        || typeof source.SourceCommit !== "string" || !HEX_40.test(source.SourceCommit)
        || typeof source.ArtifactSha256 !== "string" || !HEX_64.test(source.ArtifactSha256)) return;
    return source as unknown as InstallReceiptDocument;
}

function receiptMatches(intent: FirstSetupIntentDocument, receipt: InstallReceiptDocument): boolean {
    return intent.Channel === receipt.Channel
        && intent.DiscordVersion === receipt.DiscordVersion
        && intent.SourceCommit === receipt.SourceCommit
        && intent.ArtifactSha256 === receipt.ArtifactSha256;
}

export class SolcordFirstSetupIntentStore {
    #dependencies: IntentDependencies;

    constructor(dependencies: Pick<IntentDependencies, "betterDiscordRoot"> & Partial<Omit<IntentDependencies, "betterDiscordRoot">>) {
        this.#dependencies = {...defaults, ...dependencies};
    }

    claim(): SolcordFirstSetupClaim {
        const paths = this.#paths();
        let raw: Record<string, unknown> | undefined;
        try {raw = readBoundedJson(paths.intent);}
        catch {this.#quarantine(paths.intent, paths.root); return {pending: false, reason: "invalid"};}
        if (!raw) return {pending: false, reason: "absent"};
        const normalized = normalizeIntent(raw, this.#dependencies.now());
        if (!normalized.intent) {
            this.#quarantine(paths.intent, paths.root);
            return {pending: false, reason: normalized.reason};
        }
        let receipt: InstallReceiptDocument | undefined;
        try {receipt = normalizeReceipt(readBoundedJson(paths.receipt));}
        catch {receipt = undefined;}
        if (!receipt || !receiptMatches(normalized.intent, receipt)) {
            this.#quarantine(paths.intent, paths.root);
            return {pending: false, reason: "mismatch"};
        }
        if (normalized.intent.Attempts >= MAX_ATTEMPTS) {
            this.#removeExact(paths.intent);
            return {pending: false, reason: "attempt-limit"};
        }
        const updated = {...normalized.intent, Attempts: normalized.intent.Attempts + 1};
        this.#writeAtomic(paths.intent, JSON.stringify(updated, null, 2));
        return {pending: true, intentId: updated.IntentId, attempts: updated.Attempts};
    }

    acknowledge(intentId: unknown): {acknowledged: boolean;} {
        if (typeof intentId !== "string" || !HEX_32.test(intentId)) return {acknowledged: false};
        const paths = this.#paths();
        try {
            const normalized = normalizeIntent(readBoundedJson(paths.intent), this.#dependencies.now());
            const receipt = normalizeReceipt(readBoundedJson(paths.receipt));
            if (!normalized.intent || !receipt || normalized.intent.IntentId !== intentId || !receiptMatches(normalized.intent, receipt)) return {acknowledged: false};
            this.#removeExact(paths.intent);
            return {acknowledged: true};
        }
        catch {return {acknowledged: false};}
    }

    #paths(): {root: string; intent: string; receipt: string;} {
        const betterDiscord = path.resolve(this.#dependencies.betterDiscordRoot());
        const root = path.resolve(betterDiscord, "solcord-installer");
        if (root === betterDiscord || !root.startsWith(`${betterDiscord}${path.sep}`)) throw new TypeError("SolcordFirstSetupRootInvalid");
        const stat = fs.lstatSync(root);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new TypeError("SolcordFirstSetupRootUnsafe");
        return {root, intent: path.join(root, "first-setup-intent.json"), receipt: path.join(root, "current.json")};
    }

    #writeAtomic(target: string, content: string): void {
        const temporary = `${target}.${this.#dependencies.randomId()}.tmp`;
        fs.writeFileSync(temporary, content, {encoding: "utf8", flag: "wx", mode: 0o600});
        try {fs.renameSync(temporary, target);}
        finally {
            try {fs.unlinkSync(temporary);}
            catch {/* renamed or already removed */}
        }
    }

    #removeExact(target: string): void {
        const stat = fs.lstatSync(target);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new TypeError("SolcordFirstSetupFileInvalid");
        fs.unlinkSync(target);
    }

    #quarantine(target: string, root: string): void {
        try {
            const stat = fs.lstatSync(target);
            if (!stat.isFile() || stat.isSymbolicLink()) return;
            const quarantine = path.join(root, `first-setup-intent.invalid-${this.#dependencies.now()}-${this.#dependencies.randomId()}.json`);
            fs.renameSync(target, quarantine);
        }
        catch {/* An invalid installer hint must never block Discord startup. */}
    }
}
