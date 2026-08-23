import {describe, expect, test} from "bun:test";

import {SOULCORD_RUNTIME_ADDONS, SOULCORD_RUNTIME_DEPENDENCIES, SOULCORD_RUNTIME_THEMES} from "../../src/common/soulcord/addon-catalog.generated";
import {checkReviewedExecution, integrityBlocksExecution, integrityFailureReason, integrityRequiresQuarantine, normalizeIntegrityAudit, reviewBlocksEnable, summarizeIntegrity, unavailableIntegrityRecords} from "../../src/betterdiscord/modules/soulcord/integrity";


function expectedCount(): number {
    return SOULCORD_RUNTIME_ADDONS.length + SOULCORD_RUNTIME_DEPENDENCIES.length + SOULCORD_RUNTIME_THEMES.length;
}

describe("SoulCord curated addon integrity consumer", () => {
    test("checks reviewed bytes synchronously while leaving unrelated owner files alone", () => {
        const theme = SOULCORD_RUNTIME_THEMES[0];
        expect(checkReviewedExecution("theme", theme.fileName, "SoulCord — Obsidian Thread", theme.content)).toMatchObject({reviewed: true, matches: true, name: theme.name});
        expect(checkReviewedExecution("theme", theme.fileName, "SoulCord — Obsidian Thread", `${theme.content}\n/* changed */`)).toMatchObject({reviewed: true, matches: false, name: theme.name});
        expect(checkReviewedExecution("plugin", SOULCORD_RUNTIME_ADDONS[0].fileName, SOULCORD_RUNTIME_ADDONS[0].name, "changed plugin bytes")).toMatchObject({reviewed: true, matches: false});
        expect(checkReviewedExecution("plugin", "OwnerOnly.plugin.js", "Owner Only", "owner content")).toEqual({reviewed: false, matches: true});
    });

    test("fails closed for renamed, case-aliased, and metadata-aliased reviewed identities", () => {
        const addon = SOULCORD_RUNTIME_ADDONS[0];
        const dependency = SOULCORD_RUNTIME_DEPENDENCIES[0];
        const theme = SOULCORD_RUNTIME_THEMES[0];
        const renamed = addon.fileName.replace(".plugin.js", "-owner-copy.plugin.js");
        const caseAlias = `${addon.fileName[0].toLocaleLowerCase("en-US")}${addon.fileName.slice(1)}`;

        expect(checkReviewedExecution("plugin", renamed, addon.name, "tampered")).toMatchObject({reviewed: true, matches: false, name: addon.name});
        expect(checkReviewedExecution("plugin", caseAlias, "Unrelated display name", "tampered")).toMatchObject({reviewed: true, matches: false, name: addon.name});
        expect(checkReviewedExecution("plugin", "RenamedDependency.plugin.js", dependency.name, "tampered")).toMatchObject({reviewed: true, matches: false, name: dependency.name});
        expect(checkReviewedExecution("theme", "OwnerTheme.theme.css", "SoulCord — Obsidian Thread", theme.content)).toMatchObject({reviewed: true, matches: false, name: theme.name});
        expect(checkReviewedExecution("theme", "ByteIdenticalCopy.theme.css", "Unrelated display name", theme.content)).toMatchObject({reviewed: true, matches: false, name: theme.name});
        expect(checkReviewedExecution("plugin", "OwnerOnly.plugin.js", "Owner Only", "owner content")).toEqual({reviewed: false, matches: true});
    });

    test("places the exact-byte guard before plugin evaluation and theme injection", async () => {
        const pluginManager = await Bun.file(new URL("../../src/betterdiscord/modules/pluginmanager.ts", import.meta.url)).text();
        const themeManager = await Bun.file(new URL("../../src/betterdiscord/modules/thememanager.ts", import.meta.url)).text();
        expect(pluginManager.indexOf("checkReviewedExecution")).toBeLessThan(pluginManager.indexOf("new Function"));
        expect(themeManager.indexOf("checkReviewedExecution")).toBeLessThan(themeManager.indexOf("DOMManager.injectTheme"));
    });

    test("blocks unaccepted candidates while preserving the guarded built-in exception", () => {
        expect(reviewBlocksEnable({installable: false})).toBeTrue();
        expect(reviewBlocksEnable({installable: true})).toBeFalse();
        expect(reviewBlocksEnable({installable: false}, true)).toBeFalse();
        expect(reviewBlocksEnable(undefined)).toBeTrue();
    });

    test("fails every expected record closed when the audit is absent or oversized", () => {
        const unavailable = normalizeIntegrityAudit(undefined);
        expect(unavailable).toHaveLength(expectedCount());
        expect(unavailable.every(record => record.status === "unavailable")).toBeTrue();
        expect(unavailable.every(record => integrityRequiresQuarantine(record))).toBeTrue();
        expect(normalizeIntegrityAudit(Array.from({length: 65}, () => ({}))).every(record => integrityBlocksExecution(record))).toBeTrue();
    });

    test("accepts only manifest-bound names and reviewed hashes", () => {
        const addon = SOULCORD_RUNTIME_ADDONS[0];
        const records = normalizeIntegrityAudit([
            {kind: "addon", name: addon.name, status: "match", reviewedSha256: addon.sourceSha256, installedSha256: addon.sourceSha256},
            {kind: "addon", name: "UnknownAddon", status: "match", reviewedSha256: "a".repeat(64), installedSha256: "a".repeat(64)},
            {kind: "theme", name: SOULCORD_RUNTIME_THEMES[0].name, status: "match", reviewedSha256: "b".repeat(64), installedSha256: "b".repeat(64)}
        ]);
        expect(records.find(record => record.kind === "addon" && record.name === addon.name)?.status).toBe("match");
        expect(records.find(record => record.kind === "theme" && record.name === SOULCORD_RUNTIME_THEMES[0].name)?.status).toBe("unavailable");
        expect(records.some(record => record.name === "UnknownAddon")).toBeFalse();
    });

    test("does not classify missing files as tampering", () => {
        const addon = SOULCORD_RUNTIME_ADDONS[0];
        const record = normalizeIntegrityAudit([{kind: "addon", name: addon.name, status: "missing", reviewedSha256: addon.sourceSha256}])
            .find(item => item.kind === "addon" && item.name === addon.name)!;
        expect(record.status).toBe("missing");
        expect(integrityBlocksExecution(record)).toBeTrue();
        expect(integrityRequiresQuarantine(record)).toBeFalse();
        expect(integrityFailureReason(record)).toBeUndefined();
    });

    test("keeps mismatch, unsafe, unreadable, and incomplete audit results blocking and path-free", () => {
        const addons = SOULCORD_RUNTIME_ADDONS.slice(0, 3);
        const dependency = SOULCORD_RUNTIME_DEPENDENCIES[0];
        const raw = [
            {kind: "addon", name: addons[0].name, status: "mismatch", reviewedSha256: addons[0].sourceSha256, installedSha256: "f".repeat(64)},
            {kind: "addon", name: addons[1].name, status: "unsafe", reviewedSha256: addons[1].sourceSha256},
            {kind: "addon", name: addons[2].name, status: "unreadable", reviewedSha256: addons[2].sourceSha256},
            {kind: "dependency", name: dependency.name, status: "match", reviewedSha256: dependency.sourceSha256, installedSha256: dependency.sourceSha256}
        ];
        const records = normalizeIntegrityAudit(raw);
        for (const addon of addons) {
            const record = records.find(item => item.kind === "addon" && item.name === addon.name)!;
            expect(integrityBlocksExecution(record)).toBeTrue();
            expect(integrityRequiresQuarantine(record)).toBeTrue();
            expect(integrityFailureReason(record)).not.toContain("\\");
            expect(integrityFailureReason(record)).not.toContain("/");
        }
        expect(records.find(item => item.kind === "dependency" && item.name === dependency.name)?.status).toBe("match");
    });

    test("summarizes bounded statuses without carrying caller fields", () => {
        const baseline = unavailableIntegrityRecords();
        const records = baseline.map((record, index) => ({...record, status: index === 0 ? "missing" as const : index === 1 ? "match" as const : record.status}));
        const summary = summarizeIntegrity(records);
        expect(summary).toEqual({total: expectedCount(), match: 1, missing: 1, attention: 0, unavailable: expectedCount() - 2});
        expect(Object.keys(records[0]).sort()).toEqual(["kind", "name", "reviewedSha256", "status"]);
    });
});
