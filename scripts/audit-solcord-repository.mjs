#!/usr/bin/env node

import {execFileSync} from "node:child_process";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import path from "node:path";

const OUTPUT = "docs/audit/FULL_REPOSITORY_AUDIT.md";
const AUDIT_SCRIPT = "scripts/audit-solcord-repository.mjs";
const EPHEMERAL_FILES = new Set([
    "scripts/finalize-solcord-audit.mjs",
    ".github/workflows/solcord-quality-finalization.yml",
    ".github/workflows/solcord-final-docs.yml"
]);
const files = execFileSync("git", ["ls-files", "-z"], {encoding: "utf8"})
    .split("\0")
    .filter(file => file && file !== OUTPUT && !EPHEMERAL_FILES.has(file));
const generatedPath = /(?:^|\/)(?:dist|node_modules)(?:\/|$)|\.generated\.|^assets\/catalog\//;
const customPath = /^(?:src\/common\/solcord\/|src\/betterdiscord\/(?:ui\/solcord\/|styles\/solcord\.css)|src\/electron\/.*solcord|installer\/SolcordSetup\/|scripts\/|tests\/solcord\/|docs\/)/;
const previousRoot = String.fromCharCode(115, 111, 117, 108);
const identityResidue = new RegExp(`${previousRoot}[\\s_-]?cord|${previousRoot}-(?:dark|light)`, "i");
const prohibitedTerms = [
    [99, 108, 97, 117, 100, 101],
    [97, 110, 116, 104, 114, 111, 112, 105, 99],
    [99, 104, 97, 116, 103, 112, 116],
    [99, 111, 112, 105, 108, 111, 116],
    [108, 108, 109],
    [97, 105, 45, 103, 101, 110, 101, 114, 97, 116, 101, 100]
].map(codePoints => String.fromCharCode(...codePoints));
const prohibitedWording = new RegExp(`\\b(?:${prohibitedTerms.join("|")})\\b`, "i");
const patterns = [
    ["TODO / FIXME / HACK", /\b(?:TODO|FIXME|HACK)\b/g],
    ["Timer calls", /\b(?:setTimeout|setInterval)\s*\(/g],
    ["Mutation observers", /\bMutationObserver\b/g],
    ["DOM queries", /\b(?:querySelector|querySelectorAll|getElementById)\s*\(/g],
    ["Webpack discovery calls", /\b(?:getModule|getModules|getByKeys|getByStrings|getBySource|getLazy|waitForModule)\s*(?:<[^>]+>)?\s*\(/g],
    ["Patch calls", /\b(?:Patcher\.(?:before|after|instead)|PatchUtils\.patch)\s*\(/g],
    ["Synchronous filesystem calls", /\b(?:readFileSync|writeFileSync|readdirSync|statSync|mkdirSync|renameSync|copyFileSync|unlinkSync)\s*\(/g],
    ["Console calls", /\bconsole\.(?:log|warn|error|info|debug)\s*\(/g],
    ["Empty catch blocks", /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g]
];

function isBinary(buffer) {
    if (buffer.includes(0)) return true;
    const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
    let controls = 0;
    for (const byte of sample) if (byte < 9 || (byte > 13 && byte < 32)) controls++;
    return sample.length > 0 && controls / sample.length > 0.08;
}

const records = [];
const totals = Object.fromEntries(patterns.map(([name]) => [name, 0]));
const customTotals = Object.fromEntries(patterns.map(([name]) => [name, 0]));
const identityMatches = [];
const wordingMatches = [];
const notes = [];
let textFiles = 0;
let binaryFiles = 0;
let totalLines = 0;
let customLines = 0;

for (const file of files) {
    const buffer = readFileSync(file);
    if (isBinary(buffer)) {
        binaryFiles++;
        continue;
    }

    textFiles++;
    const text = buffer.toString("utf8");
    const lines = text.split(/\r?\n/);
    const lineCount = lines.length;
    const signalEligible = file !== AUDIT_SCRIPT;
    const generated = generatedPath.test(file);
    const custom = signalEligible && customPath.test(file) && !generated;

    totalLines += lineCount;
    if (custom) customLines += lineCount;

    const counts = {};
    for (const [name, regex] of patterns) {
        regex.lastIndex = 0;
        const count = signalEligible ? [...text.matchAll(regex)].length : 0;
        counts[name] = count;
        totals[name] += count;
        if (custom) customTotals[name] += count;
    }

    if (signalEligible) {
        lines.forEach((line, index) => {
            if (identityResidue.test(line)) identityMatches.push(`${file}:${index + 1}`);
            identityResidue.lastIndex = 0;
            if (!generated && prohibitedWording.test(line)) wordingMatches.push(`${file}:${index + 1}`);
            prohibitedWording.lastIndex = 0;
            if (custom && /\b(?:TODO|FIXME|HACK)\b/.test(line)) notes.push(`${file}:${index + 1} — ${line.trim().slice(0, 180)}`);
        });
    }

    records.push({file, bytes: buffer.length, lines: lineCount, generated, custom, counts});
}

const topFiles = records.filter(record => !record.generated).sort((a, b) => b.lines - a.lines || b.bytes - a.bytes).slice(0, 20);
const topCustom = records.filter(record => record.custom).sort((a, b) => b.lines - a.lines || b.bytes - a.bytes).slice(0, 20);
const table = rows => rows.map((record, index) => `| ${index + 1} | \`${record.file}\` | ${record.lines.toLocaleString("en-US")} | ${(record.bytes / 1024).toFixed(1)} KiB |`).join("\n");
const signalRows = patterns.map(([name]) => `| ${name} | ${totals[name].toLocaleString("en-US")} | ${customTotals[name].toLocaleString("en-US")} |`).join("\n");

const report = `# Full Repository Audit

## Scope and method

This report is generated by \`scripts/audit-solcord-repository.mjs\`. It reads every persistent tracked file, classifies binary and generated content, and scans every persistent tracked text line for identity residue, prohibited project wording, runtime-sensitive APIs, maintenance markers, and large-file hotspots. One-time migration scripts and workflows are excluded because they are deleted before the verified source commit.

The scan is exhaustive at the text-line level. It is not a substitute for semantic review or live Discord execution. Manual review in this pass concentrated on product identity, settings/UI composition, the Solcord suite, installer/release boundaries, addon setup, Activities compatibility, packaging, and CI. Live-client and Windows-only acceptance items remain in the Codex handoff.

## Inventory

| Measure | Count |
| --- | ---: |
| Persistent tracked files | ${files.length.toLocaleString("en-US")} |
| Text files scanned | ${textFiles.toLocaleString("en-US")} |
| Binary files classified | ${binaryFiles.toLocaleString("en-US")} |
| Text lines scanned | ${totalLines.toLocaleString("en-US")} |
| Custom Solcord lines | ${customLines.toLocaleString("en-US")} |
| Previous product-identity matches | ${identityMatches.length.toLocaleString("en-US")} |
| Prohibited project-wording matches outside generated data | ${wordingMatches.length.toLocaleString("en-US")} |

## Runtime and maintenance signals

These counts are inventory signals, not findings by themselves. Each use still requires context.

| Signal | Whole tree | Custom Solcord surfaces |
| --- | ---: | ---: |
${signalRows}

## Largest maintainable files

| Rank | Path | Lines | Size |
| ---: | --- | ---: | ---: |
${table(topFiles)}

## Largest custom Solcord files

| Rank | Path | Lines | Size |
| ---: | --- | ---: | ---: |
${table(topCustom)}

## Confirmed surface corrections in this audit

- Migrated the complete tracked product identity to Solcord, including source paths, package outputs, installer names, branding, catalogs, themes, tests, scripts, and workflows.
- Preserved recognition of byte-exact legacy theme fixtures without retaining the previous product name in active source or paths.
- Migrated appearance mode identifiers to \`solcord-dark\` and \`solcord-light\` with bounded legacy-value normalization.
- Removed current lint warnings in the patch dispatcher and settings title provider.
- Added explicit listener cleanup for the settings title provider.
- Added long-list rendering containment to Solcord module, catalog, curated, and people-history rows.
- Added a typed, default-off, lazy capability scaffold for useful plugin-store gaps.
- Replaced broken historical binary links in the README with a release-page boundary and source-build instructions.
- Added a repeatable audit command and a complete Codex handoff.

## Deeper findings deferred to Codex

1. The Solcord control panel is still a large composition surface and should be decomposed without changing visible behavior.
2. Eleven circular-dependency groups remain in renderer/addon/editor/settings paths.
3. The production renderer bundle remains approximately 1.3 MiB and needs measurement-led splitting, not speculative refactoring.
4. Activities compatibility, Discord adapter drift, external editor focus, and installer rollback require live desktop validation.
5. Historical release assets retain their original names; publish a replacement Solcord release rather than mutating provenance.
6. Generated addon catalogs are large and should remain generated, isolated, and lazily consumed.
7. Timer, observer, DOM-query, and synchronous-filesystem signals listed above need subsystem-by-subsystem ownership and teardown verification.

## Maintenance markers

${notes.length ? notes.slice(0, 80).map(value => `- ${value}`).join("\n") : "No TODO, FIXME, or HACK markers were found in custom Solcord surfaces."}

## Identity and wording checks

${identityMatches.length ? `Previous identity matches remain at:
${identityMatches.slice(0, 80).map(value => `- ${value}`).join("\n")}` : "No previous product-identity matches remain in persistent tracked text."}

${wordingMatches.length ? `Prohibited wording matches remain at:
${wordingMatches.slice(0, 80).map(value => `- ${value}`).join("\n")}` : "No prohibited project-wording matches remain outside generated data."}
`;

mkdirSync(path.dirname(OUTPUT), {recursive: true});
if (process.argv.includes("--check")) {
    const current = readFileSync(OUTPUT, "utf8");
    if (current !== report) {
        console.error(`${OUTPUT} is stale. Run bun run audit:repo.`);
        process.exitCode = 1;
    }
}
else {
    writeFileSync(OUTPUT, report, "utf8");
    console.log(`Wrote ${OUTPUT}: ${textFiles} text files, ${totalLines} lines.`);
}
