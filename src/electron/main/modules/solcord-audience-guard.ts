// SPDX-License-Identifier: Apache-2.0

import crypto from "crypto";
import fs from "fs";
import path from "path";
import {app, safeStorage} from "electron";

import {resolveSolcordBetterDiscordRoot} from "./solcord-data-root";

interface AudienceEntry {
    userId: string;
    label?: string;
}

interface AudiencePolicy {
    version: 1;
    entries: AudienceEntry[];
}

const ACCOUNT_ID = /^\d{1,32}$/;
const STORE_DIRECTORY = /^store-[0-9a-f]{40}$/;
const MAX_ENTRIES = 100;
const MAX_POLICY_BYTES = 32 * 1024;
const MAX_WRAPPED_BYTES = 64 * 1024;

function normalizeEntries(value: unknown): AudienceEntry[] {
    if (!Array.isArray(value)) return [];
    const result: AudienceEntry[] = [];
    const seen = new Set<string>();
    for (const candidate of value) {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
        const entry = candidate as Record<string, unknown>;
        if (typeof entry.userId !== "string" || !ACCOUNT_ID.test(entry.userId) || seen.has(entry.userId)) continue;
        seen.add(entry.userId);
        const printableLabel = typeof entry.label === "string" ? [...entry.label].map(character => {
            const code = character.charCodeAt(0);
            return code < 32 || code === 127 ? " " : character;
        }).join("") : "";
        const label = printableLabel.replace(/\s+/g, " ").trim().slice(0, 80);
        result.push({userId: entry.userId, ...(label ? {label} : {})});
        if (result.length === MAX_ENTRIES) break;
    }
    return result;
}

function normalizePolicy(value: unknown): AudiencePolicy {
    const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const policy = {version: 1 as const, entries: normalizeEntries(record.entries)};
    if (Buffer.byteLength(JSON.stringify(policy), "utf8") > MAX_POLICY_BYTES) throw new RangeError("Audience Guard policy exceeds its storage limit.");
    return policy;
}

export class SolcordAudienceGuardStorage {
    #session = new Map<string, AudiencePolicy>();
    #identity?: Buffer;
    #failed = false;
    #queue = Promise.resolve();

    status(): {persistent: boolean; sessionOnly: boolean; reason?: string;} {
        return this.#secureAvailable()
            ? {persistent: true, sessionOnly: false}
            : {persistent: false, sessionOnly: true, reason: "Electron safeStorage is unavailable; the Audience Guard denylist remains in memory only."};
    }

    read(rawAccount: unknown, rawRequest: unknown): Promise<{policy: AudiencePolicy; persistent: boolean; complete: boolean;}> {
        const account = this.#account(rawAccount);
        this.#emptyRequest(rawRequest);
        return this.#serialized(async () => {
            if (!this.#secureAvailable()) return {policy: structuredClone(this.#session.get(account) ?? {version: 1, entries: []}), persistent: false, complete: true};
            try {
                const file = this.#policyFile(account, false);
                if (!file) return {policy: {version: 1, entries: []}, persistent: true, complete: true};
                const stat = fs.lstatSync(file);
                if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_WRAPPED_BYTES) throw new TypeError("Invalid Audience Guard policy file.");
                const wrapped = fs.readFileSync(file);
                if (wrapped.length <= 0 || wrapped.length > MAX_WRAPPED_BYTES) throw new TypeError("Invalid Audience Guard policy envelope.");
                const plaintext = safeStorage.decryptString(wrapped);
                try {return {policy: normalizePolicy(JSON.parse(plaintext)), persistent: true, complete: true};}
                finally {/* strings cannot be zeroed; never expose plaintext to diagnostics */}
            }
            catch {
                this.#failed = true;
                return {policy: structuredClone(this.#session.get(account) ?? {version: 1, entries: []}), persistent: false, complete: false};
            }
        });
    }

