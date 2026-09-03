// SPDX-License-Identifier: Apache-2.0

import {afterEach, beforeEach, describe, expect, test} from "bun:test";
import React, {act, useState} from "react";
import {createRoot, type Root} from "react-dom/client";

import SolcordSwitch from "../../src/betterdiscord/ui/solcord/switch";
import SolcordSlider, {normalizeSolcordSliderValue} from "../../src/betterdiscord/ui/solcord/slider";
import ActionButton from "../../src/betterdiscord/ui/solcord/action-button";
import SolcordTextField from "../../src/betterdiscord/ui/solcord/text-field";
import {SolcordActionErrorContext, useSolcordResultScope} from "../../src/betterdiscord/ui/solcord/use-action";
import {isSolcordTranslationLanguage, normalizeSolcordTranslationEndpoint} from "../../src/common/solcord/product";

const mounted: Array<{root: Root; host: HTMLElement;}> = [];
const actEnvironment = globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean;};
let originalActEnvironment: boolean | undefined;

beforeEach(() => {originalActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT; actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;});
afterEach(async () => {
    for (const {root, host} of mounted.splice(0)) {await act(async () => root.unmount()); host.remove();}
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
});

async function render(element: React.ReactNode) {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({root, host});
    await act(async () => root.render(element));
    return {host, root};
}

function setRange(input: HTMLInputElement, value: number) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(value));
    input.dispatchEvent(new Event("input", {bubbles: true}));
}

function typeValue(input: HTMLInputElement, value: string) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", {bubbles: true}));
}

