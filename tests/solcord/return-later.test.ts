// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {normalizeSolcordReturnRoute, solcordReturnLaterTarget, SolcordReturnLaterJournal, SolcordReturnRouteMemory} from "../../src/common/solcord/return-later";

describe("Solcord Return Later", () => {
    test("accepts only explicit Discord DM or channel routes and strips query data", () => {
        expect(normalizeSolcordReturnRoute("https://discord.com/channels/@me/123/456?token=nope")).toBe("/channels/@me/123/456");
        expect(normalizeSolcordReturnRoute("https://discord.com/channels/1/2")).toBe("/channels/1/2");
        expect(normalizeSolcordReturnRoute("https://example.com/channels/@me/1/2")).toBeUndefined();
        expect(normalizeSolcordReturnRoute("javascript:alert(1)")).toBeUndefined();
        expect(solcordReturnLaterTarget("/channels/@me/123/456?private=value")).toBe("https://discord.com/channels/@me/123/456");
    });

    test("retains the last valid visible route until the account session is cleared", () => {
        const memory = new SolcordReturnRouteMemory();
        expect(memory.remember("https://discord.com/channels/@me/123/456")).toBeTrue();
        expect(memory.current()).toBe("/channels/@me/123/456");
        expect(memory.remember("https://discord.com/settings/solcord")).toBeFalse();
        expect(memory.current()).toBe("/channels/@me/123/456");
        expect(memory.remember("https://discord.com/channels/@me")).toBeFalse();
        expect(memory.current()).toBe("/channels/@me/123/456");
        expect(memory.remember("https://discord.com/channels/789/987")).toBeTrue();
        expect(memory.current()).toBe("/channels/789/987");
        memory.clear();
        expect(memory.current()).toBeUndefined();
    });

    test("bounds due dates and supports local snooze and completion without account actions", () => {
        const journal = new SolcordReturnLaterJournal();
        const item = journal.add("reminder_123", "https://discord.com/channels/@me/123/456", "Review this", 0, 1_000)!;
        expect(item.dueAt).toBe(301_000);
        expect(journal.snooze(item.id, 60 * 60 * 1_000, 2_000)).toBe(true);
        expect(journal.snapshot()[0].dueAt).toBe(3_602_000);
        expect(journal.complete(item.id, 3_000)).toBe(true);
        expect(journal.snapshot()).toEqual([]);
        expect(journal.snapshot(true)[0].completedAt).toBe(3_000);
    });
});
