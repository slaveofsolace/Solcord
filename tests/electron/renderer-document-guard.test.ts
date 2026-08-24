// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {isRendererDocumentGeneration, RendererDocumentInjectionGuard} from "../../src/electron/main/modules/renderer-document-guard";

const FIRST_DOCUMENT = "A".repeat(22);
const SECOND_DOCUMENT = "B".repeat(22);

describe("renderer document injection guard", () => {
    test("ignores duplicate calls in one document but permits a full reload in the same WebContents", () => {
        const webContents = {};
        const guard = new RendererDocumentInjectionGuard<object>();

        expect(guard.claim(webContents, FIRST_DOCUMENT)).toBe("claimed");
        expect(guard.claim(webContents, FIRST_DOCUMENT)).toBe("duplicate");
        expect(guard.complete(webContents, FIRST_DOCUMENT)).toBe(true);
        expect(guard.claim(webContents, FIRST_DOCUMENT)).toBe("duplicate");

        expect(guard.claim(webContents, SECOND_DOCUMENT)).toBe("claimed");
        expect(guard.complete(webContents, SECOND_DOCUMENT)).toBe(true);
        expect(guard.claim(webContents, SECOND_DOCUMENT)).toBe("duplicate");
    });

    test("does not let a stale document completion replace a newer in-flight generation", () => {
        const webContents = {};
        const guard = new RendererDocumentInjectionGuard<object>();
        expect(guard.claim(webContents, FIRST_DOCUMENT)).toBe("claimed");
        expect(guard.claim(webContents, SECOND_DOCUMENT)).toBe("claimed");
        expect(guard.complete(webContents, FIRST_DOCUMENT)).toBe(false);
        expect(guard.complete(webContents, SECOND_DOCUMENT)).toBe(true);
    });

    test("rejects caller-chosen malformed generations", () => {
        const guard = new RendererDocumentInjectionGuard<object>();
        const owner = {};
        for (const value of [undefined, null, 42, "", "short", "a".repeat(23), "!".repeat(22)]) {
            expect(isRendererDocumentGeneration(value)).toBe(false);
            expect(guard.claim(owner, value)).toBe("invalid");
        }
    });
});
