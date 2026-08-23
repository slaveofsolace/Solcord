import fs from "fs";
import path from "path";

import Logger from "@common/logger";


import {comparator as semverComparator, regex as semverRegex} from "@common/semver";

import Events from "./emitter";
import {t} from "@common/i18n";
import React from "./react";
import SettingsStore from "@stores/settings";
import Settings from "@ui/settings";
import PluginManager from "./pluginmanager";
import ThemeManager from "./thememanager";

import Toasts from "@stores/toasts";
import Notifications from "@ui/notifications";
import Modals from "@ui/modals";
import UpdaterPanel from "@ui/updater";
import Web from "@data/web";
import type AddonManager from "./addonmanager";
import type {Release} from "@typed/github";
import {Logo} from "@ui/logo";
import {RefreshCcwIcon} from "lucide-react";
import type {AddonType} from "@typed/addon";
import {fetch} from "./net";
import AddonStore from "./addonstore";
import {SOULCORD_RUNTIME_ADDONS, SOULCORD_RUNTIME_DEPENDENCIES, SOULCORD_RUNTIME_THEMES} from "@common/soulcord/addon-catalog.generated";
import {isSoulCordTransactionOwnedAcceptedArtifact} from "./soulcord/updater-ownership";

function acceptedSoulCordArtifact(type: AddonType, fileName: string): {fileName: string; reviewedSha256: string;} | undefined {
    if (type === "theme") {
        const theme = SOULCORD_RUNTIME_THEMES.find(candidate => candidate.fileName === fileName);
        return theme && {fileName: theme.fileName, reviewedSha256: theme.sourceSha256};
    }

    const candidate = SOULCORD_RUNTIME_ADDONS.find(addon => addon.fileName === fileName) ?? SOULCORD_RUNTIME_DEPENDENCIES.find(dependency => dependency.fileName === fileName);
    if (!candidate || (candidate as {installable?: boolean;}).installable !== true) return;
    return {fileName: candidate.fileName, reviewedSha256: candidate.sourceSha256};
}

export default class Updater {
    static updateCheckInterval: ReturnType<typeof setInterval> | null = null;

    static initialize() {
        // TODO: get rid of element creation
        SettingsStore.registerPanel("updates", t("Panels.updates"), {
            order: 1,
            icon: RefreshCcwIcon,
            element: () => {
                return React.createElement(UpdaterPanel, {
                    coreUpdater: CoreUpdater,
                    pluginUpdater: PluginUpdater,
                    themeUpdater: ThemeUpdater
                });
            }
        });

        CoreUpdater.initialize();
        PluginUpdater.initialize();
        ThemeUpdater.initialize();

        Events.on("setting-updated", (collection, category, id) => {
            if (collection !== "settings" || category !== "addons") return;
            if (id !== "updateInterval" && id !== "checkForUpdates") return;
            this.startUpdateInterval();
        });

        // This function will already check the setting
        this.startUpdateInterval();
    }

    static startUpdateInterval() {
        if (this.updateCheckInterval) {
            clearInterval(this.updateCheckInterval);
            this.updateCheckInterval = null;
        }

        if (!SettingsStore.get("addons", "checkForUpdates")) return;

        const hours = SettingsStore.get<number>("addons", "updateInterval");
        this.updateCheckInterval = setInterval(async () => {
            CoreUpdater.checkForUpdate();
            PluginUpdater.checkAll();
            ThemeUpdater.checkAll();
        }, hours * 60 * 60 * 1000);
    }
}

export class CoreUpdater {
    static hasUpdate = false;
    static apiData: Release;
    static remoteVersion = "";
    static readonly disabledReason = "SoulCord core updates are paused until an owner-controlled release feed provides signed integrity metadata.";

    static async initialize() {
        if (!SettingsStore.get("addons", "checkForUpdates")) return;
        this.checkForUpdate();
    }

    static async checkForStable(ignoreVersion = false) {
        void ignoreVersion;
        this.hasUpdate = false;
        this.remoteVersion = "";
    }

    static async checkForCanary(ignoreVersion = false) {
        void ignoreVersion;
        this.hasUpdate = false;
        this.remoteVersion = "";
    }

    static async checkForUpdate(showNotice = true) {
        void showNotice;
        this.hasUpdate = false;
        this.remoteVersion = "";
        Logger.warn("SoulCord Updater", this.disabledReason);
    }

