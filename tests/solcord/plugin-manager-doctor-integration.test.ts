import {afterAll, describe, expect, mock, test} from "bun:test";


const fileDocuments = new Map<string, unknown>();
const keyedDocuments = new Map<string, unknown>();

function clone<T>(value: T): T {
    return value === undefined ? value : structuredClone(value);
}

mock.module("@stores/json", () => ({
    "default": {
        get(file: string, key?: string) {
            return key === undefined ? clone(fileDocuments.get(file)) : clone(keyedDocuments.get(`${file}:${key}`));
        },
        set(file: string, keyOrValue: unknown, value?: unknown) {
            if (arguments.length === 2) fileDocuments.set(file, clone(keyOrValue));
            else keyedDocuments.set(`${file}:${String(keyOrValue)}`, clone(value));
        }
    }
}));

const noop = () => {};
mock.module("@common/logger", () => ({"default": {log: noop, debug: noop, warn: noop, error: noop, stacktrace: noop}}));
mock.module("@stores/settings", () => ({"default": {registerAddonPanel: noop}}));
mock.module("@stores/toasts", () => ({"default": {show: noop, success: noop, warning: noop, error: noop, info: noop}}));
mock.module("@common/i18n", () => ({t: (key: string) => key}));
mock.module("@ui/modals", () => ({"default": {showAddonError: noop}}));
mock.module("../../src/betterdiscord/modules/ipc", () => ({"default": {openPath: noop}}));
mock.module("../../src/betterdiscord/modules/react", () => ({"default": {createRef: () => ({current: null})}}));
mock.module("@polyfill/remote", () => ({
    "default": {
        editor: {open: noop},
        filesystem: new Proxy({}, {get: () => noop})
    }
}));
mock.module("@ui/floatingwindows", () => ({"default": {open: noop, close: noop}}));
mock.module("@ui/misc/addoneditor", () => ({"default": class AddonEditorFixture {}}));

let observerStarts = 0;
let observerStops = 0;
class LifecycleMutationObserver {
    constructor(_callback: MutationCallback) {}
    observe(): void {observerStarts++;}
    disconnect(): void {observerStops++;}
    takeRecords(): MutationRecord[] {return [];}
}

const originalMutationObserver = globalThis.MutationObserver;
const originalWindowRequire = Object.getOwnPropertyDescriptor(window, "require");
Object.defineProperty(globalThis, "MutationObserver", {configurable: true, writable: true, value: LifecycleMutationObserver});
Object.defineProperty(window, "require", {configurable: true, writable: true, value: () => ({})});

const [{default: PluginManager}, {default: PluginDoctor}] = await Promise.all([
    import("../../src/betterdiscord/modules/pluginmanager"),
    import("../../src/betterdiscord/modules/solcord/doctor")
]);

interface LifecycleState {
    failuresRemaining: number;
    loads: number;
    starts: number;
    stops: number;
}

interface DependencyLifecycleState {
    libraryStarts: number;
    libraryStops: number;
    consumerStarts: number;
    consumerStops: number;
}

interface CleanupBlockedState {
    starts: number;
    stops: number;
}

const lifecycleHost = globalThis as typeof globalThis & {
    __solcordPluginDoctorLifecycle?: LifecycleState;
    __solcordDependencyLifecycle?: DependencyLifecycleState;
    __solcordCleanupBlocked?: CleanupBlockedState;
};

function pluginSource(): string {
    return `
module.exports = class LifecycleFixture {
    load() { globalThis.__solcordPluginDoctorLifecycle.loads += 1; }
    start() {
        const state = globalThis.__solcordPluginDoctorLifecycle;
        state.starts += 1;
        if (state.failuresRemaining > 0) {
            state.failuresRemaining -= 1;
            throw new Error("LifecycleFixtureStartFailure");
        }
    }
    stop() { globalThis.__solcordPluginDoctorLifecycle.stops += 1; }
    observer() {}
    onSwitch() {}
};`;
}

function pluginFixture() {
    return {
        added: 1,
        author: "Solcord Test",
        description: "Sanitized lifecycle fixture.",
        fileContent: pluginSource(),
        filename: "LifecycleFixture.plugin.js",
        format: "javascript",
        id: "LifecycleFixture",
        modified: 1,
        name: "LifecycleFixture",
        runAt: "connection",
        size: pluginSource().length,
        slug: "LifecycleFixture",
        version: "1.0.0"
    } as any;
}

