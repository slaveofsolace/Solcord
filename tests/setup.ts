import {GlobalRegistrator} from "@happy-dom/global-registrator";

process.env.BETTERDISCORD_DATA_PATH ??= process.cwd();
GlobalRegistrator.register();

Object.defineProperty(window, "BetterDiscordPreload", {
    configurable: true,
    value: () => ({
        filesystem: new Proxy({}, {get: () => () => undefined})
    })
});
