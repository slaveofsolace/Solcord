import crypto from "crypto";
import fs from "fs";
import path from "path";
import {app, net} from "electron";

import {SOULCORD_RUNTIME_ADDONS, SOULCORD_RUNTIME_DEPENDENCIES, SOULCORD_RUNTIME_THEMES} from "@common/soulcord/addon-catalog.generated";

import {resolveSoulCordBetterDiscordRoot} from "./soulcord-data-root";


type AddonCandidate = typeof SOULCORD_RUNTIME_ADDONS[number];
type DependencyCandidate = typeof SOULCORD_RUNTIME_DEPENDENCIES[number];
type ThemeCandidate = typeof SOULCORD_RUNTIME_THEMES[number];
type ManagedKind = "plugin" | "theme";

interface SetupRequest {
    selectedAddons?: unknown;
    selectedTheme?: unknown;
}

interface TransactionFile {
    kind: ManagedKind;
    fileName: string;
    sha256: string;
}

interface TransactionJournal {
    version: 1;
    transactionId: string;
    createdAt: number;
    /** Contains only files whose durable ownership receipt was written. */
    added: TransactionFile[];
    reused: TransactionFile[];
    selectedAddons: string[];
    selectedTheme: string;
}

interface TransactionIntent {
    version: 1;
    transactionId: string;
    createdAt: number;
    planned: TransactionFile[];
    reused: TransactionFile[];
    selectedAddons: string[];
    selectedTheme: string;
}

interface TransactionReceipt {
    version: 1;
    transactionId: string;
    file: TransactionFile;
    device: string;
    inode: string;
}

export interface SetupIntegrityRecord {
    kind: "addon" | "dependency" | "theme";
    name: string;
    status: "missing" | "match" | "mismatch" | "unreadable" | "unsafe";
    reviewedSha256: string;
    installedSha256?: string;
}

export interface SetupRollbackResult {
    complete: boolean;
    removed: TransactionFile[];
    preserved: TransactionFile[];
}

const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;
const MAX_JOURNAL_BYTES = 128 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const TRANSACTION_ID = /^[a-z0-9]+-[0-9a-f]{16}$/;
const TRANSACTION_JOURNAL = /^([a-z0-9]+-[0-9a-f]{16})\.json$/;
const TRANSACTION_INTENT = /^([a-z0-9]+-[0-9a-f]{16})\.intent\.json$/;
const SHA256 = /^[0-9a-f]{64}$/;

function digest(value: Buffer | string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function safeFileName(value: string, kind?: ManagedKind): string {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9 _&().+—-]{0,180}\.(?:plugin\.js|theme\.css)$/.test(value) || path.basename(value) !== value) throw new TypeError("Unsafe addon filename.");
    if (kind === "plugin" && !value.endsWith(".plugin.js")) throw new TypeError("Plugin transaction contains a non-plugin filename.");
    if (kind === "theme" && !value.endsWith(".theme.css")) throw new TypeError("Theme transaction contains a non-theme filename.");
    return value;
}

