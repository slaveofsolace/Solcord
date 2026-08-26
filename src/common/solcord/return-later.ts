// SPDX-License-Identifier: Apache-2.0

export interface SolcordReturnLaterItem {
    id: string;
    route: string;
    label: string;
    createdAt: number;
    dueAt: number;
    completedAt?: number;
}

const MAX_ITEMS = 500;
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1_000;
const MIN_DUE_MS = 5 * 60 * 1_000;

export function normalizeSolcordReturnRoute(input: string): string | undefined {
    let url: URL;
    try {url = new URL(input, "https://discord.com");}
    catch {return;}
    if (url.protocol !== "https:" || !["discord.com", "www.discord.com"].includes(url.hostname.toLowerCase())) return;
    const route = url.pathname;
    if (!/^\/channels\/(?:@me|\d{1,32})\/\d{1,32}(?:\/\d{1,32})?$/.test(route)) return;
    return route;
}

function normalizeItem(value: unknown, now: number): SolcordReturnLaterItem | undefined {
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    const route = normalizeSolcordReturnRoute(typeof item.route === "string" ? item.route : "");
    if (!route || typeof item.id !== "string" || !/^[a-zA-Z0-9_-]{8,96}$/.test(item.id)) return;
    if (!Number.isSafeInteger(item.createdAt) || !Number.isSafeInteger(item.dueAt)) return;
    const createdAt = Number(item.createdAt);
    const dueAt = Number(item.dueAt);
    if (createdAt < 0 || dueAt < createdAt || now - createdAt > MAX_AGE_MS) return;
    const completedAt = Number.isSafeInteger(item.completedAt) && Number(item.completedAt) >= createdAt ? Number(item.completedAt) : undefined;
    return {id: item.id, route, label: typeof item.label === "string" ? item.label.trim().slice(0, 80) : "Return here", createdAt, dueAt, ...(completedAt ? {completedAt} : {})};
}

export class SolcordReturnLaterJournal {
    #items: SolcordReturnLaterItem[] = [];

    constructor(value?: unknown, now = Date.now()) {
        if (!Array.isArray(value)) return;
        const unique = new Map<string, SolcordReturnLaterItem>();
        for (const raw of value.slice(-MAX_ITEMS)) {
            const item = normalizeItem(raw, now);
            if (item) unique.set(item.id, item);
        }
        this.#items = [...unique.values()].sort((left, right) => left.dueAt - right.dueAt);
    }

    add(id: string, input: string, label: string, dueAt: number, now = Date.now()): SolcordReturnLaterItem | undefined {
        const route = normalizeSolcordReturnRoute(input);
        if (!route || !/^[a-zA-Z0-9_-]{8,96}$/.test(id) || !Number.isFinite(dueAt)) return;
        const boundedDue = Math.max(now + MIN_DUE_MS, Math.min(now + MAX_AGE_MS, Math.round(dueAt)));
        const item = {id, route, label: label.trim().slice(0, 80) || "Return here", createdAt: now, dueAt: boundedDue};
        this.#items = [...this.#items.filter(entry => entry.id !== id), item].sort((left, right) => left.dueAt - right.dueAt).slice(-MAX_ITEMS);
        return {...item};
    }

    complete(id: string, now = Date.now()): boolean {
        const item = this.#items.find(entry => entry.id === id);
        if (!item || item.completedAt) return false;
        item.completedAt = now;
        return true;
    }

    snooze(id: string, durationMs: number, now = Date.now()): boolean {
        const item = this.#items.find(entry => entry.id === id);
        if (!item || item.completedAt || !Number.isFinite(durationMs)) return false;
        item.dueAt = Math.max(now + MIN_DUE_MS, Math.min(now + MAX_AGE_MS, now + Math.round(durationMs)));
        this.#items.sort((left, right) => left.dueAt - right.dueAt);
        return true;
    }

    snapshot(includeCompleted = false): SolcordReturnLaterItem[] {
        return this.#items.filter(item => includeCompleted || !item.completedAt).map(item => ({...item}));
    }
}
