export interface TimedFailure {
    at: number;
}

export function failuresInWindow<T extends TimedFailure>(failures: T[], now: number, windowMs: number): T[] {
    if (!Number.isFinite(now) || !Number.isFinite(windowMs) || windowMs <= 0) return [];
    return failures.filter(failure => Number.isFinite(failure.at) && failure.at <= now && now - failure.at <= windowMs);
}

export function shouldQuarantine<T extends TimedFailure>(failures: T[], now: number, threshold = 3, windowMs = 10 * 60 * 1_000): boolean {
    return failuresInWindow(failures, now, windowMs).length >= Math.max(3, Math.floor(threshold));
}
