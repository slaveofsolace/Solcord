import Logger from "@common/logger";

import Config from "@stores/config";
import Toasts from "@stores/toasts";

import AddonManager from "./addonmanager";
import {type Addon} from "@typed/addon";
import {t} from "@common/i18n";
import Events from "./emitter";
import PluginDoctor, {type AddonFailure} from "./solcord/doctor";
import {checkReviewedExecution} from "./solcord/integrity";
import {bdfdbRequiredByEnabledAddon, pluginRuntimeHookRequirements} from "./solcord/plugin-startup-policy";
import {communityAddonSourceSha256} from "./solcord/addon-outbound-policy";

type PluginLoadPoint = "connection" | "idle";

export interface Plugin extends Addon {
    exports: any;
    requiresBdfdb?: boolean;
    sourceSha256?: string;
    instance: {
        icon?: any;
        load?(): void;
        start(): void;
        stop(): void;
        observer?(m: MutationRecord): void;
        getSettingsPanel?(): any;
        onSwitch?(): void;
    };
}

const normalizeExports = `
if (module.exports.default) {
    module.exports = module.exports.default;
}`;

class PluginManager extends AddonManager<Plugin> {
    name = "PluginManager";
    extension = ".plugin.js";
    duplicatePattern = /\.plugin\s?\([0-9]+\)\.js/;
    addonFolder = Config.get("pluginsPath");
    prefix = "plugin" as const;
    language = "javascript";
    order = 3;

    observer: MutationObserver;
    #observerActive = false;
    #navigationActive = false;
    #activePluginIds = new Set<string>();
    #cleanupBlockedPluginIds = new Set<string>();

    constructor() {
        super();
        this.onSwitch = this.onSwitch.bind(this);
        this.observer = new MutationObserver((mutations) => {
            for (let i = 0, mlen = mutations.length; i < mlen; i++) {
                this.onMutation(mutations[i]);
            }
        });
    }

    initialize() {
        const errors = super.initialize();
        this.setupFunctions();
        return errors;
    }

    startAddons(point: PluginLoadPoint) {
        Logger.log("PluginManager", `Loading addons at point: ${point}`);
        const activationEligible = this.addonList.filter(addon => this.addonActivationDisposition(addon) === "allowed");
        const bdfdbRequired = bdfdbRequiredByEnabledAddon(activationEligible, this.state);

        for (const addon of this.addonList) {
            const dependencyRequired = addon.filename.toLocaleLowerCase("en-US") === "0bdfdb.plugin.js" && bdfdbRequired;
            if (addon.runAt !== point || !(this.state[addon.id] || dependencyRequired)) continue;
            if (this.#isDoctorQuarantined(addon)) {
                this.state[addon.id] = false;
                this.saveState();
                continue;
            }
            this.startAddon(addon);
        }

        this.#releaseUnusedBdfdbDependency();

        if (point === "idle") this.finishInit();
    }

