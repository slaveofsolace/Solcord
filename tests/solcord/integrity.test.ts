import {afterEach, describe, expect, test} from "bun:test";

import {SOLCORD_RUNTIME_ADDONS, SOLCORD_RUNTIME_DEPENDENCIES, SOLCORD_RUNTIME_THEMES} from "../../src/common/solcord/addon-catalog.generated";
import {checkReviewedExecution, configureReviewedExecutionOwnership, integrityBlocksExecution, integrityFailureReason, integrityRecordIsAccepted, integrityRequiresQuarantine, normalizeIntegrityAudit, reviewBlocksEnable, summarizeIntegrity, unavailableIntegrityRecords} from "../../src/betterdiscord/modules/solcord/integrity";


function expectedCount(): number {
    return SOLCORD_RUNTIME_ADDONS.length + SOLCORD_RUNTIME_DEPENDENCIES.length + SOLCORD_RUNTIME_THEMES.length;
}

describe("Solcord curated addon integrity consumer", () => {
    afterEach(() => configureReviewedExecutionOwnership([]));

    test("checks only explicitly accepted exact files while leaving owner files alone", () => {
        const theme = SOLCORD_RUNTIME_THEMES[0];
        const addon = SOLCORD_RUNTIME_ADDONS[0];
        expect(checkReviewedExecution("plugin", addon.fileName, addon.name, "owner-modified content")).toEqual({reviewed: false, matches: true});
        configureReviewedExecutionOwnership([
            {kind: "theme", fileName: theme.fileName, reviewedSha256: theme.sourceSha256},
            {kind: "plugin", fileName: addon.fileName, reviewedSha256: addon.sourceSha256}
        ]);
        expect(checkReviewedExecution("theme", theme.fileName, "Solcord — Obsidian Thread", theme.content)).toMatchObject({reviewed: true, matches: true, name: theme.name});
        expect(checkReviewedExecution("theme", theme.fileName, "Solcord — Obsidian Thread", `${theme.content}\n/* changed */`)).toMatchObject({reviewed: true, matches: false, name: theme.name});
        expect(checkReviewedExecution("plugin", addon.fileName, addon.name, "changed plugin bytes")).toMatchObject({reviewed: true, matches: false});
        expect(checkReviewedExecution("plugin", "OwnerOnly.plugin.js", "Owner Only", "owner content")).toEqual({reviewed: false, matches: true});
    });

    test("does not claim renamed or metadata-aliased owner files while retaining Windows case safety", () => {
        const addon = SOLCORD_RUNTIME_ADDONS[0];
        const dependency = SOLCORD_RUNTIME_DEPENDENCIES[0];
        const theme = SOLCORD_RUNTIME_THEMES[0];
        const renamed = addon.fileName.replace(".plugin.js", "-owner-copy.plugin.js");
        const caseAlias = `${addon.fileName[0].toLocaleLowerCase("en-US")}${addon.fileName.slice(1)}`;
        configureReviewedExecutionOwnership([
            {kind: "plugin", fileName: addon.fileName, reviewedSha256: addon.sourceSha256},
            {kind: "plugin", fileName: dependency.fileName, reviewedSha256: dependency.sourceSha256},
            {kind: "theme", fileName: theme.fileName, reviewedSha256: theme.sourceSha256}
        ]);

        expect(checkReviewedExecution("plugin", renamed, addon.name, "tampered")).toEqual({reviewed: false, matches: true});
        expect(checkReviewedExecution("plugin", caseAlias, "Unrelated display name", "tampered")).toMatchObject({reviewed: true, matches: false, name: addon.name});
        expect(checkReviewedExecution("plugin", "RenamedDependency.plugin.js", dependency.name, "tampered")).toEqual({reviewed: false, matches: true});
        expect(checkReviewedExecution("theme", "OwnerTheme.theme.css", "Solcord — Obsidian Thread", theme.content)).toEqual({reviewed: false, matches: true});
        expect(checkReviewedExecution("theme", "ByteIdenticalCopy.theme.css", "Unrelated display name", theme.content)).toEqual({reviewed: false, matches: true});
        expect(checkReviewedExecution("plugin", "OwnerOnly.plugin.js", "Owner Only", "owner content")).toEqual({reviewed: false, matches: true});
    });

    test("places the exact-byte guard before plugin evaluation and theme injection", async () => {
        const pluginManager = await Bun.file(new URL("../../src/betterdiscord/modules/pluginmanager.ts", import.meta.url)).text();
        const themeManager = await Bun.file(new URL("../../src/betterdiscord/modules/thememanager.ts", import.meta.url)).text();
        expect(pluginManager.indexOf("checkReviewedExecution")).toBeLessThan(pluginManager.indexOf("new Function"));
        expect(themeManager.indexOf("checkReviewedExecution")).toBeLessThan(themeManager.indexOf("DOMManager.injectTheme"));
    });

    test("scopes runtime enforcement to selected hash-bound files and the selected installed theme", () => {
        const addon = SOLCORD_RUNTIME_ADDONS[0];
        const addonRecord = {kind: "addon" as const, name: addon.name, status: "mismatch" as const, reviewedSha256: addon.sourceSha256};
        const base = {curatedAddons: {}, selectedTheme: SOLCORD_RUNTIME_THEMES[0].id, hasSetupTransaction: false};
        expect(integrityRecordIsAccepted(addonRecord, base)).toBeFalse();
        expect(integrityRecordIsAccepted(addonRecord, {...base, curatedAddons: {[addon.name]: {selected: true}}})).toBeFalse();
        expect(integrityRecordIsAccepted(addonRecord, {...base, hasSetupTransaction: true, curatedAddons: {[addon.name]: {selected: true, reviewedSha256: addon.sourceSha256}}})).toBeTrue();

        const theme = SOLCORD_RUNTIME_THEMES[0];
        const themeRecord = {kind: "theme" as const, name: theme.name, status: "mismatch" as const, reviewedSha256: theme.sourceSha256};
        expect(integrityRecordIsAccepted(themeRecord, base)).toBeFalse();
        expect(integrityRecordIsAccepted(themeRecord, {...base, hasSetupTransaction: true})).toBeTrue();
        expect(integrityRecordIsAccepted(themeRecord, {...base, selectedTheme: SOLCORD_RUNTIME_THEMES[1].id, hasSetupTransaction: true})).toBeFalse();
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
        const addon = SOLCORD_RUNTIME_ADDONS[0];
        const records = normalizeIntegrityAudit([
            {kind: "addon", name: addon.name, status: "match", reviewedSha256: addon.sourceSha256, installedSha256: addon.sourceSha256},
            {kind: "addon", name: "UnknownAddon", status: "match", reviewedSha256: "a".repeat(64), installedSha256: "a".repeat(64)},
            {kind: "theme", name: SOLCORD_RUNTIME_THEMES[0].name, status: "match", reviewedSha256: "b".repeat(64), installedSha256: "b".repeat(64)}
        ]);
        expect(records.find(record => record.kind === "addon" && record.name === addon.name)?.status).toBe("match");
        expect(records.find(record => record.kind === "theme" && record.name === SOLCORD_RUNTIME_THEMES[0].name)?.status).toBe("unavailable");
        expect(records.some(record => record.name === "UnknownAddon")).toBeFalse();
    });

    test("does not classify missing files as tampering", () => {
        const addon = SOLCORD_RUNTIME_ADDONS[0];
        const record = normalizeIntegrityAudit([{kind: "addon", name: addon.name, status: "missing", reviewedSha256: addon.sourceSha256}])
            .find(item => item.kind === "addon" && item.name === addon.name)!;
        expect(record.status).toBe("missing");
        expect(integrityBlocksExecution(record)).toBeTrue();
        expect(integrityRequiresQuarantine(record)).toBeFalse();
        expect(integrityFailureReason(record)).toBeUndefined();
    });

    test("keeps mismatch, unsafe, unreadable, and incomplete audit results blocking and path-free", () => {
        const addons = SOLCORD_RUNTIME_ADDONS.slice(0, 3);
        const dependency = SOLCORD_RUNTIME_DEPENDENCIES[0];
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
