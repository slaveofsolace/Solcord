// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {app, safeStorage} from "electron";

import {resolveSolcordBetterDiscordRoot} from "./solcord-data-root";


export interface SolcordStoredIdentityNote {
    subjectId: string;
    text: string;
    tags: string[];
    updatedAt: number;
}

interface IdentityNoteDocument {
    version: 1;
    notes: SolcordStoredIdentityNote[];
}

const ACCOUNT_ID = /^\d{1,32}$/;
const STORE_DIRECTORY = /^store-[0-9a-f]{40}$/;
const MAX_NOTES = 500;
const MAX_DOCUMENT_BYTES = 512 * 1024;
const MAX_WRAPPED_BYTES = 1024 * 1024;
const EMPTY_DOCUMENT: IdentityNoteDocument = {version: 1, notes: []};
const NOTES_BACKUP_FILE = /^notes\.scdb\.\d+\.[0-9a-f]{8}\.old$/;
const NOTES_TEMPORARY_FILE = /^notes\.scdb\.\d+\.[0-9a-f]{8}\.tmp$/;

function printableText(value: unknown, maximumLength: number, label: string): string {
    if (typeof value !== "string" || value.length > maximumLength || [...value].some(character => {
        const code = character.charCodeAt(0);
        return code === 0 || code === 8 || code === 11 || code === 12 || code === 127;
    })) throw new TypeError(`Invalid ${label}.`);
    return value;
}

function normalizeTags(value: unknown): string[] {
    if (!Array.isArray(value)) throw new TypeError("Invalid identity note tags.");
    const result: string[] = [];
    const seen = new Set<string>();
    for (const candidate of value) {
        const tag = printableText(candidate, 24, "identity note tag").trim();
        if (!tag || seen.has(tag)) continue;
        seen.add(tag);
        result.push(tag);
        if (result.length > 8) throw new RangeError("An identity note supports at most eight tags.");
    }
    return result;
}

function normalizeNote(value: unknown, updatedAt = Date.now()): SolcordStoredIdentityNote {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid identity note.");
    const note = value as Record<string, unknown>;
    if (typeof note.subjectId !== "string" || !ACCOUNT_ID.test(note.subjectId)) throw new TypeError("Invalid identity note subject.");
    const timestamp = typeof note.updatedAt === "number" ? note.updatedAt : updatedAt;
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new TypeError("Invalid identity note timestamp.");
    return {subjectId: note.subjectId, text: printableText(note.text, 280, "identity note text"), tags: normalizeTags(note.tags), updatedAt: timestamp};
}

function normalizeDocument(value: unknown): IdentityNoteDocument {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid identity note document.");
    const record = value as Record<string, unknown>;
    if (record.version !== 1 || !Array.isArray(record.notes)) throw new TypeError("Invalid identity note document version.");
    const notes = new Map<string, SolcordStoredIdentityNote>();
    for (const candidate of record.notes) {
        const note = normalizeNote(candidate);
        notes.set(note.subjectId, note);
        if (notes.size > MAX_NOTES) throw new RangeError("Local identity note limit reached.");
    }
    const document: IdentityNoteDocument = {version: 1, notes: [...notes.values()].sort((left, right) => right.updatedAt - left.updatedAt)};
    if (Buffer.byteLength(JSON.stringify(document), "utf8") > MAX_DOCUMENT_BYTES) throw new RangeError("Local identity notes exceed their storage limit.");
    return document;
}

function cloneDocument(document: IdentityNoteDocument): IdentityNoteDocument {
    return structuredClone(document);
}

export class SolcordLocalIdentityNotesStorage {
    #session = new Map<string, IdentityNoteDocument>();
    #identity?: Buffer;
    #failed = false;
    #queue = Promise.resolve();

    status(): {persistent: boolean; sessionOnly: boolean; reason?: string;} {
        return this.#secureAvailable()
            ? {persistent: true, sessionOnly: false}
            : {persistent: false, sessionOnly: true, reason: "Electron safeStorage is unavailable; Local Identity Notes remain in memory only for this session."};
    }

