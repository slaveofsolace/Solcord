interface BdfdbDependencyCandidate {
    filename: string;
    id: string;
    fileContent?: string;
    requiresBdfdb?: boolean;
    instance?: {
        observer?: unknown;
        onSwitch?: unknown;
    };
}

export interface PluginRuntimeHookRequirements {
    mutationObserver: boolean;
    navigationListener: boolean;
}

/**
 * BetterDiscord historically loaded BDFDB unconditionally, including when
 * every consumer was disabled. Solcord keeps dependency compatibility while
 * avoiding evaluation of the library unless an enabled plugin's staged source
 * actually declares the BDFDB runtime contract.
 */
export function bdfdbRequiredByEnabledAddon(addons: readonly BdfdbDependencyCandidate[], state: Readonly<Record<string, boolean>>): boolean {
    return addons.some(addon => addon.filename.toLocaleLowerCase("en-US") !== "0bdfdb.plugin.js"
        && state[addon.id] === true
        && (addon.requiresBdfdb === true
            || typeof addon.fileContent === "string" && /\bBDFDB_Global\b/.test(addon.fileContent)));
}

export function pluginRuntimeHookRequirements(addons: readonly BdfdbDependencyCandidate[], state: Readonly<Record<string, boolean>>): PluginRuntimeHookRequirements {
    let mutationObserver = false;
    let navigationListener = false;
    for (const addon of addons) {
        if (state[addon.id] !== true) continue;
        mutationObserver ||= typeof addon.instance?.observer === "function";
        navigationListener ||= typeof addon.instance?.onSwitch === "function";
        if (mutationObserver && navigationListener) break;
    }
    return {mutationObserver, navigationListener};
}
