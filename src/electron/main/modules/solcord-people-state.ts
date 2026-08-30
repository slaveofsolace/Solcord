// SPDX-License-Identifier: Apache-2.0

import crypto from "crypto";
import fs from "fs";
import path from "path";
import {app, safeStorage} from "electron";

import {resolveSolcordBetterDiscordRoot} from "./solcord-data-root";

export interface SolcordPeoplePrivateState {
    version: 3;
    pinnedDmIds: string[];
    hiddenGuildIds: string[];
    guildAliases: Record<string, string>;
    favoriteFriendIds: string[];
    hiddenFriendIds: string[];
    ignoredVoiceChannelIds: string[];
    ignoredVoiceGuildIds: string[];
}

const DISCORD_ID = /^\d{1,32}$/;
const STORE_DIRECTORY = /^store-[0-9a-f]{40}$/;
const MAX_IDS = 500;
const MAX_ALIAS_LENGTH = 80;
const MAX_DOCUMENT_BYTES = 128 * 1024;
const MAX_WRAPPED_BYTES = 256 * 1024;
const BACKUP_FILE = /^state\.scdb\.\d+\.[0-9a-f]{8}\.old$/;
const TEMPORARY_FILE = /^state\.scdb\.\d+\.[0-9a-f]{8}\.tmp$/;

function normalizeIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const result: string[] = [];
    const seen = new Set<string>();
    for (const candidate of value) {
        if (typeof candidate !== "string" || !DISCORD_ID.test(candidate) || seen.has(candidate)) continue;
        seen.add(candidate);
        result.push(candidate);
        if (result.length === MAX_IDS) break;
    }
    return result;
}

function normalizeAlias(value: unknown): string {
    if (typeof value !== "string") return "";
    return [...value]
        .map(character => {
            const code = character.charCodeAt(0);
            return code < 32 || code === 127 ? " " : character;
        })
        .join("")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_ALIAS_LENGTH);
}

export function normalizeSolcordPeoplePrivateState(value: unknown): SolcordPeoplePrivateState {
    const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const aliases = record.guildAliases && typeof record.guildAliases === "object" && !Array.isArray(record.guildAliases)
        ? record.guildAliases as Record<string, unknown>
        : {};
    const guildAliases: Record<string, string> = {};
    for (const [guildId, rawAlias] of Object.entries(aliases)) {
        if (!DISCORD_ID.test(guildId)) continue;
        const alias = normalizeAlias(rawAlias);
        if (alias) guildAliases[guildId] = alias;
        if (Object.keys(guildAliases).length === MAX_IDS) break;
    }
    const state: SolcordPeoplePrivateState = {
        version: 3,
        pinnedDmIds: normalizeIds(record.pinnedDmIds),
        hiddenGuildIds: normalizeIds(record.hiddenGuildIds),
        guildAliases,
        favoriteFriendIds: normalizeIds(record.favoriteFriendIds),
        hiddenFriendIds: normalizeIds(record.hiddenFriendIds),
        ignoredVoiceChannelIds: normalizeIds(record.ignoredVoiceChannelIds),
        ignoredVoiceGuildIds: normalizeIds(record.ignoredVoiceGuildIds)
    };
    if (Buffer.byteLength(JSON.stringify(state), "utf8") > MAX_DOCUMENT_BYTES) throw new RangeError("People and Spaces state exceeds its storage limit.");
    return state;
}

const EMPTY_STATE: SolcordPeoplePrivateState = {version: 3, pinnedDmIds: [], hiddenGuildIds: [], guildAliases: {}, favoriteFriendIds: [], hiddenFriendIds: [], ignoredVoiceChannelIds: [], ignoredVoiceGuildIds: []};

export class SolcordPeopleStateStorage {
    #session = new Map<string, SolcordPeoplePrivateState>();
    #identity?: Buffer;
    #failed = false;
    #queue = Promise.resolve();

