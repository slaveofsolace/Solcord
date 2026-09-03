// SPDX-License-Identifier: Apache-2.0

import {afterEach, describe, expect, test} from "bun:test";

import {SolcordDisposalScope} from "../../src/betterdiscord/modules/solcord/disposal";
import {SolcordNativeSuiteController} from "../../src/betterdiscord/modules/solcord/native-suite";

const owned: Array<{controller: SolcordNativeSuiteController; scope: SolcordDisposalScope;}> = [];
const roots: HTMLElement[] = [];
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function start(addons: Record<string, boolean>) {
    const scope = new SolcordDisposalScope();
    const controller = new SolcordNativeSuiteController(scope, addons, {composerPreferences: {timestampFormat: "iso", counterWarningPercent: 80}});
    controller.start();
    owned.push({controller, scope});
    return {controller, scope};
}

function timestamp() {
    const root = document.createElement("article");
    root.innerHTML = `<time datetime="2026-09-02T12:00:00Z" title="Original tooltip"><span>12:00 PM</span></time>`;
    document.body.append(root);
    roots.push(root);
    return {root, time: root.querySelector("time")!, label: root.querySelector("span")!};
}

afterEach(() => {
    for (const {controller, scope} of owned.splice(0)) {controller.dispose(); scope.dispose();}
    for (const root of roots.splice(0)) root.remove();
});

describe("Composer Toolkit ownership", () => {
    test("timestamp teardown restores the original nodes and their handlers", () => {
        const {time, label} = timestamp();
        let clicks = 0;
        label.addEventListener("click", () => clicks++);
        const {controller, scope} = start({CompleteTimestamps: true});
        expect(time.textContent).toContain("2026-09-02");
        controller.dispose();
        scope.dispose();
        expect(time.firstElementChild === label).toBeTrue();
        label.click();
        expect(clicks).toBe(1);
        expect(time.title).toBe("Original tooltip");
    });

    test("a reused timestamp updates with its new datetime instead of keeping stale text", async () => {
        const {time} = timestamp();
        start({CompleteTimestamps: true});
        time.dateTime = "2026-09-03T10:15:00Z";
        await settle();
        expect(time.textContent).toContain("2026-09-03 10:15:00 UTC");
        expect(time.title).toBe("2026-09-03T10:15:00.000Z");
    });

    test("route removals release timestamp decorations without overwriting a later native render", async () => {
        const {root, time, label} = timestamp();
        const {controller} = start({CompleteTimestamps: true});
        root.remove();
        await settle();
        expect(time.hasAttribute("data-solcord-complete-time")).toBeFalse();
        expect(time.firstElementChild === label).toBeTrue();
        document.body.append(root);
        await settle();
        time.textContent = "Discord rendered a newer label";
        time.title = "Discord rendered a newer tooltip";
        controller.dispose();
        expect(time.textContent).toBe("Discord rendered a newer label");
        expect(time.title).toBe("Discord rendered a newer tooltip");
    });

    test("reply-only controls install no counter or timestamp observer", () => {
        const {scope} = start({DoubleClickToReply: true});
        expect(scope.counts()).toEqual({});
    });
});
