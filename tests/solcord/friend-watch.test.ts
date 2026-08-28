// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {normalizeDiscordRelationships, planSolcordFriendWatchNotices, pruneSolcordRelationshipEvents, reconcileSolcordRelationships, SolcordFriendWatchAccountBarrier, SolcordFriendWatchJournal} from "../../src/common/solcord/friend-watch";

describe("Solcord Friend Watch domain", () => {
    test("holds fail-closed after an account identity change until adapter restart", () => {
        const barrier = new SolcordFriendWatchAccountBarrier();
        expect(barrier.observe("100")).toBe("initialize");
        expect(barrier.observe("100")).toBe("continue");
        expect(barrier.observe("200")).toBe("hold");
        expect(barrier.observe("200")).toBe("hold");
        expect(barrier.observe("100")).toBe("hold");

        const restarted = new SolcordFriendWatchAccountBarrier();
        expect(restarted.observe("200")).toBe("initialize");
    });
    test("normalizes only already-loaded relationship state without a network interface", () => {
        expect([...normalizeDiscordRelationships({1: 1, 2: 2, 3: 3, 4: 4, bad: 1, 5: 0}).entries()]).toEqual([
            ["1", {subjectId: "1", state: "friend"}],
            ["2", {subjectId: "2", state: "blocked"}],
            ["3", {subjectId: "3", state: "incoming"}],
            ["4", {subjectId: "4", state: "outgoing"}]
        ]);
        expect([...normalizeDiscordRelationships(new Map<unknown, unknown>([["1", 1], ["2", 2], ["3", 3], ["4", 4], [5, 1]])).entries()]).toEqual([
            ["1", {subjectId: "1", state: "friend"}],
            ["2", {subjectId: "2", state: "blocked"}],
            ["3", {subjectId: "3", state: "incoming"}],
            ["4", {subjectId: "4", state: "outgoing"}]
        ]);
    });

    test("plans bounded local notices without replaying hydration or exposing identifiers", () => {
        const now = Date.UTC(2026, 7, 25, 12);
        const events = Array.from({length: 7}, (_, index) => ({
            eventId: `event-${index}`,
            observedAt: now,
            subjectId: `${100 + index}`,
            transition: "relationship-ended" as const,
            label: "Relationship ended - cause unavailable",
            ...(index === 0 ? {displayLabel: "Visible name"} : {}),
            source: "observed-store-transition" as const,
            confidence: "unknown" as const,
            schemaVersion: 1 as const
        }));
        const reconciliation = {eventId: "reconcile-1", observedAt: now, transition: "reconciled" as const, label: "Session relationship snapshot reconciled", source: "reconciliation" as const, confidence: "unknown" as const, schemaVersion: 1 as const};

        expect(planSolcordFriendWatchNotices("daily", [], [...events, reconciliation], {}, now).messages).toEqual([]);
        const daily = planSolcordFriendWatchNotices("daily", events.slice(0, 1), [...events, reconciliation], {}, now);
        expect(daily.messages).toEqual(["Friend Watch: 7 relationship changes observed today. Open People for the private history."]);
        expect(planSolcordFriendWatchNotices("daily", events.slice(1, 2), events, daily.state, now).messages).toEqual([]);
        expect(planSolcordFriendWatchNotices("off", events, events, {}, now).messages).toEqual([]);

        const perEvent = planSolcordFriendWatchNotices("per-event", events, events, {}, now).messages;
        expect(perEvent).toHaveLength(6);
        expect(perEvent[0]).not.toContain("Visible name");
        expect(perEvent.join(" ")).not.toContain("100");
        expect(perEvent.at(-1)).toBe("Friend Watch: 2 additional changes are available in People.");
        expect(pruneSolcordRelationshipEvents([reconciliation], 30, now)).toEqual([reconciliation]);
    });

    test("uses unknown causality for an uncorrelated friendship disappearance", () => {
        const before = normalizeDiscordRelationships({1: 1});
        const events = reconcileSolcordRelationships(before, new Map(), [], 10_000, () => "event-1");
        expect(events).toEqual([expect.objectContaining({transition: "relationship-ended", label: "Relationship ended - cause unavailable", source: "observed-store-transition", confidence: "unknown"})]);
        expect(events[0].label).not.toContain("blocked");
    });

    test("labels removal or block as owner-caused only inside the bounded correlation window", () => {
        const friend = normalizeDiscordRelationships({1: 1});
        const none = new Map();
        expect(reconcileSolcordRelationships(friend, none, [{subjectId: "1", action: "remove", observedAt: 8_000}], 10_000, () => "a")[0]).toEqual(expect.objectContaining({label: "Removed by you", confidence: "confirmed"}));
        expect(reconcileSolcordRelationships(friend, none, [{subjectId: "1", action: "remove", observedAt: 1_000}], 10_000, () => "b")[0]).toEqual(expect.objectContaining({label: "Relationship ended - cause unavailable", confidence: "unknown"}));
    });

    test("deduplicates and enforces retention and event caps", () => {
        const now = 100 * 86_400_000;
        const fresh = {eventId: "fresh", observedAt: now, subjectId: "1", transition: "friendship-established" as const, label: "Friendship established", source: "observed-store-transition" as const, confidence: "observed" as const, schemaVersion: 1 as const};
        const old = {...fresh, eventId: "old", observedAt: now - 31 * 86_400_000};
        expect(pruneSolcordRelationshipEvents([old, fresh], 30, now).map(event => event.eventId)).toEqual(["fresh"]);
        const journal = new SolcordFriendWatchJournal();
        expect(journal.append([fresh, fresh], 30, now)).toHaveLength(1);
        expect(journal.snapshot()).toHaveLength(1);
        journal.clear();
        expect(journal.snapshot()).toEqual([]);
    });
});
