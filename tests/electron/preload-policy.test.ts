// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {
    evaluateDiscordPreloadOverride,
    installPreloadAssignmentPolicy,
    isPathWithin,
    preloadTrustRoot,
    PreloadAssignmentGuard
} from "../../src/electron/main/modules/preload-policy";


const discordVersionRoot = "C:\\Users\\Sam\\AppData\\Local\\Discord\\app-1.0.9253";
const discordCoreRoot = `${discordVersionRoot}\\modules\\discord_desktop_core-1\\discord_desktop_core`;
const original = `${discordCoreRoot}\\core.asar\\mainScreenPreload.js`;

describe("Discord-owned preload policy", () => {
    test("accepts one absolute preload in the exact same asar package", () => {
        const candidate = `${discordCoreRoot}\\core.asar\\activityPreload.js`;
        expect(evaluateDiscordPreloadOverride(original, candidate, {discordTrustRoot: discordVersionRoot})).toEqual({
            accepted: true,
            reason: "accepted-same-package",
            candidateFile: "activityPreload.js",
            packageFile: "core.asar"
        });
    });

    test("uses the Discord version directory rather than resources app.asar as the captured root", () => {
        const candidate = `${discordCoreRoot}\\core.asar\\activityPreload.js`;
        expect(evaluateDiscordPreloadOverride(original, candidate, {discordTrustRoot: `${discordVersionRoot}\\resources\\app.asar`}).reason)
            .toBe("untrusted-original");
        expect(evaluateDiscordPreloadOverride(original, candidate, {discordTrustRoot: discordVersionRoot}).accepted)
            .toBe(true);
    });

    test("matches Windows paths case-insensitively", () => {
        const candidate = "c:\\users\\sam\\appdata\\local\\discord\\APP-1.0.9253\\modules\\discord_desktop_core-1\\discord_desktop_core\\CORE.ASAR\\activityPreload.js";
        expect(evaluateDiscordPreloadOverride(original, candidate, {discordTrustRoot: discordVersionRoot}).accepted).toBe(true);
    });

    test("supports a same-share UNC package", () => {
        const root = "\\\\server\\share\\Discord\\discord_desktop_core";
        const first = `${root}\\core.asar\\mainScreenPreload.js`;
        const second = `${root}\\core.asar\\activityPreload.js`;
        expect(evaluateDiscordPreloadOverride(first, second, {discordTrustRoot: "\\\\server\\share\\Discord"}).accepted).toBe(true);
    });

    test("accepts a POSIX candidate only inside the same trusted asar", () => {
        expect(evaluateDiscordPreloadOverride(
            "/opt/discord/core.asar/mainScreenPreload.js",
            "/opt/discord/core.asar/activityPreload.js",
            {discordTrustRoot: "/opt/discord"}
        ).accepted).toBe(true);
        expect(evaluateDiscordPreloadOverride(
            "/opt/discord/core.asar/mainScreenPreload.js",
            "/opt/discord/Core.asar/activityPreload.js",
            {discordTrustRoot: "/opt/discord"}
        ).reason).toBe("different-package");
    });

    test("rejects relative, traversal, device, sibling-asar, drive-mismatch, and malformed candidates", () => {
        const candidates: unknown[] = [
            "relative\\activityPreload.js",
            `${discordCoreRoot}\\core.asar\\..\\other.asar\\activityPreload.js`,
            "\\\\?\\C:\\Discord\\core.asar\\activityPreload.js",
            `${discordCoreRoot}\\other.asar\\activityPreload.js`,
            "D:\\Discord\\core.asar\\activityPreload.js",
            `${discordCoreRoot}\\core.asar\\activityPreload.txt`,
            "",
            null,
            42
        ];
        for (const candidate of candidates) {
            expect(evaluateDiscordPreloadOverride(original, candidate, {discordTrustRoot: discordVersionRoot}).accepted).toBe(false);
        }
    });

    test("rejects an original preload outside the captured Discord app root", () => {
        const external = "C:\\Temp\\core.asar\\mainScreenPreload.js";
        expect(evaluateDiscordPreloadOverride(external, "C:\\Temp\\core.asar\\activityPreload.js", {discordTrustRoot: discordVersionRoot}).reason).toBe("untrusted-original");
    });

    test("fails closed for unresolved or reparse-divergent canonical roots", () => {
        const candidate = `${discordCoreRoot}\\core.asar\\activityPreload.js`;
        expect(evaluateDiscordPreloadOverride(original, candidate, {
            discordTrustRoot: discordVersionRoot,
            canonicalizeRoot: () => undefined
        }).reason).toBe("canonicalization-failed");

        expect(evaluateDiscordPreloadOverride(original, candidate, {
            discordTrustRoot: discordVersionRoot,
            canonicalizeRoot: root => root.toLocaleLowerCase("en-US").endsWith("core.asar")
                ? "D:\\outside\\core.asar"
                : "C:\\trusted\\discord"
        }).reason).toBe("canonical-root-mismatch");
    });

    test("rejects an unpacked same-directory fallback instead of widening on package drift", () => {
        const directoryOriginal = `${discordVersionRoot}\\preload\\main.js`;
        const directoryCandidate = `${discordVersionRoot}\\preload\\activity.js`;
        expect(evaluateDiscordPreloadOverride(directoryOriginal, directoryCandidate, {
            discordTrustRoot: discordVersionRoot,
            canonicalizeRoot: value => value
        }).reason).toBe("unsupported-package");
    });

    test("trust-root and containment helpers preserve asar boundaries", () => {
        expect(preloadTrustRoot("/opt/discord/core.asar/app/mainScreenPreload.js")).toBe("/opt/discord/core.asar");
        expect(isPathWithin("/opt/discord", "/opt/discord/core.asar/app/main.js")).toBe(true);
        expect(isPathWithin("/opt/discord", "/opt/discord-other/core.asar/main.js")).toBe(false);
    });
});