function atomicWrite(target: string, content: string): void {
    const temporary = `${target}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    const descriptor = fs.openSync(temporary, "wx", 0o600);
    try {
        fs.writeFileSync(descriptor, content, {encoding: "utf8"});
        fs.fsyncSync(descriptor);
        fs.closeSync(descriptor);
        fs.renameSync(temporary, target);
    }
    catch (error) {
        try {fs.closeSync(descriptor);}
        catch {/* already closed */}
        try {if (fs.existsSync(temporary)) fs.unlinkSync(temporary);}
        catch {/* best effort */}
        throw error;
    }
}

export function validatePinnedSourceUrl(value: string): URL {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "raw.githubusercontent.com" || url.port || url.username || url.password || url.search || url.hash) {
        throw new TypeError("SoulCord accepts only immutable raw GitHub HTTPS sources.");
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 4 || !/^[0-9a-f]{40}$/i.test(segments[2])) throw new TypeError("SoulCord source URL is not pinned to a full Git commit.");
    for (const segment of segments) {
        let decoded: string;
        try {decoded = decodeURIComponent(segment);}
        catch {throw new TypeError("SoulCord source URL contains malformed escaping.");}
        const hasControlCharacter = [...decoded].some(character => character.charCodeAt(0) <= 0x1f || character.charCodeAt(0) === 0x7f);
        if (!decoded || decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\") || hasControlCharacter) {
            throw new TypeError("SoulCord source URL contains an unsafe path segment.");
        }
    }
    return url;
}

async function readBoundedResponse(response: Response): Promise<Buffer> {
    if (!response.body) throw new Error("Download response did not contain a body.");
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    try {
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_PAYLOAD_BYTES) throw new RangeError("Downloaded addon exceeds the staging size limit.");
            chunks.push(Buffer.from(value));
        }
    }
    catch (error) {
        try {await reader.cancel();}
        catch {/* best effort */}
        throw error;
    }
    return Buffer.concat(chunks, total);
}

export class SoulCordSetupTransactions {
    #queue = Promise.resolve();

    apply(rawRequest: unknown): Promise<{transactionId: string; added: TransactionFile[]; reused: TransactionFile[]; selectedTheme: string;}> {
        return this.#serialized(async () => {
            this.#recoverIncompleteTransactions(new Set());
            const request = this.#normalizeRequest(rawRequest);
            const selected = request.selectedAddons.map(name => {
                const candidate = SOULCORD_RUNTIME_ADDONS.find(entry => entry.name === name);
                const installable = candidate?.installable as boolean | undefined;
                if (!candidate || candidate.stageable !== true || !installable) throw new Error(`${name} has not passed runtime installation review.`);
                return candidate;
            });
            const dependencies = this.#dependencyClosure(selected);
            const transactionId = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString("hex")}`;
            const stagingRoot = this.#stagingRoot();
            this.#ensureSafeDirectory(stagingRoot, true);
            const stage = path.join(stagingRoot, transactionId);
            this.#assertInside(stage, stagingRoot);
            fs.mkdirSync(stage, {recursive: false, mode: 0o700});
            this.#assertExistingSafeDirectory(stage);
            const added: TransactionFile[] = [];
            const reused: TransactionFile[] = [];
            let planned: TransactionFile[] = [];
            let intentFile: string | undefined;
            let journalFile: string | undefined;

            try {
                const pluginCandidates: Array<AddonCandidate | DependencyCandidate> = [...dependencies, ...selected];
                for (const candidate of pluginCandidates) await this.#stageRemote(candidate, "plugin", stage, reused);
                for (const theme of SOULCORD_RUNTIME_THEMES) this.#stageTheme(theme, stage, reused);

                planned = [
                    ...pluginCandidates.map(candidate => ({kind: "plugin" as const, fileName: candidate.fileName, sha256: candidate.sourceSha256})),
                    ...SOULCORD_RUNTIME_THEMES.map(theme => ({kind: "theme" as const, fileName: theme.fileName, sha256: theme.sourceSha256}))
                ].filter(file => !reused.some(existing => existing.kind === file.kind && existing.fileName === file.fileName));
                const intent: TransactionIntent = {
                    version: 1,
                    transactionId,
                    createdAt: Date.now(),
                    planned,
                    reused,
                    selectedAddons: request.selectedAddons,
                    selectedTheme: request.selectedTheme
                };
                const journalRoot = this.#journalRoot();
                this.#ensureSafeDirectory(journalRoot, true);
                intentFile = path.join(journalRoot, `${transactionId}.intent.json`);
                atomicWrite(intentFile, `${JSON.stringify(intent, null, 2)}\n`);

                for (const candidate of pluginCandidates) this.#applyStaged(transactionId, candidate.fileName, candidate.sourceSha256, "plugin", stage, added, reused);
                for (const theme of SOULCORD_RUNTIME_THEMES) this.#applyStaged(transactionId, theme.fileName, theme.sourceSha256, "theme", stage, added, reused);

                const journal: TransactionJournal = {
                    version: 1,
                    transactionId,
                    createdAt: intent.createdAt,
                    added,
                    reused,
                    selectedAddons: request.selectedAddons,
                    selectedTheme: request.selectedTheme
                };
                const serialized = `${JSON.stringify(journal, null, 2)}\n`;
                journalFile = path.join(journalRoot, `${transactionId}.json`);
                atomicWrite(journalFile, serialized);
                // The renderer must durably record the matching settings
                // transaction before this becomes complete. Recovery either
                // acknowledges a known prepared id or rolls its owned files
                // back, so a crash cannot orphan an install.
                this.#writeMarker(transactionId, "prepared", digest(serialized));
                this.#removeStage(stage);
                return {transactionId, added, reused, selectedTheme: request.selectedTheme};
            }
            catch (error) {
                const cleanup = intentFile && fs.existsSync(intentFile)
                    ? this.#cleanupTransactionFiles(transactionId, planned, stage)
                    : {removed: [] as TransactionFile[], preserved: [] as TransactionFile[]};
                let stageRemoved = true;
                try {this.#removeStage(stage);}
                catch {stageRemoved = false;}
                try {
                    if ((intentFile && fs.existsSync(intentFile)) || (journalFile && fs.existsSync(journalFile))) {
                        this.#writeMarker(transactionId, cleanup.preserved.length === 0 && stageRemoved ? "rolledback" : "incomplete", cleanup.preserved.length === 0 && stageRemoved ? "failed-before-completion" : "cleanup-pending");
                        if (cleanup.preserved.length === 0 && stageRemoved && intentFile) this.#removeJournalArtifact(intentFile);
                    }
                }
                catch {/* preserve the original failure */}
                throw error;
            }
        });
    }

    acknowledge(transactionId: unknown): Promise<{transactionId: string; complete: true;}> {
        return this.#serialized(async () => this.#commitPreparedTransaction(transactionId));
    }

    reconcile(rawTransactionIds: unknown): Promise<{committed: string[]; rolledBack: string[];}> {
        return this.#serialized(async () => {
            if (!Array.isArray(rawTransactionIds) || rawTransactionIds.length > 10) throw new TypeError("Invalid SoulCord transaction reconciliation request.");
            const known = new Set<string>();
            for (const transactionId of rawTransactionIds) {
                if (typeof transactionId !== "string" || !TRANSACTION_ID.test(transactionId) || known.has(transactionId)) throw new TypeError("Invalid SoulCord transaction reconciliation id.");
                known.add(transactionId);
            }
            return this.#recoverIncompleteTransactions(known);
        });
    }

    rollback(transactionId: unknown): Promise<SetupRollbackResult> {
        return this.#serialized(async () => {
            if (typeof transactionId !== "string" || !TRANSACTION_ID.test(transactionId)) throw new TypeError("Invalid SoulCord transaction id.");
            const journalRoot = this.#journalRoot();
            if (!this.#ensureSafeDirectory(journalRoot, false)) throw new Error("SoulCord transaction journal not found.");
            const rolledback = path.join(journalRoot, `${transactionId}.rolledback`);
            if (fs.existsSync(rolledback)) {
                this.#readMarker(rolledback, journalRoot);
                return {complete: true, removed: [], preserved: []};
            }
            const completeMarker = path.join(journalRoot, `${transactionId}.complete`);
            const preparedMarker = path.join(journalRoot, `${transactionId}.prepared`);
            const journal = fs.existsSync(completeMarker)
                ? this.#readJournal(transactionId, "complete")
                : fs.existsSync(preparedMarker)
                    ? this.#readJournal(transactionId, "prepared")
                    : this.#readJournal(transactionId, false);
            const cleanup = this.#cleanupTransactionFiles(transactionId, journal.added);
            const complete = cleanup.preserved.length === 0;
            this.#writeMarker(transactionId, complete ? "rolledback" : "incomplete", complete ? "owner-requested" : "cleanup-pending");
            if (complete) {
                if (fs.existsSync(preparedMarker)) this.#removeJournalArtifact(preparedMarker);
                const intent = path.join(journalRoot, `${transactionId}.intent.json`);
                if (fs.existsSync(intent)) this.#removeJournalArtifact(intent);
            }
            return {complete, ...cleanup};
        });
    }

    #commitPreparedTransaction(rawTransactionId: unknown): {transactionId: string; complete: true;} {
        if (typeof rawTransactionId !== "string" || !TRANSACTION_ID.test(rawTransactionId)) throw new TypeError("Invalid SoulCord transaction id.");
        const transactionId = rawTransactionId;
        const root = this.#journalRoot();
        if (!this.#ensureSafeDirectory(root, false)) throw new Error("SoulCord transaction journal not found.");
        const rolledback = path.join(root, `${transactionId}.rolledback`);
        if (fs.existsSync(rolledback)) throw new Error("SoulCord transaction was already rolled back.");
        const complete = path.join(root, `${transactionId}.complete`);
        if (fs.existsSync(complete)) {
            this.#readJournal(transactionId, "complete");
            return {transactionId, complete: true};
        }

        const journal = this.#readJournal(transactionId, "prepared");
        for (const file of journal.added) {
            const targetRoot = this.#targetRoot(file.kind);
            if (!this.#ensureSafeDirectory(targetRoot, false)) throw new Error("Prepared SoulCord target directory is missing.");
            const target = path.join(targetRoot, safeFileName(file.fileName, file.kind));
            if (!fs.existsSync(target)) throw new Error("Prepared SoulCord file is missing.");
            const receipt = this.#readReceipt(transactionId, file);
            if (!receipt || !this.#sameFileIdentity(receipt, this.#fileIdentity(target, targetRoot)) || this.#digestManagedFile(target, targetRoot) !== file.sha256) {
                throw new Error("Prepared SoulCord file no longer matches its ownership receipt.");
            }
        }

        const journalFile = path.join(root, `${transactionId}.json`);
        const serialized = fs.readFileSync(journalFile, "utf8");
        this.#writeMarker(transactionId, "complete", digest(serialized));
        const prepared = path.join(root, `${transactionId}.prepared`);
        if (fs.existsSync(prepared)) this.#removeJournalArtifact(prepared);
        const intent = path.join(root, `${transactionId}.intent.json`);
        if (fs.existsSync(intent)) this.#removeJournalArtifact(intent);
        const stage = path.join(this.#stagingRoot(), transactionId);
        if (fs.existsSync(stage)) this.#removeStage(stage);
        return {transactionId, complete: true};
    }

    auditIntegrity(): Promise<SetupIntegrityRecord[]> {
        return this.#serialized(async () => {
            const records: SetupIntegrityRecord[] = [];
            for (const candidate of SOULCORD_RUNTIME_ADDONS) records.push(this.#auditCandidate("addon", candidate.name, "plugin", candidate.fileName, candidate.sourceSha256));
            for (const candidate of SOULCORD_RUNTIME_DEPENDENCIES) records.push(this.#auditCandidate("dependency", candidate.name, "plugin", candidate.fileName, candidate.sourceSha256));
            for (const candidate of SOULCORD_RUNTIME_THEMES) records.push(this.#auditCandidate("theme", candidate.name, "theme", candidate.fileName, candidate.sourceSha256));
            return records;
        });
    }

    #normalizeRequest(value: unknown): {selectedAddons: string[]; selectedTheme: string;} {
        if (!value || typeof value !== "object") throw new TypeError("Invalid SoulCord setup request.");
        const request = value as SetupRequest;
        const validNames = new Set<string>(SOULCORD_RUNTIME_ADDONS.map(candidate => candidate.name));
        const selectedAddons = Array.isArray(request.selectedAddons)
            ? [...new Set(request.selectedAddons.filter((name): name is string => typeof name === "string" && validNames.has(name)))]
            : [];
        if (!Array.isArray(request.selectedAddons) || selectedAddons.length !== request.selectedAddons.length) throw new TypeError("Setup contains an unknown or duplicate addon.");
        const theme = SOULCORD_RUNTIME_THEMES.find(candidate => candidate.id === request.selectedTheme);
        if (!theme) throw new TypeError("Setup contains an unknown SoulCord theme.");
        return {selectedAddons, selectedTheme: theme.id};
    }

    #dependencyClosure(addons: AddonCandidate[]): DependencyCandidate[] {
        const names = new Set(addons.flatMap(addon => [...addon.dependencies]));
        return [...names].map(name => {
            const dependency = SOULCORD_RUNTIME_DEPENDENCIES.find(candidate => candidate.name === name);
            const decision = dependency as {stageable?: boolean; installable?: boolean;} | undefined;
            if (!dependency || decision?.stageable !== true || decision.installable !== true) throw new Error(`${name} dependency has not passed runtime installation review.`);
            return dependency;
        });
    }

    async #stageRemote(candidate: AddonCandidate | DependencyCandidate, kind: "plugin", stage: string, reused: TransactionFile[]): Promise<void> {
        const fileName = safeFileName(candidate.fileName, kind);
        if (!SHA256.test(candidate.sourceSha256)) throw new TypeError(`Invalid reviewed hash for ${fileName}.`);
        const targetRoot = this.#targetRoot(kind);
        this.#ensureSafeDirectory(targetRoot, true);
        const target = path.join(targetRoot, fileName);
        if (fs.existsSync(target)) {
            const current = this.#digestManagedFile(target, targetRoot);
            if (current !== candidate.sourceSha256) throw new Error(`${fileName} already exists with a different hash; SoulCord will not overwrite it.`);
            reused.push({kind, fileName, sha256: current});
            return;
        }
        const url = validatePinnedSourceUrl(candidate.sourceUrl);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
        let response: Awaited<ReturnType<typeof net.fetch>>;
        try {response = await net.fetch(url.toString(), {redirect: "manual", signal: controller.signal});}
        finally {clearTimeout(timeout);}
        if (!response.ok || response.status < 200 || response.status >= 300 || response.headers.get("location")) throw new Error(`Download failed for ${fileName} with HTTP ${response.status}.`);
        const rawLength = response.headers.get("content-length");
        if (rawLength !== null) {
            const length = Number(rawLength);
            if (!Number.isSafeInteger(length) || length < 0 || length > MAX_PAYLOAD_BYTES) throw new RangeError(`${fileName} has an invalid or oversized Content-Length.`);
        }
        const bytes = await readBoundedResponse(response as Response);
        if (digest(bytes) !== candidate.sourceSha256) throw new Error(`Hash verification failed for ${fileName}.`);
        fs.writeFileSync(path.join(stage, fileName), bytes, {flag: "wx", mode: 0o600});
    }

    #stageTheme(theme: ThemeCandidate, stage: string, reused: TransactionFile[]): void {
        const fileName = safeFileName(theme.fileName, "theme");
        if (!SHA256.test(theme.sourceSha256)) throw new TypeError(`Invalid reviewed hash for ${fileName}.`);
        const targetRoot = this.#targetRoot("theme");
        this.#ensureSafeDirectory(targetRoot, true);
        const target = path.join(targetRoot, fileName);
        if (fs.existsSync(target)) {
            const current = this.#digestManagedFile(target, targetRoot);
            if (current !== theme.sourceSha256) throw new Error(`${fileName} already exists with a different hash; SoulCord will not overwrite it.`);
            reused.push({kind: "theme", fileName, sha256: current});
            return;
        }
        if (digest(theme.content) !== theme.sourceSha256) throw new Error(`Embedded theme verification failed for ${fileName}.`);
        fs.writeFileSync(path.join(stage, fileName), theme.content, {encoding: "utf8", flag: "wx", mode: 0o600});
    }

    #applyStaged(transactionId: string, fileName: string, sha256: string, kind: ManagedKind, stage: string, added: TransactionFile[], reused: TransactionFile[]): void {
        if (reused.some(file => file.kind === kind && file.fileName === fileName)) return;
        const source = path.join(stage, safeFileName(fileName, kind));
        this.#assertExistingSafeDirectory(stage);
        if (!fs.existsSync(source) || this.#digestManagedFile(source, stage) !== sha256) throw new Error(`Staged verification failed for ${fileName}.`);
        const targetRoot = this.#targetRoot(kind);
        this.#ensureSafeDirectory(targetRoot, true);
        const target = path.join(targetRoot, fileName);
        fs.linkSync(source, target);
        const sourceIdentity = this.#fileIdentity(source, stage);
        const targetIdentity = this.#fileIdentity(target, targetRoot);
        if (!this.#sameFileIdentity(sourceIdentity, targetIdentity)) throw new Error(`SoulCord could not prove ownership of ${fileName}.`);
        const file = {kind, fileName, sha256};
        this.#writeReceipt(transactionId, file, targetIdentity);
        added.push(file);
    }

    #auditCandidate(kind: SetupIntegrityRecord["kind"], name: string, targetKind: ManagedKind, fileName: string, reviewedSha256: string): SetupIntegrityRecord {
        const targetRoot = this.#targetRoot(targetKind);
        try {
            if (!this.#ensureSafeDirectory(targetRoot, false)) return {kind, name, status: "missing", reviewedSha256};
            const target = path.join(targetRoot, safeFileName(fileName, targetKind));
            if (!fs.existsSync(target)) return {kind, name, status: "missing", reviewedSha256};
            const installedSha256 = this.#digestManagedFile(target, targetRoot);
            return {kind, name, status: installedSha256 === reviewedSha256 ? "match" : "mismatch", reviewedSha256, installedSha256};
        }
        catch (error) {
            const status = error instanceof TypeError && error.message.includes("link") ? "unsafe" : "unreadable";
            return {kind, name, status, reviewedSha256};
        }
    }

    #managedFileExists(file: TransactionFile): boolean {
        try {
            const root = this.#targetRoot(file.kind);
            if (!this.#ensureSafeDirectory(root, false)) return false;
            const target = path.join(root, safeFileName(file.fileName, file.kind));
            return fs.existsSync(target);
        }
        catch {return true;}
    }

    #cleanupTransactionFiles(transactionId: string, files: TransactionFile[], stage?: string): {removed: TransactionFile[]; preserved: TransactionFile[];} {
        const removed: TransactionFile[] = [];
        const preserved: TransactionFile[] = [];
        for (const file of [...files].reverse()) {
            const outcome = this.#removeAddedIfUnchanged(transactionId, file, stage);
            if (outcome === "removed") removed.push(file);
            else if (outcome === "preserved") preserved.push(file);
        }
        return {removed, preserved};
    }

    #removeAddedIfUnchanged(transactionId: string, file: TransactionFile, stage?: string): "removed" | "absent" | "preserved" {
        try {
            const targetRoot = this.#targetRoot(file.kind);
            if (!this.#ensureSafeDirectory(targetRoot, false)) return "absent";
            const target = path.join(targetRoot, safeFileName(file.fileName, file.kind));
            if (!fs.existsSync(target)) return "absent";
            const targetIdentity = this.#fileIdentity(target, targetRoot);
            const receipt = this.#readReceipt(transactionId, file);
            let owned = Boolean(receipt && this.#sameFileIdentity(receipt, targetIdentity));
            if (!owned && !receipt && stage && fs.existsSync(stage)) {
                this.#assertExistingSafeDirectory(stage);
                const source = path.join(stage, safeFileName(file.fileName, file.kind));
                if (fs.existsSync(source)) owned = this.#sameFileIdentity(this.#fileIdentity(source, stage), targetIdentity);
            }
            if (!owned || this.#digestManagedFile(target, targetRoot) !== file.sha256) return "preserved";
            fs.unlinkSync(target);
            return "removed";
        }
        catch {return this.#managedFileExists(file) ? "preserved" : "absent";}
    }

    #receiptPath(transactionId: string, file: TransactionFile): string {
        if (!TRANSACTION_ID.test(transactionId)) throw new TypeError("Invalid SoulCord transaction id.");
        const key = digest(`${file.kind}\0${safeFileName(file.fileName, file.kind)}`).slice(0, 32);
        return path.join(this.#journalRoot(), `${transactionId}.${key}.receipt.json`);
    }

    #writeReceipt(transactionId: string, file: TransactionFile, identity: {device: string; inode: string;}): void {
        const root = this.#journalRoot();
        this.#ensureSafeDirectory(root, true);
        const receipt: TransactionReceipt = {version: 1, transactionId, file, ...identity};
        atomicWrite(this.#receiptPath(transactionId, file), `${JSON.stringify(receipt, null, 2)}\n`);
    }

    #readReceipt(transactionId: string, file: TransactionFile): TransactionReceipt | undefined {
        const root = this.#journalRoot();
        if (!this.#ensureSafeDirectory(root, false)) return;
        const target = this.#receiptPath(transactionId, file);
        if (!fs.existsSync(target)) return;
        this.#assertInside(target, root);
        const stat = fs.lstatSync(target);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > 4 * 1024) throw new TypeError("Invalid SoulCord transaction receipt.");
        const raw = JSON.parse(fs.readFileSync(target, "utf8")) as Partial<TransactionReceipt>;
        if (raw.version !== 1 || raw.transactionId !== transactionId || typeof raw.device !== "string" || typeof raw.inode !== "string" || !/^\d+$/.test(raw.device) || !/^[1-9]\d*$/.test(raw.inode)) {
            throw new TypeError("Invalid SoulCord transaction receipt.");
        }
        const expected = this.#validateJournalFiles([raw.file as TransactionFile])[0];
        if (expected.kind !== file.kind || expected.fileName !== file.fileName || expected.sha256 !== file.sha256) throw new TypeError("SoulCord transaction receipt does not match its reviewed file.");
        return {...raw, file: expected} as TransactionReceipt;
    }

    #fileIdentity(target: string, root: string): {device: string; inode: string;} {
        this.#assertInside(target, root);
        const stat = fs.lstatSync(target, {bigint: true});
        if (!stat.isFile() || stat.isSymbolicLink() || stat.ino <= 0n) throw new TypeError("Managed addon does not have a stable regular-file identity.");
        return {device: stat.dev.toString(), inode: stat.ino.toString()};
    }

    #sameFileIdentity(left: {device: string; inode: string;}, right: {device: string; inode: string;}): boolean {
        return left.device === right.device && left.inode === right.inode;
    }

    #digestManagedFile(target: string, root: string): string {
        this.#assertInside(target, root);
        const stat = fs.lstatSync(target);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new TypeError("Managed addon path is a link or non-file.");
        if (stat.size > MAX_PAYLOAD_BYTES) throw new RangeError("Managed addon exceeds the reviewed size boundary.");
        return digest(fs.readFileSync(target));
    }

    #targetRoot(kind: ManagedKind): string {
        return path.join(this.#betterDiscordRoot(), kind === "plugin" ? "plugins" : "themes");
    }

    #betterDiscordRoot(): string {
        return resolveSoulCordBetterDiscordRoot(app.getPath("userData"));
    }

    #stagingRoot(): string {
        return path.join(this.#betterDiscordRoot(), "soulcord-staging-v1");
    }

    #journalRoot(): string {
        return path.join(this.#betterDiscordRoot(), "soulcord-transactions-v1");
    }

    #ensureSafeDirectory(target: string, create: boolean): boolean {
        const base = path.resolve(this.#betterDiscordRoot());
        const resolved = path.resolve(target);
        if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new TypeError("Managed directory escapes the BetterDiscord root.");

        if (!fs.existsSync(base)) {
            if (!create) return false;
            fs.mkdirSync(base, {recursive: true, mode: 0o700});
        }
        this.#assertDirectoryNode(base);
        if (resolved === base) return true;

        if (!fs.existsSync(resolved)) {
            if (!create) return false;
            const parent = path.dirname(resolved);
            if (parent !== base) this.#ensureSafeDirectory(parent, true);
            fs.mkdirSync(resolved, {recursive: false, mode: 0o700});
        }
        this.#assertDirectoryNode(resolved);
        const realBase = fs.realpathSync.native(base);
        const realTarget = fs.realpathSync.native(resolved);
        if (realTarget !== realBase && !realTarget.startsWith(`${realBase}${path.sep}`)) throw new TypeError("Managed directory resolves through a link outside BetterDiscord.");
        return true;
    }

    #assertDirectoryNode(directory: string): void {
        const stat = fs.lstatSync(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new TypeError("Managed directory is a link or non-directory.");
    }

    #assertExistingSafeDirectory(directory: string): void {
        if (!this.#ensureSafeDirectory(directory, false)) throw new Error("Expected SoulCord directory is missing.");
    }

    #assertInside(target: string, root: string): void {
        const resolvedRoot = path.resolve(root);
        const resolvedTarget = path.resolve(target);
        if (resolvedTarget === resolvedRoot || !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("Unsafe SoulCord managed path.");
    }

    #removeStage(stage: string): void {
        if (!fs.existsSync(stage)) return;
        this.#assertInside(stage, this.#stagingRoot());
        this.#assertExistingSafeDirectory(stage);
        fs.rmSync(stage, {recursive: true, force: false});
    }

    #removeJournalArtifact(target: string): void {
        if (!fs.existsSync(target)) return;
        const root = this.#journalRoot();
        this.#ensureSafeDirectory(root, false);
        this.#assertInside(target, root);
        const stat = fs.lstatSync(target);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new TypeError("Invalid SoulCord transaction artifact.");
        fs.unlinkSync(target);
    }

    #writeMarker(transactionId: string, marker: "prepared" | "complete" | "rolledback" | "incomplete", content: string): void {
        const root = this.#journalRoot();
        this.#ensureSafeDirectory(root, true);
        const target = path.join(root, `${transactionId}.${marker}`);
        if (fs.existsSync(target)) {
            const existing = this.#readMarker(target, root);
            if (existing !== content) throw new TypeError("SoulCord transaction marker conflicts with the current transaction.");
            return;
        }
        atomicWrite(target, `${content}\n`);
    }

    #readMarker(target: string, root: string): string {
        this.#assertInside(target, root);
        const stat = fs.lstatSync(target);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > 256) throw new TypeError("Invalid SoulCord transaction marker.");
        return fs.readFileSync(target, "utf8").trim();
    }

    #readJournal(transactionId: string, verifyMarker: "prepared" | "complete" | false): TransactionJournal {
        const root = this.#journalRoot();
        if (!this.#ensureSafeDirectory(root, false)) throw new Error("SoulCord transaction journal not found.");
        const journalFile = path.join(root, `${transactionId}.json`);
        if (!fs.existsSync(journalFile)) throw new Error("SoulCord transaction journal not found.");
        const stat = fs.lstatSync(journalFile);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_JOURNAL_BYTES) throw new TypeError("Invalid SoulCord transaction journal file.");
        const serialized = fs.readFileSync(journalFile, "utf8");
        if (verifyMarker) {
            const markerFile = path.join(root, `${transactionId}.${verifyMarker}`);
            if (!fs.existsSync(markerFile)) throw new TypeError(`SoulCord transaction is not ${verifyMarker}.`);
            const marker = this.#readMarker(markerFile, root);
            if (!SHA256.test(marker) || marker !== digest(serialized)) throw new TypeError("SoulCord transaction journal integrity check failed.");
        }
        const raw = JSON.parse(serialized) as Partial<TransactionJournal>;
        if (raw.version !== 1 || raw.transactionId !== transactionId || !Number.isSafeInteger(raw.createdAt) || !Array.isArray(raw.added) || !Array.isArray(raw.reused) || !Array.isArray(raw.selectedAddons) || typeof raw.selectedTheme !== "string") {
            throw new TypeError("Invalid SoulCord transaction journal.");
        }
        const journal = raw as TransactionJournal;
        journal.added = this.#validateJournalFiles(journal.added);
        journal.reused = this.#validateJournalFiles(journal.reused);
        const request = this.#normalizeRequest({selectedAddons: journal.selectedAddons, selectedTheme: journal.selectedTheme});
        journal.selectedAddons = request.selectedAddons;
        journal.selectedTheme = request.selectedTheme;
        return journal;
    }

    #readIntent(transactionId: string): TransactionIntent {
        const root = this.#journalRoot();
        if (!this.#ensureSafeDirectory(root, false)) throw new Error("SoulCord transaction intent not found.");
        const intentFile = path.join(root, `${transactionId}.intent.json`);
        if (!fs.existsSync(intentFile)) throw new Error("SoulCord transaction intent not found.");
        const stat = fs.lstatSync(intentFile);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_JOURNAL_BYTES) throw new TypeError("Invalid SoulCord transaction intent file.");
        const raw = JSON.parse(fs.readFileSync(intentFile, "utf8")) as Partial<TransactionIntent>;
        if (raw.version !== 1 || raw.transactionId !== transactionId || !Number.isSafeInteger(raw.createdAt) || !Array.isArray(raw.planned) || !Array.isArray(raw.reused) || !Array.isArray(raw.selectedAddons) || typeof raw.selectedTheme !== "string") {
            throw new TypeError("Invalid SoulCord transaction intent.");
        }
        const intent = raw as TransactionIntent;
        intent.planned = this.#validateJournalFiles(intent.planned);
        intent.reused = this.#validateJournalFiles(intent.reused);
        const request = this.#normalizeRequest({selectedAddons: intent.selectedAddons, selectedTheme: intent.selectedTheme});
        intent.selectedAddons = request.selectedAddons;
        intent.selectedTheme = request.selectedTheme;
        return intent;
    }

    #validateJournalFiles(files: TransactionFile[]): TransactionFile[] {
        const known = new Map<string, TransactionFile>();
        for (const candidate of [...SOULCORD_RUNTIME_DEPENDENCIES, ...SOULCORD_RUNTIME_ADDONS]) known.set(`plugin\0${candidate.fileName}`, {kind: "plugin", fileName: candidate.fileName, sha256: candidate.sourceSha256});
        for (const candidate of SOULCORD_RUNTIME_THEMES) known.set(`theme\0${candidate.fileName}`, {kind: "theme", fileName: candidate.fileName, sha256: candidate.sourceSha256});
        const seen = new Set<string>();
        return files.map(raw => {
            if (!raw || (raw.kind !== "plugin" && raw.kind !== "theme") || typeof raw.fileName !== "string" || typeof raw.sha256 !== "string") throw new TypeError("Invalid SoulCord transaction file record.");
            const key = `${raw.kind}\0${safeFileName(raw.fileName, raw.kind)}`;
            const expected = known.get(key);
            if (!expected || expected.sha256 !== raw.sha256 || seen.has(key)) throw new TypeError("SoulCord transaction file is not in the reviewed catalog.");
            seen.add(key);
            return expected;
        });
    }

    #recoverIncompleteTransactions(knownTransactionIds: ReadonlySet<string>): {committed: string[]; rolledBack: string[];} {
        const root = this.#journalRoot();
        if (!this.#ensureSafeDirectory(root, false)) return {committed: [], rolledBack: []};
        const transactionIds = new Set<string>();
        for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
            if (!entry.isFile()) continue;
            const match = TRANSACTION_JOURNAL.exec(entry.name) ?? TRANSACTION_INTENT.exec(entry.name);
            if (match) transactionIds.add(match[1]);
        }
        if (transactionIds.size > 2_000) throw new Error("SoulCord transaction history exceeds the bounded recovery limit.");
        let ambiguous = false;
        const committed: string[] = [];
        const rolledBackIds: string[] = [];
        for (const transactionId of transactionIds) {
            try {
                const complete = path.join(root, `${transactionId}.complete`);
                const prepared = path.join(root, `${transactionId}.prepared`);
                const rolledback = path.join(root, `${transactionId}.rolledback`);
                const intentFile = path.join(root, `${transactionId}.intent.json`);
                const stage = path.join(this.#stagingRoot(), transactionId);
                if (fs.existsSync(rolledback)) {
                    this.#readMarker(rolledback, root);
                    try {if (fs.existsSync(stage)) this.#removeStage(stage);}
                    catch {ambiguous = true;}
                    if (fs.existsSync(intentFile)) this.#removeJournalArtifact(intentFile);
                    continue;
                }
                if (fs.existsSync(complete)) {
                    this.#readJournal(transactionId, "complete");
                    try {if (fs.existsSync(stage)) this.#removeStage(stage);}
                    catch {ambiguous = true;}
                    if (fs.existsSync(intentFile)) this.#removeJournalArtifact(intentFile);
                    if (fs.existsSync(prepared)) this.#removeJournalArtifact(prepared);
                    continue;
                }
                if (fs.existsSync(prepared) && knownTransactionIds.has(transactionId)) {
                    this.#commitPreparedTransaction(transactionId);
                    committed.push(transactionId);
                    continue;
                }
                const files = fs.existsSync(intentFile)
                    ? this.#readIntent(transactionId).planned
                    : this.#readJournal(transactionId, false).added;
                const cleanup = this.#cleanupTransactionFiles(transactionId, files, fs.existsSync(stage) ? stage : undefined);
                let stageRemoved = true;
                try {if (fs.existsSync(stage)) this.#removeStage(stage);}
                catch {stageRemoved = false;}
                if (cleanup.preserved.length > 0 || !stageRemoved) {
                    this.#writeMarker(transactionId, "incomplete", "cleanup-pending");
                    ambiguous = true;
                    continue;
                }
                this.#writeMarker(transactionId, "rolledback", "recovered-incomplete");
                rolledBackIds.push(transactionId);
                if (fs.existsSync(intentFile)) this.#removeJournalArtifact(intentFile);
                if (fs.existsSync(prepared)) this.#removeJournalArtifact(prepared);
            }
            catch {ambiguous = true;}
        }
        if (ambiguous) throw new Error("SoulCord found an ambiguous transaction journal; setup is paused for manual review.");
        return {committed, rolledBack: rolledBackIds};
    }

    #serialized<T>(task: () => Promise<T>): Promise<T> {
        const result = this.#queue.then(task, task);
        this.#queue = result.then(() => undefined, () => undefined);
        return result;
    }
}

export default new SoulCordSetupTransactions();
