export interface AddonNameCandidate {
    name?: unknown;
    getName?: () => unknown;
}

export function normalizeSettingsSearchTerms(values: readonly unknown[]): string[] {
    const terms: string[] = [];
    const visit = (value: unknown): void => {
        if (Array.isArray(value)) {
            for (const item of value) visit(item);
            return;
        }

        if (typeof value !== "string" || value.trim().length === 0) return;
        terms.push(value);
    };

    visit(values);
    return terms;
}

export function resolveAddonDisplayNames(addons: readonly AddonNameCandidate[]): string[] {
    const names: string[] = [];

    for (const addon of addons) {
        let candidate = addon.name;
        if (typeof candidate !== "string") {
            try {candidate = addon.getName?.();}
            catch {continue;}
        }

        if (typeof candidate !== "string" || candidate.trim().length === 0) continue;
        names.push(candidate);
    }

    return names.sort((first, second) => first.localeCompare(second, undefined, {sensitivity: "base"}));
}
