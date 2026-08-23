import {contextBridge, ipcRenderer} from "electron";
import newProcess from "./process";
import * as BdApi from "./api";
import init from "./init";
import DiscordNativePatch from "./discordnativepatch";
import * as IPCEvents from "@common/constants/ipcevents";

DiscordNativePatch.init();

/**
 * Only hand out the privileged API / run BD on first-party Discord surfaces.
 * contextBridge is designed to cross the isolation boundary, so context isolation
 * alone does not stop an untrusted origin (that happened to receive our preload)
 * from requesting the full API. This origin gate is the control that does.
 */
const TRUSTED_HOSTS = [
    "discord.com",
    "discordapp.com",
    "canary.discord.com",
    "ptb.discord.com",
];
function isTrustedOrigin(): boolean {
    try {
        // `location` here is the isolated-world location, not tamperable from the page's main world.
        const {protocol, hostname} = location;
        if (protocol !== "https:") return false;
        return TRUSTED_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`));
    }
    catch {
        return false;
    }
}

let hasInitialized = false;
let bootstrapPromise: Promise<string> | undefined;
let bootstrapClaimed = false;
contextBridge.exposeInMainWorld("process", newProcess);
contextBridge.exposeInMainWorld("BetterDiscordPreload", () => {
    if (!isTrustedOrigin()) return null;
    if (hasInitialized) return null;
    hasInitialized = true;
    return {
        ...BdApi,
        __claimSoulCordTimelineBootstrap: async () => {
            if (bootstrapClaimed || !bootstrapPromise) throw new Error("SoulCord timeline bootstrap is unavailable.");
            bootstrapClaimed = true;
            const pending = bootstrapPromise;
            bootstrapPromise = undefined;
            return pending;
        }
    };
});

let hasRanRenderer = false;
contextBridge.exposeInMainWorld("BetterDiscordRunRenderer", () => {
    if (!isTrustedOrigin()) return null;
    if (hasRanRenderer) return null;
    hasRanRenderer = true;

    bootstrapPromise = ipcRenderer.invoke(IPCEvents.RUN_RENDERER).then((response: unknown) => {
        const capability = (response as {bootstrapCapability?: unknown;} | undefined)?.bootstrapCapability;
        if (typeof capability !== "string" || !/^[a-zA-Z0-9_-]{43}$/.test(capability)) throw new Error("SoulCord timeline bootstrap was rejected.");
        return capability;
    });
});

init();