    static async update() {
        this.hasUpdate = false;
        Logger.warn("SoulCord Updater", this.disabledReason);
        Modals.showConfirmationModal("SoulCord core updates are paused", this.disabledReason, {cancelText: null});
    }
}

export class AddonUpdater {
    manager: AddonManager;
    type: AddonType;
    pending: string[];

    constructor(type: AddonType) {
        this.manager = type === "plugin" ? PluginManager : ThemeManager;
        this.type = type;
        this.pending = [];
    }

    async initialize() {
        AddonStore.getAddons();
        if (SettingsStore.get("addons", "checkForUpdates")) this.checkAll();

        Events.on(`${this.type}-read`, addon => {
            if (!SettingsStore.get("addons", "checkForUpdates")) return;
            this.checkForUpdate(addon.filename, addon.version);
        });

        Events.on(`${this.type}-unloaded`, addon => {
            const index = this.pending.indexOf(addon.filename);
            if (index >= 0) this.pending.splice(index, 1);
        });
    }

    async checkAll(showNotice = true) {
        this.pending.length = 0;

        await AddonStore.updaterRequestAddons();

        for (const addon of this.manager.addonList) this.checkForUpdate(addon.filename, addon.version);
        if (showNotice) this.showUpdateNotice();
    }

    checkForUpdate(filename: string, currentVersion: string) {
        if (this.pending.includes(filename)) return;

        const info = AddonStore.getAddon(path.basename(filename));
        if (!info) return;

        let hasUpdate = info.version > currentVersion;

        if (semverRegex.test(info.version) && semverRegex.test(currentVersion)) {
            hasUpdate = semverComparator(currentVersion, info.version) > 0;
        }

        if (!hasUpdate) return;

        this.pending.push(filename);
    }

    async updateAddon(filename: string) {
        const basename = path.basename(filename);
        const reviewed = acceptedSoulCordArtifact(this.type, basename);
        const transactionOwned = reviewed && isSoulCordTransactionOwnedAcceptedArtifact({
            accepted: true,
            addonFolder: this.manager.addonFolder,
            fileName: reviewed.fileName,
            kind: this.type,
            reviewedSha256: reviewed.reviewedSha256
        });
        if (transactionOwned) {
            const reason = "This exact file was installed by SoulCord from an accepted source. Its update is paused until provenance, code, and runtime checks are repeated.";
            Logger.warn("SoulCord Addon Integrity", `${basename} update paused for re-review.`);
            Toasts.error(reason);
            return;
        }
        const info = AddonStore.getAddon(filename);

        if (!info) return;

        const request = await fetch(Web.redirects.github(info.id.toString()));

        if (!request.ok) {
            Logger.stacktrace("AddonUpdater", `Failed to download body for ${info.id}`, request as never);
            Toasts.error(t("Updater.addonUpdateFailed", {name: info.name, version: info.version}));
            return;
        }

        const file = path.join(path.resolve(this.manager.addonFolder), filename);
        fs.writeFileSync(file, await request.text());

        Toasts.success(t("Updater.addonUpdated", {name: info.name, version: info.version}));
        this.pending.splice(this.pending.indexOf(filename), 1);
    }

    showUpdateNotice() {
        if (!this.pending.length) return;

        const addonDetails = this.pending.map(filename => {
            const info = AddonStore.getAddon(path.basename(filename));

            return {
                name: info ? info.name : filename,
                version: info ? info.version : ""
            };
        });

        Notifications.show({
            id: `addon-updates-${this.type}`,
            title: t("Updater.addonUpdaterNotificationTitle"),
            content: [
                t("Updater.addonUpdatesAvailable", {count: this.pending.length, context: this.type}),
                React.createElement("ul", {className: "bd-notification-updates-list"},
                    addonDetails.map(addon =>
                        React.createElement("li", {}, [
                            addon.name, " ", React.createElement("i", {}, `(${addon.version})`)
                        ])
                    )
                )
            ],
            type: "info",
            icon: () => React.createElement(Logo, {size: 16, accent: true}),
            duration: Infinity,
            actions: [
                {
                    label: t("Updater.viewUpdates"),
                    onClick: () => Settings.openSettingsPage("updates")
                },
                {
                    label: t("Updater.updateAll"),
                    onClick: () => {
                        for (const filename of this.pending) {
                            this.updateAddon(filename);
                        }
                    }
                }
            ]
        });
    }
}

export const PluginUpdater = new AddonUpdater("plugin");
export const ThemeUpdater = new AddonUpdater("theme");
