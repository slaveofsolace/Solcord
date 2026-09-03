// SPDX-License-Identifier: Apache-2.0

import {afterEach, describe, expect, test} from "bun:test";

import {SolcordDisposalScope} from "../../src/betterdiscord/modules/solcord/disposal";
import {SolcordNativeSuiteController} from "../../src/betterdiscord/modules/solcord/native-suite";

const originalFetch = globalThis.fetch;
const owned: Array<{controller: SolcordNativeSuiteController; scope: SolcordDisposalScope;}> = [];
const finishRequests: Array<() => void> = [];

function start(allowed = () => true) {
    const scope = new SolcordDisposalScope();
    const controller = new SolcordNativeSuiteController(scope, {Translator: true}, {externalProvidersAllowed: allowed});
    controller.start();
    owned.push({controller, scope});
    return {controller, scope};
}

function preview(controller: SolcordNativeSuiteController) {
    return controller.previewTranslation("libretranslate", "https://translate.example/v1", "en", "es", "hello");
}

function holdRequests(signals: AbortSignal[]) {
    globalThis.fetch = (async (_url: unknown, options: RequestInit) => {
        signals.push(options.signal!);
        // Ignore abort on purpose: a late provider response must never escape
        // after disable, account disposal, or withdrawal of provider access.
        return new Promise<Response>(resolve => finishRequests.push(() => resolve(new Response(JSON.stringify({translatedText: "hola"})))));
    }) as typeof fetch;
}

afterEach(() => {
    for (const finish of finishRequests.splice(0)) finish();
    for (const {controller, scope} of owned.splice(0)) {controller.dispose(); scope.dispose();}
    globalThis.fetch = originalFetch;
});

describe("external translation lifecycle", () => {
    test("disable aborts the pending request and suppresses a late result", async () => {
        const signals: AbortSignal[] = [];
        holdRequests(signals);
        const {controller, scope} = start();
        const baseline = scope.counts();
        const request = controller.executeReviewedTranslation(preview(controller).id);
        expect(scope.counts().timer).toBe((baseline.timer ?? 0) + 1);
        controller.dispose();
        expect(signals[0].aborted).toBeTrue();
        expect(scope.counts()).toEqual(baseline);
        finishRequests.shift()!();
        await expect(request).rejects.toThrow("canceled");
        await expect(controller.executeReviewedTranslation("translation:1")).rejects.toThrow("off");
        expect(signals).toHaveLength(1);
    });

    test("withdrawn provider access cancels pending work but leaves local translation available", async () => {
        const signals: AbortSignal[] = [];
        holdRequests(signals);
        let allowed = true;
        const {controller, scope} = start(() => allowed);
        const baseline = scope.counts();
        const request = controller.executeReviewedTranslation(preview(controller).id);
        allowed = false;
        controller.cancelExternalTranslations();
        expect(signals[0].aborted).toBeTrue();
        expect(scope.counts()).toEqual(baseline);
        expect(controller.providerReady("Translator")).toBeTrue();
        finishRequests.shift()!();
        await expect(request).rejects.toThrow("canceled");
        await expect(controller.executeReviewedTranslation(preview(controller).id)).rejects.toThrow("Strict Privacy");
        expect(signals).toHaveLength(1);
    });

    test("request completion releases all owned resources and abandoned previews are bounded", async () => {
        let fetches = 0;
        globalThis.fetch = (async () => {fetches++; return new Response(JSON.stringify({translatedText: "hola"}));}) as typeof fetch;
        const {controller, scope} = start();
        const baseline = scope.counts();
        const oldest = preview(controller);
        for (let i = 0; i < 40; i++) preview(controller);
        await expect(controller.executeReviewedTranslation(oldest.id)).rejects.toThrow("endpoint review expired");
        expect(fetches).toBe(0);
        for (let i = 0; i < 12; i++) {
            await expect(controller.executeReviewedTranslation(preview(controller).id)).resolves.toBe("hola");
            expect(scope.counts()).toEqual(baseline);
        }
        expect(fetches).toBe(12);
    });

    test("repeated confirmations cannot create unbounded simultaneous provider requests", async () => {
        const signals: AbortSignal[] = [];
        holdRequests(signals);
        const {controller} = start();
        const requests = Array.from({length: 4}, () => controller.executeReviewedTranslation(preview(controller).id));
        await expect(controller.executeReviewedTranslation(preview(controller).id)).rejects.toThrow("Wait for the current translations");
        expect(signals).toHaveLength(4);
        for (const finish of finishRequests.splice(0)) finish();
        expect(await Promise.all(requests)).toEqual(["hola", "hola", "hola", "hola"]);
    });
});
