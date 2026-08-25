// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {inspectSoulCordAttachment} from "../../src/common/soulcord/attachment-guard";
import {inspectSoulCordDomain, SoulCordDomainMemory} from "../../src/common/soulcord/domain-memory";

describe("SoulCord shared safety helpers", () => {
    test("never remembers an allow decision for punycode, credentials, IP literals, or lookalikes", () => {
        const memory = new SoulCordDomainMemory();
        for (const url of ["https://xn--dscord-bza.example", "https://user:pass@example.com", "https://127.0.0.1/file", "https://disc0rd.example", "https://discord.co", "https://discord.evil.example", "https://login.discord.co", "http://example.com"]) {
            expect(inspectSoulCordDomain(url).restricted).toBe(true);
            expect(memory.remember(url, "allow", 86_400_000, 100)).toBeUndefined();
            expect(memory.remember(url, "warn", 86_400_000, 100)?.decision).toBe("warn");
        }
    });

    test("expires exact-host decisions and keeps subdomains independent", () => {
        const memory = new SoulCordDomainMemory();
        memory.remember("https://example.com/a", "allow", 3_600_000, 10);
        expect(memory.decision("https://example.com/b", 20)?.decision).toBe("allow");
        expect(memory.decision("https://sub.example.com/b", 20)).toBeUndefined();
        expect(memory.decision("http://example.com/b", 20)).toBeUndefined();
        expect(memory.decision("https://example.com/b", 3_600_011)).toBeUndefined();
    });

    test("accepts canonical protected domains but not protected labels under another registrable host", () => {
        expect(inspectSoulCordDomain("https://discord.com/channels/@me").restricted).toBeFalse();
        expect(inspectSoulCordDomain("https://support.github.com/").restricted).toBeFalse();
        expect(inspectSoulCordDomain("https://discord.com.evil.example/").restricted).toBeTrue();
    });

    test("blocks executable links and reviews archives or MIME mismatches without opening them", () => {
        expect(inspectSoulCordAttachment("https://cdn.discordapp.com/a/photo.png.exe", "application/octet-stream")).toMatchObject({valid: true, risk: "block", extension: "exe"});
        expect(inspectSoulCordAttachment("https://example.com/archive.zip")).toMatchObject({valid: true, risk: "review", extension: "zip"});
        expect(inspectSoulCordAttachment("https://example.com/photo.png", "application/x-msdownload")).toMatchObject({valid: true, risk: "review", extension: "png"});
        expect(inspectSoulCordAttachment("https://example.com/file.unknown")).toMatchObject({valid: true, risk: "review", extension: "unknown"});
        expect(inspectSoulCordAttachment("https://example.com/file.exe%20")).toMatchObject({valid: true, risk: "block", extension: "exe"});
        expect(inspectSoulCordAttachment("http://example.com/file.pdf")).toMatchObject({valid: false, risk: "block"});
    });
});
