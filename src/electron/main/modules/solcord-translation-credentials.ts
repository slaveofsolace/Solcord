// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {app, safeStorage} from "electron";

import {resolveSolcordBetterDiscordRoot} from "./solcord-data-root";


interface CredentialRecord {
    version: 1;
    provider: "deepl" | "libretranslate";
    endpointHash: string;
    credential: string;
}

const ACCOUNT_ID = /^\d{1,32}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_WRAPPED_BYTES = 64 * 1024;
const TRANSIENT_SUFFIX = /^\.\d+\.[0-9a-f]{8}\.(?:old|tmp)$/;
const CLEAR_MARKER_SUFFIX = ".clear-pending";
const CLEAR_MARKER_CONTENT = "solcord-clear-v1\n";

function hasUnsafeControl(value: string): boolean {
    return [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

function endpointHash(value: unknown): string {
    if (typeof value !== "string" || value.length > 500) throw new TypeError("Invalid translation endpoint.");
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new TypeError("Translation endpoint must be credential-free HTTPS.");
    return crypto.createHash("sha256").update(url.toString(), "utf8").digest("hex");
}

function normalizeRecord(value: unknown): CredentialRecord {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid translation credential record.");
    const record = value as Record<string, unknown>;
    if (Object.keys(record).some(key => key !== "provider" && key !== "endpoint" && key !== "credential")) throw new TypeError("Invalid translation credential fields.");
    if ((record.provider !== "deepl" && record.provider !== "libretranslate") || typeof record.credential !== "string" || record.credential.length < 1 || record.credential.length > 512 || hasUnsafeControl(record.credential)) throw new TypeError("Invalid translation credential.");
    return {version: 1, provider: record.provider, endpointHash: endpointHash(record.endpoint), credential: record.credential};
}

export class SolcordTranslationCredentialStorage {
    #session = new Map<string, CredentialRecord>();
    #sessionPreferred = new Set<string>();
    #cleanupAttention = new Set<string>();
    #identity?: Buffer;
    #queue = Promise.resolve();

    read(rawAccount: unknown, rawRequest: unknown): Promise<{credential: string; persistent: boolean; complete: boolean;}> {
        const account = this.#account(rawAccount);
        if (!rawRequest || typeof rawRequest !== "object" || Array.isArray(rawRequest)) throw new TypeError("Invalid translation credential request.");
        const request = rawRequest as Record<string, unknown>;
        if (Object.keys(request).some(key => key !== "provider" && key !== "endpoint")) throw new TypeError("Invalid translation credential fields.");
        const provider = request.provider;
        if (provider !== "deepl" && provider !== "libretranslate") throw new TypeError("Invalid translation provider.");
        const binding = endpointHash(request.endpoint);
        const key = `${account}:${provider}:${binding}`;
        return this.#serialized(async () => {
            if (this.#cleanupAttention.has(key)) {
                try {
                    const file = this.#file(account, provider, binding, false);
                    if (file) this.#completePendingClear(file);
                    this.#cleanupAttention.delete(key);
                    this.#sessionPreferred.delete(key);
                    return {credential: "", persistent: this.#secureAvailable(), complete: true};
                }
                catch {return {credential: this.#session.get(key)?.credential ?? "", persistent: false, complete: false};}
            }
            if (this.#sessionPreferred.has(key)) return {credential: this.#session.get(key)?.credential ?? "", persistent: false, complete: true};
            if (!this.#secureAvailable()) return {credential: this.#session.get(key)?.credential ?? "", persistent: false, complete: true};
            try {
                const file = this.#file(account, provider, binding, false);
                if (!file) return {credential: "", persistent: true, complete: true};
                if (fs.existsSync(this.#clearMarker(file))) {
                    this.#completePendingClear(file);
                    this.#cleanupAttention.delete(key);
                    this.#sessionPreferred.delete(key);
                    return {credential: "", persistent: true, complete: true};
                }
                this.#recoverFile(file, provider, binding);
                if (!fs.existsSync(file)) return {credential: "", persistent: true, complete: true};
                const record = this.#readRecord(file, provider, binding);
                return {credential: record.credential, persistent: true, complete: true};
            }
            catch {return {credential: this.#session.get(key)?.credential ?? "", persistent: false, complete: false};}
        });
    }

    write(rawAccount: unknown, rawRequest: unknown): Promise<{persistent: boolean; complete: boolean;}> {
        const account = this.#account(rawAccount);
        const record = normalizeRecord(rawRequest);
        const key = `${account}:${record.provider}:${record.endpointHash}`;
        this.#session.set(key, record);
        return this.#serialized(async () => {
            if (!this.#secureAvailable()) {
                this.#sessionPreferred.add(key);
                return {persistent: false, complete: true};
            }
            try {
                const file = this.#file(account, record.provider, record.endpointHash, true)!;
                if (fs.existsSync(this.#clearMarker(file))) this.#completePendingClear(file);
                this.#recoverFile(file, record.provider, record.endpointHash);
                const wrapped = safeStorage.encryptString(JSON.stringify(record));
                if (!Buffer.isBuffer(wrapped) || wrapped.length <= 0 || wrapped.length > MAX_WRAPPED_BYTES) throw new TypeError("Invalid encrypted translation credential.");
                this.#atomicReplace(file, wrapped, record.provider, record.endpointHash);
                this.#sessionPreferred.delete(key);
                this.#cleanupAttention.delete(key);
                return {persistent: true, complete: true};
            }
            catch {
                this.#sessionPreferred.add(key);
                return {persistent: false, complete: false};
            }
        });
    }

    clear(rawAccount: unknown, rawRequest: unknown): Promise<{persistent: boolean; complete: boolean;}> {
        const account = this.#account(rawAccount);
        if (!rawRequest || typeof rawRequest !== "object" || Array.isArray(rawRequest)) throw new TypeError("Invalid translation credential request.");
        const request = rawRequest as Record<string, unknown>;
        if (Object.keys(request).some(key => key !== "provider" && key !== "endpoint")) throw new TypeError("Invalid translation credential fields.");
        const provider = request.provider;
        if (provider !== "deepl" && provider !== "libretranslate") throw new TypeError("Invalid translation provider.");
        const binding = endpointHash(request.endpoint);
        const key = `${account}:${provider}:${binding}`;
        this.#session.delete(key);
        return this.#serialized(async () => {
            try {
                const file = this.#file(account, provider, binding, false);
                if (file) {
                    this.#beginPendingClear(file);
                    this.#completePendingClear(file);
                }
                this.#sessionPreferred.delete(key);
                this.#cleanupAttention.delete(key);
                return {persistent: this.#secureAvailable(), complete: true};
            }
            catch {
                this.#sessionPreferred.add(key);
                this.#cleanupAttention.add(key);
                return {persistent: false, complete: false};
            }
        });
    }

    #account(value: unknown): string {
        if (typeof value !== "string" || !ACCOUNT_ID.test(value)) throw new TypeError("Invalid translation account scope.");
        return value;
    }

    #secureAvailable(): boolean {
        try {return safeStorage.isEncryptionAvailable();}
        catch {return false;}
    }

    #file(account: string, provider: CredentialRecord["provider"], binding: string, create: boolean): string | undefined {
        if (!SHA256.test(binding)) throw new TypeError("Invalid translation endpoint binding.");
        const root = this.#root(create);
        if (!root) return;
        const identity = this.#identityKey(create);
        if (!identity) return;
        let opaqueAccount: string;
        try {opaqueAccount = crypto.createHmac("sha256", identity).update(account, "utf8").digest("hex").slice(0, 40);}
        finally {identity.fill(0);}
        const directory = path.join(root, `store-${opaqueAccount}`);
        if (!fs.existsSync(directory)) {
            if (!create) return;
            fs.mkdirSync(directory, {recursive: false, mode: 0o700});
        }
        const stat = fs.lstatSync(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink() || path.resolve(fs.realpathSync.native(directory)) !== path.resolve(directory)) throw new TypeError("Translation credential directory is unsafe.");
        const file = path.join(directory, `${provider}-${binding.slice(0, 32)}.scdb`);
        const relative = path.relative(directory, file);
        if (relative.startsWith("..") || path.isAbsolute(relative)) throw new TypeError("Translation credential path escaped its store.");
        const base = path.basename(file);
        const hasTransient = fs.readdirSync(directory).some(name => name.startsWith(base) && TRANSIENT_SUFFIX.test(name.slice(base.length)));
        return fs.existsSync(file) || fs.existsSync(this.#clearMarker(file)) || hasTransient || create ? file : undefined;
    }

    #clearMarker(file: string): string {
        return `${file}${CLEAR_MARKER_SUFFIX}`;
    }

    #beginPendingClear(file: string): void {
        const marker = this.#clearMarker(file);
        if (fs.existsSync(marker)) {
            const stat = fs.lstatSync(marker);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== Buffer.byteLength(CLEAR_MARKER_CONTENT)) throw new TypeError("Unsafe translation credential clear marker.");
            if (fs.readFileSync(marker, "utf8") !== CLEAR_MARKER_CONTENT) throw new TypeError("Invalid translation credential clear marker.");
            return;
        }
        const descriptor = fs.openSync(marker, "wx", 0o600);
        try {fs.writeFileSync(descriptor, CLEAR_MARKER_CONTENT, "utf8"); fs.fsyncSync(descriptor);}
        finally {fs.closeSync(descriptor);}
    }

    #completePendingClear(file: string): void {
        const marker = this.#clearMarker(file);
        this.#beginPendingClear(file);
        const directory = path.dirname(file);
        const base = path.basename(file);
        for (const name of fs.readdirSync(directory)) {
            if (name !== base && !(name.startsWith(base) && TRANSIENT_SUFFIX.test(name.slice(base.length)))) continue;
            const candidate = path.join(directory, name);
            const stat = fs.lstatSync(candidate);
            if (!stat.isFile() || stat.isSymbolicLink()) throw new TypeError("Unsafe translation credential residue.");
            fs.unlinkSync(candidate);
        }
        const markerStat = fs.lstatSync(marker);
        if (!markerStat.isFile() || markerStat.isSymbolicLink()) throw new TypeError("Unsafe translation credential clear marker.");
        fs.unlinkSync(marker);
    }

    #root(create: boolean): string | undefined {
        const betterDiscord = path.resolve(resolveSolcordBetterDiscordRoot(app.getPath("userData")));
        const root = path.join(betterDiscord, "solcord-translation-credentials-v1");
        if (!fs.existsSync(root)) {
            if (!create) return;
            fs.mkdirSync(root, {recursive: true, mode: 0o700});
        }
        const stat = fs.lstatSync(root);
        if (!stat.isDirectory() || stat.isSymbolicLink() || path.resolve(fs.realpathSync.native(root)) !== root) throw new TypeError("Translation credential root is unsafe.");
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
                fs.writeFileSync(file, wrapped, {flag: "wx", mode: 0o600});
                this.#identity = Buffer.from(identity);
                return identity;
            }
            catch (error) {identity.fill(0); throw error;}
        }
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_WRAPPED_BYTES) throw new TypeError("Invalid translation identity key.");
        const identity = Buffer.from(safeStorage.decryptString(fs.readFileSync(file)), "base64");
        if (identity.length !== 32) throw new TypeError("Invalid translation identity key.");
        this.#identity = Buffer.from(identity);
        return identity;
    }

    #readRecord(file: string, provider: CredentialRecord["provider"], binding: string): CredentialRecord {
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_WRAPPED_BYTES) throw new TypeError("Invalid translation credential file.");
        const record = JSON.parse(safeStorage.decryptString(fs.readFileSync(file))) as Partial<CredentialRecord>;
        if (record.version !== 1 || record.provider !== provider || record.endpointHash !== binding || typeof record.credential !== "string" || record.credential.length < 1 || record.credential.length > 512 || hasUnsafeControl(record.credential)) throw new TypeError("Translation credential binding failed.");
        return record as CredentialRecord;
    }

    #recoverFile(file: string, provider: CredentialRecord["provider"], binding: string): void {
        const directory = path.dirname(file);
        const base = path.basename(file);
        const names = fs.readdirSync(directory);
        const backups = names.filter(name => name.startsWith(base) && /^\.\d+\.[0-9a-f]{8}\.old$/.test(name.slice(base.length)));
        const temporary = names.filter(name => name.startsWith(base) && /^\.\d+\.[0-9a-f]{8}\.tmp$/.test(name.slice(base.length)));
        if (backups.length > 1) throw new TypeError("Ambiguous translation credential recovery state.");
        for (const name of [...backups, ...temporary]) {
            const candidate = path.join(directory, name);
            const stat = fs.lstatSync(candidate);
            if (!stat.isFile() || stat.isSymbolicLink()) throw new TypeError("Unsafe translation credential recovery artifact.");
        }
        if (!fs.existsSync(file) && backups.length === 1) fs.renameSync(path.join(directory, backups[0]), file);
        const backup = backups.map(name => path.join(directory, name)).find(fs.existsSync);
        if (fs.existsSync(file) && backup) {
            try {this.#readRecord(file, provider, binding); fs.unlinkSync(backup);}
            catch {
                const displaced = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.old`;
                fs.renameSync(file, displaced);
                try {fs.renameSync(backup, file); this.#readRecord(file, provider, binding); fs.unlinkSync(displaced);}
                catch (error) {if (!fs.existsSync(file) && fs.existsSync(displaced)) fs.renameSync(displaced, file); throw error;}
            }
        }
        for (const name of temporary) fs.unlinkSync(path.join(directory, name));
    }

    #atomicReplace(file: string, wrapped: Buffer, provider: CredentialRecord["provider"], binding: string): void {
        const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
        const descriptor = fs.openSync(temporary, "wx", 0o600);
        try {fs.writeFileSync(descriptor, wrapped); fs.fsyncSync(descriptor);}
        finally {fs.closeSync(descriptor);}
        try {
            if (fs.existsSync(file)) {
                const stat = fs.lstatSync(file);
                if (!stat.isFile() || stat.isSymbolicLink()) throw new TypeError("Translation credential target is unsafe.");
                const backup = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.old`;
                fs.renameSync(file, backup);
                try {
                    fs.renameSync(temporary, file);
                    this.#readRecord(file, provider, binding);
                    fs.unlinkSync(backup);
                }
                catch (error) {
                    if (!fs.existsSync(file) && fs.existsSync(backup)) fs.renameSync(backup, file);
                    throw error;
                }
            }
            else {fs.renameSync(temporary, file); this.#readRecord(file, provider, binding);}
        }
        finally {
            try {if (fs.existsSync(temporary)) fs.unlinkSync(temporary);}
            catch {/* preserve primary error */}
        }
    }

    #serialized<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.#queue.then(operation, operation);
        this.#queue = result.then(() => undefined, () => undefined);
        return result;
    }
}

export default new SolcordTranslationCredentialStorage();
