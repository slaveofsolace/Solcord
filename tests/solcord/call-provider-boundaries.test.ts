// SPDX-License-Identifier: Apache-2.0

import {afterEach, describe, expect, test} from "bun:test";

import {SolcordDisposalScope} from "../../src/betterdiscord/modules/solcord/disposal";
import {SolcordNativeSuiteController} from "../../src/betterdiscord/modules/solcord/native-suite";

const owned: Array<{controller: SolcordNativeSuiteController; scope: SolcordDisposalScope;}> = [];
const roots: HTMLElement[] = [];

function fixture(addons: Record<string, boolean>) {
    const root = document.createElement("div");
    root.innerHTML = `<div class="panels_test"></div><div data-list-item-id="members-777___555" data-user-id="555"><span data-user-id="555"><img data-user-id="555" alt="Avatar"></span></div>`;
    document.body.append(root);
    roots.push(root);
    const scope = new SolcordDisposalScope();
    let notify = () => {};
    const controller = new SolcordNativeSuiteController(scope, addons, {
        currentCall: () => ({channelId: "777", connectedAt: Date.now() - 5_000, participantCount: 2, speakerCount: 1, viewerCount: 1, participantIds: ["555", "666"], speakerIds: ["555"], viewerLabels: ["Fixture Viewer"]}),
        subscribeCall: listener => {notify = listener; return () => {};},
        voiceActivityAvailable: true,
        spectatorsAvailable: true,
        spectatorsReady: () => true
    });
    controller.start();
    owned.push({controller, scope});
    return {controller, scope, root, notify: () => notify()};
}

afterEach(() => {
    for (const {controller, scope} of owned.splice(0)) {controller.dispose(); scope.dispose();}
    for (const root of roots.splice(0)) root.remove();
});

describe("Call Context provider boundaries", () => {
    test("Voice Activity renders one badge per member row and never starts the disabled call timer", () => {
        const {root, notify, scope} = fixture({VoiceActivity: true});
        expect(root.querySelectorAll("[data-solcord-voice-presence]")).toHaveLength(1);
        expect(root.querySelector("img")!.childNodes).toHaveLength(0);
        expect(root.querySelector("[data-solcord-call-badge]")).toBeNull();
        const badge = root.querySelector("[data-solcord-voice-presence]");
        notify();
        notify();
        expect(root.querySelectorAll("[data-solcord-voice-presence]")).toHaveLength(1);
        expect(root.querySelector("[data-solcord-voice-presence]")).toBe(badge);
        expect(scope.counts().interval).toBeUndefined();
    });

    test("Call Time Counter does not reveal disabled viewer or speaking features", () => {
        const {root, notify} = fixture({CallTimeCounter: true});
        const badge = root.querySelector<HTMLElement>("[data-solcord-call-badge]")!;
        expect(badge.textContent).toMatch(/00:00:0[45]/);
        expect(badge.textContent).not.toContain("Fixture Viewer");
        expect(badge.textContent).not.toContain("speaking");
        notify();
        expect(root.querySelector("[data-solcord-call-badge]")).toBe(badge);
        expect(badge.getAttribute("aria-live")).toBe("off");
    });

    test("Show Spectators renders viewers without activating the disabled timer", () => {
        const {root, scope} = fixture({ShowSpectators: true});
        const badge = root.querySelector("[data-solcord-call-badge]")!;
        expect(badge.textContent).toContain("Fixture Viewer");
        expect(badge.textContent).not.toMatch(/\d{2}:\d{2}:\d{2}/);
        expect(scope.counts().interval).toBeUndefined();
    });
});
