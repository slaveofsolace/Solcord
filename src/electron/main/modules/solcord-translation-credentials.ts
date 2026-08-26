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
            if (!this.#secureAvailable()) return {credential: this.#session.get(key)?.credential ?? "", persistent: false, complete: true};
            try {
                const file = this.#file(account, provider, binding, false);
                if (!file) return {credential: "", persistent: true, complete: true};
                const stat = fs.lstatSync(file);
                if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_WRAPPED_BYTES) throw new TypeError("Invalid translation credential file.");
                const record = JSON.parse(safeStorage.decryptString(fs.readFileSync(file))) as Partial<CredentialRecord>;
                if (record.version !== 1 || record.provider !== provider || record.endpointHash !== binding || typeof record.credential !== "string" || record.credential.length < 1 || record.credential.length > 512 || hasUnsafeControl(record.credential)) throw new TypeError("Translation credential binding failed.");
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
            if (!this.#secureAvailable()) return {persistent: false, complete: true};
            try {
                const file = this.#file(account, record.provider, record.endpointHash, true)!;
                const wrapped = safeStorage.encryptString(JSON.stringify(record));
                if (!Buffer.isBuffer(wrapped) || wrapped.length <= 0 || wrapped.length > MAX_WRAPPED_BYTES) throw new TypeError("Invalid encrypted translation credential.");
                const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
                fs.writeFileSync(temporary, wrapped, {flag: "wx", mode: 0o600});
                try {fs.renameSync(temporary, file);}
                catch (error) {
                    try {if (fs.existsSync(temporary)) fs.unlinkSync(temporary);}
                    catch {/* preserve ambiguous residue for manual recovery */}
                    throw error;
                }
                return {persistent: true, complete: true};
            }
            catch {return {persistent: false, complete: false};}
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
        this.#session.delete(`${account}:${provider}:${binding}`);
        return this.#serialized(async () => {
            try {
                const file = this.#file(account, provider, binding, false);
                if (file) fs.unlinkSync(file);
                return {persistent: this.#secureAvailable(), complete: true};
            }
            catch {return {persistent: false, complete: false};}
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
        return fs.existsSync(file) || create ? file : undefined;
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

    #serialized<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.#queue.then(operation, operation);
        this.#queue = result.then(() => undefined, () => undefined);
        return result;
    }
}

export default new SolcordTranslationCredentialStorage();
