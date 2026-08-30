// SPDX-License-Identifier: Apache-2.0

let automaticUpdatesAllowed = false;
const listeners = new Set<() => void>();

export function setSolcordAutomaticUpdatesAllowed(value: boolean): void {
    const next = value === true;
    if (automaticUpdatesAllowed === next) return;
    automaticUpdatesAllowed = next;
    for (const listener of listeners) listener();
}

export function solcordAutomaticUpdatesAllowed(): boolean {
    return automaticUpdatesAllowed;
}

export function solcordAutomaticCatalogRequestsAllowed(storeVisible: boolean, addonUpdatesEnabled: boolean): boolean {
    return automaticUpdatesAllowed && (storeVisible || addonUpdatesEnabled);
}

export function solcordCatalogRetryAllowed(automaticRequest: boolean): boolean {
    return automaticRequest && automaticUpdatesAllowed;
}

export function onSolcordUpdatePolicyChange(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
