// SPDX-License-Identifier: Apache-2.0

export const SOULCORD_LAUNCH_TIMING = Object.freeze({
    settleMs: 180,
    insertMs: 420,
    resolveMs: 820,
    handoffMs: 190,
    timeoutMs: 12_000
});

export type SoulCordLaunchFrame = "initial" | "inserting" | "resolved";

/** Pure timing model used by the renderer adapter and source-frozen frame tests. */
export function soulCordLaunchFrame(elapsedMs: number, reducedMotion = false): SoulCordLaunchFrame {
    if (reducedMotion) return "resolved";
    if (!Number.isFinite(elapsedMs) || elapsedMs <= SOULCORD_LAUNCH_TIMING.settleMs) return "initial";
    if (elapsedMs < SOULCORD_LAUNCH_TIMING.resolveMs) return "inserting";
    return "resolved";
}

export function soulCordLaunchTimeout(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value)
        ? Math.min(15_000, Math.max(4_000, Math.round(value)))
        : SOULCORD_LAUNCH_TIMING.timeoutMs;
}
