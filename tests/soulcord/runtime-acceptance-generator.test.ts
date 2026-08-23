import {afterEach, describe, expect, test} from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";


const REPOSITORY_ROOT = path.resolve(import.meta.dir, "../..");
const GENERATOR_SOURCE = path.join(REPOSITORY_ROOT, "scripts", "build-soulcord-runtime-catalog.cjs");
const ADDON_REVISION = "1".repeat(40);
const DEPENDENCY_REVISION = "2".repeat(40);
const ADDON_SHA256 = "a".repeat(64);
const DEPENDENCY_SHA256 = "b".repeat(64);
const SUITE = {
    soulCordCommit: "c".repeat(40),
    artifactSha256: "d".repeat(64),
    discordVersion: "1.0.9999"
};

interface RuntimeEvidence {
    status: "PASSED" | "PENDING";
    cleanup: "PASSED" | "PENDING";
    sourceSha256: string;
    immutableRevision: string;
    soulCordCommit: string;
    artifactSha256: string;
    discordVersion: string;
    humanAcceptance: "ACCEPT" | "NOT_APPLICABLE" | "PENDING" | "REVISE";
    dependencyHashes?: Record<string, string>;
}

interface AcceptanceLedger {
    schemaVersion: 1;
    suite: typeof SUITE | null;
    candidates: Record<string, RuntimeEvidence>;
    dependencies: Record<string, RuntimeEvidence>;
}

interface GeneratedRecord {
    name: string;
    stageable: boolean;
    installable: boolean;
    reviewStatus: string;
}

interface FixtureOptions {
    securitySchemaVersion?: number;
    candidateBinding?: Partial<{catalogId: number | null; immutableRevision: string; sourceSha256: string;}>;
    duplicateCandidate?: boolean;
}

const temporaryRoots: string[] = [];

function evidence(sourceSha256: string, immutableRevision: string): RuntimeEvidence {
    return {
        status: "PASSED",
        cleanup: "PASSED",
        sourceSha256,
        immutableRevision,
        ...SUITE,
        humanAcceptance: "NOT_APPLICABLE"
    };
}

function acceptedLedger(): AcceptanceLedger {
    return {
        schemaVersion: 1,
        suite: {...SUITE},
        candidates: {
            TestAddon: {...evidence(ADDON_SHA256, ADDON_REVISION), dependencyHashes: {BDFDB: DEPENDENCY_SHA256}}
        },
        dependencies: {
            BDFDB: evidence(DEPENDENCY_SHA256, DEPENDENCY_REVISION)
        }
    };
}

function extractGeneratedArray(source: string, name: string): GeneratedRecord[] {
    const marker = `export const ${name} = `;
    const start = source.indexOf(marker);
    if (start < 0) throw new Error(`Generated fixture is missing ${name}.`);
    const valueStart = start + marker.length;
    const valueEnd = source.indexOf(" as const;", valueStart);
    if (valueEnd < 0) throw new Error(`Generated fixture has an unterminated ${name}.`);
    return JSON.parse(source.slice(valueStart, valueEnd)) as GeneratedRecord[];
}

