import {contextBridge, ipcRenderer} from "electron";
import newProcess from "./process";
import * as BdApi from "./api";
import init from "./init";
import DiscordNativePatch from "./discordnativepatch";
import {evaluateSoulCordPreloadExposure} from "./context-policy";
import * as IPCEvents from "@common/constants/ipcevents";

const electronProcess = process as typeof process & {isMainFrame?: boolean;};
function currentExposure() {
    try {
        return evaluateSoulCordPreloadExposure({
            protocol: location.protocol,
            hostname: location.hostname,
            port: location.port,
            isMainFrame: window.top === window && electronProcess.isMainFrame !== false
        });
    }
    catch {
        return evaluateSoulCordPreloadExposure({
            protocol: undefined,
            hostname: undefined,
            isMainFrame: false
        });
    }
}
const exposure = currentExposure();

let hasInitialized = false;
let bootstrapPromise: Promise<string> | undefined;
let bootstrapClaimed = false;
let hasRanRenderer = false;
if (exposure.exposeSoulCord) {
    DiscordNativePatch.init();
    contextBridge.exposeInMainWorld("process", newProcess);
    contextBridge.exposeInMainWorld("BetterDiscordPreload", () => {
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

    contextBridge.exposeInMainWorld("BetterDiscordRunRenderer", () => {
        if (hasRanRenderer) return null;
        hasRanRenderer = true;

        bootstrapPromise = ipcRenderer.invoke(IPCEvents.RUN_RENDERER).then((response: unknown) => {
            const capability = (response as {bootstrapCapability?: unknown;} | undefined)?.bootstrapCapability;
            if (typeof capability !== "string" || !/^[a-zA-Z0-9_-]{43}$/.test(capability)) throw new Error("SoulCord timeline bootstrap was rejected.");
            return capability;
        });
    });
}

// Discord's original preload always runs, including in rejected Activity or
// embedded contexts. Only SoulCord's bridge and early renderer are withheld.
init({enableSoulCordEarlyRenderer: exposure.exposeSoulCord});
