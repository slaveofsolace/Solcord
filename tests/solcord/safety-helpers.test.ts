// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";

import {inspectSolcordAttachment} from "../../src/common/solcord/attachment-guard";
import {inspectSolcordDomain, SolcordDomainMemory} from "../../src/common/solcord/domain-memory";

describe("Solcord shared safety helpers", () => {
    test("never remembers an allow decision for punycode, credentials, IP literals, or lookalikes", () => {
        const memory = new SolcordDomainMemory();
        for (const url of ["https://xn--dscord-bza.example", "https://user:pass@example.com", "https://127.0.0.1/file", "https://disc0rd.example", "https://discord.co", "https://discord.evil.example", "https://login.discord.co", "http://example.com"]) {
            expect(inspectSolcordDomain(url).restricted).toBe(true);
            expect(memory.remember(url, "allow", 86_400_000, 100)).toBeUndefined();
            expect(memory.remember(url, "warn", 86_400_000, 100)?.decision).toBe("warn");
        }
    });

    test("expires exact-host decisions and keeps subdomains independent", () => {
        const memory = new SolcordDomainMemory();
        memory.remember("https://example.com/a", "allow", 3_600_000, 10);
        expect(memory.decision("https://example.com/b", 20)?.decision).toBe("allow");
        expect(memory.decision("https://sub.example.com/b", 20)).toBeUndefined();
        expect(memory.decision("http://example.com/b", 20)).toBeUndefined();
        expect(memory.decision("https://example.com/b", 3_600_011)).toBeUndefined();
    });

    test("accepts canonical protected domains but not protected labels under another registrable host", () => {
        expect(inspectSolcordDomain("https://discord.com/channels/@me").restricted).toBeFalse();
        expect(inspectSolcordDomain("https://support.github.com/").restricted).toBeFalse();
        expect(inspectSolcordDomain("https://discord.com.evil.example/").restricted).toBeTrue();
    });

    test("blocks executable links and reviews archives or MIME mismatches without opening them", () => {
        expect(inspectSolcordAttachment("https://cdn.discordapp.com/a/photo.png.exe", "application/octet-stream")).toMatchObject({valid: true, risk: "block", extension: "exe"});
        expect(inspectSolcordAttachment("https://example.com/archive.zip")).toMatchObject({valid: true, risk: "review", extension: "zip"});
        expect(inspectSolcordAttachment("https://example.com/photo.png", "application/x-msdownload")).toMatchObject({valid: true, risk: "review", extension: "png"});
        expect(inspectSolcordAttachment("https://example.com/file.unknown")).toMatchObject({valid: true, risk: "review", extension: "unknown"});
        expect(inspectSolcordAttachment("https://example.com/file.exe%20")).toMatchObject({valid: true, risk: "block", extension: "exe"});
        expect(inspectSolcordAttachment("http://example.com/file.pdf")).toMatchObject({valid: false, risk: "block"});
    });
});
