// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {OriginalPreloadRegistry} from "../../src/electron/main/modules/original-preload-registry";


class FakeWebContents {
    #destroyed?: () => void;

    constructor(readonly id: number) {}

    once(event: "destroyed", listener: () => void): void {
        expect(event).toBe("destroyed");
        this.#destroyed = listener;
    }

    destroy(): void {
        this.#destroyed?.();
    }
}

describe("per-WebContents original preload registry", () => {
    test("keeps simultaneous BrowserWindow preload associations isolated", () => {
        const registry = new OriginalPreloadRegistry();
        const shell = new FakeWebContents(17);
        const activity = new FakeWebContents(23);

        expect(registry.register(shell, "C:\\Discord\\shell.asar\\mainScreenPreload.js")).toBe(true);
        expect(registry.register(activity, "C:\\Discord\\activity.asar\\activityPreload.js")).toBe(true);
        expect(registry.resolve(shell.id)).toEndWith("mainScreenPreload.js");
        expect(registry.resolve(activity.id)).toEndWith("activityPreload.js");
        expect(registry.resolve(999)).toBeUndefined();
    });

    test("releases the association when its WebContents is destroyed", () => {
        const registry = new OriginalPreloadRegistry();
        const contents = new FakeWebContents(31);
        registry.register(contents, "/opt/discord/core.asar/mainScreenPreload.js");
        expect(registry.sizeForTests()).toBe(1);
        contents.destroy();
        expect(registry.resolve(contents.id)).toBeUndefined();
        expect(registry.sizeForTests()).toBe(0);
    });

    test("rejects malformed identifiers and preload values", () => {
        const registry = new OriginalPreloadRegistry();
        expect(registry.register(new FakeWebContents(0), "/opt/discord/preload.js")).toBe(false);
        expect(registry.register(new FakeWebContents(1), "")).toBe(false);
        expect(registry.resolve(Number.NaN)).toBeUndefined();
    });
});
