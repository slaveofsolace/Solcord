// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {normalizeSoulCordReturnRoute, SoulCordReturnLaterJournal} from "../../src/common/soulcord/return-later";

describe("SoulCord Return Later", () => {
    test("accepts only explicit Discord DM or channel routes and strips query data", () => {
        expect(normalizeSoulCordReturnRoute("https://discord.com/channels/@me/123/456?token=nope")).toBe("/channels/@me/123/456");
        expect(normalizeSoulCordReturnRoute("https://discord.com/channels/1/2")).toBe("/channels/1/2");
        expect(normalizeSoulCordReturnRoute("https://example.com/channels/@me/1/2")).toBeUndefined();
        expect(normalizeSoulCordReturnRoute("javascript:alert(1)")).toBeUndefined();
    });

    test("bounds due dates and supports local snooze and completion without account actions", () => {
        const journal = new SoulCordReturnLaterJournal();
        const item = journal.add("reminder_123", "https://discord.com/channels/@me/123/456", "Review this", 0, 1_000)!;
        expect(item.dueAt).toBe(301_000);
        expect(journal.snooze(item.id, 60 * 60 * 1_000, 2_000)).toBe(true);
        expect(journal.snapshot()[0].dueAt).toBe(3_602_000);
        expect(journal.complete(item.id, 3_000)).toBe(true);
        expect(journal.snapshot()).toEqual([]);
        expect(journal.snapshot(true)[0].completedAt).toBe(3_000);
    });
});