    read(rawAccount: unknown, rawRequest: unknown): Promise<{notes: SolcordStoredIdentityNote[]; persistent: boolean; complete: boolean;}> {
        const account = this.#account(rawAccount);
        this.#emptyRequest(rawRequest);
        return this.#serialized(async () => {
            const result = this.#readDocument(account);
            return {notes: result.document.notes, persistent: result.persistent, complete: result.complete};
        });
    }

    write(rawAccount: unknown, rawRequest: unknown): Promise<{note: SolcordStoredIdentityNote; persistent: boolean; complete: boolean;}> {
        const account = this.#account(rawAccount);
        if (!rawRequest || typeof rawRequest !== "object" || Array.isArray(rawRequest)) throw new TypeError("Invalid identity note write request.");
        const request = rawRequest as Record<string, unknown>;
        this.#rejectAuthority(request);
        if (request.storage !== "secure-only" || Object.keys(request).some(key => !["subjectId", "note", "tags", "storage"].includes(key))) throw new TypeError("Identity note writes require the reviewed secure-only intent.");
        const note = normalizeNote({subjectId: request.subjectId, text: request.note, tags: request.tags});
        return this.#serialized(async () => {
            const current = this.#readDocument(account);
            const notes = new Map(current.document.notes.map(item => [item.subjectId, item]));
            if (!notes.has(note.subjectId) && notes.size >= MAX_NOTES) throw new RangeError("Local identity note limit reached.");
            notes.set(note.subjectId, note);
            const document = normalizeDocument({version: 1, notes: [...notes.values()]});
            this.#session.set(account, cloneDocument(document));
            const stored = document.notes.find(item => item.subjectId === note.subjectId)!;
            if (!this.#secureAvailable()) return {note: structuredClone(stored), persistent: false, complete: true};
            try {
                this.#writeDocument(account, document);
                return {note: structuredClone(stored), persistent: true, complete: true};
            }
            catch {
                this.#failed = true;
                return {note: structuredClone(stored), persistent: false, complete: false};
            }
        });
    }

    remove(rawAccount: unknown, rawRequest: unknown): Promise<{removed: boolean; persistent: boolean; complete: boolean;}> {
        const account = this.#account(rawAccount);
        if (!rawRequest || typeof rawRequest !== "object" || Array.isArray(rawRequest)) throw new TypeError("Invalid identity note remove request.");
        const request = rawRequest as Record<string, unknown>;
        this.#rejectAuthority(request);
        if (typeof request.subjectId !== "string" || !ACCOUNT_ID.test(request.subjectId) || Object.keys(request).some(key => key !== "subjectId")) throw new TypeError("Invalid identity note subject.");
        return this.#serialized(async () => {
            const current = this.#readDocument(account);
            const notes = new Map(current.document.notes.map(item => [item.subjectId, item]));
            const removed = notes.delete(request.subjectId as string);
            const document = normalizeDocument({version: 1, notes: [...notes.values()]});
            this.#session.set(account, cloneDocument(document));
            if (!this.#secureAvailable()) return {removed, persistent: false, complete: true};
            try {
                this.#writeDocument(account, document);
                return {removed, persistent: true, complete: true};
            }
            catch {
                this.#failed = true;
                return {removed, persistent: false, complete: false};
            }
        });
    }

    clear(rawAccount: unknown, rawRequest: unknown): Promise<{cleared: number; persistent: boolean; complete: boolean;}> {
        const account = this.#account(rawAccount);
        this.#emptyRequest(rawRequest);
        return this.#serialized(async () => {
            const current = this.#readDocument(account);
            const cleared = current.document.notes.length;
            this.#session.delete(account);
            try {
                const directory = this.#accountDirectory(account, false);
                if (!directory) return {cleared, persistent: this.#secureAvailable(), complete: true};
                for (const name of fs.readdirSync(directory)) {
                    if (name !== "notes.scdb" && !NOTES_TEMPORARY_FILE.test(name) && !NOTES_BACKUP_FILE.test(name)) continue;
                    const file = path.join(directory, name);
                    const stat = fs.lstatSync(file);
                    if (!stat.isFile() || stat.isSymbolicLink()) throw new TypeError("Unsafe identity note residue.");
                    fs.unlinkSync(file);
                }
                if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
                return {cleared, persistent: this.#secureAvailable(), complete: true};
            }
            catch {return {cleared, persistent: false, complete: false};}
        });
    }

    #readDocument(account: string): {document: IdentityNoteDocument; persistent: boolean; complete: boolean;} {
        const fallback = cloneDocument(this.#session.get(account) ?? EMPTY_DOCUMENT);
        if (!this.#secureAvailable()) return {document: fallback, persistent: false, complete: true};
        try {
            const file = this.#notesFile(account, false);
            if (!file) return {document: fallback, persistent: true, complete: true};
            const directory = path.dirname(file);
            this.#recoverNotes(directory);
            if (!fs.existsSync(file)) return {document: fallback, persistent: true, complete: true};
            const document = this.#readNotesFile(file);
            this.#session.set(account, cloneDocument(document));
            return {document, persistent: true, complete: true};
        }
        catch {
            this.#failed = true;
            return {document: fallback, persistent: false, complete: false};
        }
    }

    #writeDocument(account: string, document: IdentityNoteDocument): void {
        const file = this.#notesFile(account, true)!;
        this.#recoverNotes(path.dirname(file));
        const wrapped = safeStorage.encryptString(JSON.stringify(document));
        if (!Buffer.isBuffer(wrapped) || wrapped.length <= 0 || wrapped.length > MAX_WRAPPED_BYTES) throw new TypeError("Invalid encrypted identity note document.");
        this.#atomicWrite(file, wrapped, true);
    }

    #serialized<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.#queue.then(operation, operation);
        this.#queue = result.then(() => undefined, () => undefined);
        return result;
    }

    #account(value: unknown): string {
        if (typeof value !== "string" || !ACCOUNT_ID.test(value)) throw new TypeError("Invalid identity note account scope.");
        return value;
    }

    #emptyRequest(value: unknown): void {
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid identity note request.");
        const request = value as Record<string, unknown>;
        this.#rejectAuthority(request);
        if (Object.keys(request).length) throw new TypeError("Identity note request must be empty.");
    }

    #rejectAuthority(request: Record<string, unknown>): void {
        if (Object.hasOwn(request, "accountId") || Object.hasOwn(request, "accountScope") || Object.hasOwn(request, "capability")) throw new TypeError("Identity note requests cannot select their authority.");
    }

    #secureAvailable(): boolean {
        if (this.#failed) return false;
        try {return safeStorage.isEncryptionAvailable();}
        catch {return false;}
    }

    #root(create: boolean): string | undefined {
        const betterDiscord = path.resolve(resolveSolcordBetterDiscordRoot(app.getPath("userData")));
        const root = path.join(betterDiscord, "solcord-local-identity-notes-v1");
        if (!fs.existsSync(betterDiscord)) {
            if (!create) return;
            fs.mkdirSync(betterDiscord, {recursive: true, mode: 0o700});
        }
        this.#assertDirectory(betterDiscord);
        if (!fs.existsSync(root)) {
            if (!create) return;
            fs.mkdirSync(root, {recursive: false, mode: 0o700});
        }
        this.#assertDirectory(root);
        this.#assertWithin(root, betterDiscord);
        return root;
    }

    #identityKey(create: boolean): Buffer | undefined {
        if (this.#identity) return Buffer.from(this.#identity);
        const root = this.#root(create);
        if (!root) return;
        const file = path.join(root, "identity.sc-key");
        if (!fs.existsSync(file)) {
            if (!create) return;
            const identity = crypto.randomBytes(32);
            try {
                const wrapped = safeStorage.encryptString(identity.toString("base64"));
                this.#atomicWrite(file, wrapped);
                this.#identity = Buffer.from(identity);
                return identity;
            }
            catch (error) {identity.fill(0); throw error;}
        }
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_WRAPPED_BYTES) throw new TypeError("Invalid identity note storage key.");
        const identity = Buffer.from(safeStorage.decryptString(fs.readFileSync(file)), "base64");
        if (identity.length !== 32) throw new TypeError("Invalid identity note storage key.");
        this.#identity = Buffer.from(identity);
        return identity;
    }

    #accountDirectory(account: string, create: boolean): string | undefined {
        const root = this.#root(create);
        if (!root) return;
        const identity = this.#identityKey(create);
        if (!identity) return;
        let opaque: string;
        try {opaque = crypto.createHmac("sha256", identity).update(account, "utf8").digest("hex").slice(0, 40);}
        finally {identity.fill(0);}
        const directory = path.join(root, `store-${opaque}`);
        if (!STORE_DIRECTORY.test(path.basename(directory))) throw new TypeError("Invalid identity note store directory.");
        if (!fs.existsSync(directory)) {
            if (!create) return;
            fs.mkdirSync(directory, {recursive: false, mode: 0o700});
        }
        this.#assertDirectory(directory);
        this.#assertWithin(directory, root);
        return directory;
    }

    #notesFile(account: string, create: boolean): string | undefined {
        const directory = this.#accountDirectory(account, create);
        if (!directory) return;
        const file = path.join(directory, "notes.scdb");
        this.#assertWithin(file, directory);
        const hasTransient = fs.readdirSync(directory).some(name => NOTES_BACKUP_FILE.test(name) || NOTES_TEMPORARY_FILE.test(name));
        return fs.existsSync(file) || hasTransient || create ? file : undefined;
    }

    #assertDirectory(directory: string): void {
        const stat = fs.lstatSync(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink() || path.resolve(fs.realpathSync.native(directory)) !== path.resolve(directory)) throw new TypeError("Identity note storage directory is unsafe.");
    }

    #assertWithin(target: string, root: string): void {
        const resolvedRoot = path.resolve(root);
        const resolvedTarget = path.resolve(target);
        if (resolvedTarget === resolvedRoot || !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) throw new TypeError("Identity note storage path escaped its root.");
    }

    #readNotesFile(file: string): IdentityNoteDocument {
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_WRAPPED_BYTES) throw new TypeError("Invalid identity note file.");
        return normalizeDocument(JSON.parse(safeStorage.decryptString(fs.readFileSync(file))));
    }

    #recoverNotes(directory: string): void {
        this.#assertDirectory(directory);
        const target = path.join(directory, "notes.scdb");
        this.#assertWithin(target, directory);
        const names = fs.readdirSync(directory);
        const backups = names.filter(name => NOTES_BACKUP_FILE.test(name));
        const temporary = names.filter(name => NOTES_TEMPORARY_FILE.test(name));
        if (backups.length > 1) throw new TypeError("Ambiguous identity note recovery state.");
        for (const name of [...backups, ...temporary]) {
            const candidate = path.join(directory, name);
            const stat = fs.lstatSync(candidate);
            if (!stat.isFile() || stat.isSymbolicLink()) throw new TypeError("Unsafe identity note recovery artifact.");
        }
        if (!fs.existsSync(target) && backups.length === 1) fs.renameSync(path.join(directory, backups[0]), target);
        const backup = backups.map(name => path.join(directory, name)).find(fs.existsSync);
        if (fs.existsSync(target) && backup) {
            try {this.#readNotesFile(target); fs.unlinkSync(backup);}
            catch {
                const displaced = `${target}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.old`;
                fs.renameSync(target, displaced);
                try {fs.renameSync(backup, target); this.#readNotesFile(target); fs.unlinkSync(displaced);}
                catch (error) {if (!fs.existsSync(target) && fs.existsSync(displaced)) fs.renameSync(displaced, target); throw error;}
            }
        }
        for (const name of temporary) fs.unlinkSync(path.join(directory, name));
    }

    #atomicWrite(target: string, content: Buffer, replace = false): void {
        const directory = path.dirname(target);
        this.#assertDirectory(directory);
        this.#assertWithin(target, directory);
        const temporary = `${target}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
        const descriptor = fs.openSync(temporary, "wx", 0o600);
        try {fs.writeFileSync(descriptor, content); fs.fsyncSync(descriptor);}
        finally {fs.closeSync(descriptor);}
        try {
            if (replace && fs.existsSync(target)) {
                const stat = fs.lstatSync(target);
                if (!stat.isFile() || stat.isSymbolicLink()) throw new TypeError("Identity note target is unsafe.");
                const backup = `${target}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.old`;
                fs.renameSync(target, backup);
                try {
                    fs.renameSync(temporary, target);
                    this.#readNotesFile(target);
                    fs.unlinkSync(backup);
                }
                catch (error) {
                    if (!fs.existsSync(target) && fs.existsSync(backup)) fs.renameSync(backup, target);
                    throw error;
                }
            }
            else {fs.renameSync(temporary, target);}
        }
        finally {
            try {if (fs.existsSync(temporary)) fs.unlinkSync(temporary);}
            catch {/* preserve primary error */}
        }
    }
}

export default new SolcordLocalIdentityNotesStorage();
