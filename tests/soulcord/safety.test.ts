import {describe, expect, test} from "bun:test";

import {runStructuralProbes} from "../../src/betterdiscord/modules/soulcord/drift";
import {inspectLink, interceptLinkActivation, isDiscordInternalNavigation, shouldInterceptLink} from "../../src/betterdiscord/modules/soulcord/link-lens";
import {BoundedPerformanceSampler} from "../../src/betterdiscord/modules/soulcord/performance";
import {evaluateCrashGuard} from "../../src/betterdiscord/modules/soulcord/crash-guard";
import {SoulCordDisposalScope} from "../../src/betterdiscord/modules/soulcord/disposal";
import {failuresInWindow, shouldQuarantine} from "../../src/betterdiscord/modules/soulcord/quarantine-policy";

describe("SoulCord safety adapters", () => {
    test("quarantines only after three recent failures", () => {
        const now = 1_000_000;
        const failures = [{at: now - 601_000}, {at: now - 5_000}, {at: now - 3_000}, {at: now - 1_000}];
        expect(failuresInWindow(failures, now, 600_000)).toEqual(failures.slice(1));
        expect(shouldQuarantine(failures.slice(0, 3), now)).toBe(false);
        expect(shouldQuarantine(failures, now)).toBe(true);
    });

    test("removes known trackers and exposes declared redirect hosts", () => {
        const result = inspectLink("https://example.com/go?utm_source=test&url=https%3A%2F%2Ffinal.example%2Ffile");
        expect(result).toMatchObject({valid: true, host: "example.com", finalHost: "final.example", removedParameters: ["utm_source"], requiresConfirmation: true});
        expect(result.cleanedUrl).not.toContain("utm_source");
    });

    test("flags insecure and punycode links and identifies invites without fetching", () => {
        expect(inspectLink("http://xn--e1awd7f.com/").warnings.length).toBeGreaterThanOrEqual(2);
        expect(inspectLink("https://discord.gg/local-test")).toMatchObject({inviteCode: "local-test", requiresConfirmation: true});
        expect(inspectLink("https://discord.com/invite/local-test")).toMatchObject({inviteCode: "local-test", requiresConfirmation: true});
    });

    test("never mistakes Discord application routes for invite codes or external links", () => {
        const dm = "https://discord.com/channels/@me/123456789012345678";
        const inspection = inspectLink(dm);
        expect(inspection).toMatchObject({valid: true, inviteCode: undefined, requiresConfirmation: false});
        expect(isDiscordInternalNavigation(dm, "https://discord.com/channels/@me")).toBeTrue();
        expect(shouldInterceptLink(dm, inspection, "https://discord.com/channels/@me", true)).toBeFalse();
    });

    test("reviews only external links selected by the warning policy", () => {
        const safe = "https://example.com/path";
        const risky = "http://example.com/path?utm_source=test";
        expect(shouldInterceptLink(safe, inspectLink(safe), "https://discord.com/channels/@me", false)).toBeFalse();
        expect(shouldInterceptLink(safe, inspectLink(safe), "https://discord.com/channels/@me", true)).toBeTrue();
        expect(shouldInterceptLink(risky, inspectLink(risky), "https://discord.com/channels/@me", false)).toBeTrue();
    });

    test("keeps internal DM navigation on Discord's original activation path", () => {
        let originalCalls = 0;
        const event = new MouseEvent("click", {cancelable: true});
        const result = interceptLinkActivation({}, [
            {href: "https://discord.com/channels/@me/123456789012345678"},
            event
        ], () => {
            originalCalls++;
            return "original";
        }, {
            currentHref: "https://discord.com/channels/@me",
            confirmAllExternal: true,
            removeTrackers: true,
            review: () => {throw new Error("internal navigation must not review");},
            open: () => {throw new Error("internal navigation must not open externally");}
        });

        expect(result).toBe("original");
        expect(originalCalls).toBe(1);
        expect(event.defaultPrevented).toBeFalse();
    });

    test("stops a risky external activation until native review confirms it", () => {
        let originalCalls = 0;
        let confirm: (() => void) | undefined;
        const opened: string[] = [];
        const event = new MouseEvent("click", {cancelable: true});
        const result = interceptLinkActivation({}, [
            {href: "http://example.com/path?utm_source=test"},
            event
        ], () => {
            originalCalls++;
            return "original";
        }, {
            currentHref: "https://discord.com/channels/@me",
            confirmAllExternal: false,
            removeTrackers: true,
            review: (_inspection, onConfirm) => {confirm = onConfirm; return true;},
            open: destination => opened.push(destination)
        });

        expect(result).toBeUndefined();
        expect(originalCalls).toBe(0);
        expect(event.defaultPrevented).toBeTrue();
        expect(opened).toEqual([]);
        confirm?.();
        expect(opened).toEqual(["http://example.com/path"]);
    });

    test("fails open through the original activation when the native review adapter drifts", () => {
        let originalCalls = 0;
        const event = new MouseEvent("click", {cancelable: true});
        const result = interceptLinkActivation({}, [{href: "http://example.com/"}, event], () => {
            originalCalls++;
            return "original";
        }, {
            currentHref: "https://discord.com/channels/@me",
            confirmAllExternal: false,
            removeTrackers: true,
            review: () => {throw new Error("native modal unavailable");},
            open: () => {throw new Error("must remain on original activation path");}
        });
        expect(result).toBe("original");
        expect(originalCalls).toBe(1);
        expect(event.defaultPrevented).toBeFalse();
    });

    test("structural probes fail closed when a validator throws", () => {
        expect(runStructuralProbes([
            {id: "ok", description: "ok", validate: () => true},
            {id: "throw", description: "throws", validate: () => {throw new TypeError("private detail must not escape");}}
        ], 42)).toEqual([
            {id: "ok", ok: true, checkedAt: 42, detail: "Structural contract present."},
            {id: "throw", ok: false, checkedAt: 42, detail: "Validation threw TypeError."}
        ]);
    });

    test("keeps performance samples bounded and reports deterministic lag", () => {
        const sampler = new BoundedPerformanceSampler();
        sampler.begin(100);
        expect(sampler.sample(50, 4, 165)).toMatchObject({eventLoopLagMs: 15, ownedResources: 4});
        for (let index = 0; index < 140; index++) sampler.sample(10, index, 175 + index * 10);
        expect(sampler.snapshot()).toHaveLength(120);
    });

    test("enters startup recovery only after three distinct interrupted starts", () => {
        const first = evaluateCrashGuard(undefined, 1_000);
        expect(first.recovery).toBeFalse();
        const second = evaluateCrashGuard(first.next, 2_000);
        expect(second.recovery).toBeFalse();
        const third = evaluateCrashGuard(second.next, 3_000);
        expect(third.recovery).toBeFalse();
        const fourth = evaluateCrashGuard(third.next, 4_000);
        expect(fourth.recovery).toBeTrue();
        expect(new Set(fourth.next.attempts).size).toBe(4);
    });

    test("clears old or stable crash history", () => {
        const old = evaluateCrashGuard({attempts: [1, 2, 3], state: "starting", at: 3}, 10 * 60 * 1_000 + 4);
        expect(old.recovery).toBeFalse();
        expect(old.next.attempts).toEqual([10 * 60 * 1_000 + 4]);

        const stable = evaluateCrashGuard({attempts: [1_000, 2_000, 3_000], state: "stable", at: 3_000}, 4_000);
        expect(stable.recovery).toBeFalse();
        expect(stable.next.attempts).toEqual([4_000]);
    });

    test("releases owned listeners and disposers exactly once in reverse order", () => {
        const scope = new SoulCordDisposalScope();
        const target = document.createElement("button");
        let clicks = 0;
        const order: string[] = [];
        scope.listen(target, "click", () => clicks++);
        scope.own(() => order.push("first"), "other");
        scope.own(() => order.push("second"), "patch");
        expect(scope.counts()).toEqual({listener: 1, other: 1, patch: 1});

        target.click();
        scope.dispose();
        scope.dispose();
        target.click();

        expect(clicks).toBe(1);
        expect(order).toEqual(["second", "first"]);
        expect(scope.counts()).toEqual({});
    });
});