function runFixture(acceptance: AcceptanceLedger, candidateDisposition = "SAFE_TO_RUNTIME_TEST", dependencyDisposition = "SAFE_TO_RUNTIME_TEST", options: FixtureOptions = {}): {addons: GeneratedRecord[]; dependencies: GeneratedRecord[];} {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "soulcord-acceptance-generator-"));
    temporaryRoots.push(root);
    const scripts = path.join(root, "scripts");
    const catalog = path.join(root, "assets", "catalog");
    const themes = path.join(root, "assets", "themes");
    fs.mkdirSync(scripts, {recursive: true});
    fs.mkdirSync(catalog, {recursive: true});
    fs.mkdirSync(themes, {recursive: true});
    fs.copyFileSync(GENERATOR_SOURCE, path.join(scripts, "build-soulcord-runtime-catalog.cjs"));

    const verification = {code: "STATIC_REVIEWED", security: "STATIC_REVIEWED", runtime: "PENDING"};
    const review = {
        schemaVersion: 1,
        candidates: [{
            catalogId: 1,
            name: "TestAddon",
            fileName: "TestAddon.plugin.js",
            version: "1.0.0",
            sourceUrl: `https://raw.githubusercontent.com/example/addons/${ADDON_REVISION}/TestAddon.plugin.js`,
            sourceSha256: ADDON_SHA256,
            immutableRevision: ADDON_REVISION,
            sizeBytes: 123,
            dependencies: ["BDFDB"],
            conflicts: [],
            requestedByPreset: true,
            reviewStatus: "STATIC_PASS_RUNTIME_REQUIRED",
            verification,
            license: {status: "FOUND", name: "MIT"}
        }],
        dependencies: [{
            name: "BDFDB",
            fileName: "0BDFDB.plugin.js",
            sourceUrl: `https://raw.githubusercontent.com/example/library/${DEPENDENCY_REVISION}/0BDFDB.plugin.js`,
            sourceSha256: DEPENDENCY_SHA256,
            immutableRevision: DEPENDENCY_REVISION,
            sizeBytes: 456,
            reviewStatus: "STATIC_PASS_RUNTIME_REQUIRED",
            verification,
            license: {status: "FOUND", name: "GPL"}
        }]
    };
    if (options.duplicateCandidate) review.candidates.push({...review.candidates[0]});
    const securityCandidate = {
        catalogId: 1,
        immutableRevision: ADDON_REVISION,
        sourceSha256: ADDON_SHA256,
        disposition: candidateDisposition,
        reasonCodes: ["TEST_FIXTURE"],
        ...options.candidateBinding
    };
    fs.writeFileSync(path.join(catalog, "soulcord-reviewed-addons.json"), JSON.stringify(review));
    fs.writeFileSync(path.join(catalog, "soulcord-catalog.json"), JSON.stringify({schemaVersion: 1, snapshot: {pluginCount: 1, themeCount: 0}, candidates: []}));
    fs.writeFileSync(path.join(catalog, "soulcord-runtime-acceptance.json"), JSON.stringify(acceptance));
    fs.writeFileSync(path.join(catalog, "soulcord-security-dispositions.json"), JSON.stringify({
        schemaVersion: options.securitySchemaVersion ?? 2,
        candidates: {TestAddon: securityCandidate},
        dependencies: {BDFDB: {catalogId: null, immutableRevision: DEPENDENCY_REVISION, sourceSha256: DEPENDENCY_SHA256, disposition: dependencyDisposition, reasonCodes: ["TEST_FIXTURE"]}}
    }));
    for (const fileName of [
        "SoulCord-ObsidianThread.theme.css",
        "SoulCord-CarbonEmber.theme.css",
        "SoulCord-MidnightGlass.theme.css",
        "SoulCord-PaperSignal.theme.css"
    ]) fs.writeFileSync(path.join(themes, fileName), `/** @name ${fileName} */\n:root {}\n`);

    const result = Bun.spawnSync({
        cmd: [process.execPath, path.join(scripts, "build-soulcord-runtime-catalog.cjs")],
        cwd: root,
        stdout: "pipe",
        stderr: "pipe"
    });
    if (result.exitCode !== 0) throw new Error(`Fixture generator failed: ${result.stderr.toString()}`);
    const generated = fs.readFileSync(path.join(root, "src", "common", "soulcord", "addon-catalog.generated.ts"), "utf8");
    return {
        addons: extractGeneratedArray(generated, "SOULCORD_RUNTIME_ADDONS"),
        dependencies: extractGeneratedArray(generated, "SOULCORD_RUNTIME_DEPENDENCIES")
    };
}

afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
        const resolved = fs.realpathSync(root);
        const temporary = fs.realpathSync(os.tmpdir());
        if (!resolved.startsWith(`${temporary}${path.sep}`) || !path.basename(resolved).startsWith("soulcord-acceptance-generator-")) throw new Error("Refusing unsafe acceptance-fixture cleanup.");
        fs.rmSync(resolved, {recursive: true});
    }
});

