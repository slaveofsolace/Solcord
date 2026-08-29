import {afterEach, describe, expect, test} from "bun:test";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

import {classifySolcordUpdateOwnership, isSolcordTransactionOwnedAcceptedArtifact, solcordUpdateRequiresReview} from "../../src/betterdiscord/modules/solcord/updater-ownership";


const roots: string[] = [];
const FILE_NAME = "Reviewed.plugin.js";
const CONTENT = "/** @name Reviewed */\nmodule.exports = class Reviewed {};\n";

function digest(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function fixture(added: boolean): {pluginRoot: string; transactionRoot: string; transactionId: string; reviewedSha256: string;} {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "solcord-updater-ownership-"));
    roots.push(root);
    const betterDiscordRoot = path.join(root, "BetterDiscord");
    const pluginRoot = path.join(betterDiscordRoot, "plugins");
    const transactionRoot = path.join(betterDiscordRoot, "solcord-transactions-v1");
    fs.mkdirSync(pluginRoot, {recursive: true});
    fs.mkdirSync(transactionRoot, {recursive: true});
    fs.writeFileSync(path.join(pluginRoot, FILE_NAME), CONTENT);
    const reviewedSha256 = digest(CONTENT);
    const transactionId = "m1234-0123456789abcdef";
    const file = {kind: "plugin", fileName: FILE_NAME, sha256: reviewedSha256};
    const journal = {
        version: 1,
        transactionId,
        createdAt: Date.now(),
        added: added ? [file] : [],
        reused: added ? [] : [file],
        selectedAddons: ["Reviewed"],
        selectedTheme: "obsidian-thread"
    };
    const serialized = `${JSON.stringify(journal, null, 2)}\n`;
    fs.writeFileSync(path.join(transactionRoot, `${transactionId}.json`), serialized);
    fs.writeFileSync(path.join(transactionRoot, `${transactionId}.complete`), `${digest(serialized)}\n`);
    return {pluginRoot, transactionRoot, transactionId, reviewedSha256};
}

function owned(pluginRoot: string, reviewedSha256: string, accepted = true): boolean {
    return isSolcordTransactionOwnedAcceptedArtifact({accepted, addonFolder: pluginRoot, fileName: FILE_NAME, kind: "plugin", reviewedSha256});
}

function classified(pluginRoot: string, reviewedSha256: string) {
    return classifySolcordUpdateOwnership({accepted: true, addonFolder: pluginRoot, fileName: FILE_NAME, kind: "plugin", reviewedSha256});
}

afterEach(() => {
    for (const root of roots.splice(0)) {
        const resolved = fs.realpathSync(root);
        const temporary = fs.realpathSync(os.tmpdir());
        if (!resolved.startsWith(`${temporary}${path.sep}`) || !path.basename(resolved).startsWith("solcord-updater-ownership-")) throw new Error("Refusing unsafe updater fixture cleanup.");
        fs.rmSync(resolved, {recursive: true});
    }
});

describe("Solcord updater ownership", () => {
    test("holds only an accepted exact file that Solcord added", () => {
        const state = fixture(true);
        expect(owned(state.pluginRoot, state.reviewedSha256)).toBeTrue();
    });

    test("does not claim a reused owner file or an unaccepted candidate", () => {
        const reused = fixture(false);
        expect(owned(reused.pluginRoot, reused.reviewedSha256)).toBeFalse();
        const added = fixture(true);
        expect(owned(added.pluginRoot, added.reviewedSha256, false)).toBeFalse();
    });

    test("releases the update hold after owner modification or rollback", () => {
        const changed = fixture(true);
        fs.appendFileSync(path.join(changed.pluginRoot, FILE_NAME), "// owner change\n");
        expect(owned(changed.pluginRoot, changed.reviewedSha256)).toBeFalse();

        const rolledBack = fixture(true);
        fs.writeFileSync(path.join(rolledBack.transactionRoot, `${rolledBack.transactionId}.rolledback`), "owner-requested\n");
        expect(owned(rolledBack.pluginRoot, rolledBack.reviewedSha256)).toBeFalse();
    });

    test("fails closed when completion evidence is forged", () => {
        const state = fixture(true);
        fs.writeFileSync(path.join(state.transactionRoot, `${state.transactionId}.complete`), `${"0".repeat(64)}\n`);
        expect(owned(state.pluginRoot, state.reviewedSha256)).toBeFalse();
        expect(classified(state.pluginRoot, state.reviewedSha256).state).toBe("indeterminate");
    });

    test("fails closed for malformed or unsafe transaction evidence", () => {
        const malformed = fixture(true);
        fs.writeFileSync(path.join(malformed.transactionRoot, `${malformed.transactionId}.json`), "{not-json\n");
        expect(classified(malformed.pluginRoot, malformed.reviewedSha256).state).toBe("indeterminate");

        const unsafe = fixture(true);
        fs.rmSync(unsafe.transactionRoot, {recursive: true});
        fs.writeFileSync(unsafe.transactionRoot, "not-a-directory\n");
        expect(classified(unsafe.pluginRoot, unsafe.reviewedSha256).state).toBe("indeterminate");
    });

    test("allows ordinary updates only when ownership is provably owner-managed", () => {
        const reused = fixture(false);
        expect(classified(reused.pluginRoot, reused.reviewedSha256).state).toBe("owner-managed");

        const noTransaction = fixture(false);
        fs.rmSync(noTransaction.transactionRoot, {recursive: true});
        expect(classified(noTransaction.pluginRoot, noTransaction.reviewedSha256).state).toBe("owner-managed");
    });

    test("holds both managed and indeterminate files at the updater decision boundary", () => {
        const managed = fixture(true);
        expect(solcordUpdateRequiresReview(classified(managed.pluginRoot, managed.reviewedSha256))).toBeTrue();

        const indeterminate = fixture(true);
        fs.writeFileSync(path.join(indeterminate.transactionRoot, `${indeterminate.transactionId}.complete`), "invalid\n");
        expect(solcordUpdateRequiresReview(classified(indeterminate.pluginRoot, indeterminate.reviewedSha256))).toBeTrue();

        const ownerManaged = fixture(false);
        expect(solcordUpdateRequiresReview(classified(ownerManaged.pluginRoot, ownerManaged.reviewedSha256))).toBeFalse();
    });
});
