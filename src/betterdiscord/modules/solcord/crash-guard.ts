export interface CrashGuardDocument {
    attempts: number[];
    state: "starting" | "stable" | "clean";
    at: number;
}

const CRASH_WINDOW_MS = 10 * 60 * 1_000;
const CRASH_THRESHOLD = 3;

/**
 * Tracks interrupted starts without counting any start twice. Recovery begins
 * only after three prior starts failed to reach the stable/clean state.
 */
export function evaluateCrashGuard(raw: Partial<CrashGuardDocument> | undefined, now: number): {recovery: boolean; next: CrashGuardDocument;} {
    const previousStarts = raw?.state === "starting" && Array.isArray(raw.attempts)
        ? raw.attempts.filter(value => Number.isFinite(value) && value <= now && now - value < CRASH_WINDOW_MS)
        : [];
    const recovery = previousStarts.length >= CRASH_THRESHOLD;
    return {
        recovery,
        next: {
            attempts: [...previousStarts, now].slice(-CRASH_THRESHOLD - 1),
            state: "starting",
            at: now
        }
    };
}