describe("rendered Solcord controls", () => {
    test("unchanged text fields do not invalidate existing credential or result state on mount, blur, or Enter", async () => {
        let credential = "fixture credential";
        let result = "fixture result";
        let writes = 0;
        const {host} = await render(<SolcordTextField label="HTTPS endpoint" value="https://translate.example/translate"
            normalize={raw => raw} onCommit={() => {writes++;}} onDraftChange={() => {credential = ""; result = "";}} />);
        const input = host.querySelector("input")!;
        expect(credential).toBe("fixture credential");
        expect(result).toBe("fixture result");
        await act(async () => {
            input.dispatchEvent(new FocusEvent("focusin", {bubbles: true}));
            input.dispatchEvent(new FocusEvent("focusout", {bubbles: true}));
            input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}));
            input.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
        });
        expect(credential).toBe("fixture credential");
        expect(result).toBe("fixture result");
        expect(writes).toBe(0);
        await act(async () => typeValue(input, "https://other.example/translate"));
        expect(credential).toBe("");
        expect(result).toBe("");
        expect(writes).toBe(0);
    });

    test("URL fields keep intermediate typing local and save the complete address once", async () => {
        const writes: string[] = [];
        const drafts: boolean[] = [];
        function Example() {
            const [value, setValue] = useState("");
            return <SolcordTextField label="HTTPS endpoint" value={value} normalize={raw => {
                const endpoint = normalizeSolcordTranslationEndpoint(raw);
                if (!endpoint) throw new Error("Use a complete HTTPS address.");
                return endpoint;
            }} onCommit={next => {writes.push(next); setValue(next);}} onDraftChange={dirty => drafts.push(dirty)} />;
        }
        const {host} = await render(<Example />);
        const input = host.querySelector("input")!;
        const value = "https://translate.example/translate";
        for (let i = 1; i <= value.length; i++) {
            await act(async () => typeValue(input, value.slice(0, i)));
            expect(input.value).toBe(value.slice(0, i));
            expect(writes).toHaveLength(0);
        }
        await act(async () => {
            input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}));
            input.dispatchEvent(new FocusEvent("focusout", {bubbles: true}));
        });
        expect(writes).toEqual([value]);
        expect(input.value).toBe(value);
        expect(drafts.at(-1)).toBeFalse();
        expect(input.disabled).toBeFalse();
    });

    test("replacing a dirty field releases its parent action hold", async () => {
        let writes = 0;
        function Example({endpoint}: {endpoint: string;}) {
            const [dirty, setDirty] = useState(false);
            return <><SolcordTextField key={endpoint} label="To" value="EN" normalize={raw => {
                if (!isSolcordTranslationLanguage(raw)) throw new Error("Use a language code.");
                return raw;
            }} onCommit={() => {writes++;}} onDraftChange={setDirty} /><button disabled={dirty}>Translate</button></>;
        }
        const {host, root} = await render(<Example endpoint="https://one.example/translate" />);
        const input = host.querySelector("input")!;
        await act(async () => {typeValue(input, "p"); input.dispatchEvent(new FocusEvent("focusout", {bubbles: true}));});
        expect(host.querySelector("button")!.disabled).toBeTrue();
        expect(host.querySelector("[role=alert]")).not.toBeNull();
        await act(async () => root.render(<Example endpoint="https://two.example/translate" />));
        expect(host.querySelector("input")!.value).toBe("EN");
        expect(host.querySelector("button")!.disabled).toBeFalse();
        expect(host.querySelector("[role=alert]")).toBeNull();
        expect(writes).toBe(0);
    });

    test("language edits do not fall back mid-word, and invalid input stays visible until corrected or cancelled", async () => {
        const writes: string[] = [];
        const {host} = await render(<SolcordTextField label="To" value="EN" normalize={raw => {
            if (!isSolcordTranslationLanguage(raw)) throw new Error("Use a language code.");
            return raw;
        }} onCommit={next => writes.push(next)} />);
        const input = host.querySelector("input")!;
        await act(async () => typeValue(input, "p"));
        expect(input.value).toBe("p");
        await act(async () => input.dispatchEvent(new FocusEvent("focusout", {bubbles: true})));
        expect(input.value).toBe("p");
        expect(input.getAttribute("aria-invalid")).toBe("true");
        expect(host.querySelector("[role=alert]")?.textContent).toBe("Use a language code.");
        expect(writes).toHaveLength(0);
        await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true})));
        expect(input.value).toBe("EN");
        expect(input.hasAttribute("aria-invalid")).toBeFalse();
        await act(async () => {typeValue(input, "pt-BR"); input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}));});
        expect(writes).toEqual(["pt-BR"]);
    });

    test("failed text saves retain the user's edit and disabled fields never commit", async () => {
        let writes = 0;
        let reject!: (error: Error) => void;
        const {host, root} = await render(<SolcordTextField label="From" value="auto" normalize={raw => raw} onCommit={() => {writes++; return new Promise<void>((_resolve, fail) => {reject = fail;});}} />);
        const input = host.querySelector("input")!;
        await act(async () => {typeValue(input, "en"); input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}));});
        expect(input.disabled).toBeTrue();
        await act(async () => input.dispatchEvent(new FocusEvent("focusout", {bubbles: true})));
        expect(writes).toBe(1);
        await act(async () => reject(new Error("Fixture disk failure")));
        expect(input.value).toBe("en");
        expect(input.disabled).toBeFalse();
        expect(input.getAttribute("aria-invalid")).toBe("true");
        await act(async () => root.render(<SolcordTextField label="From" value="fr" disabled normalize={raw => raw} onCommit={() => writes++} />));
        expect(input.value).toBe("fr");
        await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true})));
        expect(writes).toBe(1);
    });

    test("private async results cannot cross account/provider changes, edits, newer requests, or unmount", async () => {
        let scope!: ReturnType<typeof useSolcordResultScope>;
        function Example({context}: {context: string;}) {scope = useSolcordResultScope(context); return <div />;}
        const {root} = await render(<Example context="account-a:provider-a" />);
        const first = scope.begin();
        expect(first()).toBeTrue();
        const second = scope.begin();
        expect(first()).toBeFalse();
        expect(second()).toBeTrue();
        scope.invalidate();
        expect(second()).toBeFalse();
        const beforeSwitch = scope.begin();
        await act(async () => root.render(<Example context="account-b:provider-b" />));
        expect(beforeSwitch()).toBeFalse();
        await act(async () => root.render(<Example context="account-a:provider-a" />));
        expect(beforeSwitch()).toBeFalse();
        const beforeUnmount = scope.begin();
        await act(async () => root.render(null));
        expect(beforeUnmount()).toBeFalse();
        expect(scope.begin()()).toBeFalse();
    });

    test("a live account change rejects stale credential actions before React receives its next snapshot", async () => {
        let liveGeneration = 1;
        let scope!: ReturnType<typeof useSolcordResultScope>;
        let finish!: () => void;
        let writes = 0;
        function Example({generation}: {generation: number;}) {
            const [credential] = useState(`account-${generation}-fixture`);
            const [result, setResult] = useState("");
            scope = useSolcordResultScope(String(generation), () => generation === liveGeneration);
            return <><output>{credential}:{result}</output><ActionButton onClick={async () => {
                const isCurrent = scope.begin();
                if (!isCurrent()) return;
                writes++;
                await new Promise<void>(resolve => {finish = resolve;});
                if (isCurrent()) setResult("saved");
            }}>Save</ActionButton></>;
        }
        const {host, root} = await render(<Example key={1} generation={1} />);
        await act(async () => host.querySelector("button")!.click());
        expect(writes).toBe(1);
        liveGeneration = 2;
        expect(scope.begin()()).toBeFalse();
        await act(async () => finish());
        expect(host.querySelector("output")!.textContent).toBe("account-1-fixture:");
        await act(async () => host.querySelector("button")!.click());
        expect(writes).toBe(1);
        await act(async () => root.render(<Example key={2} generation={2} />));
        expect(host.querySelector("output")!.textContent).toBe("account-2-fixture:");
        expect(scope.begin()()).toBeTrue();
    });

    test("action buttons guard repeated clicks and report failures through the shared feedback surface", async () => {
        let writes = 0;
        let fail!: (error: Error) => void;
        const errors: unknown[] = [];
        const {host} = await render(<SolcordActionErrorContext.Provider value={error => errors.push(error)}><ActionButton onClick={() => {writes++; return new Promise<void>((_resolve, reject) => {fail = reject;});}}>Save</ActionButton></SolcordActionErrorContext.Provider>);
        const button = host.querySelector("button")!;
        await act(async () => {button.click(); button.click();});
        expect(writes).toBe(1);
        expect(button.disabled).toBeTrue();
        expect(button.getAttribute("aria-busy")).toBe("true");
        await act(async () => fail(new Error("Fixture write failed")));
        expect(button.disabled).toBeFalse();
        expect(errors).toHaveLength(1);
        expect(button.textContent).toBe("Save");
    });

    test("switches follow real state and keep the same explicit thumb through repeated changes", async () => {
        const changes: boolean[] = [];
        function Example() {
            const [checked, setChecked] = useState(false);
            return <SolcordSwitch label="Local feature" checked={checked} onChange={next => {changes.push(next); setChecked(next);}} />;
        }
        const {host} = await render(<Example />);
        const input = host.querySelector("input")!;
        const thumb = host.querySelector(".solcord-switch-thumb")!;
        for (let i = 0; i < 12; i++) {
            await act(async () => input.click());
            expect(input.checked).toBe(i % 2 === 0);
            expect(input.getAttribute("aria-checked")).toBe(String(input.checked));
            expect(host.querySelector(".solcord-switch-thumb") === thumb).toBeTrue();
            expect(input.disabled).toBeFalse();
        }
        input.focus();
        expect(document.activeElement === input).toBeTrue();
        expect(changes).toHaveLength(12);
    });

    test("switches reject duplicate clicks during a write and recover from failure", async () => {
        let reject!: (error: Error) => void;
        const errors: unknown[] = [];
        let writes = 0;
        const {host} = await render(<SolcordSwitch label="Private feature" checked={false} onChange={() => {writes++; return new Promise<void>((_resolve, fail) => {reject = fail;});}} onError={error => errors.push(error)} />);
        const input = host.querySelector("input")!;
        await act(async () => {input.click(); input.click();});
        expect(writes).toBe(1);
        expect(input.disabled).toBeTrue();
        expect(input.getAttribute("aria-busy")).toBe("true");
        await act(async () => reject(new Error("Disk unavailable")));
        expect(errors).toHaveLength(1);
        expect(input.disabled).toBeFalse();
        expect(input.checked).toBeFalse();
        expect(input.getAttribute("aria-checked")).toBe("false");
        expect(host.querySelector(".solcord-switch-thumb")).not.toBeNull();
    });

    test("disabled switches do no work and prop updates stay synchronized", async () => {
        let changes = 0;
        const {host, root} = await render(<SolcordSwitch label="Disabled" checked={false} disabled onChange={() => changes++} />);
        const input = host.querySelector("input")!;
        await act(async () => input.click());
        expect(changes).toBe(0);
        await act(async () => root.render(<SolcordSwitch label="Restored" checked disabled onChange={() => changes++} />));
        expect(input.checked).toBeTrue();
        expect(input.getAttribute("aria-checked")).toBe("true");
        expect(changes).toBe(0);
    });

    test("sliders commit the actual input value once, not a stale render or every pointer move", async () => {
        const commits: number[] = [];
        function Example() {
            const [value, setValue] = useState(100);
            return <SolcordSlider label="Effect speed" min={25} max={300} value={value} suffix="%" onCommit={next => {commits.push(next); setValue(next);}} />;
        }
        const {host} = await render(<Example />);
        const input = host.querySelector("input")!;
        await act(async () => {setRange(input, 140); setRange(input, 180);});
        expect(commits).toEqual([]);
        expect(host.querySelector("output")!.textContent).toBe("180%");
        await act(async () => {
            input.dispatchEvent(new Event("pointerup", {bubbles: true}));
            input.dispatchEvent(new FocusEvent("focusout", {bubbles: true}));
        });
        expect(commits).toEqual([180]);
        expect(input.value).toBe("180");
        expect(input.getAttribute("aria-valuetext")).toBe("180%");
    });

    test("slider keyboard commits, normalization, and failed saves preserve the actual setting", async () => {
        const errors: unknown[] = [];
        let writes = 0;
        const {host} = await render(<SolcordSlider label="Reading width" min={0} max={1200} step={40} value={400} onCommit={async () => {writes++; throw new Error("Save failed");}} onError={error => errors.push(error)} />);
        const input = host.querySelector("input")!;
        await act(async () => {setRange(input, 480); input.dispatchEvent(new KeyboardEvent("keyup", {key: "Tab", bubbles: true}));});
        expect(writes).toBe(0);
        await act(async () => input.dispatchEvent(new KeyboardEvent("keyup", {key: "ArrowRight", bubbles: true})));
        expect(writes).toBe(1);
        expect(errors).toHaveLength(1);
        expect(input.value).toBe("400");
        expect(host.querySelector("output")!.textContent).toBe("400");
        expect(input.disabled).toBeFalse();
        expect(normalizeSolcordSliderValue(459, 0, 1200, 40)).toBe(440);
        expect(normalizeSolcordSliderValue(Number.NaN, 25, 300)).toBe(25);
        expect(normalizeSolcordSliderValue(0.29, 0, 1, 0.1)).toBe(0.3);
    });

    test("disabled sliders cannot commit and restored values update both input and output", async () => {
        let writes = 0;
        const {host, root} = await render(<SolcordSlider label="Amount" min={1} max={24} value={6} disabled onCommit={() => writes++} />);
        const input = host.querySelector("input")!;
        await act(async () => {setRange(input, 20); input.dispatchEvent(new Event("pointerup", {bubbles: true}));});
        expect(writes).toBe(0);
        await act(async () => root.render(<SolcordSlider label="Amount" min={1} max={24} value={12} onCommit={() => writes++} />));
        expect(input.value).toBe("12");
        expect(host.querySelector("output")!.textContent).toBe("12");
        await act(async () => root.render(<SolcordSlider label="Amount" min={1} max={24} value={6} onCommit={() => writes++} />));
        expect(input.value).toBe("6");
        expect(host.querySelector("output")!.textContent).toBe("6");
    });
});
