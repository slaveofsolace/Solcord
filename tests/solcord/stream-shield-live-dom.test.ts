// SPDX-License-Identifier: Apache-2.0

import {beforeEach, describe, expect, test} from "bun:test";

import {describeSolcordStreamShieldResolution, SolcordStreamShieldDom, type SolcordStreamShieldSettings} from "../../src/betterdiscord/modules/solcord/stream-shield";

const ALL: SolcordStreamShieldSettings = {
    redactGuilds: true,
    redactChannels: true,
    redactDMs: true,
    redactNotifications: true,
    redactNotes: true,
    redactAccount: true
};

describe("Stream Shield exact-client DOM redaction", () => {
    beforeEach(() => {
        document.head.innerHTML = "";
        document.body.innerHTML = "";
        document.documentElement.className = "";
    });

    test("tags verified shell landmarks while leaving Settings and account controls usable", () => {
        document.body.innerHTML = `
            <div id="app-mount">
                <nav id="guilds" aria-label="Servers sidebar"><div data-list-id="guildsnav"></div></nav>
                <nav id="channels" aria-label="Channels"><div data-list-id="channels-123"></div></nav>
                <nav id="dms" aria-label="Direct Messages"><div data-list-id="private-channels"></div></nav>
                <div id="toast" role="alert" class="toast_current">Private notice</div>
                <section id="profile"><textarea id="note" aria-label="User note"></textarea></section>
                <section id="account" aria-label="User area">
                    <div id="account-avatar" class="avatar_current"></div>
                    <div id="account-name" class="nameTag_current">Owner</div>
                    <button aria-label="Mute"></button><button aria-label="Deafen"></button><button id="settings-button" aria-label="User Settings"></button>
                </section>
                <div class="standardSidebarView_current">
                    <div id="settings-control-center" class="solcord-control-center">
                        <nav aria-label="Channels"><div data-list-id="channels-settings"></div></nav>
                        <div role="alert" class="notification_current">Settings status</div>
                    </div>
                </div>
            </div>
        `;
        const dom = new SolcordStreamShieldDom(document);
        const result = dom.reconcile(true, ALL);

        expect(result).toEqual({
            active: true,
            requested: ["guilds", "channels", "dms", "notifications", "notes", "account"],
            resolved: ["guilds", "channels", "dms", "notifications", "notes", "account"],
            waiting: [],
            drift: [],
            tagged: 7
        });
        for (const id of ["guilds", "channels", "dms", "toast", "profile", "account-avatar", "account-name"]) {
            expect(document.getElementById(id)?.classList.contains("solcord-stream-redaction")).toBeTrue();
        }
        expect(document.getElementById("settings-button")?.classList.contains("solcord-stream-redaction")).toBeFalse();
        expect(document.getElementById("settings-control-center")?.querySelector(".solcord-stream-redaction")).toBeNull();
    });

    test("reports selector drift separately from regions absent on the current route", () => {
        document.body.innerHTML = `<div class="guilds_newHash"><span>Unverified servers</span></div>`;
        const dom = new SolcordStreamShieldDom(document);
        const result = dom.reconcile(true, {...ALL, redactChannels: false, redactDMs: false, redactNotifications: false, redactAccount: false});

        expect(result.resolved).toEqual([]);
        expect(result.drift).toEqual(["guilds"]);
        expect(result.waiting).toEqual(["notes"]);
        expect(describeSolcordStreamShieldResolution(result, false, "preview")).toContain("Selector drift left guilds unchanged");
        expect(describeSolcordStreamShieldResolution(result, false, "preview")).toContain("Waiting for notes on the current route");
        expect(describeSolcordStreamShieldResolution(result, false, "preview")).toContain("Automatic Go Live detection is unavailable");
    });

    test("retags route replacements without duplicates and removes every owned tag on dispose", () => {
        document.body.innerHTML = `<nav id="guilds-a" aria-label="Servers"><div data-list-id="guildsnav"></div></nav>`;
        const dom = new SolcordStreamShieldDom(document);
        const settings = {...ALL, redactChannels: false, redactDMs: false, redactNotifications: false, redactNotes: false, redactAccount: false};
        expect(dom.reconcile(true, settings).tagged).toBe(1);
        const old = document.getElementById("guilds-a")!;

        old.remove();
        document.body.innerHTML = `<nav id="guilds-b" aria-label="Servers"><div data-list-id="guildsnav"></div></nav>`;
        expect(dom.reconcile(true, settings).tagged).toBe(1);
        expect(old.classList.contains("solcord-stream-redaction")).toBeFalse();
        expect(document.querySelectorAll(".solcord-stream-redaction")).toHaveLength(1);
        expect(document.getElementById("guilds-b")?.getAttribute("data-solcord-stream-region")).toBe("guilds");

        dom.dispose();
        expect(document.querySelector(".solcord-stream-redaction")).toBeNull();
        expect(document.querySelector("[data-solcord-stream-region]")).toBeNull();
    });

    test("does no DOM work while inactive and clears active redactions immediately", () => {
        document.body.innerHTML = `<nav id="guilds" aria-label="Servers"><div data-list-id="guildsnav"></div></nav>`;
        const dom = new SolcordStreamShieldDom(document);
        const settings = {...ALL, redactChannels: false, redactDMs: false, redactNotifications: false, redactNotes: false, redactAccount: false};

        expect(dom.reconcile(false, settings).tagged).toBe(0);
        expect(document.querySelector(".solcord-stream-redaction")).toBeNull();
        expect(dom.reconcile(true, settings).tagged).toBe(1);
        expect(dom.reconcile(false, settings).tagged).toBe(0);
        expect(document.querySelector(".solcord-stream-redaction")).toBeNull();

        const untouched = new SolcordStreamShieldDom({querySelectorAll: () => {throw new Error("inactive scan");}} as unknown as ParentNode);
        expect(untouched.reconcile(false, settings).tagged).toBe(0);
    });
});