    initAddon(plugin: Plugin) {
        plugin.sourceSha256 = communityAddonSourceSha256(plugin.fileContent ?? "");
        plugin.requiresBdfdb = plugin.filename.toLocaleLowerCase("en-US") !== "0bdfdb.plugin.js"
            && typeof plugin.fileContent === "string"
            && /\bBDFDB_Global\b/.test(plugin.fileContent);
        const executionCheck = checkReviewedExecution("plugin", plugin.filename, plugin.name, plugin.fileContent ?? "");
        if (executionCheck.reviewed && !executionCheck.matches) {
            const name = executionCheck.name ?? plugin.filename;
            const reason = "Installed bytes changed after Solcord review; execution was stopped before the plugin was evaluated.";
            this.state[plugin.id] = false;
            this.saveState();
            PluginDoctor.quarantine(name, reason);
            Toasts.warning(`${name} changed after review and was quarantined before execution.`);
            return false;
        }

        // Evaluate the plugin
        try {
            const module = {filename: plugin.filename, exports: {}};

            plugin.fileContent += normalizeExports + `\n//# sourceURL=betterdiscord://betterdiscord/plugins/${plugin.filename}`;

            // Wrap the plugin in a function and run it
            const wrappedPlugin = new Function("require", "module", "exports", "__filename", "__dirname", plugin.fileContent!); // eslint-disable-line no-new-func
            wrappedPlugin(window.require, module, module.exports, module.filename, this.addonFolder);

            plugin.exports = module.exports;
            delete plugin.fileContent;
        }
        catch (err) {
            this.recordDoctorFailure(plugin, "compile", err);
            this.showAddonError(plugin, t("Addons.compileError"), {
                message: (err as Error).message,
                stack: (err as Error).stack
            });
            return false;
        }

        // Confirm the plugin has a name
        if (!plugin.exports || !plugin.name) {
            this.showAddonError(plugin, "Plugin had no exports or @name property", {
                message: "Plugin had no exports or no @name property. @name property is required for all addons.",
                stack: ""
            });
            return false;
        }

        // Confirm the exports are valid
        if (typeof plugin.exports !== "function") {
            this.showAddonError(plugin, "Plugin not a valid format.", {
                message: "Plugins should be either a function or a class",
                stack: ""
            });
            return false;
        }

        const meta = Object.assign({}, plugin);
        const exports = plugin.exports;
        delete meta.exports;

        try {
            // Load the plugin instance
            const instance = exports.prototype ? new exports(meta) : exports(meta);

            // Confirm the required methods are present
            if (!instance.start || !instance.stop) {
                this.showAddonError(plugin, "Missing start or stop function.", {
                    message: "Plugins must have both a start and stop function.",
                    stack: ""
                });
                return false;
            }

            plugin.instance = instance;
            plugin.name = instance.getName ? instance.getName() : plugin.name;
            plugin.author = instance.getAuthor ? instance.getAuthor() : plugin.author;
            plugin.description = instance.getDescription ? instance.getDescription() : plugin.description;
            plugin.version = instance.getVersion ? instance.getVersion() : plugin.version;

            // Confirm required fields are present
            if (!plugin.name || !plugin.author || !plugin.description || !plugin.version) {
                this.showAddonError(plugin, "Plugin is missing name, author, description, or version", {
                    message: "Plugin must provide name, author, description, and version.",
                    stack: ""
                });
                return false;
            }

            // Run the plugin's load function
            try {
                if (typeof instance.load === "function") instance.load();
                return true;
            }
            catch (err) {
                this.recordDoctorFailure(plugin, "load", err);
                this.state[plugin.id] = false;
                this.showAddonError(plugin, t("Addons.methodError", {method: "load()"}), {
                    message: (err as Error).message,
                    stack: (err as Error).stack
                });
                return false;
            }
        }
        catch (err) {
            this.recordDoctorFailure(plugin, "construct", err);
            this.showAddonError(plugin, t("Addons.methodError", {method: "Plugin constructor()"}), {
                message: (err as Error).message,
                stack: (err as Error).stack
            });
            return false;
        }
    }

