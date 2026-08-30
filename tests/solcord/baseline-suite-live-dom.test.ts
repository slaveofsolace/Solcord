// SPDX-License-Identifier: Apache-2.0

import {beforeEach, describe, expect, test} from "bun:test";

import {resolveSolcordEmbedTargets, resolveSolcordLayoutTarget, SolcordBaselineSuite} from "../../src/betterdiscord/modules/solcord/baseline-suite";
import {defaultSolcordProductPreferences} from "../../src/common/solcord/product";

async function flushMutations(): Promise<void> {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

describe("Solcord baseline exact-client DOM adapters", () => {
    beforeEach(() => {
        document.head.innerHTML = "";
        document.body.innerHTML = "";
        document.documentElement.className = "";
    });
    test("resolves semantic shell landmarks without swallowing the account panel", () => {
        document.body.innerHTML = `
            <nav id="servers" aria-label="Servers sidebar"><div data-list-id="guildsnav"></div></nav>
            <aside id="left-column">
                <nav id="channels" aria-label="Channels"><div data-list-id="channels-123"></div></nav>
                <section id="account-panel"><button>Settings</button></section>
            </aside>
            <aside id="members" aria-label="Members"><div data-list-id="members-123"></div></aside>
        `;

        expect(resolveSolcordLayoutTarget(document, "guilds")?.id).toBe("servers");
        expect(resolveSolcordLayoutTarget(document, "channels")?.id).toBe("channels");
        expect(resolveSolcordLayoutTarget(document, "members")?.id).toBe("members");
        expect(resolveSolcordLayoutTarget(document, "channels")?.contains(document.getElementById("account-panel"))).toBe(false);
    });

    test("does not install a layout observer or shortcut until a region is selected", () => {
        const suite = new SolcordBaselineSuite({});
        const status = suite.start({...defaultSolcordProductPreferences().baseline, layoutCollapse: true});

        expect(status).toEqual({
            active: false,
            resources: {},
            enabled: [],
            unavailable: ["Layout Collapse: select at least one region; no layout adapter is running."]
        });
        expect(document.querySelector(".solcord-layout-restore")).toBeNull();
        suite.stop();
    });

    test("tags only requested regions and provides an outside-the-shell recovery control", () => {
        document.body.innerHTML = `
            <nav id="servers" aria-label="Servers sidebar"><div data-list-id="guildsnav"></div></nav>
            <aside><nav id="channels" aria-label="Channels"><div data-list-id="channels-123"></div></nav><section id="account-panel"><button>Settings</button></section></aside>
        `;
        const suite = new SolcordBaselineSuite({});
        const baseline = {...defaultSolcordProductPreferences().baseline, layoutCollapse: true, collapsedRegions: ["guilds", "channels"] as Array<"guilds" | "channels">};

        const status = suite.start(baseline);
        expect(status.enabled).toContain("Layout Collapse");
        expect(status.unavailable).toEqual([]);
        expect(document.getElementById("servers")?.classList.contains("solcord-layout-region-hidden")).toBe(true);
        expect(document.getElementById("channels")?.classList.contains("solcord-layout-region-hidden")).toBe(true);
        expect(document.getElementById("account-panel")?.classList.contains("solcord-layout-region-hidden")).toBe(false);

        const restore = document.querySelector<HTMLButtonElement>(".solcord-layout-restore")!;
        expect(restore.parentElement).toBe(document.body);
        expect(restore.getAttribute("aria-keyshortcuts")).toBe("Control+Shift+L");
        restore.click();
        expect(document.querySelector(".solcord-layout-region-hidden")).toBeNull();
        expect(restore.hidden).toBe(true);
        expect(suite.status().unavailable.join(" ")).toContain("shown temporarily");

        suite.stop();
        expect(document.querySelector(".solcord-layout-restore")).toBeNull();
        expect(document.getElementById("solcord-layout-collapse-runtime")).toBeNull();
        expect(suite.status()).toEqual({active: false, resources: {}, enabled: [], unavailable: []});
    });

    test("the documented shortcut restores a hidden channel landmark", () => {
        document.body.innerHTML = `<nav id="channels" aria-label="Channels"><div data-list-id="channels-123"></div></nav>`;
        const suite = new SolcordBaselineSuite({});
        suite.start({...defaultSolcordProductPreferences().baseline, layoutCollapse: true, collapsedRegions: ["channels"]});
        expect(document.getElementById("channels")?.classList.contains("solcord-layout-region-hidden")).toBe(true);

        document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, code: "KeyL", ctrlKey: true, shiftKey: true}));
        expect(document.getElementById("channels")?.classList.contains("solcord-layout-region-hidden")).toBe(false);
        suite.stop();
    });

    test("discovers current rich-embed roots instead of relying on embedWrapper", () => {
        document.body.innerHTML = `
            <li id="chat-messages-123-456">
                <article id="google-doc" class="embed__currentHash embedFull__currentHash">
                    <a href="https://docs.google.com/document/d/example">Project document</a>
                    <div class="embedTitle__currentHash">Project document</div>
                </article>
            </li>
        `;
        expect(resolveSolcordEmbedTargets(document).map(element => element.id)).toEqual(["google-doc"]);

        const suite = new SolcordBaselineSuite({});
        const status = suite.start({...defaultSolcordProductPreferences().baseline, embedControls: true});
        expect(status.enabled).toContain("Embed Controls");
        expect(status.unavailable).toEqual([]);
        const embed = document.getElementById("google-doc")!;
        const button = embed.querySelector<HTMLButtonElement>(".solcord-embed-control")!;
        expect(button?.getAttribute("aria-label")).toBe("Collapse this embed locally");
        button.click();
        expect(embed.classList.contains("solcord-embed-collapsed")).toBe(true);
        expect(button.getAttribute("aria-label")).toBe("Expand this embed locally");

        suite.stop();
        expect(embed.querySelector(".solcord-embed-control")).toBeNull();
        expect(embed.classList.contains("solcord-embed-host")).toBe(false);
        expect(embed.classList.contains("solcord-embed-collapsed")).toBe(false);
    });

    test("fails closed and reports drift when embed-like markup is not a verified root", () => {
        document.body.innerHTML = `
            <li id="chat-messages-123-456"><div class="embedTitle__unknown"><a href="https://docs.google.com/document/d/example">Project document</a></div></li>
        `;
        const suite = new SolcordBaselineSuite({});
        suite.start({...defaultSolcordProductPreferences().baseline, embedControls: true});

        expect(document.querySelector(".solcord-embed-control")).toBeNull();
        expect(suite.status().unavailable.join(" ")).toContain("could not be structurally verified");
        suite.stop();
    });

    test("retags route replacements, releases detached controls, and never duplicates a button", async () => {
        document.body.innerHTML = `<nav id="servers-a" aria-label="Servers"><div data-list-id="guildsnav"></div></nav>`;
        const suite = new SolcordBaselineSuite({});
        suite.start({...defaultSolcordProductPreferences().baseline, layoutCollapse: true, collapsedRegions: ["guilds"], embedControls: true});
        expect(suite.status().unavailable.join(" ")).toContain("no loaded rich embed");

        document.getElementById("servers-a")?.remove();
        document.body.insertAdjacentHTML("afterbegin", `<nav id="servers-b" aria-label="Servers"><div data-list-id="guildsnav"></div></nav>`);
        document.body.insertAdjacentHTML("beforeend", `<li id="chat-messages-1-2"><article id="route-embed" class="embed__new"><a href="https://docs.google.com/document/d/example">Document</a></article></li>`);
        await flushMutations();

        expect(document.getElementById("servers-b")?.classList.contains("solcord-layout-region-hidden")).toBe(true);
        expect(document.querySelectorAll("#route-embed > .solcord-embed-control")).toHaveLength(1);
        expect(suite.status().unavailable).toEqual([]);

        document.getElementById("route-embed")?.remove();
        await flushMutations();
        expect(document.querySelector(".solcord-embed-control")).toBeNull();
        expect(suite.status().unavailable.join(" ")).toContain("no loaded rich embed");
        suite.stop();
    });
});
