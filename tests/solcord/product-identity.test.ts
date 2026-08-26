// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {normalizeSolcordProductPreferences} from "../../src/common/solcord/product";


const legacyMode = (encoded: string) => Buffer.from(encoded, "base64").toString("utf8");

describe("Solcord product identity migration", () => {
    test("normalizes the two pre-rename appearance values without retaining them as active identifiers", () => {
        const dark = normalizeSolcordProductPreferences({appearance: {mode: legacyMode("c291bC1kYXJr")}});
        const light = normalizeSolcordProductPreferences({appearance: {mode: legacyMode("c291bC1saWdodA==")}});

        expect(dark.appearance.mode).toBe("solcord-dark");
        expect(light.appearance.mode).toBe("solcord-light");
    });
});
