import path from "path";
import Store from "./base";


class ConfigStore extends Store {
    data = {
        branch: process.env.__BRANCH__!,
        commit: process.env.__COMMIT__!,
        build: process.env.__BUILD__!,
        version: process.env.__VERSION__!,
        candidate: process.env.__CANDIDATE__!,

        // TODO: asynchronously get these from the main process instead of hacky env vars
        appPath: process.env.DISCORD_APP_PATH!,
        userData: process.env.DISCORD_USER_DATA!,
        bdPath: process.env.BETTERDISCORD_DATA_PATH!,
        dataPath: path.join(process.env.BETTERDISCORD_DATA_PATH!, "data"),
        pluginsPath: path.join(process.env.BETTERDISCORD_DATA_PATH!, "plugins"),
        themesPath: path.join(process.env.BETTERDISCORD_DATA_PATH!, "themes"),
        channelPath: path.join(process.env.BETTERDISCORD_DATA_PATH!, "data", window?.DiscordNative?.app?.getReleaseChannel?.() ?? "stable"),
    };

    get(id: keyof typeof this.data) {
        return this.data[id];
    }

    set(id: keyof typeof this.data, value: string) {
        this.data[id] = value;
        this.emitChange();
    }

    get isCleanCandidateBuild() {return this.data.build === "production-clean" || this.data.build === "release-clean";}
    get candidateIdentity() {return this.isCleanCandidateBuild ? this.data.candidate : `${this.data.candidate} · ${this.data.build || "unidentified build"}`;}
    get isDevelopment() {return !this.isCleanCandidateBuild;}
    get isCanary() {return this.data.branch !== "main";}
}

export default new ConfigStore();
