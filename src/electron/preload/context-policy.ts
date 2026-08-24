// SPDX-License-Identifier: Apache-2.0

export type SoulCordPreloadExposureReason =
    | "trusted-main-frame"
    | "embedded-frame"
    | "untrusted-origin";

export interface SoulCordPreloadContextFacts {
    protocol: unknown;
    hostname: unknown;
    port?: unknown;
    isMainFrame: unknown;
}

export interface SoulCordPreloadExposureDecision {
    exposeSoulCord: boolean;
    reason: SoulCordPreloadExposureReason;
}

const TRUSTED_DISCORD_HOSTS = new Set([
    "discord.com",
    "discordapp.com",
    "canary.discord.com",
    "canary.discordapp.com",
    "ptb.discord.com",
    "ptb.discordapp.com"
]);

/**
 * SoulCord's context-bridge objects are only installed into a verified top-level
 * Discord document. Discord's own preload is still chained when this decision is
 * negative, so embedded Activities retain unmodified Discord behavior.
 */
export function evaluateSoulCordPreloadExposure(facts: SoulCordPreloadContextFacts): SoulCordPreloadExposureDecision {
    if (facts.isMainFrame !== true) return {exposeSoulCord: false, reason: "embedded-frame"};
    if (facts.protocol !== "https:"
        || typeof facts.hostname !== "string"
        || !TRUSTED_DISCORD_HOSTS.has(facts.hostname.toLocaleLowerCase("en-US"))
        || (facts.port !== undefined && facts.port !== "")) {
        return {exposeSoulCord: false, reason: "untrusted-origin"};
    }
    return {exposeSoulCord: true, reason: "trusted-main-frame"};
}
