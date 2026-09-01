import Logger from "@common/logger";

import Config from "@stores/config";
import Changelog from "@data/changelog";

import * as Builtins from "@builtins/builtins";

import LoadingIcon from "../loadingicon";

import LocaleManager from "./localemanager";
import DOMManager from "./dommanager";
import PluginManager from "./pluginmanager";
import ThemeManager from "./thememanager";
import Settings from "@stores/settings";
import JsonStore from "@stores/json";
import ToastStore from "@stores/toasts";
import DiscordModules from "./discordmodules";

import Updater from "./updater";
import AddonStore from "./addonstore";

import Styles from "@styles/index.css";
import SolcordHankenFont from "@styles/fonts/HankenGrotesk-variable.ttf";
import Modals from "@ui/modals";
import FloatingWindows from "@ui/floatingwindows";
import Toasts from "@ui/toasts";
import SettingsRenderer from "@ui/settings";
import CommandManager from "./commandmanager";
import InstallCSS from "@ui/customcss/mdinstallcss";
import {allModulesLoaded, getStore, Stores} from "@webpack";
import Patcher from "./patcher";
import SolcordRuntime from "./solcord/runtime";
import SolcordPanel from "@ui/solcord/panel";
import {ShieldCheckIcon} from "lucide-react";

export default new class Core {
    hasStarted = false;

    trustBetterDiscordProtocol() {
        Patcher.after("BetterDiscordProtocol", getStore("MaskedLinkStore")!, "isTrustedProtocol", (_, [url]: any, ret) => ret || url.startsWith("betterdiscord://"));
    }

    async startup() {
        if (this.hasStarted) return;
        this.hasStarted = true;

        this.trustBetterDiscordProtocol();

        // Load css early
        Logger.log("Startup", "Injecting BD Styles");
        const bundledStyles = Styles.toString().replace("./fonts/HankenGrotesk-variable.ttf", SolcordHankenFont);
        DOMManager.injectStyle("bd-stylesheet", bundledStyles);

        Logger.log("Startup", "Initializing LocaleManager");
        LocaleManager.initialize();

        Logger.log("Startup", "Initializing Settings");
        Settings.initialize();
        await SolcordRuntime.initialize();
        SolcordRuntime.attachControlCenter(() => {
            Settings.registerPanel("solcord", "Solcord Suite", {
                order: 0,
                icon: ShieldCheckIcon,
                element: SolcordPanel,
                translateLabel: false,
                searchable: () => ["Solcord", "Activity Bridge", "Plugin Doctor", "profiles", "privacy", "recovery", "Do Not Track", "Invisible Typing", "Double Click to Reply"]
            });
        });
        SettingsRenderer.initialize();

        Logger.log("Startup", "Initializing AddonStore");
        AddonStore.initialize();

        Logger.log("Startup", "Initializing CommandManager");
        CommandManager.initialize();

        Logger.log("Startup", "Initializing Internal InstallCSS");
        InstallCSS.initialize();

        Logger.log("Startup", "Waiting for connection...");
        await this.waitForConnection();

        Logger.log("Startup", "Initializing FloatingWindows");
        FloatingWindows.initialize();

        Logger.log("Startup", "Initializing Toasts");
        Toasts.initialize();

        Logger.log("Startup", "Starting Solcord privacy policy");
        const privacyPolicyReady = await SolcordRuntime.start();

        Logger.log("Startup", "Initializing Builtins");
        for (const module in Builtins) {
            Builtins[module as keyof typeof Builtins].initialize();
        }

        PluginManager.holdAddonActivation();
        ThemeManager.holdAddonActivation();
        PluginManager.setAddonActivationGuard(addon => SolcordRuntime.canActivateCommunityAddon(addon));
        ThemeManager.setAddonActivationGuard(theme => SolcordRuntime.canActivateCommunityTheme(theme));

        Logger.log("Startup", "Loading Plugins");
        PluginManager.initialize();

        Logger.log("Startup", "Loading Themes");
        ThemeManager.initialize();

        Logger.log("Startup", "Validating reviewed addons before activation");
        const addonActivationAllowed = privacyPolicyReady && await SolcordRuntime.enforceAddonIntegrityBeforeStart();
        if (addonActivationAllowed) {
            PluginManager.releaseAddonActivation();
            ThemeManager.releaseAddonActivation();
            PluginManager.startAddons("connection");
            ThemeManager.startAddons();
        }
        else {
            Logger.warn("Startup", "Community addon activation remains held because Solcord privacy or integrity validation did not complete.");
        }

        Logger.log("Startup", "Initializing Updater");
        Updater.initialize();

        Logger.log("Startup", "Removing Loading Icon");
        LoadingIcon.hide();
        SolcordRuntime.scheduleDeferredStartup();
        ToastStore.success(`Solcord ${Config.get("candidate")} active`, {
            forceShow: true,
            timeout: 5_000,
            group: "solcord-startup-identity"
        });

        const previousVersion = JsonStore.get("misc", "version");
        if (Config.get("version") !== previousVersion) {
            Modals.showChangelogModal(Changelog);
            JsonStore.set("misc", "version", Config.get("version"));
        }

        if (addonActivationAllowed) allModulesLoaded.then(() => PluginManager.startAddons("idle"));
    }

    waitForConnection() {
        return new Promise<void>(done => {
            if (Stores.UserStore?.getCurrentUser()) return done();
            DiscordModules.Dispatcher?.subscribe("CONNECTION_OPEN", done);
        });
    }
};
