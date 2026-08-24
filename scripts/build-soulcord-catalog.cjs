#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const quarantine = path.resolve(root, "..", "quarantine-soulcord-v1", "catalog");
const pluginSnapshot = process.argv[2] || path.join(quarantine, "plugins.json");
const themeSnapshot = process.argv[3] || path.join(quarantine, "themes.json");
const output = process.argv[4] || path.join(root, "assets", "catalog", "soulcord-catalog.json");

const requestedPreset = [
    "DoNotTrack", "InvisibleTyping", "DoubleClickToReply", "PinDMs", "MessagePeek", "FileNameRandomization", "BlurNSFW",
    "VoiceMessages", "VoiceActivity", "ShowSpectators", "CallTimeCounter", "BetterVolume", "AudioOptions", "NotifyWhenMuted",
    "Translator", "SplitLargeMessages", "CharCounter", "SpellCheck", "InsertTimestamps",
    "ServerHider", "ServerDetails", "ReadAllNotificationsButton", "BetterFolders", "PersonalPins", "PermissionsViewer", "ActivityFilter",
    "DiscordEffects", "CompleteTimestamps", "BetterFriendList", "BetterAnimations", "EditServers", "ImageUtilities", "HideDisabledEmojis", "BetterSearchPage", "RevealAllSpoilers", "ViewProfilePicture"
];

const optionalNames = [
    "ChannelTabs", "UserNotes", "Timezones", "RoleExplorer", "FavoriteMedia", "Uncompressed Images", "GameActivityToggle", "InMyVoice", "ShowPing", "VoiceHub", "BetterMediaPlayer", "ChannelsPreview"
];
const optional = new Set(optionalNames.map(normalize));

const preset = new Set(requestedPreset.map(normalize));
const conflicts = new Map([
    [normalize("SplitLargeMessages"), ["Message Splitter", "other automatic message splitters"]],
    [normalize("ImageUtilities"), ["competing media viewers"]],
    [normalize("BetterAnimations"), ["Discord reduced-motion preference", "animation-heavy themes"]],
    [normalize("DiscordEffects"), ["Windows or Discord reduced-motion preference"]],
    [normalize("ChannelsPreview"), ["other channel-preview tools"]],
    [normalize("BetterFolders"), ["ServerFolders"]]
]);

// Risk terms must be complete words. In particular, an unbounded `quest`
// also matches ordinary catalog copy such as "feature requests".
const powerPattern = /(?:fake\s*(?:mute|deafen|nitro)|\bquests?\b|\bpremium\b|\bentitlements?\b|\btokens?\b|self[ -]?bot|message\s*logger|deleted\s*message|anti[ -]?afk)/i;
const rejectPattern = /(?:token\s*(?:grab|extract)|credential|stealer|malware)/i;

function normalize(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function digest(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

function immutableRevision(url) {
    const match = /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/([0-9a-f]{40})\//i.exec(url || "");
    return match ? match[1].toLowerCase() : null;
}

function disposition(record, kind) {
    const key = normalize(record.name);
    const text = `${record.name || ""} ${record.description || ""}`;
    if (rejectPattern.test(text)) return "REJECT";
    if (powerPattern.test(text)) return "POWER_LAB";
    if (kind === "plugin" && preset.has(key)) return "CURATED";
    if (kind === "plugin" && optional.has(key)) return "OPTIONAL";
    return "HOLD";
}

function candidate(record, kind) {
    const sourceUrl = String(record.latest_source_url || "");
    const decided = disposition(record, kind);
    const requestedByPreset = kind === "plugin" && preset.has(normalize(record.name));
    return {
        catalogId: Number(record.id),
        type: kind,
        name: String(record.name || ""),
        fileName: String(record.file_name || ""),
        description: String(record.description || ""),
        version: String(record.version || ""),
        author: String(record.author?.display_name || record.author?.github_name || "unknown"),
        tags: Array.isArray(record.tags) ? record.tags.filter((tag) => typeof tag === "string") : [],
        sourceUrl,
        immutableRevision: immutableRevision(sourceUrl),
        disposition: requestedByPreset ? "HOLD" : decided,
        targetDisposition: requestedByPreset ? "CURATED" : decided,
        requestedByPreset,
        license: {status: "UNRESOLVED", evidence: null},
        sourceSha256: null,
        dependencies: [],
        capabilities: Array.isArray(record.tags) ? record.tags.filter((tag) => typeof tag === "string") : [],
        networkBehavior: "CODE_REVIEW_REQUIRED",
        accountActions: "CODE_REVIEW_REQUIRED",
        conflicts: conflicts.get(normalize(record.name)) || [],
        cleanupBehavior: "RUNTIME_REVIEW_REQUIRED",
        reviewDate: "2026-08-22",
        verification: {
            metadata: sourceUrl && immutableRevision(sourceUrl) ? "REVIEWED" : "HOLD",
            provenance: "PENDING",
            code: "PENDING",
            security: "PENDING",
            runtime: "PENDING"
        },
        installable: false
    };
}

function readSnapshot(file) {
    const raw = fs.readFileSync(file);
    const records = JSON.parse(raw.toString("utf8"));
    if (!Array.isArray(records)) throw new TypeError(`${file} is not a catalog array.`);
    return {raw, records};
}

function main() {
    const plugins = readSnapshot(pluginSnapshot);
    const themes = readSnapshot(themeSnapshot);
    const pluginCandidates = plugins.records.map((record) => candidate(record, "plugin"));
    const themeCandidates = themes.records.map((record) => candidate(record, "theme"));
    const found = new Set(pluginCandidates.filter((entry) => entry.requestedByPreset).map((entry) => normalize(entry.name)));
    const missingRequested = requestedPreset.filter((name) => !found.has(normalize(name)));
    const foundOptional = new Set(pluginCandidates.filter((entry) => entry.targetDisposition === "OPTIONAL").map((entry) => normalize(entry.name)));
    const missingOptional = optionalNames.filter((name) => !foundOptional.has(normalize(name)));

    const manifest = {
        schemaVersion: 1,
        snapshot: {
            reviewedAt: "2026-08-22",
            pluginCount: pluginCandidates.length,
            pluginSha256: digest(plugins.raw),
            themeCount: themeCandidates.length,
            themeSha256: digest(themes.raw)
        },
        preset: {
            declaredCount: 36,
            namedCount: requestedPreset.length,
            matchedCount: found.size,
            names: requestedPreset,
            missingRequested,
            note: requestedPreset.length === 36 ? null : "The approved table names 37 feature plugins even though its prose says 36; no named feature is silently discarded."
        },
        optional: {
            declaredCount: optionalNames.length,
            matchedCount: foundOptional.size,
            names: optionalNames,
            missingOptional
        },
        candidates: [...pluginCandidates, ...themeCandidates]
    };

    fs.mkdirSync(path.dirname(output), {recursive: true});
    fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(`${pluginCandidates.length} plugins, ${themeCandidates.length} themes, ${found.size}/${requestedPreset.length} requested preset matches.\n`);
    if (missingRequested.length) process.stdout.write(`Missing requested names: ${missingRequested.join(", ")}\n`);
    if (missingOptional.length) process.stdout.write(`Missing optional names: ${missingOptional.join(", ")}\n`);
}

main();
