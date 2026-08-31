// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {filterSolcordCommands} from "../../src/common/solcord/command-deck";

describe("Solcord Command Deck", () => {
    const commands = [
        {name: "Open Solcord Suite"},
        {name: "Toggle Stream Shield"},
        {name: "Save current DM or channel for later"}
    ];

    test("filters the visible command list by a trimmed case-insensitive query", () => {
        expect(filterSolcordCommands(commands, "  SAVE  ").map(command => command.name)).toEqual(["Save current DM or channel for later"]);
        expect(filterSolcordCommands(commands, "stream").map(command => command.name)).toEqual(["Toggle Stream Shield"]);
        expect(filterSolcordCommands(commands, "missing")).toEqual([]);
        expect(filterSolcordCommands(commands, "")).toHaveLength(3);
    });
});
