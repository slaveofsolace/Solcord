import {ipcRenderer as IPC, webFrame} from "electron";
import fs from "fs";
import path from "path";

import * as IPCEvents from "@common/constants/ipcevents";
import {runOriginalPreloadOnce} from "./original-preload";


const originalPreloadState = {attempted: false};

export default function () {
    webFrame.top?.executeJavaScript(`(() => {${fs.readFileSync(path.join(__dirname, "earlyRenderer.js"), "utf8")}})()`).catch(() => {});

    // Load Discord's original preload
    const result = runOriginalPreloadOnce(originalPreloadState, process.env.BD_DISCORD_PRELOAD, {
        register: preload => IPC.send(IPCEvents.REGISTER_PRELOAD, preload),
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        load: preload => require(preload),
        getKill: () => process.kill,
        setKill: kill => {process.kill = kill;}
    });
    if (result.state === "failed") {
        // The error class is useful; the absolute preload path and error message are not.
        // eslint-disable-next-line no-console
        console.error(`[SoulCord] Discord preload failed (${result.errorName ?? "unknown-error"}).`);
    }
}
