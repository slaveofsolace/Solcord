#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const review = JSON.parse(fs.readFileSync(path.join(root, "assets", "catalog", "solcord-reviewed-addons.json"), "utf8"));
const pluginRoot = path.join(process.env.APPDATA || "", "BetterDiscord", "plugins");
const output = path.join(root, "docs", "evidence", "catalog", "local-addon-inventory.json");

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function main() {
    if (!process.env.APPDATA || !fs.existsSync(pluginRoot)) throw new Error("BetterDiscord plugin directory is unavailable.");
    const records = review.candidates.filter(candidate => candidate.requestedByPreset).map(candidate => {
        const localFile = path.join(pluginRoot, candidate.fileName);
        if (!fs.existsSync(localFile) || !fs.statSync(localFile).isFile()) return {name: candidate.name, fileName: candidate.fileName, state: "MISSING", reviewedSha256: candidate.sourceSha256};
        const bytes = fs.readFileSync(localFile);
        const localSha256 = sha256(bytes);
        return {
            name: candidate.name,
            fileName: candidate.fileName,
            state: localSha256 === candidate.sourceSha256 ? "EXACT_REVIEWED" : "LOCAL_CONFLICT",
            reviewedSha256: candidate.sourceSha256,
            localSha256,
            sizeBytes: bytes.length
        };
    });
    const dependencyFile = path.join(pluginRoot, "0BDFDB.plugin.js");
    const reviewedDependency = review.dependencies?.find(candidate => candidate.name === "BDFDB");
    const dependency = fs.existsSync(dependencyFile) ? (() => {
        const bytes = fs.readFileSync(dependencyFile);
        const localSha256 = sha256(bytes);
        return {name: "BDFDB", fileName: "0BDFDB.plugin.js", state: reviewedDependency?.sourceSha256 === localSha256 ? "EXACT_REVIEWED" : "LOCAL_CONFLICT", reviewedSha256: reviewedDependency?.sourceSha256, localSha256, sizeBytes: bytes.length};
    })() : {name: "BDFDB", fileName: "0BDFDB.plugin.js", state: "MISSING"};
    const evidence = {
        schemaVersion: 1,
        inspectedAt: "2026-08-22",
        privacy: "Only requested addon source files were hashed. Config files, MessageLogger files, messages, user identifiers, and local paths were not read or recorded.",
        counts: {
            exact: records.filter(record => record.state === "EXACT_REVIEWED").length,
            conflict: records.filter(record => record.state === "LOCAL_CONFLICT").length,
            missing: records.filter(record => record.state === "MISSING").length
        },
        dependency,
        records
    };
    fs.mkdirSync(path.dirname(output), {recursive: true});
    fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
    process.stdout.write(`${evidence.counts.exact} exact, ${evidence.counts.conflict} local conflicts, ${evidence.counts.missing} missing.\n`);
}

main();
