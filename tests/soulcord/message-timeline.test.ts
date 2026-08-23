import {describe, expect, test} from "bun:test";

import type {SoulCordTimelinePolicy} from "../../src/betterdiscord/modules/soulcord/contracts";
import {
    boundedTimelineMessageIds,
    channelIsInTimelineScope,
    MessageTimelineJournal,
    normalizeTimelineAccountId,
    normalizeTimelineEvent,
    TimelineAccountGuard,
    timelineEventAccountMatches,
    type TimelineEvent
} from "../../src/betterdiscord/modules/soulcord/message-timeline";


const DAY = 24 * 60 * 60 * 1_000;

function policy(overrides: Partial<SoulCordTimelinePolicy> = {}): SoulCordTimelinePolicy {
    return {
        enabled: true,
        scope: "dm-only",
        serverChannelIds: [],
        retention: "7-days",
        content: "text-only",
        textBudgetBytes: 262_144_000,
        mediaBudgetBytes: 1_073_741_824,
        ...overrides
    } as SoulCordTimelinePolicy;
}

function event(eventId: string, kind: TimelineEvent["kind"], observedAt: number, messageId = "100", content?: string): TimelineEvent {
    return {eventId, kind, observedAt, messageId, channelId: "200", ...(content === undefined ? {} : {content})};
}

