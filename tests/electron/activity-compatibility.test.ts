import {beforeEach, describe, expect, test} from "bun:test";

import ActivityCompatibility from "../../src/electron/main/modules/activity-compatibility";


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
});
