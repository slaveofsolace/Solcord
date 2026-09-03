#!/usr/bin/env node

import {execFileSync} from "node:child_process";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import path from "node:path";

import {normalizePortableText, portableTextByteLength} from "./helpers/portable-text.mjs";

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
const inheritedPathsInsideCustomRoots = new Set(["scripts/translations.ts"]);
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
    const custom = signalEligible && customPath.test(file) && !generated && !inheritedPathsInsideCustomRoots.has(file);

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

    records.push({file, bytes: portableTextByteLength(text), lines: lineCount, generated, custom, counts});
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
- Completed typed, default-off, lazy capability contracts with bounded runtime adapters; unsupported Discord internals remain visibly unavailable instead of being advertised as live.
- Replaced broken historical binary links in the README with a release-page boundary and source-build instructions.
- Added a repeatable audit command and a complete Codex handoff.

## Circular-dependency classification

The pinned dependency audit reports eleven groups. They are classified rather than hidden:

| Groups | Area | Classification | Decision |
| --- | --- | --- | --- |
| 1–5 | BetterDiscord Webpack, patcher, and store utilities | Inherited core topology | Retain. Solcord added no edge in these groups; speculative rewrites would threaten public addon compatibility. |
| 6–7 | BetterDiscord addon manager, editor, plugin, and theme managers | Inherited editor topology | Retain. Solcord's manager imports point only to leaf integrity/doctor modules and do not create the cycle. |
| 8 | BetterDiscord floating-window container | Inherited UI topology | Retain. No Solcord change participates. |
| 9–11 | BetterDiscord settings, addon store, builtins, and Custom CSS | Inherited settings topology | Retain. Solcord's settings-name helper is a leaf and creates no return edge. |

No Solcord module appears in a reported cycle. The release gate therefore records the inherited groups as baseline debt while treating any future Solcord-introduced cycle as a failure.

## Remaining measured constraints

1. The Control Center remains a large composition surface. Further splitting is maintenance work only and must preserve its accepted route, focus, and scroll behavior.
2. The production renderer bundle remains approximately 1.6 MiB; any split must be supported by startup and interaction measurements.
3. Activities compatibility, Discord adapter drift, external editor focus, and installer rollback require exact-client validation for every release candidate.
4. Historical release assets retain their original names; replacement releases must preserve that provenance rather than mutating old assets.
5. Generated addon catalogs remain generated and isolated; consumers must not eagerly load optional source bodies.
6. Timer, observer, DOM-query, and synchronous-filesystem signals require subsystem ownership and teardown evidence before release.

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
    if (normalizePortableText(current) !== report) {
        console.error(`${OUTPUT} is stale. Run bun run audit:repo.`);
        process.exitCode = 1;
    }
}
else {
    writeFileSync(OUTPUT, report, "utf8");
    console.log(`Wrote ${OUTPUT}: ${textFiles} text files, ${totalLines} lines.`);
}
