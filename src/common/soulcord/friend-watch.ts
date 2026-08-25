// SPDX-License-Identifier: Apache-2.0

export type SoulCordRelationshipState = "none" | "friend" | "blocked" | "incoming" | "outgoing";
export type SoulCordRelationshipTransition =
    | "incoming-request-received"
    | "incoming-request-cancelled"
    | "outgoing-request-sent"
    | "outgoing-request-cancelled"
    | "friendship-established"
    | "relationship-ended"
    | "blocked-by-you"
    | "unblocked-by-you"
    | "reconciled";
export type SoulCordRelationshipChangeTransition = Exclude<SoulCordRelationshipTransition, "reconciled">;
export type SoulCordRelationshipSource = "confirmed-owner-action" | "observed-store-transition" | "reconciliation";
export type SoulCordRelationshipConfidence = "confirmed" | "observed" | "unknown";

export interface SoulCordRelationshipSnapshot {
    subjectId: string;
    state: SoulCordRelationshipState;
    displayLabel?: string;
}

export interface SoulCordOwnerRelationshipAction {
    subjectId: string;
    action: "remove" | "block" | "unblock";
    observedAt: number;
}

interface SoulCordRelationshipEventBase {
    eventId: string;
    observedAt: number;
    transition: SoulCordRelationshipTransition;
    label: string;
    source: SoulCordRelationshipSource;
    confidence: SoulCordRelationshipConfidence;
    displayLabel?: string;
    schemaVersion: 1;
}

export type SoulCordRelationshipEvent = SoulCordRelationshipEventBase & (
    | {transition: SoulCordRelationshipChangeTransition; subjectId: string; subjectKey?: never;}
    | {transition: SoulCordRelationshipChangeTransition; subjectId?: never; subjectKey: string;}
    | {transition: "reconciled"; subjectId?: never; subjectKey?: never;}
);

export type SoulCordFriendWatchDigestMode = "off" | "daily" | "per-event";

export interface SoulCordFriendWatchNoticeState {
    /** Local calendar day last summarized in this renderer session. */
    lastDailyDay?: string;
}

export interface SoulCordFriendWatchNoticePlan {
    messages: string[];
    state: SoulCordFriendWatchNoticeState;
}

export type SoulCordFriendWatchAccountDecision = "initialize" | "continue" | "hold";

/**
 * RelationshipStore snapshots do not carry the account that produced them.
 * Once a running adapter observes an identity change, it therefore cannot
 * safely decide whether the next snapshot belongs to the old or new account.
 * Hold until the feature is restarted and a fresh baseline can be established.
 */
export class SoulCordFriendWatchAccountBarrier {
    #initialized = false;
    #accountId?: string;
    #held = false;

    observe(accountId: string | undefined): SoulCordFriendWatchAccountDecision {
        if (this.#held) return "hold";
        if (!this.#initialized) {
            this.#initialized = true;
            this.#accountId = accountId;
            return "initialize";
        }
        if (this.#accountId === accountId) return "continue";
        this.#held = true;
        this.#accountId = undefined;
        return "hold";
    }
}

const VALID_SUBJECT = /^\d{1,32}$/;

export function normalizeDiscordRelationships(value: unknown): Map<string, SoulCordRelationshipSnapshot> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return new Map();
    const states: Record<number, SoulCordRelationshipState | undefined> = {0: "none", 1: "friend", 2: "blocked", 3: "incoming", 4: "outgoing"};
    const result = new Map<string, SoulCordRelationshipSnapshot>();
    for (const [subjectId, rawState] of Object.entries(value as Record<string, unknown>)) {
        if (!VALID_SUBJECT.test(subjectId) || typeof rawState !== "number" || !states[rawState] || states[rawState] === "none") continue;
        result.set(subjectId, {subjectId, state: states[rawState]!});
        if (result.size === 25_000) break;
    }
    return result;
}

function transition(previous: SoulCordRelationshipState, next: SoulCordRelationshipState): {transition: SoulCordRelationshipChangeTransition; label: string;} {
    if (previous === "none" && next === "incoming") return {transition: "incoming-request-received", label: "Incoming request received"};
    if (previous === "incoming" && next === "none") return {transition: "incoming-request-cancelled", label: "Incoming request cancelled"};
    if (previous === "none" && next === "outgoing") return {transition: "outgoing-request-sent", label: "Outgoing request sent"};
    if (previous === "outgoing" && next === "none") return {transition: "outgoing-request-cancelled", label: "Outgoing request cancelled"};
    if (next === "friend" && previous !== "friend") return {transition: "friendship-established", label: "Friendship established"};
    if (next === "blocked") return {transition: "blocked-by-you", label: "Blocked by you"};
    if (previous === "blocked") return {transition: "unblocked-by-you", label: "Unblocked by you"};
    return {transition: "relationship-ended", label: "Relationship ended - cause unavailable"};
}

function recentOwnerAction(actions: readonly SoulCordOwnerRelationshipAction[], subjectId: string, now: number): SoulCordOwnerRelationshipAction | undefined {
    return [...actions].reverse().find(action => action.subjectId === subjectId && now - action.observedAt >= 0 && now - action.observedAt <= 5_000);
}

export function reconcileSoulCordRelationships(
    previous: ReadonlyMap<string, SoulCordRelationshipSnapshot>,
    next: ReadonlyMap<string, SoulCordRelationshipSnapshot>,
    ownerActions: readonly SoulCordOwnerRelationshipAction[] = [],
    now = Date.now(),
    eventId: () => string = () => globalThis.crypto?.randomUUID?.() ?? `${now}-${Math.random().toString(36).slice(2)}`
): SoulCordRelationshipEvent[] {
    const events: SoulCordRelationshipEvent[] = [];
    const ids = [...new Set([...previous.keys(), ...next.keys()])].sort();
    for (const subjectId of ids) {
        const before = previous.get(subjectId)?.state ?? "none";
        const after = next.get(subjectId)?.state ?? "none";
        if (before === after) continue;
        const mapped = transition(before, after);
        const action = recentOwnerAction(ownerActions, subjectId, now);
        const ownerConfirmed = Boolean(action
            && ((action.action === "remove" && before === "friend" && after === "none")
                || (action.action === "block" && after === "blocked")
                || (action.action === "unblock" && before === "blocked")));
        const label = ownerConfirmed && action?.action === "remove" ? "Removed by you"
            : !ownerConfirmed && mapped.transition === "blocked-by-you" ? "Block state changed - cause unavailable"
            : !ownerConfirmed && mapped.transition === "unblocked-by-you" ? "Block state changed - cause unavailable"
            : mapped.label;
        events.push({
            eventId: eventId().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 96) || `${now}`,
            observedAt: now,
            subjectId,
            transition: mapped.transition,
            label,
            source: ownerConfirmed ? "confirmed-owner-action" : "observed-store-transition",
            confidence: ownerConfirmed ? "confirmed" : mapped.transition === "relationship-ended" ? "unknown" : "observed",
            ...(next.get(subjectId)?.displayLabel || previous.get(subjectId)?.displayLabel ? {displayLabel: (next.get(subjectId)?.displayLabel ?? previous.get(subjectId)?.displayLabel)!.slice(0, 160)} : {}),
            schemaVersion: 1
        });
    }
    return events;
}