describe("hash-bound runtime acceptance generator", () => {
    test("keeps statically reviewed records stageable but non-installable with an empty ledger", () => {
        const generated = runFixture({schemaVersion: 1, suite: null, candidates: {}, dependencies: {}});
        expect(generated.addons[0]).toEqual(expect.objectContaining({stageable: true, installable: false, reviewStatus: "SAFE_TO_RUNTIME_TEST"}));
        expect(generated.dependencies[0]).toEqual(expect.objectContaining({stageable: true, installable: false, reviewStatus: "SAFE_TO_RUNTIME_TEST"}));
    });

    test("graduates exact PASSED candidate and dependency evidence without losing stageability", () => {
        const generated = runFixture(acceptedLedger());
        expect(generated.addons[0]).toEqual(expect.objectContaining({stageable: true, installable: true, reviewStatus: "ACCEPTED"}));
        expect(generated.dependencies[0]).toEqual(expect.objectContaining({stageable: true, installable: true, reviewStatus: "ACCEPTED"}));
    });

    test("never graduates a candidate or dependency held by the deep security review", () => {
        const candidateHeld = runFixture(acceptedLedger(), "HOLD");
        expect(candidateHeld.addons[0]).toEqual(expect.objectContaining({stageable: false, installable: false, reviewStatus: "HOLD"}));
        const dependencyHeld = runFixture(acceptedLedger(), "SAFE_TO_RUNTIME_TEST", "HOLD");
        expect(dependencyHeld.dependencies[0]).toEqual(expect.objectContaining({stageable: false, installable: false, reviewStatus: "HOLD"}));
        expect(dependencyHeld.addons[0]).toEqual(expect.objectContaining({stageable: true, installable: false}));
    });

    test("rejects stale deep-security approval bindings", () => {
        for (const candidateBinding of [
            {catalogId: 2},
            {immutableRevision: "e".repeat(40)},
            {sourceSha256: "e".repeat(64)}
        ]) {
            expect(() => runFixture(acceptedLedger(), "SAFE_TO_RUNTIME_TEST", "SAFE_TO_RUNTIME_TEST", {candidateBinding})).toThrow("not bound to the exact reviewed source");
        }
    });

    test("rejects security schema drift and duplicate reviewed candidates", () => {
        expect(() => runFixture(acceptedLedger(), "SAFE_TO_RUNTIME_TEST", "SAFE_TO_RUNTIME_TEST", {securitySchemaVersion: 1})).toThrow("Security disposition manifest schema");
        expect(() => runFixture(acceptedLedger(), "SAFE_TO_RUNTIME_TEST", "SAFE_TO_RUNTIME_TEST", {duplicateCandidate: true})).toThrow("duplicate name");
    });

    test("fails closed when candidate source or declared dependency hashes drift", () => {
        for (const mutate of [
            (ledger: AcceptanceLedger) => {ledger.candidates.TestAddon.sourceSha256 = "e".repeat(64);},
            (ledger: AcceptanceLedger) => {ledger.candidates.TestAddon.immutableRevision = "e".repeat(40);},
            (ledger: AcceptanceLedger) => {ledger.candidates.TestAddon.dependencyHashes = {BDFDB: "e".repeat(64)};}
        ]) {
            const ledger = acceptedLedger();
            mutate(ledger);
            const generated = runFixture(ledger);
            expect(generated.addons[0]).toEqual(expect.objectContaining({stageable: true, installable: false}));
        }
    });

    test("fails the candidate closure when dependency runtime evidence drifts", () => {
        const ledger = acceptedLedger();
        ledger.dependencies.BDFDB.sourceSha256 = "e".repeat(64);
        const generated = runFixture(ledger);
        expect(generated.dependencies[0]).toEqual(expect.objectContaining({stageable: true, installable: false}));
        expect(generated.addons[0]).toEqual(expect.objectContaining({stageable: true, installable: false}));
    });

    test("binds every record to the exact suite artifact, commit, and Discord version", () => {
        for (const mutate of [
            (ledger: AcceptanceLedger) => {ledger.candidates.TestAddon.artifactSha256 = "e".repeat(64);},
            (ledger: AcceptanceLedger) => {ledger.candidates.TestAddon.soulCordCommit = "e".repeat(40);},
            (ledger: AcceptanceLedger) => {ledger.candidates.TestAddon.discordVersion = "1.0.drift";},
            (ledger: AcceptanceLedger) => {ledger.suite = {...SUITE, artifactSha256: "not-a-hash"};}
        ]) {
            const ledger = acceptedLedger();
            mutate(ledger);
            const generated = runFixture(ledger);
            expect(generated.addons[0]).toEqual(expect.objectContaining({stageable: true, installable: false}));
        }
    });

    test("requires completed cleanup and an accepted human gate", () => {
        for (const mutate of [
            (ledger: AcceptanceLedger) => {ledger.candidates.TestAddon.status = "PENDING";},
            (ledger: AcceptanceLedger) => {ledger.candidates.TestAddon.cleanup = "PENDING";},
            (ledger: AcceptanceLedger) => {ledger.candidates.TestAddon.humanAcceptance = "PENDING";},
            (ledger: AcceptanceLedger) => {ledger.candidates.TestAddon.humanAcceptance = "REVISE";}
        ]) {
            const ledger = acceptedLedger();
            mutate(ledger);
            const generated = runFixture(ledger);
            expect(generated.addons[0]).toEqual(expect.objectContaining({stageable: true, installable: false}));
        }
    });
});
