// SPDX-License-Identifier: Apache-2.0

const DOCUMENT_GENERATION = /^[A-Za-z0-9_-]{22}$/;

export type RendererDocumentClaim = "claimed" | "duplicate" | "invalid";

export function isRendererDocumentGeneration(value: unknown): value is string {
    return typeof value === "string" && DOCUMENT_GENERATION.test(value);
}

/**
 * Tracks renderer injection per preload document rather than for the lifetime of
 * a WebContents. A full navigation receives a new isolated-preload generation;
 * repeated calls from the same document remain idempotent.
 */
export class RendererDocumentInjectionGuard<TOwner extends object> {
    #inFlight = new WeakMap<TOwner, string>();
    #completed = new WeakMap<TOwner, string>();

    claim(owner: TOwner, generation: unknown): RendererDocumentClaim {
        if (!isRendererDocumentGeneration(generation)) return "invalid";
        if (this.#inFlight.get(owner) === generation || this.#completed.get(owner) === generation) return "duplicate";
        this.#inFlight.set(owner, generation);
        return "claimed";
    }

    complete(owner: TOwner, generation: string): boolean {
        if (this.#inFlight.get(owner) !== generation) return false;
        this.#inFlight.delete(owner);
        this.#completed.set(owner, generation);
        return true;
    }

    fail(owner: TOwner, generation: string): void {
        if (this.#inFlight.get(owner) === generation) this.#inFlight.delete(owner);
    }
}
