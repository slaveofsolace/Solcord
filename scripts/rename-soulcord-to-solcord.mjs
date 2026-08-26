#!/usr/bin/env node

import {execFileSync} from "node:child_process";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import path from "node:path";

const SCRIPT_PATH = "scripts/rename-soulcord-to-solcord.mjs";
const WORKFLOW_PATH = ".github/workflows/solcord-identity-migration.yml";
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

const files = trackedFiles();
const targets = new Map();
for (const source of files) {
    if (excluded.has(source)) continue;
    const target = renameIdentity(source);
    const previous = targets.get(target);
    if (previous && previous !== source) throw new Error(`Identity rename collision: ${previous} and ${source} -> ${target}`);
    targets.set(target, source);
}

for (const source of files) {
    if (excluded.has(source)) continue;
    const target = renameIdentity(source);
    if (target === source) continue;
    if (existsSync(target) && !files.includes(target)) throw new Error(`Identity rename target already exists: ${target}`);
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

const remainingPaths = trackedFiles().filter(file => !excluded.has(file) && identityPattern.test(file));
identityPattern.lastIndex = 0;
if (remainingPaths.length) throw new Error(`Identity paths remain: ${remainingPaths.join(", ")}`);

console.log(`Renamed ${targets.size} tracked paths and updated ${changedTextFiles} text files.`);
