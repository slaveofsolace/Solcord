import fs from "@polyfill/fs";
import path from "path";
import crypto from "@polyfill/crypto";
import {deepEqual} from "fast-equals";
import Store from "./base";
import Config from "./config";
import Logger from "@common/logger";
import {useCallback, useSyncExternalStore} from "react";


export type Files = "settings" | "plugins" | "themes" | "misc" | "addon-store";

function parseData(text: string): Record<string, unknown> {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Settings data must be a JSON object.");
    return value as Record<string, unknown>;
}

class JsonStore extends Store {
    private cache: Record<Files, Record<string, unknown> | undefined> = {
        "settings": undefined,
        "plugins": undefined,
        "themes": undefined,
        "misc": undefined,
        "addon-store": undefined
    };

    private pluginCache: Record<string, Record<string, unknown>> = {};
    private pluginListeners = new Map<string, {
        keys: Map<string, Set<(newData?: unknown) => void>>,
        all: Set<(key: string, newData?: unknown) => void>;
    }>();

    // Normal BD data
    public get(file: Files): Record<string, unknown>;
    public get(file: Files, key: string): unknown;
    public get(file: Files, key?: string) {
        this.cache[file] = this.#ensureData(file);
        if (typeof key === "undefined") return this.cache[file] ?? {};
        return this.cache[file][key] ?? "";
    }

    public set(file: Files, key: Record<string, unknown>): void;
    public set(file: Files, key: string, value: unknown): void;
    public set(file: Files, key: Record<string, unknown> | string, value?: unknown) {
        this.cache[file] = this.#ensureData(file);
        if (typeof value === "undefined") {
            if (typeof key === "string") throw new Error("Cannot save string as JSON");
            this.#save(file, key);
            this.cache[file] = key;
        }
        else {
            if (typeof key !== "string") throw new Error("Cannot use object as key");
            this.#save(file, {...this.cache[file], [key]: value});
            this.cache[file][key] = value;
        }
        this.#notifyCommitted();
    }

    public delete(file: Files, key: string) {
        this.cache[file] = this.#ensureData(file);
        const next = {...this.cache[file]};
        delete next[key];
        this.#save(file, next);
        delete this.cache[file][key];
        this.#notifyCommitted();
    }