    status(): {persistent: boolean; sessionOnly: boolean; reason?: string;} {
        return this.#secureAvailable()
            ? {persistent: true, sessionOnly: false}
            : {persistent: false, sessionOnly: true, reason: "Electron safeStorage is unavailable; People and Spaces changes remain in memory only."};
    }

    read(rawAccount: unknown, rawRequest: unknown): Promise<{state: SolcordPeoplePrivateState; persistent: boolean; complete: boolean;}> {
        const account = this.#account(rawAccount);
        this.#emptyRequest(rawRequest);
        return this.#serialized(async () => {
            if (!this.#secureAvailable()) return {state: structuredClone(this.#session.get(account) ?? EMPTY_STATE), persistent: false, complete: true};
            try {
                const directory = this.#accountDirectory(account, false);
                if (!directory) return {state: structuredClone(EMPTY_STATE), persistent: true, complete: true};
                this.#recover(directory);
                const file = path.join(directory, "state.scdb");
                if (!fs.existsSync(file)) return {state: structuredClone(EMPTY_STATE), persistent: true, complete: true};
                return {state: this.#readFile(file), persistent: true, complete: true};
            }
            catch {
                this.#failed = true;
                return {state: structuredClone(this.#session.get(account) ?? EMPTY_STATE), persistent: false, complete: false};
            }
        });
    }

    write(rawAccount: unknown, rawRequest: unknown): Promise<{state: SolcordPeoplePrivateState; persistent: boolean; complete: boolean;}> {
        const account = this.#account(rawAccount);
        if (!rawRequest || typeof rawRequest !== "object" || Array.isArray(rawRequest)) throw new TypeError("Invalid People and Spaces write request.");
        const request = rawRequest as Record<string, unknown>;
        if (Object.hasOwn(request, "accountId") || Object.hasOwn(request, "accountScope")) throw new TypeError("People and Spaces requests cannot select an account.");
        const state = normalizeSolcordPeoplePrivateState(request.state);
        this.#session.set(account, structuredClone(state));
        return this.#serialized(async () => {
            if (!this.#secureAvailable()) return {state: structuredClone(state), persistent: false, complete: true};
            try {
                const directory = this.#accountDirectory(account, true)!;
                this.#recover(directory);
                const wrapped = safeStorage.encryptString(JSON.stringify(state));
                if (!Buffer.isBuffer(wrapped) || wrapped.length <= 0 || wrapped.length > MAX_WRAPPED_BYTES) throw new TypeError("Invalid encrypted People and Spaces state.");
                this.#atomicWrite(path.join(directory, "state.scdb"), wrapped, true);
                return {state: structuredClone(state), persistent: true, complete: true};
            }
            catch {
                this.#failed = true;
                return {state: structuredClone(state), persistent: false, complete: false};
            }
        });
    }

    clear(rawAccount: unknown, rawRequest: unknown): Promise<{cleared: boolean; persistent: boolean; complete: boolean;}> {
        const account = this.#account(rawAccount);
        this.#emptyRequest(rawRequest);
        const cleared = this.#session.delete(account);
        return this.#serialized(async () => {
            try {
                const directory = this.#accountDirectory(account, false);
                if (!directory) return {cleared, persistent: this.#secureAvailable(), complete: true};
                this.#assertDirectory(directory);
                for (const name of fs.readdirSync(directory)) {
                    if (name !== "state.scdb" && !TEMPORARY_FILE.test(name) && !BACKUP_FILE.test(name)) continue;
                    const file = path.join(directory, name);
                    const stat = fs.lstatSync(file);
                    if (!stat.isFile() || stat.isSymbolicLink()) return {cleared, persistent: false, complete: false};
                    fs.unlinkSync(file);
                }
                if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
                return {cleared: true, persistent: this.#secureAvailable(), complete: true};
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
        if (typeof value !== "string" || !DISCORD_ID.test(value)) throw new TypeError("Invalid People and Spaces account scope.");
        return value;
    }

    #emptyRequest(value: unknown): void {
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid People and Spaces request.");
        const request = value as Record<string, unknown>;
        if (Object.keys(request).length || Object.hasOwn(request, "accountId") || Object.hasOwn(request, "accountScope")) throw new TypeError("People and Spaces request must be empty and cannot select an account.");
    }

    #secureAvailable(): boolean {
        if (this.#failed) return false;
        try {return safeStorage.isEncryptionAvailable();}
        catch {return false;}
    }

    #root(create: boolean): string | undefined {
        const betterDiscord = path.resolve(resolveSolcordBetterDiscordRoot(app.getPath("userData")));
        const root = path.join(betterDiscord, "solcord-people-state-v1");
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
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_WRAPPED_BYTES) throw new TypeError("Invalid People and Spaces identity file.");
        const identity = Buffer.from(safeStorage.decryptString(fs.readFileSync(file)), "base64");
        if (identity.length !== 32) throw new TypeError("Invalid People and Spaces identity key.");
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
        if (!STORE_DIRECTORY.test(path.basename(directory))) throw new TypeError("Invalid People and Spaces store directory.");
        if (!fs.existsSync(directory)) {
            if (!create) return;
            fs.mkdirSync(directory, {recursive: false, mode: 0o700});
        }
        this.#assertDirectory(directory);
        this.#assertWithin(directory, root);
        return directory;
    }

    #assertDirectory(directory: string): void {
        const stat = fs.lstatSync(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new TypeError("People and Spaces storage directory is unsafe.");
        if (path.resolve(fs.realpathSync.native(directory)) !== path.resolve(directory)) throw new TypeError("People and Spaces storage directory resolves through a link.");
    }

    #assertWithin(target: string, root: string): void {
        const resolvedRoot = path.resolve(root);
        const resolvedTarget = path.resolve(target);
        if (resolvedTarget === resolvedRoot || !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) throw new TypeError("People and Spaces storage path escapes its root.");
    }

