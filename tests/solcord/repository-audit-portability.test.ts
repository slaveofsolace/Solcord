// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {portableTextByteLength} from "../../scripts/helpers/portable-text.mjs";

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
});
