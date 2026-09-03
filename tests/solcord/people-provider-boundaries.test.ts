import {afterEach, describe, expect, test} from "bun:test";

import {SolcordDisposalScope} from "../../src/betterdiscord/modules/solcord/disposal";
import {SolcordNativeSuiteController} from "../../src/betterdiscord/modules/solcord/native-suite";

const owned: Array<{controller: SolcordNativeSuiteController; scope: SolcordDisposalScope; root: HTMLElement;}> = [];

function start(providers: Record<string, boolean>) {
    const root = document.createElement("div");
    root.innerHTML = `<nav data-list-id="guildsnav"><div data-list-item-id="guildsnav___222"><a id="guild" href="/channels/222/333" aria-label="Workshop">Workshop</a></div></nav>
        <nav data-list-id="channels"><li><a id="channel" href="/channels/222/333" aria-label="general">general</a></li></nav>
        <nav data-list-id="private-channels"><li><a id="dm" href="/channels/@me/111" aria-label="Ada">Ada</a></li></nav>
        <article><a id="message-link" href="/channels/222/333" aria-label="Read the discussion">discussion</a><a id="dm-link" href="/channels/@me/111">shared link</a></article>`;
    document.body.append(root);
    const scope = new SolcordDisposalScope();
    let detailsReads = 0;
    const controller = new SolcordNativeSuiteController(scope, providers, {
        peopleState: {pinnedDmIds: ["111"], hiddenGuildIds: ["222"], guildAliases: {222: "My workspace"}, favoriteFriendIds: [], hiddenFriendIds: []},
        guildDetails: () => {detailsReads++; return {name: "Workshop", channelCount: 12};}
    });
    owned.push({controller, scope, root});
    controller.start();
    return {root, controller, scope, detailsReads: () => detailsReads};
}

afterEach(() => {
    for (const {controller, scope, root} of owned.splice(0)) {
        controller.dispose();
        scope.dispose();
        root.remove();
    }
});

describe("Solcord People provider boundaries", () => {
    test("a persistence result updates its status without rebuilding DOM resources or losing local selections", () => {
        const {root, controller, scope, detailsReads} = start({PinDMs: true});
        const initial = controller.peopleSnapshot()!;
        const counts = scope.counts();
        const row = root.querySelector("[data-solcord-pinned-dm]");
        controller.updatePeoplePersistence(true);
        expect(controller.statuses().find(status => status.id === "people-and-spaces")?.detail).toContain("encrypted");
        controller.updatePeoplePersistence(false);
        expect(controller.statuses().find(status => status.id === "people-and-spaces")?.detail).toContain("session-only");
        expect(controller.peopleSnapshot()).toEqual(initial);
        expect(scope.counts()).toEqual(counts);
        expect(root.querySelector("[data-solcord-pinned-dm]")).toBe(row);
        expect(detailsReads()).toBe(0);
    });
    test("Server Details changes only a proven guild entry, without activating saved pins, hiding, or aliases", () => {
        const {root, controller, scope} = start({ServerDetails: true});
        expect(root.querySelector("#guild")?.getAttribute("title")).toBe("Workshop · 12 channels");
        expect(root.querySelector("#channel")?.getAttribute("aria-label")).toBe("general");
        expect(root.querySelector("#message-link")?.getAttribute("aria-label")).toBe("Read the discussion");
        expect(root.querySelector("[data-solcord-pinned-dm]")).toBeNull();
        expect(root.querySelector("[data-solcord-hidden-guild]")).toBeNull();
        expect(root.querySelector("[data-solcord-guild-alias]")).toBeNull();
        controller.dispose();
        scope.dispose();
        expect(root.querySelector("#guild")?.getAttribute("aria-label")).toBe("Workshop");
        expect(root.querySelector("#guild")?.getAttribute("title")).toBeNull();
    });

    test("Pin DMs only changes native DM rows and performs no disabled guild-details work", () => {
        const {root, detailsReads} = start({PinDMs: true});
        expect(root.querySelector("#dm")?.closest("li")?.getAttribute("data-solcord-pinned-dm")).toBe("true");
        expect(root.querySelector("#dm-link")?.hasAttribute("data-solcord-pinned-dm")).toBeFalse();
        expect(root.querySelector("[data-solcord-hidden-guild]")).toBeNull();
        expect(root.querySelector("#guild")?.getAttribute("aria-label")).toBe("Workshop");
        expect(detailsReads()).toBe(0);
    });

    test("Server Hider cannot hide channel rows or message links with the same server ID", () => {
        const {root, detailsReads} = start({ServerHider: true});
        expect(root.querySelectorAll("[data-solcord-hidden-guild]")).toHaveLength(1);
        expect(root.querySelector("#guild")?.closest("[data-solcord-hidden-guild]")).not.toBeNull();
        expect(root.querySelector("#channel")?.closest("[data-solcord-hidden-guild]")).toBeNull();
        expect(root.querySelector("#message-link")?.closest("[data-solcord-hidden-guild]")).toBeNull();
        expect(detailsReads()).toBe(0);
    });

    test("local aliases do not replace channel labels or activate Server Details", () => {
        const {root, detailsReads} = start({EditServers: true});
        expect(root.querySelector("#guild")?.getAttribute("aria-label")).toBe("My workspace");
        expect(root.querySelector("#channel")?.getAttribute("aria-label")).toBe("general");
        expect(root.querySelectorAll("[data-solcord-guild-alias]")).toHaveLength(1);
        expect(detailsReads()).toBe(0);
    });
});
