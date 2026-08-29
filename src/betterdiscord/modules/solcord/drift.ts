export interface StructuralProbe {
    id: string;
    description: string;
    validate(): boolean;
}

export interface StructuralProbeResult {
    id: string;
    ok: boolean;
    checkedAt: number;
    detail: string;
}

export interface ReversiblePatchCanary {
    id: string;
    install(callback: (thisObject: unknown, args: unknown[], original: (...args: unknown[]) => unknown) => unknown): (() => void) | null;
    invoke(): unknown;
    expectedPatched: unknown;
    expectedRestored: unknown;
}

export function runStructuralProbes(probes: StructuralProbe[], now = Date.now()): StructuralProbeResult[] {
    return probes.map(probe => {
        try {
            const ok = probe.validate() === true;
            return {id: probe.id, ok, checkedAt: now, detail: ok ? "Structural contract present." : `Unavailable: ${probe.description}.`};
        }
        catch (error) {
            return {id: probe.id, ok: false, checkedAt: now, detail: `Validation threw ${error instanceof Error ? error.name : typeof error}.`};
        }
    });
}

/**
 * Exercises the real patch registry against an isolated fixture. The canary
 * never patches a Discord-owned method: it proves interception, exactly-once
 * original chaining, and restoration before volatile adapters are trusted.
 */
export function runReversiblePatchCanary(canary: ReversiblePatchCanary, now = Date.now()): StructuralProbeResult {
    let release: (() => void) | null = null;
    let interceptions = 0;
    let originalCalls = 0;
    let released = false;
    try {
        release = canary.install((thisObject, args, original) => {
            interceptions++;
            const value = Reflect.apply(original, thisObject, args);
            originalCalls++;
            return value;
        });
        if (!release) return {id: canary.id, ok: false, checkedAt: now, detail: "Patch registry rejected the isolated canary."};

        const patched = canary.invoke();
        release();
        released = true;
        release = null;
        const restored = canary.invoke();
        const ok = Object.is(patched, canary.expectedPatched)
            && Object.is(restored, canary.expectedRestored)
            && interceptions === 1
            && originalCalls === 1;
        return {
            id: canary.id,
            ok,
            checkedAt: now,
            detail: ok
                ? "Reversible patch applied exactly once and restored."
                : "Patch canary did not preserve exactly-once chaining and restoration."
        };
    }
    catch (error) {
        return {id: canary.id, ok: false, checkedAt: now, detail: `Patch canary threw ${error instanceof Error ? error.name : typeof error}.`};
    }
    finally {
        if (!released) {
            try {release?.();}
            catch {release = null;}
        }
    }
}
