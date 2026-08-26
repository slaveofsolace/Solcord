// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {evaluateSolcordPreloadExposure} from "../../src/electron/preload/context-policy";


describe("Solcord preload exposure policy", () => {
    test("exposes Solcord only in exact first-party Discord main-frame origins", () => {
        for (const hostname of ["discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"]) {
            expect(evaluateSolcordPreloadExposure({
                protocol: "https:",
                hostname,
                port: "",
                isMainFrame: true
            })).toEqual({exposeSolcord: true, reason: "trusted-main-frame"});
        }
    });

    test("withholds process and Solcord bridges from embedded Discord frames", () => {
        expect(evaluateSolcordPreloadExposure({
            protocol: "https:",
            hostname: "discord.com",
            port: "",
            isMainFrame: false
        })).toEqual({exposeSolcord: false, reason: "embedded-frame"});
    });

    test("withholds Solcord from Activity, lookalike, custom-port, and custom-protocol origins", () => {
        const rejected = [
            {protocol: "https:", hostname: "activity.example", port: "", isMainFrame: true},
            {protocol: "https:", hostname: "evil.discord.com", port: "", isMainFrame: true},
            {protocol: "https:", hostname: "discord.com.example", port: "", isMainFrame: true},
            {protocol: "https:", hostname: "discord.com", port: "8443", isMainFrame: true},
            {protocol: "betterdiscord:", hostname: "discord.com", port: "", isMainFrame: true},
            {protocol: "https:", hostname: "discord.com", port: "", isMainFrame: undefined}
        ];
        for (const facts of rejected) {
            expect(evaluateSolcordPreloadExposure(facts).exposeSolcord).toBe(false);
        }
    });
});
