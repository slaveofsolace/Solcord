import crypto from "crypto";
import fs from "fs";
import path from "path";


export type SolcordManagedKind = "plugin" | "theme";

export interface SolcordUpdateOwnershipQuery {
    accepted: boolean;
    addonFolder: string;
    fileName: string;
    kind: SolcordManagedKind;
    reviewedSha256: string;
}

export type SolcordUpdateOwnershipState = "solcord-managed" | "owner-managed" | "indeterminate";

export interface SolcordUpdateOwnershipResult {
    state: SolcordUpdateOwnershipState;
    reason: string;
}

export function solcordUpdateRequiresReview(ownership: SolcordUpdateOwnershipResult): boolean {
    return ownership.state !== "owner-managed";
}

interface TransactionFile {
    kind: SolcordManagedKind;
    fileName: string;
    sha256: string;
}

interface TransactionJournal {
    version: 1;
    transactionId: string;
    added: TransactionFile[];
}

const SHA256 = /^[0-9a-f]{64}$/;
const TRANSACTION_JOURNAL = /^([a-z0-9]+-[0-9a-f]{16})\.json$/;
const MAX_JOURNAL_BYTES = 128 * 1024;
const MAX_MANAGED_BYTES = 5 * 1024 * 1024;
const MAX_JOURNALS = 2_000;

function digest(value: Buffer | string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function safeFileName(value: string, kind: SolcordManagedKind): boolean {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9 _&().+—-]{0,180}\.(?:plugin\.js|theme\.css)$/.test(value) || path.basename(value) !== value) return false;
    return kind === "plugin" ? value.endsWith(".plugin.js") : value.endsWith(".theme.css");
}

function readRegularFile(target: string, maximumBytes: number): Buffer | undefined {
    if (!fs.existsSync(target)) return;
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > maximumBytes) return;
    return fs.readFileSync(target);
}

function isSafeDirectory(directory: string): boolean {
    if (!fs.existsSync(directory)) return false;
    const stat = fs.lstatSync(directory);
    return stat.isDirectory() && !stat.isSymbolicLink();
}

function completedJournal(transactionRoot: string, transactionId: string, serialized: Buffer): "complete" | "incomplete" | "invalid" | "rolled-back" {
    if (fs.existsSync(path.join(transactionRoot, `${transactionId}.rolledback`))) return "rolled-back";
    const marker = readRegularFile(path.join(transactionRoot, `${transactionId}.complete`), 256);
    if (!marker) return "incomplete";
    const markerDigest = marker.toString("utf8").trim();
    if (!SHA256.test(markerDigest) || markerDigest !== digest(serialized)) return "invalid";
    return "complete";
}

function result(state: SolcordUpdateOwnershipState, reason: string): SolcordUpdateOwnershipResult {
    return {state, reason};
}

/**
 * Separates a proven owner-managed file from both Solcord-managed and ambiguous
 * evidence. Callers must pause writes for `indeterminate`; treating corrupt or
 * unreadable ownership evidence as permission to overwrite is unsafe.
 */
export function classifySolcordUpdateOwnership(query: SolcordUpdateOwnershipQuery): SolcordUpdateOwnershipResult {
    if (!query.accepted) return result("owner-managed", "The file is not in Solcord's accepted catalog.");
    if (!SHA256.test(query.reviewedSha256) || !safeFileName(query.fileName, query.kind)) {
        return result("indeterminate", "The accepted catalog identity is malformed.");
    }

    try {
        const addonFolder = path.resolve(query.addonFolder);
        if (!isSafeDirectory(addonFolder)) return result("indeterminate", "The addon folder cannot be verified as a regular directory.");
        const target = path.resolve(addonFolder, query.fileName);
        if (!target.startsWith(`${addonFolder}${path.sep}`)) return result("indeterminate", "The addon path escapes its managed folder.");
        const installed = readRegularFile(target, MAX_MANAGED_BYTES);
        if (!installed) return result("indeterminate", "The accepted addon file cannot be verified as a bounded regular file.");
        if (digest(installed) !== query.reviewedSha256) {
            return result("owner-managed", "The installed bytes differ from Solcord's reviewed artifact.");
        }

        const betterDiscordRoot = path.dirname(addonFolder);
        const transactionRoot = path.join(betterDiscordRoot, "solcord-transactions-v1");
        if (!fs.existsSync(transactionRoot)) return result("owner-managed", "No Solcord installation transaction exists for this profile.");
        if (!isSafeDirectory(transactionRoot)) return result("indeterminate", "The Solcord transaction store is not a regular directory.");

        const entries = fs.readdirSync(transactionRoot, {withFileTypes: true})
            .filter(entry => TRANSACTION_JOURNAL.test(entry.name));
        if (entries.length > MAX_JOURNALS) return result("indeterminate", "The Solcord transaction store exceeds its review bound.");

        for (const entry of entries) {
            if (!entry.isFile() || entry.isSymbolicLink()) return result("indeterminate", "A transaction journal is not a regular file.");
            const transactionId = TRANSACTION_JOURNAL.exec(entry.name)?.[1];
            if (!transactionId) continue;
            const serialized = readRegularFile(path.join(transactionRoot, entry.name), MAX_JOURNAL_BYTES);
            if (!serialized) return result("indeterminate", "A transaction journal cannot be read safely.");

            let journal: Partial<TransactionJournal>;
            try {
                journal = JSON.parse(serialized.toString("utf8")) as Partial<TransactionJournal>;
            }
            catch {
                return result("indeterminate", "A transaction journal is malformed.");
            }
            if (journal.version !== 1 || journal.transactionId !== transactionId || !Array.isArray(journal.added)) {
                return result("indeterminate", "A transaction journal has an unsupported schema.");
            }
            if (journal.added.some(file => !file || (file.kind !== "plugin" && file.kind !== "theme")
                || !safeFileName(file.fileName, file.kind) || !SHA256.test(file.sha256))) {
                return result("indeterminate", "A transaction journal contains an invalid artifact identity.");
            }

            const ownsTarget = journal.added.some(file => file.kind === query.kind
                && file.fileName === query.fileName
                && file.sha256 === query.reviewedSha256);
            if (!ownsTarget) continue;

            const completion = completedJournal(transactionRoot, transactionId, serialized);
            if (completion === "complete") return result("solcord-managed", "A completed Solcord transaction owns the exact reviewed bytes.");
            if (completion === "rolled-back") return result("owner-managed", "The owning Solcord transaction was rolled back.");
            return result("indeterminate", completion === "invalid"
                ? "The owning transaction completion marker failed integrity validation."
                : "The owning Solcord transaction did not complete.");
        }
        return result("owner-managed", "No completed Solcord transaction claims the exact reviewed bytes.");
    }
    catch {
        return result("indeterminate", "Solcord could not safely inspect addon ownership evidence.");
    }
}

/**
 * Returns true only for exact accepted bytes that Solcord itself added in a
 * completed, unrolled transaction. Reused owner files are deliberately not
 * treated as Solcord-owned, even when their bytes match the reviewed hash.
 */
export function isSolcordTransactionOwnedAcceptedArtifact(query: SolcordUpdateOwnershipQuery): boolean {
    return classifySolcordUpdateOwnership(query).state === "solcord-managed";
}
