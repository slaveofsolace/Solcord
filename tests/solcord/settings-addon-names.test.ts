import {describe, expect, test} from "bun:test";

import {normalizeSettingsSearchTerms, resolveAddonDisplayNames} from "../../src/betterdiscord/ui/settings/addon-names";

describe("Solcord settings addon names", () => {
    test("keeps search and menus usable when addon metadata is incomplete", () => {
        const throwing = {getName: () => {throw new Error("malformed addon");}};

        expect(resolveAddonDisplayNames([
            {name: "Voice Notes"},
            {name: undefined, getName: () => "Call Context"},
            {name: ""},
            {name: "   "},
            throwing,
            {}
        ])).toEqual(["Call Context", "Voice Notes"]);
    });

    test("sorts valid names without changing their display text", () => {
        expect(resolveAddonDisplayNames([
            {name: "privacy Controls"},
            {name: "Audio Console"},
            {name: "Voice Note Studio"}
        ])).toEqual(["Audio Console", "privacy Controls", "Voice Note Studio"]);
    });

    test("removes malformed terms from nested settings search sources", () => {
        expect(normalizeSettingsSearchTerms([
            "Solcord",
            ["Privacy", undefined, null, ["Voice", ""]],
            {label: "not a string term"},
            42
        ])).toEqual(["Solcord", "Privacy", "Voice"]);
    });
});