describe("PreloadAssignmentGuard", () => {
    test("keeps Solcord injected, accepts exactly one Discord assignment, and rejects the next", () => {
        const injected = "C:\\Users\\Sam\\AppData\\Roaming\\BetterDiscord\\data\\betterdiscord.asar\\preload.js";
        const guard = new PreloadAssignmentGuard(original, injected, {discordTrustRoot: discordVersionRoot});
        expect(guard.value).toBe(injected);

        const accepted = guard.assign(`${discordCoreRoot}\\core.asar\\activityPreload.js`, false);
        expect(accepted.action).toBe("accepted-discord");
        expect(guard.value).toEndWith("activityPreload.js");

        const duplicate = guard.assign(guard.value, false);
        expect(duplicate.action).toBe("duplicate");

        const rejected = guard.assign(`${discordCoreRoot}\\core.asar\\secondPreload.js`, false);
        expect(rejected).toMatchObject({accepted: false, action: "rejected", reason: "assignment-limit"});
        expect(guard.value).toEndWith("activityPreload.js");
    });

    test("retains the explicit legacy override without enabling it by default", () => {
        const injected = "C:\\Solcord\\preload.js";
        const guard = new PreloadAssignmentGuard(original, injected, {discordTrustRoot: discordVersionRoot});
        expect(guard.assign("C:\\Temp\\external.js", false).action).toBe("rejected");
        expect(guard.assign("C:\\Temp\\external.js", true).action).toBe("accepted-unrestricted");
    });
});

describe("BrowserWindow preload property integration", () => {
    test("retains the injected preload, accepts one Discord assignment, and rejects an external assignment", () => {
        const target: {preload?: string;} = {preload: original};
        const decisions: string[] = [];
        installPreloadAssignmentPolicy(
            target,
            original,
            "C:\\Solcord\\preload.js",
            {discordTrustRoot: discordVersionRoot},
            () => false,
            result => decisions.push(`${result.action}:${result.reason}`)
        );

        expect(target.preload).toBe("C:\\Solcord\\preload.js");
        target.preload = `${discordCoreRoot}\\core.asar\\activityPreload.js`;
        expect(target.preload).toEndWith("activityPreload.js");
        target.preload = "C:\\Temp\\external.js";
        expect(target.preload).toEndWith("activityPreload.js");
        expect(decisions).toEqual(["accepted-discord:accepted-same-package", "rejected:different-package"]);
    });
});
