export interface PerformanceSample {
    at: number;
    eventLoopLagMs: number;
    rendererHeapBytes?: number;
    ownedResources: number;
}

const MAX_SAMPLES = 120;

export class BoundedPerformanceSampler {
    #samples: PerformanceSample[] = [];
    #expectedAt = 0;

    begin(now = performance.now()): void {
        this.#expectedAt = now;
    }

    sample(intervalMs: number, ownedResources: number, now = performance.now()): PerformanceSample {
        const expected = this.#expectedAt ? this.#expectedAt + intervalMs : now;
        const memory = (performance as Performance & {memory?: {usedJSHeapSize?: number;};}).memory;
        const sample: PerformanceSample = {
            at: Date.now(),
            eventLoopLagMs: Math.max(0, Math.round((now - expected) * 10) / 10),
            rendererHeapBytes: typeof memory?.usedJSHeapSize === "number" ? memory.usedJSHeapSize : undefined,
            ownedResources
        };
        this.#expectedAt = now;
        this.#samples.push(sample);
        this.#samples.splice(0, Math.max(0, this.#samples.length - MAX_SAMPLES));
        return sample;
    }

    snapshot(): PerformanceSample[] {
        return structuredClone(this.#samples);
    }
}
