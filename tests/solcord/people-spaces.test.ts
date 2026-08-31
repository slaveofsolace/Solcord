import {describe, expect, test} from "bun:test";

import {currentSolcordPeopleObjectId, resolveSolcordPeopleObject, type SolcordPeopleObjectSources} from "../../src/common/solcord/people-spaces";

function sources(): SolcordPeopleObjectSources {
    return {
        channel: id => ({
            100: {id: "100", type: 1},
            101: {id: "101", type: 3},
            200: {id: "200", type: 0, guildId: "300"},
            201: {id: "201", type: 99}
        } as Record<string, {id: string; type: number; guildId?: string;}>)[id],
        server: id => id === "300" ? {id, name: "Workshop"} : undefined,
        user: id => id === "400" ? {id, label: "Ada"} : undefined
    };
}

describe("Solcord People and Spaces object resolution", () => {
    test("enables only the action family proven by already-loaded Discord stores", () => {
        expect(resolveSolcordPeopleObject("100", sources())).toMatchObject({kind: "dm", canPinDm: true, canManageServer: false});
        expect(resolveSolcordPeopleObject("101", sources())).toMatchObject({kind: "dm", canPinDm: true, canManageServer: false, label: "Loaded group DM"});
        expect(resolveSolcordPeopleObject("300", sources())).toMatchObject({kind: "server", canPinDm: false, canManageServer: true, label: "Loaded server: Workshop"});
        expect(resolveSolcordPeopleObject("400", sources())).toMatchObject({kind: "user", canPinDm: false, canManageServer: false});
    });

    test("fails closed for a server channel, unknown object, malformed input, or drifting lookup", () => {
        expect(resolveSolcordPeopleObject("200", sources())).toMatchObject({kind: "server-channel", serverId: "300", canPinDm: false, canManageServer: false});
        expect(resolveSolcordPeopleObject("201", sources())).toMatchObject({kind: "unsupported-channel", canPinDm: false, canManageServer: false});
        expect(resolveSolcordPeopleObject("999", sources())).toMatchObject({kind: "not-loaded", label: expect.stringContaining("Object not loaded")});
        expect(resolveSolcordPeopleObject("not-an-id", sources())).toMatchObject({kind: "invalid"});
        expect(resolveSolcordPeopleObject("100", {...sources(), channel: () => {throw new Error("drift");}})).toMatchObject({kind: "not-loaded"});
    });

    test("prefills the applicable DM or server identity instead of an inapplicable server-channel ID", () => {
        const loaded = sources();
        expect(currentSolcordPeopleObjectId("100", undefined, loaded)).toBe("100");
        expect(currentSolcordPeopleObjectId("200", undefined, loaded)).toBe("300");
        expect(currentSolcordPeopleObjectId(undefined, "300", loaded)).toBe("300");
        expect(currentSolcordPeopleObjectId("999", "999", loaded)).toBeUndefined();
    });
});
