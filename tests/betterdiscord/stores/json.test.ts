import {afterEach, beforeEach, describe, expect, spyOn, test} from "bun:test";
import React, {act} from "react";
import {createRoot, type Root} from "react-dom/client";

import fs from "../../../src/betterdiscord/polyfill/fs";
import JsonStore from "../../../src/betterdiscord/stores/json";
import Logger from "../../../src/common/logger";

const createStore = () => new (JsonStore.constructor as new () => typeof JsonStore)();
const spies: Array<{mockRestore(): void;}> = [];
let files: Map<string, string>;
let failWrite: boolean;
let failReplace: boolean;
const mounted: Array<{root: Root; host: HTMLElement;}> = [];
const reactEnvironment = globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean;};
let previousReactEnvironment: boolean | undefined;

// Bun module mocks are process-wide. Plugin Doctor replaces this singleton,
// so exercise its real implementation in one explicitly isolated test process.
if (process.env.SOLCORD_JSON_STORE_TEST !== "isolated") {
    test("shared JSON store passes the isolated persistence and live-subscription contracts", () => {
        const result = Bun.spawnSync({
            cmd: [process.execPath, "test", import.meta.path],
            cwd: process.cwd(),
            stdout: "pipe",
            stderr: "pipe",
            env: {...process.env, SOLCORD_JSON_STORE_TEST: "isolated"},
            timeout: 20_000
        });
        const output = result.stdout.toString() + result.stderr.toString();
        expect(result.exitCode, output).toBe(0);
        expect(output).toContain("10 pass");
        expect(output).toContain("0 fail");
    });
}
else {
    beforeEach(() => {
        previousReactEnvironment = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
        reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
        files = new Map();
        failWrite = false;
        failReplace = false;
        spies.push(
            spyOn(fs, "existsSync").mockImplementation(file => files.has(String(file))),
            spyOn(fs, "readFileSync").mockImplementation(file => {
                if (!files.has(String(file))) throw new Error("Fixture file not found");
                return files.get(String(file))!;
            }),
            spyOn(fs, "writeFileSync").mockImplementation((file, value) => {
                if (failWrite) throw new Error("Fixture write failed");
                files.set(String(file), String(value));
            }),
            spyOn(fs, "renameSync").mockImplementation((from, to) => {
                if (failReplace) throw new Error("Fixture replace failed");
                files.set(String(to), files.get(String(from))!);
                files.delete(String(from));
            }),
            spyOn(fs, "unlinkSync").mockImplementation(file => {files.delete(String(file));})
        );
    });

    afterEach(async () => {
        for (const {root, host} of mounted.splice(0)) {await act(async () => root.unmount()); host.remove();}
        reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousReactEnvironment;
        for (const spy of spies.splice(0)) spy.mockRestore();
    });

    describe("Shared JSON store persistence", () => {
        test("successful writes keep the public file names, falsey values, and restart behavior", () => {
            const store = createStore();
            store.set("misc", "visible", false);
            store.setData("FixtureAddon", "volume", 0);
            store.setData("FixtureAddon", "draft", "");
            store.setData("FixtureAddon", "optional", null);
            expect([...files.keys()].every(file => file.endsWith("misc.json") || file.endsWith("FixtureAddon.config.json"))).toBeTrue();
            const restarted = createStore();
            expect(restarted.get("misc", "visible")).toBeFalse();
            expect(restarted.getData<number>("FixtureAddon", "volume")).toBe(0);
            expect(restarted.getData<string>("FixtureAddon", "draft")).toBe("");
            expect(restarted.getData("FixtureAddon", "optional")).toBeNull();
        });

        for (const failure of ["write", "replace"] as const) {
            test(`failed ${failure} leaves settings and plugin caches, files, and notifications unchanged`, () => {
                const store = createStore();
                store.set("misc", "visible", false);
                store.setData("FixtureAddon", "enabled", false);
                const beforeFiles = new Map(files);
                let events = 0;
                store.addChangeListener(() => events++);
                store.addPluginChangeListener("FixtureAddon", () => events++);
                failWrite = failure === "write";
                failReplace = failure === "replace";

                for (const action of [
                    () => store.set("misc", "visible", true),
                    () => store.set("misc", {replacement: true}),
                    () => store.delete("misc", "visible"),
                    () => store.setData("FixtureAddon", "enabled", true),
                    () => store.deleteData("FixtureAddon", "enabled")
                ]) {
                    expect(action).toThrow();
                    expect(store.get("misc")).toEqual({visible: false});
                    expect(store.getData("FixtureAddon", "enabled")).toBeFalse();
                    expect(files).toEqual(beforeFiles);
                    expect(events).toBe(0);
                }
            });
        }

        test("serialization errors cannot install unsavable cache entries", () => {
            const store = createStore();
            store.setData("FixtureAddon", "value", "previous");
            const cyclic: Record<string, unknown> = {};
            cyclic.self = cyclic;
            expect(() => store.setData("FixtureAddon", "value", cyclic)).toThrow();
            expect(store.getData<string>("FixtureAddon", "value")).toBe("previous");
            expect([...files.keys()].some(file => file.endsWith(".tmp"))).toBeFalse();
        });

        test("plugin change and delete callbacks retain their argument contracts", () => {
            const store = createStore();
            const all: unknown[][] = [];
            const key: unknown[][] = [];
            store.addPluginChangeListener("FixtureAddon", (...args: unknown[]) => all.push(args));
            store.addPluginChangeListener("FixtureAddon", (...args: unknown[]) => key.push(args), "value");
            store.setData("FixtureAddon", "value", false);
            store.deleteData("FixtureAddon", "value");
            expect(all).toEqual([["value", false], ["value"]]);
            expect(key).toEqual([[false], []]);
        });

        test("a throwing plugin listener neither reports a failed save nor skips the next listener", () => {
            const store = createStore();
            spies.push(spyOn(Logger, "warn").mockImplementation(() => {}));
            let delivered = 0;
            store.addPluginChangeListener("FixtureAddon", () => {throw new Error("Fixture listener failed");});
            store.addPluginChangeListener("FixtureAddon", () => delivered++);
            expect(() => store.setData("FixtureAddon", "enabled", true)).not.toThrow();
            expect(delivered).toBe(1);
            expect(createStore().getData("FixtureAddon", "enabled")).toBeTrue();
        });

        test("malformed JSON roots are inert on load and cannot replace a good plugin cache", () => {
            const store = createStore();
            store.set("misc", "safe", true);
            store.setData("FixtureAddon", "safe", true);
            const miscFile = [...files.keys()].find(file => file.endsWith("misc.json"))!;
            const pluginFile = [...files.keys()].find(file => file.endsWith("FixtureAddon.config.json"))!;
            spies.push(spyOn(Logger, "error").mockImplementation(() => {}));
            for (const malformed of ["null", "[]", "42", JSON.stringify("text")]) {
                files.set(miscFile, malformed);
                files.set(pluginFile, malformed);
                const restarted = createStore();
                expect(restarted.get("misc")).toEqual({});
                expect(restarted.getData("FixtureAddon", "safe")).toBeUndefined();
                expect(store.recache("FixtureAddon")).toBeFalse();
                expect(store.getData("FixtureAddon", "safe")).toBeTrue();
                expect(files.get(miscFile)).toBe(malformed);
                expect(files.get(pluginFile)).toBe(malformed);
            }
        });

        test("recache publishes only actual changes and does no work for unchanged values", () => {
            const store = createStore();
            store.setData("FixtureAddon", "stable", {nested: [1, false]});
            store.setData("FixtureAddon", "changed", "before");
            const file = [...files.keys()].find(name => name.endsWith("FixtureAddon.config.json"))!;
            const delivered: string[] = [];
            let events = 0;
            store.addChangeListener(() => events++);
            store.addPluginChangeListener("FixtureAddon", (key: string) => delivered.push(key));
            expect(store.recache("FixtureAddon")).toBeTrue();
            expect(delivered).toEqual([]);
            expect(events).toBe(0);
            files.set(file, JSON.stringify({changed: "after", stable: {nested: [1, false]}}));
            expect(store.recache("FixtureAddon")).toBeTrue();
            expect(delivered).toEqual(["changed"]);
            expect(events).toBe(1);
        });

        test("useData follows plugin/key changes, committed writes, deletion, and complete unsubscription", async () => {
            const store = createStore();
            store.setData("FirstAddon", "value", "first");
            store.setData("SecondAddon", "value", "second");
            store.setData("SecondAddon", "other", "other key");
            let renders = 0;
            function Value({plugin, field}: {plugin: string; field: string;}) {
                const value = store.useData<string>(plugin, field);
                renders++;
                return React.createElement("output", null, value ?? "missing");
            }
            const host = document.createElement("div");
            document.body.append(host);
            const root = createRoot(host);
            mounted.push({root, host});
            await act(async () => root.render(React.createElement(Value, {plugin: "FirstAddon", field: "value"})));
            expect(host.textContent).toBe("first");
            await act(async () => store.setData("FirstAddon", "value", "changed"));
            expect(host.textContent).toBe("changed");
            await act(async () => root.render(React.createElement(Value, {plugin: "SecondAddon", field: "value"})));
            expect(host.textContent).toBe("second");
            const afterSwitch = renders;
            await act(async () => store.setData("FirstAddon", "value", "old source"));
            expect(renders).toBe(afterSwitch);
            await act(async () => root.render(React.createElement(Value, {plugin: "SecondAddon", field: "other"})));
            expect(host.textContent).toBe("other key");
            await act(async () => store.deleteData("SecondAddon", "other"));
            expect(host.textContent).toBe("missing");
            const read = spyOn(store, "getData");
            spies.push(read);
            await act(async () => root.unmount());
            mounted.pop();
            host.remove();
            read.mockClear();
            store.setData("SecondAddon", "other", "after unmount");
            expect(read).not.toHaveBeenCalled();
        });

        test("useData catches a commit between rendering and subscribing without insertion-effect updates", async () => {
            const store = createStore();
            store.setData("FixtureAddon", "value", "before");
            const originalSubscribe = store.addPluginChangeListener.bind(store);
            let writeDuringSubscription = true;
            spies.push(spyOn(store, "addPluginChangeListener").mockImplementation((...args) => {
                if (writeDuringSubscription) {
                    writeDuringSubscription = false;
                    store.setData("FixtureAddon", "value", "during subscription");
                }
                return originalSubscribe(...args);
            }));
            const errors: unknown[][] = [];
            spies.push(spyOn(console, "error").mockImplementation((...args: unknown[]) => {errors.push(args);}));
            function Value() {return React.createElement("output", null, store.useData<string>("FixtureAddon", "value"));}
            const host = document.createElement("div");
            document.body.append(host);
            const root = createRoot(host);
            mounted.push({root, host});
            await act(async () => root.render(React.createElement(Value)));
            expect(host.textContent).toBe("during subscription");
            expect(errors).toEqual([]);
        });
    });
}
