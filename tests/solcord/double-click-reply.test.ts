// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {
    decideDoubleClickReply,
    DoubleClickReplyFeature,
    type DoubleClickReplyAdapter,
    type DoubleClickReplyContext,
    type DoubleClickReplyTarget
} from "../../src/betterdiscord/modules/solcord/double-click-reply";

const MESSAGE_ID = "1152921504606846976";
const CHANNEL_ID = "1152921504606846977";

function context(overrides: Partial<DoubleClickReplyContext> = {}): DoubleClickReplyContext {
    return {
        eventType: "dblclick",
        button: 0,
        detail: 2,
        hasSelection: false,
        ancestors: [{tagName: "div"}],
        message: {messageId: MESSAGE_ID, channelId: CHANNEL_ID},
        ...overrides
    };
}

class FakeAdapter implements DoubleClickReplyAdapter {
    public valid = true;
    public installs = 0;
    public disposals = 0;
    public replies: DoubleClickReplyTarget[] = [];
    public listener: ((event: unknown) => void) | undefined;

    public validate(): boolean {
        return this.valid;
    }

    public installDoubleClickListener(listener: (event: unknown) => void): () => void {
        this.installs++;
        this.listener = listener;
        return () => {
            this.disposals++;
            if (this.listener === listener) this.listener = undefined;
        };
    }

    public inspect(event: unknown): DoubleClickReplyContext | null {
        return event as DoubleClickReplyContext;
    }

    public requestReply(target: DoubleClickReplyTarget): void {
        this.replies.push(target);
    }
}

describe("double-click reply domain policy", () => {
    test("distinguishes a double primary-button click from single and alternate clicks", () => {
        expect(decideDoubleClickReply(context({eventType: "click", detail: 1}))).toEqual({action: "ignore", reason: "not-double-primary-click"});
        expect(decideDoubleClickReply(context({button: 2}))).toEqual({action: "ignore", reason: "not-double-primary-click"});
        expect(decideDoubleClickReply(context({detail: 3}))).toEqual({action: "ignore", reason: "not-double-primary-click"});
        expect(decideDoubleClickReply(context())).toEqual({
            action: "reply",
            target: {messageId: MESSAGE_ID, channelId: CHANNEL_ID}
        });
    });

    test("ignores links, buttons, forms, code blocks, editable controls, and Solcord-owned UI", () => {
        const blocked = [
            {tagName: "a"},
            {tagName: "BUTTON"},
            {tagName: "form"},
            {tagName: "code"},
            {tagName: "pre"},
            {tagName: "textarea"},
            {tagName: "div", role: "link"},
            {tagName: "div", contentEditable: "true"},
            {tagName: "div", solcordOwned: true}
        ];

        for (const node of blocked) {
            expect(decideDoubleClickReply(context({ancestors: [{tagName: "div"}, node]}))).toEqual({action: "ignore", reason: "blocked-target"});
        }
    });

    test("ignores text selection, modifiers, and non-message surfaces", () => {
        expect(decideDoubleClickReply(context({hasSelection: true}))).toEqual({action: "ignore", reason: "text-selected"});
        expect(decideDoubleClickReply(context({shiftKey: true}))).toEqual({action: "ignore", reason: "modified-click"});
        expect(decideDoubleClickReply(context({message: null}))).toEqual({action: "ignore", reason: "not-message"});
    });

    test("fails closed for malformed or structurally invalid message identities", () => {
        expect(decideDoubleClickReply(null)).toEqual({action: "ignore", reason: "malformed-context"});
        expect(decideDoubleClickReply(context({message: {messageId: "not-an-id", channelId: CHANNEL_ID}}))).toEqual({action: "ignore", reason: "invalid-message-identity"});
        expect(decideDoubleClickReply(context({message: {messageId: MESSAGE_ID, channelId: "0"}}))).toEqual({action: "ignore", reason: "invalid-message-identity"});
    });
});

describe("double-click reply lifecycle", () => {
    test("installs one listener and only requests reply state on a valid double click", () => {
        const adapter = new FakeAdapter();
        const feature = new DoubleClickReplyFeature(adapter);

        expect(feature.start()).toBeTrue();
        adapter.listener?.(context({eventType: "click", detail: 1}));
        adapter.listener?.(context());

        expect(adapter.installs).toBe(1);
        expect(adapter.replies).toEqual([{messageId: MESSAGE_ID, channelId: CHANNEL_ID}]);
    });

    test("duplicate start is idempotent and stop reverses the listener", () => {
        const adapter = new FakeAdapter();
        const feature = new DoubleClickReplyFeature(adapter);

        expect(feature.start()).toBeTrue();
        const installedListener = adapter.listener!;
        expect(feature.start()).toBeTrue();
        expect(adapter.installs).toBe(1);

        feature.stop();
        expect(feature.running).toBeFalse();
        expect(adapter.disposals).toBe(1);
        expect(adapter.listener).toBeUndefined();

        installedListener(context());
        expect(adapter.replies).toEqual([]);
    });

    test("fails closed before installation when adapter validation fails", () => {
        const adapter = new FakeAdapter();
        adapter.valid = false;
        const feature = new DoubleClickReplyFeature(adapter);

        expect(feature.start()).toBeFalse();
        expect(feature.running).toBeFalse();
        expect(adapter.installs).toBe(0);
        expect(adapter.replies).toEqual([]);
    });

    test("fails closed when inspection drifts or throws", () => {
        const adapter = new FakeAdapter();
        adapter.inspect = () => {throw new Error("drift");};
        const feature = new DoubleClickReplyFeature(adapter);

        expect(feature.start()).toBeTrue();
        expect(() => adapter.listener?.(context())).not.toThrow();
        expect(adapter.replies).toEqual([]);
    });
});
