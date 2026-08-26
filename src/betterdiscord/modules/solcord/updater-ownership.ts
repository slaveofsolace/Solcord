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

function completedJournal(transactionRoot: string, transactionId: string, serialized: Buffer): boolean {
    if (fs.existsSync(path.join(transactionRoot, `${transactionId}.rolledback`))) return false;
    const marker = readRegularFile(path.join(transactionRoot, `${transactionId}.complete`), 256);
    return Boolean(marker && SHA256.test(marker.toString("utf8").trim()) && marker.toString("utf8").trim() === digest(serialized));
}

/**
 * Returns true only for exact accepted bytes that Solcord itself added in a
 * completed, unrolled transaction. Reused owner files are deliberately not
 * treated as Solcord-owned, even when their bytes match the reviewed hash.
 */
export function isSolcordTransactionOwnedAcceptedArtifact(query: SolcordUpdateOwnershipQuery): boolean {
    if (!query.accepted || !SHA256.test(query.reviewedSha256) || !safeFileName(query.fileName, query.kind)) return false;

    try {
        const addonFolder = path.resolve(query.addonFolder);
        if (!isSafeDirectory(addonFolder)) return false;
        const target = path.resolve(addonFolder, query.fileName);
        if (!target.startsWith(`${addonFolder}${path.sep}`)) return false;
        const installed = readRegularFile(target, MAX_MANAGED_BYTES);
        if (!installed || digest(installed) !== query.reviewedSha256) return false;

        const betterDiscordRoot = path.dirname(addonFolder);
        const transactionRoot = path.join(betterDiscordRoot, "solcord-transactions-v1");
        if (!isSafeDirectory(transactionRoot)) return false;
        const entries = fs.readdirSync(transactionRoot, {withFileTypes: true}).filter(entry => entry.isFile() && TRANSACTION_JOURNAL.test(entry.name));
        if (entries.length > MAX_JOURNALS) return false;

        for (const entry of entries) {
            const transactionId = TRANSACTION_JOURNAL.exec(entry.name)?.[1];
            if (!transactionId) continue;
            const serialized = readRegularFile(path.join(transactionRoot, entry.name), MAX_JOURNAL_BYTES);
            if (!serialized || !completedJournal(transactionRoot, transactionId, serialized)) continue;
            const journal = JSON.parse(serialized.toString("utf8")) as Partial<TransactionJournal>;
            if (journal.version !== 1 || journal.transactionId !== transactionId || !Array.isArray(journal.added)) continue;
            if (journal.added.some(file => file?.kind === query.kind
                && file.fileName === query.fileName
                && file.sha256 === query.reviewedSha256)) return true;
        }
    }
    catch {/* malformed or inaccessible ownership evidence fails open to the ordinary updater */}
    return false;
}
