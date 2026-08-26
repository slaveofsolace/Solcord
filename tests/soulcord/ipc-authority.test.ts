import {describe, expect, test} from "bun:test";

import {isTrustedSoulCordIpcUrl, SoulCordTimelineIpcAuthority} from "../../src/electron/main/modules/soulcord-ipc-authority";


const ACCOUNT_A = "111222333";
const ACCOUNT_B = "444555666";

describe("SoulCord private IPC sender origin", () => {
    test("accepts only the exact HTTPS Discord application hosts", () => {
        for (const value of [
            "https://discord.com/channels/@me",
            "https://discordapp.com/login",
            "https://canary.discord.com/channels/@me",
            "https://canary.discordapp.com/login",
            "https://ptb.discord.com/channels/@me",
            "https://ptb.discordapp.com/login"
        ]) expect(isTrustedSoulCordIpcUrl(value)).toBeTrue();

        for (const value of [
            "http://discord.com/channels/@me",
            "https://cdn.discord.com/attachments/x",
            "https://evil.discord.com/channels/@me",
            "https://evil.discordapp.com/login",
            "https://discord.com.evil.example/channels/@me",
            "https://discordapp.com.evil.example/login",
            "https://user@discord.com/channels/@me",
            "https://discord.com:444/channels/@me",
            "file:///discord.com/channels/@me",
            "not-a-url"
        ]) expect(isTrustedSoulCordIpcUrl(value)).toBeFalse();
    });
});

describe("SoulCord private IPC capability authority", () => {
    test("rejects a malicious first bind when Timeline is disabled or not bootstrapped", () => {
        const authority = new SoulCordTimelineIpcAuthority();
        const attackerCapability = "a".repeat(43);

        expect(() => authority.bind(91, {capability: attackerCapability, accountId: ACCOUNT_B})).toThrow("not active");
        expect(() => authority.authorize(91, {capability: attackerCapability}, false)).toThrow("not active");

        // A reload has a fresh main-owned authority state. A renderer still
        // cannot manufacture the first account binding.
        const afterReload = new SoulCordTimelineIpcAuthority();
        expect(() => afterReload.bind(91, {capability: attackerCapability, accountId: ACCOUNT_B})).toThrow("not active");
    });

    test("consumes bootstrap once, rotates on identity changes, and isolates senders", () => {
        const authority = new SoulCordTimelineIpcAuthority();
        const {bootstrapCapability} = authority.bootstrap(7);
        expect(bootstrapCapability).toMatch(/^[a-zA-Z0-9_-]{43}$/);

        const activated = authority.activate(7, {bootstrapCapability});
        expect(activated.capability).toMatch(/^[a-zA-Z0-9_-]{43}$/);
        expect(activated.capability).not.toBe(bootstrapCapability);
        expect(() => authority.activate(7, {bootstrapCapability})).toThrow("unavailable");
        expect(() => authority.bind(8, {capability: activated.capability, accountId: ACCOUNT_A})).toThrow("not active");

        const bound = authority.bind(7, {capability: activated.capability, accountId: ACCOUNT_A});
        expect(bound.capability).not.toBe(activated.capability);
        expect(() => authority.authorize(7, {capability: activated.capability, policy: {retention: "7-days"}})).toThrow("rejected");

        const authorized = authority.authorize(7, {capability: bound.capability, policy: {retention: "7-days"}});
        expect(authorized.accountScope).toBe(ACCOUNT_A);
        expect(authorized.request).toEqual({policy: {retention: "7-days"}});
        expect(() => authority.assertCurrent(7, authorized)).not.toThrow();

        const released = authority.releaseAccount(7, {capability: bound.capability});
        expect(() => authority.assertCurrent(7, authorized)).toThrow("binding changed");
        expect(released.capability).not.toBe(bound.capability);
        expect(() => authority.authorize(7, {capability: bound.capability}, false)).toThrow("rejected");
        expect(() => authority.authorize(7, {capability: released.capability})).toThrow("not bound");
        expect(authority.authorize(7, {capability: released.capability}, false).accountScope).toBe("");

        const rebound = authority.bind(7, {capability: released.capability, accountId: ACCOUNT_B});
        expect(authority.authorize(7, {capability: rebound.capability}).accountScope).toBe(ACCOUNT_B);
    });

    test("rejects renderer account selectors and invalidates all capabilities on reload/destroy", () => {
        const authority = new SoulCordTimelineIpcAuthority();
        const bootstrap = authority.bootstrap(23);
        const active = authority.activate(23, bootstrap);
        const bound = authority.bind(23, {capability: active.capability, accountId: ACCOUNT_A});

        expect(() => authority.authorize(23, {capability: bound.capability, accountId: ACCOUNT_B})).toThrow("cannot select an account");
        authority.release(23);
        expect(() => authority.authorize(23, {capability: bound.capability}, false)).toThrow("not active");
        expect(() => authority.bind(23, {capability: bound.capability, accountId: ACCOUNT_A})).toThrow("not active");

        const nextBootstrap = authority.bootstrap(23);
        expect(nextBootstrap.bootstrapCapability).not.toBe(bootstrap.bootstrapCapability);
        const nextActive = authority.activate(23, nextBootstrap);
        expect(() => authority.authorize(23, {capability: active.capability}, false)).toThrow("rejected");
        expect(authority.authorize(23, {capability: nextActive.capability}, false).request).toEqual({});
    });
});
