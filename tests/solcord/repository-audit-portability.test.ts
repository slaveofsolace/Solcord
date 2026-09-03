// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {normalizePortableText, portableTextByteLength} from "../../scripts/helpers/portable-text.mjs";

describe("Solcord repository audit portability", () => {
    test("measures equivalent text identically across checkout line endings", () => {
        const lf = "alpha\nbeta\ngamma\n";
        const crlf = "alpha\r\nbeta\r\ngamma\r\n";
        const legacyCr = "alpha\rbeta\rgamma\r";

        expect(portableTextByteLength(crlf)).toBe(portableTextByteLength(lf));
        expect(portableTextByteLength(legacyCr)).toBe(portableTextByteLength(lf));
        expect(portableTextByteLength("cafe\n")).toBe(Buffer.byteLength("cafe\n", "utf8"));
        expect(() => portableTextByteLength(null as unknown as string)).toThrow("Text metrics require a string.");
    });

    test("compares checked-out reports without treating Windows line endings as stale content", () => {
        const report = "# Repository audit\n\n| Files | Lines |\n| 3 | 42 |\n";
        expect(normalizePortableText(report.replace(/\n/g, "\r\n"))).toBe(report);
        expect(normalizePortableText(report.replace(/\n/g, "\r"))).toBe(report);
        expect(normalizePortableText(report)).toBe(report);
    });

    test("still detects changed content, spacing, and missing final newlines", () => {
        const report = "audit: 42\n";
        expect(normalizePortableText("audit: 43\r\n")).not.toBe(report);
        expect(normalizePortableText("audit: 42 \r\n")).not.toBe(report);
        expect(normalizePortableText("audit: 42")).not.toBe(report);
        expect(normalizePortableText("\ufeffaudit: 42\r\n")).not.toBe(report);
        expect(() => normalizePortableText(undefined as unknown as string)).toThrow("Text metrics require a string.");
    });
});
