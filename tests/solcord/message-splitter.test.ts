import {describe, expect, test} from "bun:test";

import {splitLargeMessage} from "../../src/betterdiscord/modules/solcord/message-splitter";


function containsUnpairedSurrogate(value: string): boolean {
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        if (code >= 0xD800 && code <= 0xDBFF) {
            const next = value.charCodeAt(++index);
            if (!(next >= 0xDC00 && next <= 0xDFFF)) return true;
        }
        else if (code >= 0xDC00 && code <= 0xDFFF) {
            return true;
        }
    }
    return false;
}

describe("guarded large-message splitter", () => {
    test("returns an empty deterministic preview for blank or malformed input", () => {
        expect(splitLargeMessage("   \r\n\t ")).toEqual({parts: [], limit: 2_000, delayMs: 1_200, totalDelayMs: 0});
        expect(splitLargeMessage(undefined as unknown as string, Number.NaN, Number.NaN)).toEqual({parts: [], limit: 2_000, delayMs: 1_200, totalDelayMs: 0});
    });

    test("clamps part size and delay and reports the exact ordered delay", () => {
        const low = splitLargeMessage("a".repeat(2_500), 10, 1);
        const high = splitLargeMessage("b".repeat(4_500), 99_999, 99_999);

        expect(low.limit).toBe(1_000);
        expect(low.delayMs).toBe(500);
        expect(low.parts.every(part => part.length <= low.limit)).toBeTrue();
        expect(low.totalDelayMs).toBe((low.parts.length - 1) * low.delayMs);
        expect(high.limit).toBe(4_000);
        expect(high.delayMs).toBe(5_000);
        expect(high.parts.every(part => part.length <= high.limit)).toBeTrue();
    });

    test("prefers newline and word boundaries without reordering content", () => {
        const paragraph = `${"a".repeat(600)}\n${"b".repeat(600)}`;
        const preview = splitLargeMessage(paragraph, 1_000, 1_000);
        expect(preview.parts).toHaveLength(2);
        expect(preview.parts[0]).toBe("a".repeat(600));
        expect(preview.parts[1]).toBe("b".repeat(600));

        const words = Array.from({length: 500}, (_, index) => `word${index}`).join(" ");
        const wordPreview = splitLargeMessage(words, 1_000, 1_000);
        expect(wordPreview.parts.join(" ")).toBe(words);
    });

    test("normalizes Windows line endings and tabs before previewing", () => {
        const preview = splitLargeMessage("one\r\ntwo\tthree", 2_000, 1_200);
        expect(preview.parts).toEqual(["one\ntwo    three"]);
    });

    test("closes and reopens fenced code blocks while keeping every part bounded", () => {
        const source = `\`\`\`typescript\n${"const answer = 42;\n".repeat(120)}\`\`\``;
        const preview = splitLargeMessage(source, 1_000, 1_200);

        expect(preview.parts.length).toBeGreaterThan(2);
        expect(preview.parts.every(part => part.length <= preview.limit)).toBeTrue();
        for (const part of preview.parts) expect((part.match(/```/g) ?? [])).toHaveLength(2);
        expect(preview.parts[0].startsWith("```typescript\n")).toBeTrue();
        expect(preview.parts.at(-1)?.endsWith("```")).toBeTrue();
    });

    test("never splits a Unicode surrogate pair at a hard boundary", () => {
        const preview = splitLargeMessage(`${"a".repeat(995)}😀${"b".repeat(200)}`, 1_000, 1_200);
        expect(preview.parts).toHaveLength(2);
        expect(preview.parts.some(containsUnpairedSurrogate)).toBeFalse();
        expect(preview.parts[1].startsWith("😀")).toBeTrue();
    });
});