    #ensureData(file: Files): Record<string, unknown> {
        if (typeof (this.cache[file]) !== "undefined") return this.cache[file]; // Already have data cached
        let data;
        try {
            data = parseData(fs.readFileSync(path.resolve(Config.get("channelPath"), `${file}.json`)).toString());
        }
        catch {
            data = {};
        }
        return data;
    }

    #save(file: Files, value: Record<string, unknown>) {
        this.#writeJson(path.resolve(Config.get("channelPath"), `${file}.json`), value);
    }

    #writeJson(target: string, value: Record<string, unknown>) {
        // Serialize before touching disk, then publish the complete file once.
        // Cache mutation and notification happen only after this succeeds.
        const content = JSON.stringify(value, null, 4);
        const temporary = `${target}.${crypto.randomBytes(16).toString("hex")}.tmp`;
        try {
            fs.writeFileSync(temporary, content, {flag: "wx", originalFs: false});
            fs.renameSync(temporary, target);
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") {
                try {if (fs.existsSync(temporary)) fs.unlinkSync(temporary);}
                catch {/* preserve the original write error */}
            }
            throw error;
        }
    }

    #notifyCommitted() {
        try {this.emitChange();}
        catch {Logger.warn("JsonStore", "A settings listener failed after the data was saved.");}
    }

    // Plugin data
    #getPluginFile(pluginName: string) {
        return path.resolve(Config.get("pluginsPath"), pluginName + ".config.json");
    }

    #ensurePluginData(pluginName: string) {
        if (typeof (this.pluginCache[pluginName]) !== "undefined") return; // Already have data cached

        // Setup blank data if config doesn't exist
        if (!fs.existsSync(this.#getPluginFile(pluginName))) return this.pluginCache[pluginName] = {};

        try {
            // Getting here means not cached, read from disk
            this.pluginCache[pluginName] = parseData(fs.readFileSync(this.#getPluginFile(pluginName)).toString());
        }
        catch {
            // Setup blank data if parse fails
            return this.pluginCache[pluginName] = {};
        }
    }

    public recache(pluginName: string) {
        this.#ensurePluginData(pluginName);
        const before = this.pluginCache[pluginName];

        try {
            this.pluginCache[pluginName] = parseData(fs.readFileSync(this.#getPluginFile(pluginName)).toString());
            if (!deepEqual(before, this.pluginCache[pluginName])) this.#notifyCommitted();
            return true;
        }
        catch (err) {
            Logger.error("JsonStore", "recache: ", err);
            return false;
        }
        finally {
            const after = this.pluginCache[pluginName];

            const beforeKeys = Object.keys(before);
            const afterKeys = Object.keys(after);

            const beforeSet = new Set(beforeKeys);
            const afterSet = new Set(afterKeys);

            const result: {
                deleted: string[];
                changed: string[];
            } = {
                deleted: [],
                changed: []
            };

            for (const k of beforeSet) {
                if (!afterSet.has(k)) result.deleted.push(k);
                else if (!deepEqual(before[k], after[k])) result.changed.push(k);
            }

            for (const k of afterSet) {
                if (!beforeSet.has(k)) {
                    result.changed.push(k);
                }
            }

            for (const key of result.changed) {
                this.emitPluginChangeListeners(pluginName, key, after[key]);
            }

            for (const key of result.deleted) {
                this.emitPluginChangeListeners(pluginName, key);
            }
        }
    }

    #savePluginData(pluginName: string, value: Record<string, unknown>) {
        this.#writeJson(this.#getPluginFile(pluginName), value);
    }

    public getData<T>(pluginName: string, key: string): T {
        this.#ensurePluginData(pluginName); //       Ensure plugin data, if any, is cached
        return this.pluginCache[pluginName][key] as T; // Return blindly to allow falsey values
    }

    public useData<T>(pluginName: string, key: string): T {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const subscribe = useCallback((notify: () => void) => this.addPluginChangeListener(pluginName, notify, key), [pluginName, key]);
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const snapshot = useCallback(() => this.getData<T>(pluginName, key), [pluginName, key]);
        // eslint-disable-next-line react-hooks/rules-of-hooks
        return useSyncExternalStore(subscribe, snapshot, snapshot);
    }

    public setData(pluginName: string, key: string, value: unknown) {
        if (value === undefined) return; // Can't set undefined, use deletePluginData
        this.#ensurePluginData(pluginName); // Ensure plugin data, if any, is cached

        this.#savePluginData(pluginName, {...this.pluginCache[pluginName], [key]: value});
        this.pluginCache[pluginName][key] = value;
        this.#notifyCommitted();
        this.emitPluginChangeListeners(pluginName, key, value);
    }

    public deleteData(pluginName: string, key: string) {
        this.#ensurePluginData(pluginName); // Ensure plugin data, if any, is cached
        const next = {...this.pluginCache[pluginName]};
        delete next[key];
        this.#savePluginData(pluginName, next);
        delete this.pluginCache[pluginName][key];
        this.#notifyCommitted();
        this.emitPluginChangeListeners(pluginName, key);
    }

    private emitPluginChangeListeners(pluginName: string, key: string, newData?: unknown) {
        if (!this.pluginListeners.has(pluginName)) return;

        const pluginListeners = this.pluginListeners.get(pluginName)!;

        for (const element of pluginListeners.all) {
            // So plugins can do arguments.length === 1 to see if it was a delete
            try {
                if (arguments.length === 3) element(key, newData);
                else element(key);
            }
            catch {Logger.warn("JsonStore", "A plugin data listener failed after the data was saved.");}
        }

        if (!pluginListeners.keys.has(key)) return;

        const listeners = pluginListeners.keys.get(key)!;

        for (const element of listeners) {
            // So plugins can do arguments.length === 0 to see if it was a delete
            try {
                if (arguments.length === 3) element(newData);
                else element();
            }
            catch {Logger.warn("JsonStore", "A plugin data listener failed after the data was saved.");}
        }
    }

    public addPluginChangeListener(pluginName: string, callback: any, key?: string | undefined) {
        if (!this.pluginListeners.has(pluginName)) {
            this.pluginListeners.set(pluginName, {
                keys: new Map(),
                all: new Set()
            });
        }

        const listeners = this.pluginListeners.get(pluginName)!;

        if (typeof key === "string") {
            if (!listeners.keys.has(key)) listeners.keys.set(key, new Set());

            const keyListeners = listeners.keys.get(key)!;
            keyListeners.add(callback);

            return () => void keyListeners.delete(callback);
        }

        listeners.all.add(callback);
        return () => void listeners.all.delete(callback);
    }
    public removePluginChangeListener(pluginName: string, callback: any, key?: string | undefined) {
        if (!this.pluginListeners.has(pluginName)) return;

        const listeners = this.pluginListeners.get(pluginName)!;

        if (typeof key === "string") {
            if (!listeners.keys.has(key)) return;

            listeners.keys.get(key)!.delete(callback);
            return;
        }

        listeners.all.delete(callback);
    }
};

export default new JsonStore();