    startAddon(idOrAddon: string | Plugin) {
        const plugin = this.resolveAddon(idOrAddon);
        if (!plugin) return false;
        if (!this.approveAddonActivation(plugin)) {
            this.#refreshRuntimeHooks();
            return false;
        }
        if (this.#isDoctorQuarantined(plugin)) {
            this.state[plugin.id] = false;
            this.saveState();
            Toasts.warning(`${plugin.name} is quarantined by Solcord. Retry it manually from Solcord Suite.`);
            this.#releaseUnusedBdfdbDependency();
            return false;
        }
        if (this.#cleanupBlockedPluginIds.has(plugin.id)) {
            this.state[plugin.id] = false;
            this.saveState();
            Toasts.warning(`${plugin.name} could not be restarted because its previous cleanup did not finish. Restart Discord before retrying it.`);
            return false;
        }
        if (this.#activePluginIds.has(plugin.id)) return true;
        if (!this.#ensureBdfdbDependency(plugin)) {
            this.state[plugin.id] = false;
            this.saveState();
            Toasts.warning(`${plugin.name} requires BDFDB, but the dependency is missing, quarantined, or failed to start.`);
            this.#refreshRuntimeHooks();
            return false;
        }

        if (!plugin.instance) {
            const loaded = this.loadAddon(plugin);
            if (!loaded) {
                this.saveState();
                this.#refreshRuntimeHooks();
                return false;
            }
        }

        try {
            plugin.instance.start();
        }
        catch (err) {
            let cleanupError: unknown;
            try {plugin.instance.stop();}
            catch (error) {cleanupError = error;}
            this.recordDoctorFailure(plugin, "start", err, true);
            if (cleanupError) {
                this.recordDoctorFailure(plugin, "stop", cleanupError);
                PluginDoctor.quarantine(plugin.id, "Cleanup failed after an unsuccessful start; manual recovery is required before retrying.");
                this.#cleanupBlockedPluginIds.add(plugin.id);
                Logger.stacktrace(this.name, `${plugin.name} cleanup after a failed start also failed.`, cleanupError as Error);
            }
            // Disable the addon if it can't be started
            this.state[plugin.id] = false;
            this.saveState();
            this.trigger("disabled", plugin);
            this.#refreshRuntimeHooks();
            this.#releaseUnusedBdfdbDependency();
            Toasts.warning(t("Addons.couldNotStart", {name: plugin.name, version: plugin.version}));
            Logger.stacktrace(this.name, `${plugin.name} v${plugin.version} could not be started.`, err as Error);

            this.showAddonError(plugin, t("Addons.methodError", {method: "start()"}), {
                message: (err as Error).message,
                stack: (err as Error).stack
            });

            return false;
        }

        this.#activePluginIds.add(plugin.id);
        this.trigger("started", plugin.id);
        PluginDoctor.recordSuccessfulStart(plugin.id);
        this.#refreshRuntimeHooks();
        if (this.hasInitialized) Toasts.success(t("Addons.enabled", {name: plugin.name, version: plugin.version}));
        else this.initialAddonsLoaded++;

        return true;
    }

    stopAddon(idOrAddon: string | Plugin, options: {silent?: boolean;} = {}) {
        const plugin = this.resolveAddon(idOrAddon);
        if (!plugin) return false;
        if (!this.#activePluginIds.has(plugin.id)) return true;

        try {
            plugin.instance?.stop();
        }
        catch (err) {
            this.recordDoctorFailure(plugin, "stop", err);
            PluginDoctor.quarantine(plugin.id, "Cleanup failed while disabling this addon; manual recovery is required before retrying.");
            this.#cleanupBlockedPluginIds.add(plugin.id);
            this.state[plugin.id] = false;
            this.saveState();
            this.#refreshRuntimeHooks();
            Toasts.warning(t("Addons.couldNotStop", {name: plugin.name, version: plugin.version}));
            Logger.stacktrace(this.name, `${plugin.name} v${plugin.version} could not be stopped.`, err as Error);

            this.showAddonError(plugin, t("Addons.methodError", {method: "stop()"}), {
                message: (err as Error).message,
                stack: (err as Error).stack
            });

            return false;
        }

        this.#activePluginIds.delete(plugin.id);
        this.#cleanupBlockedPluginIds.delete(plugin.id);
        this.trigger("stopped", plugin.id);
        this.#refreshRuntimeHooks();
        if (!options.silent) Toasts.error(t("Addons.disabled", {name: plugin.name, version: plugin.version}));
        if (!this.#isBdfdb(plugin)) this.#releaseUnusedBdfdbDependency();

        return true;
    }

    setupFunctions() {
        this.#refreshRuntimeHooks();
    }

    #refreshRuntimeHooks() {
        const activeState = Object.fromEntries(this.addonList.map(addon => [addon.id, this.#activePluginIds.has(addon.id)]));
        const required = pluginRuntimeHookRequirements(this.addonList, activeState);
        if (required.mutationObserver !== this.#observerActive) {
            this.#observerActive = required.mutationObserver;
            if (required.mutationObserver) this.observer.observe(document, {childList: true, subtree: true});
            else this.observer.disconnect();
        }

        if (required.navigationListener === this.#navigationActive) return;
        this.#navigationActive = required.navigationListener;
        if (required.navigationListener) Events.on("navigate", this.onSwitch);
        else Events.off("navigate", this.onSwitch);
    }

    override unloadAddon(idOrFileOrAddon: string | Plugin, isReload = false) {
        const unloaded = super.unloadAddon(idOrFileOrAddon, isReload);
        this.#refreshRuntimeHooks();
        return unloaded;
    }

    onSwitch() {
        for (let i = 0; i < this.addonList.length; i++) {
            if (!this.state[this.addonList[i].id]) continue;
            const plugin = this.addonList[i].instance;
            try {
                if (typeof plugin?.onSwitch === "function") {
                    plugin.onSwitch();
                }
            }
            catch (err) {
                this.recordDoctorFailure(this.addonList[i], "switch", err);
                Logger.stacktrace(this.name, `Unable to fire onSwitch for ${this.addonList[i].name} v${this.addonList[i].version}`, err as Error);
            }
        }
    }

    onMutation(mutation: MutationRecord) {
        for (let i = 0; i < this.addonList.length; i++) {
            if (!this.state[this.addonList[i].id]) continue;
            const plugin = this.addonList[i].instance;
            try {
                if (typeof plugin?.observer === "function") {
                    plugin.observer(mutation);
                }
            }
            catch (err) {
                this.recordDoctorFailure(this.addonList[i], "mutation", err);
                Logger.stacktrace(this.name, `Unable to fire observer for ${this.addonList[i].name} v${this.addonList[i].version}`, err as Error);
            }
        }
        this.#refreshRuntimeHooks();
    }

    private recordDoctorFailure(plugin: Plugin, phase: AddonFailure["phase"], error: unknown, cleanupAlreadyAttempted = false) {
        const quarantined = PluginDoctor.recordFailure(plugin.id, phase, error);
        if (!quarantined) return;
        this.state[plugin.id] = false;
        this.saveState();
        if (!cleanupAlreadyAttempted && phase !== "stop" && typeof plugin.instance?.stop === "function") {
            try {
                plugin.instance.stop();
                this.#activePluginIds.delete(plugin.id);
            }
            catch (cleanupError) {
                PluginDoctor.recordFailure(plugin.id, "stop", cleanupError);
                PluginDoctor.quarantine(plugin.id, "Cleanup failed while quarantining this addon; restart Discord before retrying it.");
                this.#cleanupBlockedPluginIds.add(plugin.id);
                Logger.stacktrace(this.name, `Quarantine cleanup failed for ${plugin.name}.`, cleanupError as Error);
            }
        }
        this.trigger("disabled", plugin);
        this.#refreshRuntimeHooks();
        this.#releaseUnusedBdfdbDependency();
    }

    #isBdfdb(plugin: Plugin): boolean {
        return plugin.filename.toLocaleLowerCase("en-US") === "0bdfdb.plugin.js";
    }

    #isDoctorQuarantined(plugin: Plugin): boolean {
        return PluginDoctor.isAnyQuarantined(plugin.id, plugin.name, plugin.filename);
    }

    #requiresBdfdb(plugin: Plugin): boolean {
        return !this.#isBdfdb(plugin) && (plugin.requiresBdfdb === true
            || typeof plugin.fileContent === "string" && /\bBDFDB_Global\b/.test(plugin.fileContent));
    }

    #ensureBdfdbDependency(plugin: Plugin): boolean {
        if (!this.#requiresBdfdb(plugin)) return true;
        const dependency = this.resolveAddon("0BDFDB.plugin.js");
        if (!dependency || this.#isDoctorQuarantined(dependency) || this.#cleanupBlockedPluginIds.has(dependency.id)) return false;
        return this.#activePluginIds.has(dependency.id) || this.startAddon(dependency) === true;
    }

    #releaseUnusedBdfdbDependency(): void {
        const dependency = this.resolveAddon("0BDFDB.plugin.js");
        if (!dependency || !this.#activePluginIds.has(dependency.id) || this.state[dependency.id] === true) return;
        const required = this.addonList.some(addon => this.state[addon.id] === true && this.#requiresBdfdb(addon));
        if (!required) this.stopAddon(dependency, {silent: true});
    }
}

export default new PluginManager();
