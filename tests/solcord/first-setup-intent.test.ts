// SPDX-License-Identifier: Apache-2.0

import {afterEach, describe, expect, test} from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const {SolcordFirstSetupIntentStore} = await import("../../src/electron/main/modules/solcord-first-setup-intent");

const roots: string[] = [];
const now = Date.parse("2026-09-01T12:00:00.000Z");
const sourceCommit = "a".repeat(40);
const artifactSha256 = "b".repeat(64);

function fixture(attempts = 0, overrides: Record<string, unknown> = {}) {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "solcord-first-setup-"));
    roots.push(parent);
    const betterDiscord = path.join(parent, "BetterDiscord");
    const installer = path.join(betterDiscord, "solcord-installer");
    fs.mkdirSync(installer, {recursive: true});
    const receipt = {SourceCommit: sourceCommit, ArtifactSha256: artifactSha256, Channel: "Stable", DiscordVersion: "1.0.9255"};
    const intent = {
        Version: 1,
        IntentId: "c".repeat(32),
        Purpose: "first-setup",
        Channel: "Stable",
        DiscordVersion: "1.0.9255",
        SourceCommit: sourceCommit,
        ArtifactSha256: artifactSha256,
        CreatedAtUtc: new Date(now).toISOString(),
        Attempts: attempts,
        ...overrides
    };
    fs.writeFileSync(path.join(installer, "current.json"), JSON.stringify(receipt));
    fs.writeFileSync(path.join(installer, "first-setup-intent.json"), JSON.stringify(intent));
    const store = new SolcordFirstSetupIntentStore({betterDiscordRoot: () => betterDiscord, now: () => now, randomId: () => "d".repeat(16)});
    return {store, installer};
}

afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, {recursive: true, force: true});
});

describe("Solcord first-install setup intent", () => {
    test("claims a receipt-bound intent once per clean start and acknowledges only its exact id", () => {
        const {store, installer} = fixture();
        expect(store.claim()).toEqual({pending: true, intentId: "c".repeat(32), attempts: 1});
        expect(JSON.parse(fs.readFileSync(path.join(installer, "first-setup-intent.json"), "utf8")).Attempts).toBe(1);
        expect(store.acknowledge("e".repeat(32))).toEqual({acknowledged: false});
        expect(store.acknowledge("c".repeat(32))).toEqual({acknowledged: true});
        expect(store.claim()).toEqual({pending: false, reason: "absent"});
    });

    test("fails closed and quarantines a mismatched or malformed installer hint", () => {
        const mismatch = fixture(0, {ArtifactSha256: "f".repeat(64)});
        expect(mismatch.store.claim()).toEqual({pending: false, reason: "mismatch"});
        expect(fs.readdirSync(mismatch.installer).some(name => name.startsWith("first-setup-intent.invalid-"))).toBeTrue();

        const malformed = fixture(0, {IntentId: "not-an-id"});
        expect(malformed.store.claim()).toEqual({pending: false, reason: "invalid"});
        expect(fs.existsSync(path.join(malformed.installer, "current.json"))).toBeTrue();
    });

    test("expires stale hints and stops retrying after three interrupted starts", () => {
        const stale = fixture(0, {CreatedAtUtc: "2020-01-01T00:00:00.000Z"});
        expect(stale.store.claim()).toEqual({pending: false, reason: "stale"});

        const exhausted = fixture(3);
        expect(exhausted.store.claim()).toEqual({pending: false, reason: "attempt-limit"});
        expect(fs.existsSync(path.join(exhausted.installer, "first-setup-intent.json"))).toBeFalse();
    });
});
