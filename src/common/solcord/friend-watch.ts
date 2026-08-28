// SPDX-License-Identifier: Apache-2.0

export type SolcordRelationshipState = "none" | "friend" | "blocked" | "incoming" | "outgoing";
export type SolcordRelationshipTransition =
    | "incoming-request-received"
    | "incoming-request-cancelled"
    | "outgoing-request-sent"
    | "outgoing-request-cancelled"
    | "friendship-established"
    | "relationship-ended"
    | "blocked-by-you"
    | "unblocked-by-you"
    | "reconciled";
export type SolcordRelationshipChangeTransition = Exclude<SolcordRelationshipTransition, "reconciled">;
export type SolcordRelationshipSource = "confirmed-owner-action" | "observed-store-transition" | "reconciliation";
export type SolcordRelationshipConfidence = "confirmed" | "observed" | "unknown";

export interface SolcordRelationshipSnapshot {
    subjectId: string;
    state: SolcordRelationshipState;
    displayLabel?: string;
}

export interface SolcordOwnerRelationshipAction {
    subjectId: string;
    action: "remove" | "block" | "unblock";
    observedAt: number;
}

interface SolcordRelationshipEventBase {
    eventId: string;
    observedAt: number;
    transition: SolcordRelationshipTransition;
    label: string;
    source: SolcordRelationshipSource;
    confidence: SolcordRelationshipConfidence;
    displayLabel?: string;
    schemaVersion: 1;
}

export type SolcordRelationshipEvent = SolcordRelationshipEventBase & (
    | {transition: SolcordRelationshipChangeTransition; subjectId: string; subjectKey?: never;}
    | {transition: SolcordRelationshipChangeTransition; subjectId?: never; subjectKey: string;}
    | {transition: "reconciled"; subjectId?: never; subjectKey?: never;}
);

export type SolcordFriendWatchDigestMode = "off" | "daily" | "per-event";

export interface SolcordFriendWatchNoticeState {
    /** Local calendar day last summarized in this renderer session. */
    lastDailyDay?: string;
}

export interface SolcordFriendWatchNoticePlan {
    messages: string[];
    state: SolcordFriendWatchNoticeState;
}

export type SolcordFriendWatchAccountDecision = "initialize" | "continue" | "hold";

/**
 * RelationshipStore snapshots do not carry the account that produced them.
 * Once a running adapter observes an identity change, it therefore cannot
 * safely decide whether the next snapshot belongs to the old or new account.
 * Hold until the feature is restarted and a fresh baseline can be established.
 */
export class SolcordFriendWatchAccountBarrier {
    #initialized = false;
    #accountId?: string;
    #held = false;

    observe(accountId: string | undefined): SolcordFriendWatchAccountDecision {
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

export function normalizeDiscordRelationships(value: unknown): Map<string, SolcordRelationshipSnapshot> {
    const states: Record<number, SolcordRelationshipState | undefined> = {0: "none", 1: "friend", 2: "blocked", 3: "incoming", 4: "outgoing"};
    const result = new Map<string, SolcordRelationshipSnapshot>();
    const entries = value instanceof Map
        ? value.entries()
        : value && typeof value === "object" && !Array.isArray(value)
            ? Object.entries(value as Record<string, unknown>)
            : [];
    for (const [rawSubjectId, rawState] of entries) {
        const subjectId = typeof rawSubjectId === "string" ? rawSubjectId : "";
        if (!VALID_SUBJECT.test(subjectId) || typeof rawState !== "number" || !states[rawState] || states[rawState] === "none") continue;
        result.set(subjectId, {subjectId, state: states[rawState]!});
        if (result.size === 25_000) break;
    }
    return result;
}

function transition(previous: SolcordRelationshipState, next: SolcordRelationshipState): {transition: SolcordRelationshipChangeTransition; label: string;} {
    if (previous === "none" && next === "incoming") return {transition: "incoming-request-received", label: "Incoming request received"};
    if (previous === "incoming" && next === "none") return {transition: "incoming-request-cancelled", label: "Incoming request cancelled"};
    if (previous === "none" && next === "outgoing") return {transition: "outgoing-request-sent", label: "Outgoing request sent"};
    if (previous === "outgoing" && next === "none") return {transition: "outgoing-request-cancelled", label: "Outgoing request cancelled"};
    if (next === "friend" && previous !== "friend") return {transition: "friendship-established", label: "Friendship established"};
    if (next === "blocked") return {transition: "blocked-by-you", label: "Blocked by you"};
    if (previous === "blocked") return {transition: "unblocked-by-you", label: "Unblocked by you"};
    return {transition: "relationship-ended", label: "Relationship ended - cause unavailable"};
}

function recentOwnerAction(actions: readonly SolcordOwnerRelationshipAction[], subjectId: string, now: number): SolcordOwnerRelationshipAction | undefined {
    return [...actions].reverse().find(action => action.subjectId === subjectId && now - action.observedAt >= 0 && now - action.observedAt <= 5_000);
}

export function reconcileSolcordRelationships(
    previous: ReadonlyMap<string, SolcordRelationshipSnapshot>,
    next: ReadonlyMap<string, SolcordRelationshipSnapshot>,
    ownerActions: readonly SolcordOwnerRelationshipAction[] = [],
    now = Date.now(),
    eventId: () => string = () => globalThis.crypto?.randomUUID?.() ?? `${now}-${Math.random().toString(36).slice(2)}`
): SolcordRelationshipEvent[] {
    const events: SolcordRelationshipEvent[] = [];
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

export function pruneSolcordRelationshipEvents(events: readonly SolcordRelationshipEvent[], retentionDays: 7 | 30 | 90, now = Date.now()): SolcordRelationshipEvent[] {
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
export function planSolcordFriendWatchNotices(
    mode: SolcordFriendWatchDigestMode,
    newEvents: readonly SolcordRelationshipEvent[],
    allEvents: readonly SolcordRelationshipEvent[],
    previousState: SolcordFriendWatchNoticeState = {},
    now = Date.now()
): SolcordFriendWatchNoticePlan {
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

export class SolcordFriendWatchJournal {
    #events: SolcordRelationshipEvent[] = [];
    #eventIds = new Set<string>();

    append(events: readonly SolcordRelationshipEvent[], retentionDays: 7 | 30 | 90, now = Date.now()): SolcordRelationshipEvent[] {
        const added: SolcordRelationshipEvent[] = [];
        for (const event of events) {
            if (this.#eventIds.has(event.eventId)) continue;
            this.#eventIds.add(event.eventId);
            this.#events.push(structuredClone(event));
            added.push(structuredClone(event));
        }
        this.#events = pruneSolcordRelationshipEvents(this.#events, retentionDays, now);
        this.#eventIds = new Set(this.#events.map(event => event.eventId));
        return added;
    }

    snapshot(): SolcordRelationshipEvent[] {return structuredClone(this.#events);}
    clear(): void {this.#events = []; this.#eventIds.clear();}
}
