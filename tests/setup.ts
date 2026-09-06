import {GlobalRegistrator} from "@happy-dom/global-registrator";
import * as crypto from "../src/electron/preload/api/crypto";

process.env.BETTERDISCORD_DATA_PATH ??= process.cwd();
GlobalRegistrator.register();

Object.defineProperty(window, "BetterDiscordPreload", {
    configurable: true,
    value: () => ({
        crypto,
        filesystem: new Proxy({}, {get: () => () => undefined})
    })
});
