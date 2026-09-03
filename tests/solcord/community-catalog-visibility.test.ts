// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {visibleSolcordCommunityGroups, type SolcordAddonGroup} from "../../src/betterdiscord/ui/solcord/catalog";

const groups: readonly SolcordAddonGroup[] = [
    {
        id: "voice",
        title: "Voice",
        summary: "Local controls",
        addons: [
            {name: "BuiltIn", label: "Built-in voice tool", summary: "Included"},
            {name: "External", label: "External voice tool", summary: "Optional"}
        ]
    },
    {
        id: "media",
        title: "Media",
        summary: "Local media",
        addons: [{name: "Missing", label: "Missing media tool", summary: "Reference only"}]
    }
];

describe("installed community-plugin presentation", () => {
    test("does not offer dead switches for absent catalog files or duplicate built-ins", () => {
        expect(visibleSolcordCommunityGroups(groups, [
            {name: "BuiltIn", builtIn: true, installed: true},
            {name: "External", builtIn: false, installed: false},
            {name: "Missing", builtIn: false, installed: false}
        ])).toEqual([]);
    });

    test("keeps installed plugins visible regardless of enabled state and drops empty groups", () => {
        expect(visibleSolcordCommunityGroups(groups, [
            {name: "BuiltIn", builtIn: true, installed: true},
            {name: "External", builtIn: false, installed: true}
        ])).toEqual([{...groups[0], addons: [groups[0].addons[1]]}]);
        expect(groups[0].addons).toHaveLength(2);
    });

    test("keeps quarantined records discoverable even when their source was moved out of scanning", () => {
        expect(visibleSolcordCommunityGroups(groups, [
            {name: "Missing", builtIn: false, installed: false, quarantine: "Hash changed"}
        ])).toEqual([groups[1]]);
    });
});
