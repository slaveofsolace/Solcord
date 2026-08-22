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
