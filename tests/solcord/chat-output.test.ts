import {describe, expect, test} from "bun:test";

import {
    presentSolcordChannelGlance,
    presentSolcordLoadedText,
    SOLCORD_CHANNEL_GLANCE_EXCERPT_LIMIT,
    SOLCORD_CHANNEL_GLANCE_VISIBLE_LIMIT
} from "../../src/common/solcord/chat-output";

describe("Solcord chat evidence presentation", () => {
    test("renders Discord markup as bounded readable text without raw IDs or URLs", () => {
        const snowflake = "123456789012345678";
        const output = presentSolcordLoadedText([
            `<@${snowflake}> asked <#${snowflake}> to ping <@&${snowflake}>`,
            `<:wave:${snowflake}> <a:dance:${snowflake}>`,
            `[named link](https://example.com/private/path?token=secret)`,
            `https://discord.com/channels/${snowflake}/${snowflake}`,
            "docs.example.test/private/path",
            "x".repeat(SOLCORD_CHANNEL_GLANCE_EXCERPT_LIMIT * 2)
        ].join(" "));

        expect(output).toContain("@member");
        expect(output).toContain("#channel");
        expect(output).toContain("@role");
        expect(output).toContain(":wave:");
        expect(output).toContain("named link [link]");
        expect(output).not.toContain(snowflake);
        expect(output).not.toMatch(/https?:\/\/|www\./i);
        expect(Array.from(output).length).toBeLessThanOrEqual(SOLCORD_CHANNEL_GLANCE_EXCERPT_LIMIT);
        expect(output.endsWith("…")).toBeTrue();
    });

    test("keeps only short rows and never carries message IDs into rendered evidence", () => {
        const messages = Array.from({length: SOLCORD_CHANNEL_GLANCE_VISIBLE_LIMIT + 3}, (_, index) => ({
            id: `98765432109876543${index}`,
            authorLabel: index === 0 ? "123456789012345678" : `Person ${index}`,
            text: index === 1 ? "Visit discord.gg/private-code" : `Loaded message ${index}`,
            timestamp: 1_000 + index
        }));
        const presentation = presentSolcordChannelGlance(messages);

        expect(presentation.totalCount).toBe(8);
        expect(presentation.rows).toHaveLength(SOLCORD_CHANNEL_GLANCE_VISIBLE_LIMIT);
        expect(presentation.hiddenCount).toBe(3);
        expect(presentation.rows[0]?.author).toBe("Loaded participant");
        expect(presentation.rows[1]?.excerpt).toBe("Visit [link]");
        for (const message of messages) expect(JSON.stringify(presentation)).not.toContain(message.id);
        expect(Object.isFrozen(presentation)).toBeTrue();
        expect(Object.isFrozen(presentation.rows)).toBeTrue();
    });
});
