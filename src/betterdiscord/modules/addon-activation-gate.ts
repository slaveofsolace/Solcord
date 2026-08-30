export type AddonActivationDisposition = "allowed" | "held" | "denied";

export type AddonActivationGuard<T> = (addon: T) => boolean;

/**
 * Keeps addon inventory separate from addon execution. The startup hold is
 * temporary and preserves the owner's enabled state; a policy denial is a
 * durable fail-closed decision handled by the owning AddonManager.
 */
export class AddonActivationGate<T> {
    #held = false;
    #guard?: AddonActivationGuard<T>;

    hold(): void {
        this.#held = true;
    }

    release(): void {
        this.#held = false;
    }

    setGuard(guard?: AddonActivationGuard<T>): void {
        this.#guard = guard;
    }

    evaluate(addon: T): AddonActivationDisposition {
        if (this.#held) return "held";
        if (!this.#guard) return "allowed";
        try {
            return this.#guard(addon) ? "allowed" : "denied";
        }
        catch {
            return "denied";
        }
    }
}
