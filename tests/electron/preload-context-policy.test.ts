// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {evaluateSoulCordPreloadExposure} from "../../src/electron/preload/context-policy";


describe("SoulCord preload exposure policy", () => {
    test("exposes SoulCord only in exact first-party Discord main-frame origins", () => {
        for (const hostname of ["discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"]) {
            expect(evaluateSoulCordPreloadExposure({
                protocol: "https:",
                hostname,
                port: "",
                isMainFrame: true
            })).toEqual({exposeSoulCord: true, reason: "trusted-main-frame"});
        }
    });

    test("withholds process and SoulCord bridges from embedded Discord frames", () => {
        expect(evaluateSoulCordPreloadExposure({
            protocol: "https:",
            hostname: "discord.com",
            port: "",
            isMainFrame: false
        })).toEqual({exposeSoulCord: false, reason: "embedded-frame"});
    });

    test("withholds SoulCord from Activity, lookalike, custom-port, and custom-protocol origins", () => {
        const rejected = [
            {protocol: "https:", hostname: "activity.example", port: "", isMainFrame: true},
            {protocol: "https:", hostname: "evil.discord.com", port: "", isMainFrame: true},
            {protocol: "https:", hostname: "discord.com.example", port: "", isMainFrame: true},
            {protocol: "https:", hostname: "discord.com", port: "8443", isMainFrame: true},
            {protocol: "betterdiscord:", hostname: "discord.com", port: "", isMainFrame: true},
            {protocol: "https:", hostname: "discord.com", port: "", isMainFrame: undefined}
        ];
        for (const facts of rejected) {
            expect(evaluateSoulCordPreloadExposure(facts).exposeSoulCord).toBe(false);
        }
    });
});