export function pruneSoulCordRelationshipEvents(events: readonly SoulCordRelationshipEvent[], retentionDays: 7 | 30 | 90, now = Date.now()): SoulCordRelationshipEvent[] {
    const cutoff = now - retentionDays * 86_400_000;
    const valid = events.filter(event => event.observedAt >= cutoff
        && (event.transition === "reconciled" || (event.subjectId ? VALID_SUBJECT.test(event.subjectId) : /^[0-9a-f]{64}$/.test(event.subjectKey ?? "")))).slice(-10_000);
    let bytes = new TextEncoder().encode(JSON.stringify(valid)).byteLength;
    while (bytes > 25 * 1024 * 1024 && valid.length) {
        valid.shift();
        bytes = new TextEncoder().encode(JSON.stringify(valid)).byteLength;
    }
    return valid;
}

/**
 * Plans bounded, local-only notices for newly observed transitions. Hydrated
 * history must never be passed as `newEvents`, so starting or changing accounts
 * cannot replay old relationship events as notifications.
 */
export function planSoulCordFriendWatchNotices(
    mode: SoulCordFriendWatchDigestMode,
    newEvents: readonly SoulCordRelationshipEvent[],
    allEvents: readonly SoulCordRelationshipEvent[],
    previousState: SoulCordFriendWatchNoticeState = {},
    now = Date.now()
): SoulCordFriendWatchNoticePlan {
    const state = {...previousState};
    if (mode === "off" || newEvents.length === 0) return {messages: [], state};

    const local = new Date(now);
    const day = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    if (mode === "daily") {
        if (state.lastDailyDay === day) return {messages: [], state};
        state.lastDailyDay = day;
        const observedToday = allEvents.filter(event => event.transition !== "reconciled" && (() => {
            const date = new Date(event.observedAt);
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` === day;
        })()).length;
        return {
            messages: [`Friend Watch: ${observedToday} relationship change${observedToday === 1 ? "" : "s"} observed today. Open People for the private history.`],
            state
        };
    }

    // Keep transient notifications free of account and subject identifiers.
    // The optional encrypted display snapshot remains available only in People.
    const shown = newEvents.slice(0, 5).map(event => `Friend Watch: ${event.label}.`);
    if (newEvents.length > shown.length) shown.push(`Friend Watch: ${newEvents.length - shown.length} additional changes are available in People.`);
    return {messages: shown, state};
}

export class SoulCordFriendWatchJournal {
    #events: SoulCordRelationshipEvent[] = [];
    #eventIds = new Set<string>();

    append(events: readonly SoulCordRelationshipEvent[], retentionDays: 7 | 30 | 90, now = Date.now()): SoulCordRelationshipEvent[] {
        const added: SoulCordRelationshipEvent[] = [];
        for (const event of events) {
            if (this.#eventIds.has(event.eventId)) continue;
            this.#eventIds.add(event.eventId);
            this.#events.push(structuredClone(event));
            added.push(structuredClone(event));
        }
        this.#events = pruneSoulCordRelationshipEvents(this.#events, retentionDays, now);
        this.#eventIds = new Set(this.#events.map(event => event.eventId));
        return added;
    }

    snapshot(): SoulCordRelationshipEvent[] {return structuredClone(this.#events);}
    clear(): void {this.#events = []; this.#eventIds.clear();}
}
