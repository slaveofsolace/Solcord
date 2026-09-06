// SPDX-License-Identifier: Apache-2.0

import {afterEach, beforeEach, describe, expect, test} from "bun:test";
import React, {act, useState} from "react";
import {createRoot, type Root} from "react-dom/client";
import AccessibilityOptions, {readingWidthAtStep, readingWidthStep} from "../../src/betterdiscord/ui/solcord/accessibility-options";

let root: Root;
let host: HTMLDivElement;
const environment = globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean;};
let previousActEnvironment: boolean | undefined;

beforeEach(() => {
    previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

function setRange(input: HTMLInputElement, value: number) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(value));
    input.dispatchEvent(new Event("input", {bubbles: true}));
    input.dispatchEvent(new KeyboardEvent("keyup", {key: "ArrowRight", bubbles: true}));
}

describe("accessibility choices", () => {
    test("every selectable reading width is default or an effective renderer width", () => {
        expect(readingWidthAtStep(0)).toBe(0);
        expect(readingWidthAtStep(1)).toBe(480);
        expect(readingWidthAtStep(19)).toBe(1200);
        for (let step = 0; step <= 19; step++) {
            const width = readingWidthAtStep(step);
            expect(width === 0 || (width >= 480 && width <= 1200)).toBeTrue();
            expect(readingWidthStep(width)).toBe(step);
        }
    });

    test("legacy ineffective widths remain default without rewriting saved data", async () => {
        let writes = 0;
        for (const width of [0, 40, 440, -1, NaN, Infinity]) expect(readingWidthStep(width)).toBe(0);
        expect(readingWidthStep(1800)).toBe(19);
        expect(readingWidthAtStep(-8)).toBe(0);
        expect(readingWidthAtStep(Infinity)).toBe(0);
        expect(readingWidthAtStep(100)).toBe(1200);
        const values = {readingWidth: 440, reducedMotion: true, roleContrast: true};
        await act(async () => root.render(<AccessibilityOptions enabled values={values} onEnabledChange={() => writes++} onValueChange={() => writes++} />));
        expect(host.querySelector("output")!.textContent).toBe("Discord default");
        expect(values.readingWidth).toBe(440);
        expect(writes).toBe(0);
    });

    test("the module gate disables saved choices and does not pretend they are active", async () => {
        let writes = 0;
        const enabledChanges: boolean[] = [];
        await act(async () => root.render(<AccessibilityOptions enabled={false} values={{roleContrast: true, readingWidth: 720}}
            onEnabledChange={next => {enabledChanges.push(next);}} onValueChange={() => writes++} />));
        const master = host.querySelector<HTMLInputElement>("input[aria-label=\"Use accessibility aids\"]")!;
        expect(master.disabled).toBeFalse();
        expect(master.checked).toBeFalse();
        expect(host.textContent).toContain("Off. Your saved choices below will apply when enabled.");
        const children = [...host.querySelectorAll<HTMLInputElement>("input")].filter(input => input !== master);
        expect(children).toHaveLength(4);
        expect(children.every(input => input.disabled)).toBeTrue();
        expect(host.querySelector<HTMLInputElement>("input[aria-label=\"Role contrast aid\"]")!.checked).toBeTrue();
        await act(async () => {for (const input of children) input.click(); setRange(host.querySelector("input[type=\"range\"]")!, 1);});
        expect(writes).toBe(0);
        await act(async () => master.click());
        expect(enabledChanges).toEqual([true]);
    });

    test("one adjustment leaves default for 480 px, saves pixels, and can return to default", async () => {
        const writes: Array<[string, boolean | number]> = [];
        function Example() {
            const [values, setValues] = useState<Record<string, unknown>>({readingWidth: 0});
            return <AccessibilityOptions enabled values={values} onEnabledChange={() => {}} onValueChange={(key, value) => {
                writes.push([key, value]); setValues(previous => ({...previous, [key]: value}));
            }} />;
        }
        await act(async () => root.render(<Example />));
        const range = host.querySelector<HTMLInputElement>("input[type=\"range\"]")!;
        for (const [step, pixels] of [[1, 480], [2, 520], [19, 1200], [0, 0]]) {
            await act(async () => setRange(range, step));
            expect(writes.at(-1)).toEqual(["readingWidth", pixels]);
            expect(range.getAttribute("aria-valuetext")).toBe(pixels ? `${pixels} px` : "Discord default");
            expect(range.disabled).toBeFalse();
        }
        expect(writes).toHaveLength(4);
    });

    test("enabling and disabling retains the saved choices across remount", async () => {
        const values = {readingWidth: 800, reducedMotion: false, roleContrast: true, readingRuler: true};
        function Example() {
            const [enabled, setEnabled] = useState(false);
            return <AccessibilityOptions enabled={enabled} values={values} onEnabledChange={setEnabled} onValueChange={() => {}} />;
        }
        await act(async () => root.render(<Example />));
        const master = () => host.querySelector<HTMLInputElement>("input[aria-label=\"Use accessibility aids\"]")!;
        await act(async () => master().click());
        expect(host.querySelector<HTMLInputElement>("input[aria-label=\"Reading ruler\"]")!.disabled).toBeFalse();
        expect(host.querySelector("output")!.textContent).toBe("800 px");
        await act(async () => master().click());
        expect(host.querySelector<HTMLInputElement>("input[aria-label=\"Reading ruler\"]")!.disabled).toBeTrue();
        expect(values).toEqual({readingWidth: 800, reducedMotion: false, roleContrast: true, readingRuler: true});
        await act(async () => root.render(<AccessibilityOptions enabled values={values} onEnabledChange={() => {}} onValueChange={() => {}} />));
        expect(host.querySelector("output")!.textContent).toBe("800 px");
    });
});
