// SPDX-License-Identifier: Apache-2.0

export type SolcordScrollMode = "upward-only" | "target";

export function findSolcordSettingsScrollOwner(target: HTMLElement): HTMLElement | null {
    let candidate = target.parentElement;
    while (candidate) {
        if (/^(auto|scroll|overlay)$/.test(getComputedStyle(candidate).overflowY)) return candidate;
        candidate = candidate.parentElement;
    }
    return null;
}

function stickyOffset(target: HTMLElement): number {
    const navigation = target.closest(".solcord-control-center")?.querySelector<HTMLElement>(".solcord-workspace-nav") ?? null;
    if (!navigation || getComputedStyle(navigation).position !== "sticky") return 0;
    const navigationRect = navigation.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const overlaps = navigationRect.left < targetRect.right && navigationRect.right > targetRect.left;
    return overlaps ? Math.ceil(navigationRect.height) + 12 : 0;
}

/** Scroll only Discord's captured settings owner. Never falls back to the document. */
export function scrollSolcordSettingsTarget(target: HTMLElement | null, mode: SolcordScrollMode): boolean {
    if (!target) return false;
    const owner = findSolcordSettingsScrollOwner(target);
    if (!owner) return false;
    const offset = stickyOffset(target);
    const ownerRect = owner.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const visibleTop = ownerRect.top + offset;
    if (mode === "upward-only" && targetRect.top >= visibleTop) return false;
    const desired = Math.max(0, owner.scrollTop + targetRect.top - ownerRect.top - offset);
    if (mode === "upward-only" && desired >= owner.scrollTop) return false;
    if (Math.abs(desired - owner.scrollTop) < 1) return false;
    owner.scrollTo({top: desired, behavior: "auto"});
    return true;
}
