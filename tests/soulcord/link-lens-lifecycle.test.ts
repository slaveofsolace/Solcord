// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {
    interceptLinkActivation,
    LinkReviewLifecycle,
    type LinkReviewLifecycleActions,
    type LinkReviewLifecycleEnvironment,
    type LinkReviewModalAdapter,
    type LinkReviewModalCallbacks,
    type LinkReviewModalKey
} from "../../src/betterdiscord/modules/soulcord/link-lens";

class LifecycleEnvironment implements LinkReviewLifecycleEnvironment {
    hrefValue = "https://discord.com/channels/@me";
    focusConnected = true;
    focusCalls = 0;
    clearCalls = 0;
    interval?: () => void;

    href(): string {return this.hrefValue;}
    activeElement() {
        return {
            isConnected: this.focusConnected,
            focus: () => {this.focusCalls++;}
        };
    }
    setInterval(callback: () => void): unknown {
        this.interval = callback;
        return 1;
    }
    clearInterval(): void {
        this.clearCalls++;
        this.interval = undefined;
    }
    tick(): void {this.interval?.();}
}

class NativeModalHarness implements LinkReviewModalAdapter {
    callbacks?: LinkReviewModalCallbacks;
    openCalls = 0;
    closeKeys: LinkReviewModalKey[] = [];
    result: LinkReviewModalKey | undefined = "native-link-review";
    throwOnOpen = false;

    open(callbacks: LinkReviewModalCallbacks): LinkReviewModalKey | undefined {
        this.openCalls++;
        if (this.throwOnOpen) throw new Error("native modal drift");
        this.callbacks = callbacks;
        return this.result;
    }
    close(key: LinkReviewModalKey): void {this.closeKeys.push(key);}
}

function actionCounters() {
    const counts = {confirm: 0, cancel: 0, failure: 0};
    const actions: LinkReviewLifecycleActions = {
        confirm: () => {counts.confirm++;},
        cancel: () => {counts.cancel++;},
        failure: () => {counts.failure++;}
    };
    return {actions, counts};
}

function interceptedActivation(lifecycle: LinkReviewLifecycle, modal: NativeModalHarness) {
    let originalCalls = 0;
    const opened: string[] = [];
    const event = new MouseEvent("click", {cancelable: true});
    const result = interceptLinkActivation({}, [{href: "http://example.com/?utm_source=test"}, event], () => {
        originalCalls++;
        return "original";
    }, {
        currentHref: "https://discord.com/channels/@me",
        confirmAllExternal: false,
        removeTrackers: true,
        review: (_inspection, onConfirm, onCancel, onFailure) => lifecycle.open(modal, {
            confirm: onConfirm,
            cancel: onCancel,
            failure: onFailure
        }) !== "unavailable",
        open: destination => opened.push(destination)
    });
    return {event, opened, result, originalCalls: () => originalCalls};
}

describe("Link Lens native modal lifecycle", () => {
    test("owns only one modal and suppresses a duplicate activation", () => {
        const environment = new LifecycleEnvironment();
        const lifecycle = new LinkReviewLifecycle(environment);
        const modal = new NativeModalHarness();
        const first = actionCounters();
        const second = actionCounters();

        expect(lifecycle.open(modal, first.actions)).toBe("opened");
        expect(lifecycle.open(modal, second.actions)).toBe("busy");
        expect(modal.openCalls).toBe(1);
        modal.callbacks?.onCancel();
        expect(first.counts).toEqual({confirm: 0, cancel: 1, failure: 0});
        expect(second.counts).toEqual({confirm: 0, cancel: 0, failure: 0});
        expect(lifecycle.active).toBeFalse();
    });

    test("treats Escape or backdrop-equivalent native close as one cancellation and restores focus", () => {
        const environment = new LifecycleEnvironment();
        const lifecycle = new LinkReviewLifecycle(environment);
        const modal = new NativeModalHarness();
        const {actions, counts} = actionCounters();

        lifecycle.open(modal, actions);
        modal.callbacks?.onClose();
        modal.callbacks?.onCancel();
        expect(counts).toEqual({confirm: 0, cancel: 1, failure: 0});
        expect(environment.focusCalls).toBe(1);
        expect(environment.clearCalls).toBe(1);
    });

    test("closes and releases the modal on route change", () => {
        const environment = new LifecycleEnvironment();
        const lifecycle = new LinkReviewLifecycle(environment);
        const modal = new NativeModalHarness();
        const {actions, counts} = actionCounters();

        lifecycle.open(modal, actions);
        environment.hrefValue = "https://discord.com/channels/@me/123";
        environment.tick();
        expect(modal.closeKeys).toEqual(["native-link-review"]);
        expect(counts).toEqual({confirm: 0, cancel: 1, failure: 0});
        expect(environment.focusCalls).toBe(1);
        expect(lifecycle.active).toBeFalse();
    });

    test("fails through the original activation exactly once when native open throws", () => {
        const environment = new LifecycleEnvironment();
        const lifecycle = new LinkReviewLifecycle(environment);
        const modal = new NativeModalHarness();
        modal.throwOnOpen = true;

        const activation = interceptedActivation(lifecycle, modal);
        expect(activation.result).toBe("original");
        expect(activation.originalCalls()).toBe(1);
        expect(activation.event.defaultPrevented).toBeFalse();
        expect(lifecycle.active).toBeFalse();
    });

    test("fails through the original activation exactly once after a native render error", () => {
        const environment = new LifecycleEnvironment();
        const lifecycle = new LinkReviewLifecycle(environment);
        const modal = new NativeModalHarness();

        const activation = interceptedActivation(lifecycle, modal);
        expect(activation.event.defaultPrevented).toBeTrue();
        modal.callbacks?.onRenderError();
        modal.callbacks?.onRenderError();
        expect(activation.originalCalls()).toBe(1);
        expect(modal.closeKeys).toEqual(["native-link-review"]);
        expect(environment.focusCalls).toBe(1);
        expect(lifecycle.active).toBeFalse();
    });

    test("teardown closes the modal, cancels once, and restores focus", () => {
        const environment = new LifecycleEnvironment();
        const lifecycle = new LinkReviewLifecycle(environment);
        const modal = new NativeModalHarness();
        const {actions, counts} = actionCounters();

        lifecycle.open(modal, actions);
        lifecycle.dispose();
        lifecycle.dispose();
        expect(modal.closeKeys).toEqual(["native-link-review"]);
        expect(counts).toEqual({confirm: 0, cancel: 1, failure: 0});
        expect(environment.focusCalls).toBe(1);
    });

    test("confirmation opens the reviewed destination once and never invokes the original activation", () => {
        const environment = new LifecycleEnvironment();
        const lifecycle = new LinkReviewLifecycle(environment);
        const modal = new NativeModalHarness();

        const activation = interceptedActivation(lifecycle, modal);
        modal.callbacks?.onConfirm();
        modal.callbacks?.onConfirm();
        modal.callbacks?.onClose();
        expect(activation.opened).toEqual(["http://example.com/"]);
        expect(activation.originalCalls()).toBe(0);
        expect(environment.focusCalls).toBe(1);
        expect(lifecycle.active).toBeFalse();
    });

    test("does not focus a disconnected prior element", () => {
        const environment = new LifecycleEnvironment();
        environment.focusConnected = false;
        const lifecycle = new LinkReviewLifecycle(environment);
        const modal = new NativeModalHarness();

        lifecycle.open(modal, actionCounters().actions);
        modal.callbacks?.onCancel();
        expect(environment.focusCalls).toBe(0);
    });
});
