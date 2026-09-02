// SPDX-License-Identifier: Apache-2.0

import {beforeEach, describe, expect, test} from "bun:test";

import {findSolcordSettingsScrollOwner, scrollSolcordSettingsTarget} from "../../src/betterdiscord/ui/solcord/scroll-owner";

function rectangle(top: number, left = 0, width = 640, height = 40): DOMRect {
    return {top, left, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({})} as DOMRect;
}

describe("Solcord native settings scroll ownership", () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="document-shell">
                <div id="settings-owner" style="overflow-y: auto">
                    <main class="solcord-control-center">
                        <nav class="solcord-workspace-nav"></nav>
                        <section id="workspace"></section>
                    </main>
                </div>
            </div>
        `;
    });

    test("captures Discord's nearest declared scroller even before the page is tall enough to overflow", () => {
        const owner = document.getElementById("settings-owner")!;
        const target = document.getElementById("workspace")!;
        Object.defineProperties(owner, {clientHeight: {value: 600}, scrollHeight: {value: 600}});

        expect(findSolcordSettingsScrollOwner(target)).toBe(owner);
    });

    test("never pushes a visible workspace downward and moves only the captured owner when hidden above", () => {
        const owner = document.getElementById("settings-owner")!;
        const target = document.getElementById("workspace")!;
        const navigation = document.querySelector<HTMLElement>(".solcord-workspace-nav")!;
        owner.scrollTop = 300;
        owner.getBoundingClientRect = () => rectangle(0, 0, 640, 500);
        navigation.getBoundingClientRect = () => rectangle(0, 0, 640, 48);
        target.getBoundingClientRect = () => rectangle(180, 0, 640, 40);
        let requested: number | undefined;
        owner.scrollTo = options => {
            requested = typeof options === "object" ? options.top : undefined;
            if (requested !== undefined) owner.scrollTop = requested;
        };

        expect(scrollSolcordSettingsTarget(target, "upward-only")).toBeFalse();
        expect(requested).toBeUndefined();

        target.getBoundingClientRect = () => rectangle(-40, 0, 640, 40);
        expect(scrollSolcordSettingsTarget(target, "upward-only")).toBeTrue();
        expect(requested).toBe(260);
        expect(document.scrollingElement?.scrollTop ?? 0).toBe(0);
    });

    test("returns without a document fallback when no native settings owner can be proven", () => {
        const target = document.getElementById("workspace")!;
        document.getElementById("settings-owner")!.style.overflowY = "visible";
        let documentScrollCalled = false;
        const original = window.scrollTo;
        window.scrollTo = () => {documentScrollCalled = true;};
        try {
            expect(scrollSolcordSettingsTarget(target, "target")).toBeFalse();
            expect(documentScrollCalled).toBeFalse();
        }
        finally {window.scrollTo = original;}
    });
});
