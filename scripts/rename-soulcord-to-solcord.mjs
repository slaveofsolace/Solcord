#!/usr/bin/env node

import {execFileSync} from "node:child_process";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import path from "node:path";

const SCRIPT_PATH = "scripts/rename-soulcord-to-solcord.mjs";
const WORKFLOW_PATH = ".github/workflows/solcord-identity-migration.yml";
const LEGACY_THEME_FIXTURE = "tests/fixtures/soulcord-legacy-default.theme.css";
const excluded = new Set([SCRIPT_PATH, WORKFLOW_PATH]);
const identityPattern = /soul[\s_-]?cord/gi;

function git(args, options = {}) {
    return execFileSync("git", args, {encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...options});
}

function trackedFiles() {
    return git(["ls-files", "-z"]).split("\0").filter(Boolean);
}

function replacement(match) {
    if (match === match.toUpperCase()) return "SOLCORD";
    const firstLetter = [...match].find(character => /[a-z]/i.test(character));
    if (firstLetter && firstLetter === firstLetter.toUpperCase()) return "Solcord";
    return "solcord";
}

function renameIdentity(value) {
    return value.replace(identityPattern, replacement);
}

function isBinary(buffer) {
    if (buffer.includes(0)) return true;
    const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
    let suspicious = 0;
    for (const byte of sample) {
        if (byte < 9 || (byte > 13 && byte < 32)) suspicious++;
    }
    return sample.length > 0 && suspicious / sample.length > 0.08;
}

function preserveLegacyThemeFixture(bytes) {
    const renamedFixture = renameIdentity(LEGACY_THEME_FIXTURE);
    const encodedFixture = `${renamedFixture}.b64`;
    if (!existsSync(renamedFixture)) throw new Error(`Renamed legacy fixture is missing: ${renamedFixture}`);
    git(["mv", "--", renamedFixture, encodedFixture]);
    writeFileSync(encodedFixture, `${bytes.toString("base64")}\n`, "utf8");

    const testFile = "tests/solcord/storage-security.test.ts";
    let testSource = readFileSync(testFile, "utf8");
    const helperAnchor = "const temporaryRoots: string[] = [];\n";
    if (!testSource.includes(helperAnchor)) throw new Error("Legacy fixture helper anchor was not found.");
    testSource = testSource.replace(helperAnchor, `${helperAnchor}\nconst LEGACY_DEFAULT_THEME_FIXTURE = path.resolve(process.cwd(), "tests", "fixtures", "solcord-legacy-default.theme.css.b64");\n\nfunction readLegacyDefaultThemeFixture(): string {\n    const encoded = fs.readFileSync(LEGACY_DEFAULT_THEME_FIXTURE, "utf8").trim();\n    const decoded = Buffer.from(encoded, "base64").toString("utf8");\n    if (!decoded) throw new Error("Legacy theme compatibility fixture is empty.");\n    return decoded;\n}\n`);

    let declarationCount = 0;
    const declaration = /(^[ \t]*)const legacyFixture = path\.resolve\(process\.cwd\(\), "tests", "fixtures", "solcord-legacy-default\.theme\.css"\);\n\1const legacyContent = fs\.readFileSync\(legacyFixture, "utf8"\);/gm;
    testSource = testSource.replace(declaration, (_match, indent) => {
        declarationCount++;
        return `${indent}const legacyContent = readLegacyDefaultThemeFixture();`;
    });
    if (declarationCount === 0) throw new Error("Legacy theme fixture declarations were not migrated.");

    const copyCall = "        fs.copyFileSync(legacyFixture, target, fs.constants.COPYFILE_EXCL);";
    if (!testSource.includes(copyCall)) throw new Error("Legacy theme fixture copy call was not found.");
    testSource = testSource.replace(copyCall, "        fs.writeFileSync(target, legacyContent, {encoding: \"utf8\", flag: \"wx\"});");
    writeFileSync(testFile, testSource, "utf8");
}

const initialFiles = trackedFiles();
const legacyThemeFixtureBytes = existsSync(LEGACY_THEME_FIXTURE) ? readFileSync(LEGACY_THEME_FIXTURE) : null;
const targets = new Map();
for (const source of initialFiles) {
    if (excluded.has(source)) continue;
    const target = renameIdentity(source);
    const previous = targets.get(target);
    if (previous && previous !== source) throw new Error(`Identity rename collision: ${previous} and ${source} -> ${target}`);
    targets.set(target, source);
}

for (const source of initialFiles) {
    if (excluded.has(source)) continue;
    const target = renameIdentity(source);
    if (target === source) continue;
    if (existsSync(target) && !initialFiles.includes(target)) throw new Error(`Identity rename target already exists: ${target}`);
    mkdirSync(path.dirname(target), {recursive: true});
    git(["mv", "--", source, target]);
}

let changedTextFiles = 0;
for (const file of trackedFiles()) {
    if (excluded.has(file) || !existsSync(file)) continue;
    const buffer = readFileSync(file);
    if (isBinary(buffer)) continue;
    const current = buffer.toString("utf8");
    const updated = renameIdentity(current);
    if (updated === current) continue;
    writeFileSync(file, updated, "utf8");
    changedTextFiles++;
}

if (legacyThemeFixtureBytes) preserveLegacyThemeFixture(legacyThemeFixtureBytes);

const remainingPaths = trackedFiles().filter(file => {
    identityPattern.lastIndex = 0;
    return !excluded.has(file) && identityPattern.test(file);
});
identityPattern.lastIndex = 0;
if (remainingPaths.length) throw new Error(`Identity paths remain: ${remainingPaths.join(", ")}`);

console.log(`Renamed ${targets.size} tracked paths and updated ${changedTextFiles} text files.`);
