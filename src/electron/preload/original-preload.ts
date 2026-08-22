export interface OriginalPreloadState {
    attempted: boolean;
}

export interface OriginalPreloadRuntime {
    register(preload: string): void;
    load(preload: string): void;
    getKill(): typeof process.kill;
    setKill(kill: typeof process.kill): void;
}

export interface OriginalPreloadResult {
    state: "loaded" | "failed" | "duplicate" | "missing";
    errorName?: string;
}

/**
 * Runs Discord's original preload at most once and restores process.kill even when
 * Discord's module throws. The path is deliberately absent from the result so it
 * cannot leak into ordinary logs or diagnostics.
 */
export function runOriginalPreloadOnce(
    state: OriginalPreloadState,
    preload: unknown,
    runtime: OriginalPreloadRuntime
): OriginalPreloadResult {
    if (typeof preload !== "string" || !preload) return {state: "missing"};
    if (state.attempted) return {state: "duplicate"};
    state.attempted = true;

    runtime.register(preload);
    const originalKill = runtime.getKill();
    const blockedKill = ((_pid: number, _signal?: string | number) => true) as typeof process.kill;
    runtime.setKill(blockedKill);
    try {
        runtime.load(preload);
        return {state: "loaded"};
    }
    catch (error) {
        return {state: "failed", errorName: error instanceof Error ? error.name : "unknown-error"};
    }
    finally {
        runtime.setKill(originalKill);
    }
}