    write(rawAccount: unknown, rawRequest: unknown): Promise<{policy: AudiencePolicy; persistent: boolean; complete: boolean;}> {
        const account = this.#account(rawAccount);
        if (!rawRequest || typeof rawRequest !== "object" || Array.isArray(rawRequest)) throw new TypeError("Invalid Audience Guard write request.");
        const request = rawRequest as Record<string, unknown>;
        if (Object.hasOwn(request, "accountId") || Object.hasOwn(request, "accountScope")) throw new TypeError("Audience Guard requests cannot select an account.");
        const policy = normalizePolicy(request.policy);
        this.#session.set(account, structuredClone(policy));
        return this.#serialized(async () => {
            if (!this.#secureAvailable()) return {policy: structuredClone(policy), persistent: false, complete: true};
            try {
                const file = this.#policyFile(account, true)!;
                const wrapped = safeStorage.encryptString(JSON.stringify(policy));
                if (!Buffer.isBuffer(wrapped) || wrapped.length <= 0 || wrapped.length > MAX_WRAPPED_BYTES) throw new TypeError("Invalid Audience Guard encrypted policy.");
                this.#atomicWrite(file, wrapped);
                return {policy: structuredClone(policy), persistent: true, complete: true};
            }
            catch {
                this.#failed = true;
                return {policy: structuredClone(policy), persistent: false, complete: false};
            }
        });
    }

    clear(rawAccount: unknown, rawRequest: unknown): Promise<{cleared: number; persistent: boolean; complete: boolean;}> {
        const account = this.#account(rawAccount);
        this.#emptyRequest(rawRequest);
        const cleared = this.#session.get(account)?.entries.length ?? 0;
        this.#session.delete(account);
        return this.#serialized(async () => {
            try {
                const directory = this.#accountDirectory(account, false);
                if (!directory) return {cleared, persistent: this.#secureAvailable(), complete: true};
                this.#assertDirectory(directory);
                for (const name of fs.readdirSync(directory)) {
                    if (name !== "policy.scdb" && !/^policy\.scdb\.\d+\.[0-9a-f]{8}\.tmp$/.test(name)) continue;
                    const file = path.join(directory, name);
                    const stat = fs.lstatSync(file);
                    if (!stat.isFile() || stat.isSymbolicLink()) return {cleared, persistent: false, complete: false};
                    fs.unlinkSync(file);
                }
                if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
                return {cleared, persistent: this.#secureAvailable(), complete: true};
            }
            catch {return {cleared, persistent: false, complete: false};}
        });
    }

    #serialized<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.#queue.then(operation, operation);
        this.#queue = result.then(() => undefined, () => undefined);
        return result;
    }

    #account(value: unknown): string {
        if (typeof value !== "string" || !ACCOUNT_ID.test(value)) throw new TypeError("Invalid Audience Guard account scope.");
        return value;
    }

    #emptyRequest(value: unknown): void {
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid Audience Guard request.");
        const request = value as Record<string, unknown>;
        if (Object.keys(request).length || Object.hasOwn(request, "accountId") || Object.hasOwn(request, "accountScope")) throw new TypeError("Audience Guard request must be empty and cannot select an account.");
    }

    #secureAvailable(): boolean {
        if (this.#failed) return false;
        try {return safeStorage.isEncryptionAvailable();}
        catch {return false;}
    }

    #root(create: boolean): string | undefined {
        const betterDiscord = path.resolve(resolveSolcordBetterDiscordRoot(app.getPath("userData")));
        const root = path.join(betterDiscord, "solcord-audience-guard-v1");
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
            catch (error) {
                identity.fill(0);
                throw error;
            }
        }
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_WRAPPED_BYTES) throw new TypeError("Invalid Audience Guard identity file.");
        const plaintext = safeStorage.decryptString(fs.readFileSync(file));
        const identity = Buffer.from(plaintext, "base64");
        if (identity.length !== 32) throw new TypeError("Invalid Audience Guard identity key.");
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
        if (!STORE_DIRECTORY.test(path.basename(directory))) throw new TypeError("Invalid Audience Guard store directory.");
        if (!fs.existsSync(directory)) {
            if (!create) return;
            fs.mkdirSync(directory, {recursive: false, mode: 0o700});
        }
        this.#assertDirectory(directory);
        this.#assertWithin(directory, root);
        return directory;
    }

    #policyFile(account: string, create: boolean): string | undefined {
        const directory = this.#accountDirectory(account, create);
        if (!directory) return;
        const file = path.join(directory, "policy.scdb");
        this.#assertWithin(file, directory);
        return fs.existsSync(file) || create ? file : undefined;
    }

    #assertDirectory(directory: string): void {
        const stat = fs.lstatSync(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new TypeError("Audience Guard storage directory is unsafe.");
        const real = fs.realpathSync.native(directory);
        if (path.resolve(real) !== path.resolve(directory)) throw new TypeError("Audience Guard storage directory resolves through a link.");
    }

    #assertWithin(target: string, root: string): void {
        const resolvedRoot = path.resolve(root);
        const resolvedTarget = path.resolve(target);
        if (resolvedTarget === resolvedRoot || !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) throw new TypeError("Audience Guard storage path escapes its root.");
    }

    #atomicWrite(target: string, content: Buffer): void {
        const directory = path.dirname(target);
        this.#assertDirectory(directory);
        this.#assertWithin(target, directory);
        const temporary = `${target}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
        fs.writeFileSync(temporary, content, {flag: "wx", mode: 0o600});
        try {fs.renameSync(temporary, target);}
        catch (error) {
            try {if (fs.existsSync(temporary)) fs.unlinkSync(temporary);}
            catch {/* preserve ambiguous residue */}
            throw error;
        }
    }
}

export default new SolcordAudienceGuardStorage();
