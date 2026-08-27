// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {parseLoadedDiscordMessageLink, SolcordBaselineSuite} from "../../src/betterdiscord/modules/solcord/baseline-suite";
import {defaultSolcordProductPreferences} from "../../src/common/solcord/product";

describe("Solcord baseline suite", () => {
    test("accepts only explicit Discord message links", () => {
        expect(parseLoadedDiscordMessageLink("https://discord.com/channels/@me/123/456")).toEqual({channelId: "123", messageId: "456"});
        expect(parseLoadedDiscordMessageLink("https://canary.discordapp.com/channels/1/22/33?jump=1")).toEqual({channelId: "22", messageId: "33"});
        expect(parseLoadedDiscordMessageLink("https://example.com/channels/@me/123/456")).toBeUndefined();
        expect(parseLoadedDiscordMessageLink("javascript:alert(1)")).toBeUndefined();
        expect(parseLoadedDiscordMessageLink("https://discord.com/channels/@me/123/not-a-message")).toBeUndefined();
    });

    test("does no work when all baseline tools are disabled", () => {
        const suite = new SolcordBaselineSuite({});
        const status = suite.start(defaultSolcordProductPreferences().baseline);

        expect(status).toEqual({active: false, resources: {}, enabled: [], unavailable: []});
        expect(suite.status()).toEqual(status);
        suite.stop();
        suite.stop();
        expect(suite.status()).toEqual(status);
    });

    test("keeps Media Shelf as stored references without starting a runtime adapter", () => {
        const suite = new SolcordBaselineSuite({});
        const baseline = {
            ...defaultSolcordProductPreferences().baseline,
            mediaShelf: [{id: "saved-one", label: "Saved clip", kind: "gif" as const, url: "https://cdn.discordapp.com/attachments/1/2/file.gif"}]
        };

        expect(suite.start(baseline)).toEqual({active: false, resources: {}, enabled: [], unavailable: []});
        expect(suite.status()).toEqual({active: false, resources: {}, enabled: [], unavailable: []});
    });

    test("reports a loaded-message adapter drift without installing listeners", () => {
        const suite = new SolcordBaselineSuite({});
        const baseline = {...defaultSolcordProductPreferences().baseline, messageLinkPreview: true};

        expect(suite.start(baseline)).toEqual({
            active: false,
            resources: {},
            enabled: [],
            unavailable: ["Message Link Preview: loaded message store unavailable"]
        });
    });
});