describe("Message Timeline model", () => {
    test("accepts events only for the ready active account and rejects switch windows", () => {
        expect(normalizeTimelineAccountId("123456789012345678")).toBe("123456789012345678");
        expect(normalizeTimelineAccountId("../123")).toBeUndefined();
        expect(timelineEventAccountMatches("123", "123", true)).toBeTrue();
        expect(timelineEventAccountMatches("123", "456", true)).toBeFalse();
        expect(timelineEventAccountMatches("123", "123", false)).toBeFalse();
        expect(timelineEventAccountMatches(undefined, undefined, true)).toBeFalse();
    });

    test("invalidates a captured account generation across a delayed account switch", async () => {
        const guard = new TimelineAccountGuard();
        let currentAccount: string | undefined = "123";
        const captured = guard.observe(currentAccount);
        expect(guard.matches(captured, currentAccount)).toBeTrue();

        const delayedValidation = (async () => {
            await Promise.resolve();
            return guard.matches(captured, currentAccount);
        })();
        currentAccount = "456";

        expect(await delayedValidation).toBeFalse();
        const switched = guard.observe(currentAccount);
        expect(switched.generation).toBeGreaterThan(captured.generation);
        expect(guard.matches(switched, currentAccount)).toBeTrue();
        currentAccount = undefined;
        expect(guard.matches(switched, currentAccount)).toBeFalse();
    });

    test("includes only enabled DM/GDM scope or explicitly selected server channels", () => {
        expect(channelIsInTimelineScope({id: "1", type: 1}, policy({enabled: false}))).toBeFalse();
        expect(channelIsInTimelineScope({id: "1", type: 1}, policy())).toBeTrue();
        expect(channelIsInTimelineScope({id: "2", type: 3}, policy())).toBeTrue();
        expect(channelIsInTimelineScope({id: "3", type: 0, guild_id: "9"}, policy())).toBeFalse();
        expect(channelIsInTimelineScope({id: "3", type: 0, guild_id: "9"}, policy({scope: "selected-channels", serverChannelIds: ["3"]}))).toBeTrue();
        expect(channelIsInTimelineScope({id: "4", type: 0, guild_id: "9"}, policy({scope: "selected-channels", serverChannelIds: ["3"]}))).toBeFalse();
        expect(channelIsInTimelineScope({id: "not-a-snowflake", type: 1}, policy())).toBeFalse();
        expect(channelIsInTimelineScope(undefined, policy())).toBeFalse();
    });

    test("normalizes bounded local-only event fields and rejects malformed identities", () => {
        const normalized = normalizeTimelineEvent({
            eventId: "event_OK-1",
            kind: "create",
            observedAt: 10,
            messageId: "123",
            channelId: "456",
            authorLabel: "a".repeat(200),
            content: "x".repeat(70_000),
            attachments: Array.from({length: 25}, (_, index) => ({name: `file-${index}`.repeat(80), contentType: "image/png", size: index}))
        });

        expect(normalized?.authorLabel).toHaveLength(160);
        expect(normalized?.content).toHaveLength(64_000);
        expect(normalized?.attachments).toHaveLength(20);
        expect(normalized?.attachments?.[0].name.length).toBeLessThanOrEqual(260);
        expect(normalizeTimelineEvent({eventId: "bad id", kind: "create", messageId: "1", channelId: "2"})).toBeUndefined();
        expect(normalizeTimelineEvent({eventId: "ok", kind: "unknown", messageId: "1", channelId: "2"})).toBeUndefined();
        expect(normalizeTimelineEvent({eventId: "ok", kind: "create", messageId: "../1", channelId: "2"})).toBeUndefined();
        expect(normalizeTimelineEvent(null)).toBeUndefined();
    });

    test("hydrates out-of-order observations chronologically and preserves edit/delete/recovery order", () => {
        const journal = new MessageTimelineJournal();
        journal.hydrate([
            event("recover", "recovery", 40),
            event("delete", "delete", 30),
            event("edit", "edit", 20, "100", "second"),
            event("create", "create", 10, "100", "first")
        ], policy(), 50);

        expect(journal.snapshot()).toEqual([expect.objectContaining({
            messageId: "100",
            content: "second",
            createdAt: 10,
            updatedAt: 40,
            deletedAt: 30,
            edits: [{at: 20, content: "first"}]
        })]);
        expect(journal.status()).toEqual({records: 1, deleted: 1, edited: 1, textBytes: 11});
    });

    test("applies create, edit, delete, and bulk-delete idempotently", () => {
        const journal = new MessageTimelineJournal();
        const activePolicy = policy();
        expect(journal.apply(event("edit-missing", "edit", 1, "999", "ignored"), activePolicy, 1)).toBeFalse();
        expect(journal.apply(event("create-1", "create", 2, "100", "one"), activePolicy, 2)).toBeTrue();
        expect(journal.apply(event("create-1", "create", 2, "100", "changed"), activePolicy, 2)).toBeFalse();
        expect(journal.apply(event("create-2", "create", 3, "101", "two"), activePolicy, 3)).toBeTrue();
        expect(journal.apply(event("bulk-1", "bulk-delete", 4, "100"), activePolicy, 4)).toBeTrue();
        expect(journal.apply(event("bulk-2", "bulk-delete", 4, "101"), activePolicy, 4)).toBeTrue();
        expect(journal.snapshot().every(item => item.deletedAt === 4)).toBeTrue();
    });

    test("bounds bulk message expansion, removes malformed ids, and deduplicates", () => {
        const ids = Array.from({length: 800}, (_, index) => String(index + 1));
        ids.splice(10, 0, "1", "../2", "not-a-snowflake");
        const bounded = boundedTimelineMessageIds(ids);
        expect(bounded).toHaveLength(500);
        expect(bounded[0]).toBe("1");
        expect(new Set(bounded).size).toBe(bounded.length);
        expect(bounded).not.toContain("../2");
        expect(boundedTimelineMessageIds(ids, 0)).toEqual([]);
    });

    test("hard-bounds zero-text records, edit history, dedupe state, and snapshot work", () => {
        const journal = new MessageTimelineJournal({records: 3, seenEvents: 4, editsPerRecord: 2, snapshotRecords: 2, estimatedBytes: 4_096});
        const activePolicy = policy({retention: "session"});
        for (let index = 1; index <= 10; index++) {
            expect(journal.apply(event(`create-${index}`, "create", index, String(100 + index), ""), activePolicy, index)).toBeTrue();
        }

        expect(journal.status()).toMatchObject({records: 3, textBytes: 0});
        expect(journal.snapshot().map(item => item.messageId)).toEqual(["110", "109"]);

        expect(journal.apply(event("unknown-event", "delete", 20, "999"), activePolicy, 20)).toBeFalse();
        expect(journal.apply(event("unknown-event", "create", 21, "111", ""), activePolicy, 21)).toBeTrue();
        for (let index = 0; index < 8; index++) journal.apply(event(`edit-${index}`, "edit", 30 + index, "111", index % 2 ? "" : "x"), activePolicy, 40);
        expect(journal.snapshot(undefined, 10).find(item => item.messageId === "111")?.edits).toHaveLength(2);
        expect(journal.status().records).toBeLessThanOrEqual(3);
    });

    test("accounts for attachment metadata in the renderer memory budget", () => {
        const limits = {records: 10, seenEvents: 20, editsPerRecord: 5, snapshotRecords: 10, estimatedBytes: 320};
        const withMetadata = new MessageTimelineJournal(limits);
        const textOnly = new MessageTimelineJournal(limits);
        const attachment = {name: "x".repeat(260), contentType: "application/octet-stream", size: 42};
        const create: TimelineEvent = {...event("metadata", "create", 1, "100", ""), attachments: [attachment]};

        expect(withMetadata.apply(create, policy({content: "text-and-metadata"}), 1)).toBeFalse();
        expect(withMetadata.status().records).toBe(0);
        expect(textOnly.apply(create, policy({content: "text-only"}), 1)).toBeTrue();
        expect(textOnly.status().records).toBe(1);
    });

    test("prunes expired records while retaining the cutoff boundary", () => {
        const now = 10 * DAY;
        const journal = new MessageTimelineJournal();
        const oneDay = policy({retention: "24-hours"});
        journal.hydrate([
            event("expired", "create", now - DAY - 1, "100", "expired"),
            event("boundary", "create", now - DAY, "101", "boundary"),
            event("recent", "create", now - 1, "102", "recent")
        ], oneDay, now);

        expect(journal.snapshot().map(item => item.messageId)).toEqual(["102", "101"]);
    });

    test("enforces the text hard cap even for session retention and counts UTF-8 bytes", () => {
        const journal = new MessageTimelineJournal();
        const tinySessionBudget = policy({retention: "session", textBudgetBytes: 5 as SoulCordTimelinePolicy["textBudgetBytes"]});
        expect(journal.apply(event("old", "create", 1, "100", "old"), tinySessionBudget, 2)).toBeTrue();
        expect(journal.apply(event("new", "create", 2, "101", "éé"), tinySessionBudget, 2)).toBeTrue();

        expect(journal.snapshot().map(item => item.messageId)).toEqual(["101"]);
        expect(journal.status().textBytes).toBe(4);
    });

    test("stores attachment metadata only when the selected content policy permits it", () => {
        const attachment = {name: "image.png", contentType: "image/png", size: 42};
        const create: TimelineEvent = {...event("create", "create", 1, "100", "hello"), attachments: [attachment]};
        const textOnly = new MessageTimelineJournal();
        const withMetadata = new MessageTimelineJournal();

        textOnly.apply(create, policy({content: "text-only"}), 1);
        withMetadata.apply(create, policy({content: "text-and-metadata"}), 1);
        expect(textOnly.snapshot()[0].attachments).toEqual([]);
        expect(withMetadata.snapshot()[0].attachments).toEqual([attachment]);
    });

    test("returns defensive snapshots and clear resets records and event idempotency", () => {
        const journal = new MessageTimelineJournal();
        const create = event("create", "create", 1, "100", "original");
        journal.apply(create, policy(), 1);
        const snapshot = journal.snapshot();
        snapshot[0].content = "mutated";
        expect(journal.snapshot()[0].content).toBe("original");

        journal.clear();
        expect(journal.status().records).toBe(0);
        expect(journal.apply(create, policy(), 1)).toBeTrue();
    });
});