    #readFile(file: string): SolcordPeoplePrivateState {
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_WRAPPED_BYTES) throw new TypeError("Invalid People and Spaces state file.");
        return normalizeSolcordPeoplePrivateState(JSON.parse(safeStorage.decryptString(fs.readFileSync(file))));
    }

    #recover(directory: string): void {
        this.#assertDirectory(directory);
        const target = path.join(directory, "state.scdb");
        const names = fs.readdirSync(directory);
        const backups = names.filter(name => BACKUP_FILE.test(name));
        const temporary = names.filter(name => TEMPORARY_FILE.test(name));
        if (backups.length > 1) throw new TypeError("Ambiguous People and Spaces recovery state.");
        for (const name of [...backups, ...temporary]) {
            const candidate = path.join(directory, name);
            this.#assertWithin(candidate, directory);
            const stat = fs.lstatSync(candidate);
            if (!stat.isFile() || stat.isSymbolicLink()) throw new TypeError("Unsafe People and Spaces recovery artifact.");
        }
        if (!fs.existsSync(target) && backups.length === 1) fs.renameSync(path.join(directory, backups[0]), target);
        const backup = backups.map(name => path.join(directory, name)).find(fs.existsSync);
        if (fs.existsSync(target) && backup) {
            try {this.#readFile(target); fs.unlinkSync(backup);}
            catch {
                const displaced = `${target}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.old`;
                fs.renameSync(target, displaced);
                try {fs.renameSync(backup, target); this.#readFile(target); fs.unlinkSync(displaced);}
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
                if (!stat.isFile() || stat.isSymbolicLink()) throw new TypeError("People and Spaces state target is unsafe.");
                const backup = `${target}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.old`;
                fs.renameSync(target, backup);
                try {fs.renameSync(temporary, target); this.#readFile(target); fs.unlinkSync(backup);}
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

export default new SolcordPeopleStateStorage();
