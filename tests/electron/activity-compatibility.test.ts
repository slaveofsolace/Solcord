// SPDX-License-Identifier: Apache-2.0

import {beforeEach, describe, expect, test} from "bun:test";

import ActivityCompatibility, {ACTIVITY_COMPATIBILITY_MAX_SERIALIZED_BYTES} from "../../src/electron/main/modules/activity-compatibility";


describe("bounded Activity compatibility ledger", () => {
    beforeEach(() => ActivityCompatibility.resetForTests());

    test("stores sanitized window and assignment facts without absolute paths", () => {
        const token = ActivityCompatibility.beginWindow(
            "Discord",
            "C:\\Users\\PrivateName\\Discord\\core.asar\\mainScreenPreload.js",
            "C:\\Users\\PrivateName\\Discord\\core.asar"
        );
        ActivityCompatibility.assignment(token, {
            accepted: true,
            action: "accepted-discord",
            reason: "accepted-same-package",
            candidateFile: "activityPreload.js",
            packageFile: "core.asar"
        }, false);
        ActivityCompatibility.ready(token, 17);
        ActivityCompatibility.injection(token);
        ActivityCompatibility.destroyed(token, 17);

        const health = ActivityCompatibility.snapshot();
        expect(health.status).toBe("healthy");
        expect(health.counters.discordPreloadsAccepted).toBe(1);
        expect(health.counters.rendererInjections).toBe(1);
        expect(JSON.stringify(health)).not.toContain("PrivateName");
        expect(JSON.stringify(health)).not.toContain("C:\\\\Users");
    });

    test("caps the event history during repeated open and close cycles", () => {
        for (let index = 0; index < 40; index++) {
            const token = ActivityCompatibility.beginWindow("Discord", "/opt/discord/core.asar/mainScreenPreload.js", "/opt/discord/core.asar");
            ActivityCompatibility.ready(token, index + 1);
            ActivityCompatibility.destroyed(token, index + 1);
        }
        const health = ActivityCompatibility.snapshot();
        expect(health.events.length).toBe(64);
        expect(health.counters.windowsBegun).toBe(40);
        expect(health.counters.windowsDestroyed).toBe(40);
    });

    test("does not claim healthy from an ordinary window-ready event", () => {
        const token = ActivityCompatibility.beginWindow("Discord", "/opt/discord/core.asar/mainScreenPreload.js", "/opt/discord/core.asar");
        ActivityCompatibility.ready(token, 41);
        expect(ActivityCompatibility.snapshot()).toMatchObject({
            status: "idle",
            counters: {windowsReady: 1, discordPreloadsAccepted: 0}
        });
    });

    test("cleans a failed BrowserWindow construction context and reports attention", () => {
        const token = ActivityCompatibility.beginWindow("Discord", "/opt/discord/core.asar/mainScreenPreload.js", "/opt/discord/core.asar");
        ActivityCompatibility.constructionFailed(token, new TypeError("private path must not be retained"));
        ActivityCompatibility.ready(token, 55);
        ActivityCompatibility.destroyed(token, 55);

        const health = ActivityCompatibility.snapshot();
        expect(health.status).toBe("attention");
        expect(health.counters.windowConstructionFailures).toBe(1);
        expect(health.counters.windowsReady).toBe(0);
        expect(health.counters.windowsDestroyed).toBe(0);
        expect(health.events.at(-1)).toMatchObject({
            action: "window-construction-failed",
            reason: "TypeError"
        });
        expect(JSON.stringify(health)).not.toContain("private path");
    });

    test("keeps unrestricted acceptance as sticky attention after the setting is turned off", () => {
        const token = ActivityCompatibility.beginWindow("Discord", "/opt/discord/core.asar/mainScreenPreload.js", "/opt/discord/core.asar");
        ActivityCompatibility.setUnrestrictedOverride(true);
        ActivityCompatibility.assignment(token, {
            accepted: true,
            action: "accepted-unrestricted",
            reason: "accepted-same-package",
            candidateFile: "external.js",
            packageFile: "external.asar"
        }, true);
        expect(ActivityCompatibility.snapshot().status).toBe("attention");
        ActivityCompatibility.setUnrestrictedOverride(false);
        expect(ActivityCompatibility.snapshot()).toMatchObject({
            status: "attention",
            unrestrictedOverride: false,
            counters: {unrestrictedPreloadsAccepted: 1}
        });
    });

    test("allowlists event strings and bounds the complete serialized event history", () => {
        const privateText = `PrivateAccount-${"x".repeat(20_000)}`;
        const token = ActivityCompatibility.beginWindow(
            privateText,
            `/opt/discord/core.asar/${privateText}.js`,
            `/opt/discord/${privateText}.asar`
        );
        ActivityCompatibility.assignment(token, {
            accepted: false,
            action: "rejected",
            reason: "different-package",
            candidateFile: `${privateText}.js`,
            packageFile: `${privateText}.asar`
        }, false);
        const privateError = new Error("message must not be retained");
        privateError.name = privateText;
        for (let index = 0; index < 100; index++) ActivityCompatibility.preloadError(token, privateError);

        const health = ActivityCompatibility.snapshot();
        const serialized = JSON.stringify(health.events);
        expect(Buffer.byteLength(serialized, "utf8")).toBeLessThanOrEqual(ACTIVITY_COMPATIBILITY_MAX_SERIALIZED_BYTES);
        expect(serialized).not.toContain("PrivateAccount");
        expect(serialized).not.toContain("message must not be retained");
        expect(health.events.at(-1)?.reason).toBe("unknown-error");
    });
});
