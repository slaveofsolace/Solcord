// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {RendererDocumentInjectionGuard} from "../../src/electron/main/modules/renderer-document-guard";

describe("renderer document injection guard", () => {
    test("requires a main-minted document boundary and allows one attempt per document", () => {
        const webContents = {};
        const guard = new RendererDocumentInjectionGuard<object>();

        expect(guard.claim(webContents)).toEqual({status: "unbound"});
        guard.beginDocument(webContents);
        const first = guard.claim(webContents);
        expect(first.status).toBe("claimed");
        if (first.status !== "claimed") throw new Error("Expected a claimed document.");
        expect(guard.claim(webContents)).toEqual({status: "duplicate"});
        expect(guard.complete(webContents, first.token)).toBe(true);
        expect(guard.claim(webContents)).toEqual({status: "duplicate"});

        guard.beginDocument(webContents);
        const second = guard.claim(webContents);
        expect(second.status).toBe("claimed");
        if (second.status !== "claimed") throw new Error("Expected a claimed reloaded document.");
        expect(second.token).not.toBe(first.token);
        expect(guard.complete(webContents, second.token)).toBe(true);
        expect(guard.claim(webContents)).toEqual({status: "duplicate"});
    });

    test("does not let a stale asynchronous completion finish a newer document", () => {
        const webContents = {};
        const guard = new RendererDocumentInjectionGuard<object>();
        guard.beginDocument(webContents);
        const first = guard.claim(webContents);
        if (first.status !== "claimed") throw new Error("Expected a claimed document.");
        guard.beginDocument(webContents);
        const second = guard.claim(webContents);
        if (second.status !== "claimed") throw new Error("Expected a claimed reloaded document.");
        expect(guard.complete(webContents, first.token)).toBe(false);
        expect(guard.complete(webContents, second.token)).toBe(true);
    });

    test("fails closed after one failed attempt until main begins a new document", () => {
        const guard = new RendererDocumentInjectionGuard<object>();
        const owner = {};
        guard.beginDocument(owner);
        const claim = guard.claim(owner);
        if (claim.status !== "claimed") throw new Error("Expected a claimed document.");
        guard.fail(owner, claim.token);
        expect(guard.claim(owner)).toEqual({status: "duplicate"});
        guard.beginDocument(owner);
        expect(guard.claim(owner).status).toBe("claimed");
        guard.release(owner);
        expect(guard.claim(owner)).toEqual({status: "unbound"});
    });
});