function dependencyPluginFixture(kind: "library" | "consumer") {
    const library = kind === "library";
    const name = library ? "BDFDB" : "DependencyConsumer";
    const filename = library ? "0BDFDB.plugin.js" : "DependencyConsumer.plugin.js";
    const source = library
        ? `module.exports = class BDFDBFixture {
            start() { globalThis.__solcordDependencyLifecycle.libraryStarts += 1; }
            stop() { globalThis.__solcordDependencyLifecycle.libraryStops += 1; }
        };`
        : `module.exports = class DependencyConsumerFixture {
            start() { void globalThis.BDFDB_Global; globalThis.__solcordDependencyLifecycle.consumerStarts += 1; }
            stop() { globalThis.__solcordDependencyLifecycle.consumerStops += 1; }
        };`;
    return {
        added: 1,
        author: "Solcord Test",
        description: "Dependency lifecycle fixture.",
        fileContent: source,
        filename,
        format: "javascript",
        id: name,
        modified: 1,
        name,
        runAt: "connection",
        size: source.length,
        slug: name,
        version: "1.0.0"
    } as any;
}

describe("PluginManager and Plugin Doctor lifecycle", () => {
    test("persists quarantine, holds reload, clears explicitly, retries, and releases hooks", () => {
        const originalAddonList = PluginManager.addonList;
        const originalState = PluginManager.state;
        const originalInitialized = PluginManager.hasInitialized;
        const lifecycle: LifecycleState = {failuresRemaining: 3, loads: 0, starts: 0, stops: 0};
        lifecycleHost.__solcordPluginDoctorLifecycle = lifecycle;
        observerStarts = 0;
        observerStops = 0;

        try {
            const plugin = pluginFixture();
            PluginManager.addonList = [plugin];
            PluginManager.state = {[plugin.id]: false};
            PluginManager.hasInitialized = true;

            for (let attempt = 0; attempt < 3; attempt++) {
                expect(PluginManager.enableAddon(plugin)).toBeFalse();
                expect(PluginManager.state[plugin.id]).toBeFalse();
            }

            expect(lifecycle).toEqual({failuresRemaining: 0, loads: 1, starts: 3, stops: 3});
            expect(PluginDoctor.isQuarantined(plugin.id)).toBeTrue();
            expect(fileDocuments.get("plugins")).toEqual({[plugin.id]: false});

            const persistedDoctor = keyedDocuments.get("misc:solcordPluginDoctor") as {
                records: Record<string, {failures: unknown[]; quarantinedAt?: number;}>;
            };
            expect(persistedDoctor.records[plugin.id].failures).toHaveLength(3);
            expect(typeof persistedDoctor.records[plugin.id].quarantinedAt).toBe("number");
            expect(JSON.stringify(persistedDoctor)).not.toContain("LifecycleFixtureStartFailure");

            const reloadedPlugin = pluginFixture();
            PluginManager.addonList = [reloadedPlugin];
            PluginManager.state = {[reloadedPlugin.id]: true};
            PluginManager.startAddons("connection");

            expect(PluginManager.state[reloadedPlugin.id]).toBeFalse();
            expect(fileDocuments.get("plugins")).toEqual({[reloadedPlugin.id]: false});
            expect(lifecycle.loads).toBe(1);
            expect(lifecycle.starts).toBe(3);

            expect(PluginDoctor.clearQuarantine(reloadedPlugin.id)).toBeTrue();
            expect(PluginDoctor.isQuarantined(reloadedPlugin.id)).toBeFalse();
            expect(PluginManager.enableAddon(reloadedPlugin)).toBeTrue();
            expect(lifecycle.loads).toBe(2);
            expect(lifecycle.starts).toBe(4);
            expect(observerStarts).toBe(1);
            expect(typeof PluginDoctor.snapshot().find(record => record.addonId === reloadedPlugin.id)?.lastSuccessfulStart).toBe("number");

            expect(PluginManager.disableAddon(reloadedPlugin)).toBeTrue();
            expect(lifecycle.stops).toBe(4);
            expect(observerStops).toBe(1);
            expect(PluginManager.state[reloadedPlugin.id]).toBeFalse();
            expect(fileDocuments.get("plugins")).toEqual({[reloadedPlugin.id]: false});
        }
        finally {
            PluginManager.addonList = originalAddonList;
            PluginManager.state = originalState;
            PluginManager.hasInitialized = originalInitialized;
            delete lifecycleHost.__solcordPluginDoctorLifecycle;
        }
    });

    test("starts BDFDB once before a consumer and releases it after the last consumer stops", () => {
        const originalAddonList = PluginManager.addonList;
        const originalState = PluginManager.state;
        const originalInitialized = PluginManager.hasInitialized;
        const lifecycle: DependencyLifecycleState = {libraryStarts: 0, libraryStops: 0, consumerStarts: 0, consumerStops: 0};
        lifecycleHost.__solcordDependencyLifecycle = lifecycle;

        try {
            const consumer = dependencyPluginFixture("consumer");
            const library = dependencyPluginFixture("library");
            // Deliberately put the consumer first. Dependency ordering must not
            // depend on filesystem enumeration.
            PluginManager.addonList = [consumer, library];
            PluginManager.state = {[consumer.id]: true, [library.id]: false};
            PluginManager.hasInitialized = true;

            PluginManager.startAddons("connection");
            expect(lifecycle).toEqual({libraryStarts: 1, libraryStops: 0, consumerStarts: 1, consumerStops: 0});
            expect(PluginManager.isEnabled(library.filename)).toBeFalse();

            expect(PluginManager.disableAddon(consumer)).toBeTrue();
            expect(lifecycle).toEqual({libraryStarts: 1, libraryStops: 1, consumerStarts: 1, consumerStops: 1});

            expect(PluginManager.enableAddon(consumer)).toBeTrue();
            expect(lifecycle).toEqual({libraryStarts: 2, libraryStops: 1, consumerStarts: 2, consumerStops: 1});
            expect(PluginManager.disableAddon(consumer)).toBeTrue();
            expect(lifecycle).toEqual({libraryStarts: 2, libraryStops: 2, consumerStarts: 2, consumerStops: 2});
        }
        finally {
            PluginManager.addonList = originalAddonList;
            PluginManager.state = originalState;
            PluginManager.hasInitialized = originalInitialized;
            delete lifecycleHost.__solcordDependencyLifecycle;
        }
    });

    test("blocks duplicate activation when prior cleanup did not finish", () => {
        const originalAddonList = PluginManager.addonList;
        const originalState = PluginManager.state;
        const lifecycle: CleanupBlockedState = {starts: 0, stops: 0};
        lifecycleHost.__solcordCleanupBlocked = lifecycle;
        const source = `module.exports = class CleanupBlockedFixture {
            start() { globalThis.__solcordCleanupBlocked.starts += 1; }
            stop() { globalThis.__solcordCleanupBlocked.stops += 1; throw new Error("CleanupBlockedFixture"); }
        };`;
        const plugin = {
            added: 1,
            author: "Solcord Test",
            description: "Cleanup fixture.",
            fileContent: source,
            filename: "CleanupBlockedFixture.plugin.js",
            format: "javascript",
            id: "CleanupBlockedFixture",
            modified: 1,
            name: "CleanupBlockedFixture",
            runAt: "connection",
            size: source.length,
            slug: "CleanupBlockedFixture",
            version: "1.0.0"
        } as any;

        try {
            PluginManager.addonList = [plugin];
            PluginManager.state = {[plugin.id]: false};
            expect(PluginManager.enableAddon(plugin)).toBeTrue();
            expect(PluginManager.disableAddon(plugin)).toBeFalse();
            expect(lifecycle).toEqual({starts: 1, stops: 1});
            expect(PluginDoctor.isQuarantined(plugin.id)).toBeTrue();

            expect(PluginDoctor.clearQuarantine(plugin.id)).toBeTrue();
            expect(PluginManager.enableAddon(plugin)).toBeFalse();
            expect(lifecycle).toEqual({starts: 1, stops: 1});
            expect(PluginManager.state[plugin.id]).toBeFalse();
        }
        finally {
            PluginManager.addonList = originalAddonList;
            PluginManager.state = originalState;
            delete lifecycleHost.__solcordCleanupBlocked;
        }
    });
});

afterAll(() => {
    Object.defineProperty(globalThis, "MutationObserver", {configurable: true, writable: true, value: originalMutationObserver});
    if (originalWindowRequire) Object.defineProperty(window, "require", originalWindowRequire);
    else Reflect.deleteProperty(window, "require");
});
