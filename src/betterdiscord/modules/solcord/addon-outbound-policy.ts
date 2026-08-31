// SPDX-License-Identifier: Apache-2.0

import crypto from "crypto";

export type CommunityAddonOutboundDisposition = "local-only" | "outbound" | "undeclared";

export interface CommunityAddonCatalogDeclaration {
    fileName: string;
    name?: string;
    sourceSha256: string | null;
    networkBehavior: readonly string[];
    dependencies?: readonly string[];
    verification?: {security?: string;};
}

export interface CommunityAddonPolicyInput {
    fileName: string;
    integrityMatched: boolean;
}

export interface CommunityAddonSourceInput {
    fileName: string;
    fileContent?: string;
    sourceSha256?: string;
}

export interface CommunityAddonPolicyDecision extends CommunityAddonPolicyInput {
    disposition: CommunityAddonOutboundDisposition;
    action: "keep" | "disable";
    reason: string;
}

const OUTBOUND_MARKERS = new Set(["fetch", "network-api", "xmlhttprequest", "websocket", "external-provider", "remote-request"]);
const LOCAL_ONLY_MARKERS = new Set(["no-static-network-signal", "local-only", "none"]);
const SHA256 = /^[0-9a-f]{64}$/;

function safeFileName(value: unknown): string | undefined {
    if (typeof value !== "string" || !/^[^\\/:*?"<>|]{1,120}\.plugin\.js$/i.test(value)) return;
    return value;
}

export function communityAddonSourceSha256(content: string): string {
    return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export function strictCommunityAddonActivationDecision(input: CommunityAddonSourceInput, catalog: readonly CommunityAddonCatalogDeclaration[]): CommunityAddonPolicyDecision | undefined {
    const fileName = safeFileName(input.fileName);
    if (!fileName) return;
    const candidate = catalog.find(entry => entry.fileName.toLocaleLowerCase("en-US") === fileName.toLocaleLowerCase("en-US"));
    const sourceSha256 = typeof input.fileContent === "string"
        ? communityAddonSourceSha256(input.fileContent)
        : typeof input.sourceSha256 === "string" && SHA256.test(input.sourceSha256)
            ? input.sourceSha256
            : undefined;
    const decision = planStrictCommunityAddonPolicy([{
        fileName,
        integrityMatched: Boolean(candidate?.sourceSha256 && sourceSha256 === candidate.sourceSha256)
    }], catalog)[0];
    if (decision?.action !== "keep" || !candidate?.dependencies?.length) return decision;
    const dependencyIsApprovedLocalOnly = candidate.dependencies.every(name => {
        const dependency = catalog.find(entry => entry.name === name);
        if (!dependency?.sourceSha256 || dependency.verification?.security !== "STATIC_REVIEWED") return false;
        const behavior = dependency.networkBehavior.map(item => item.trim().toLowerCase()).filter(Boolean);
        return behavior.length > 0 && behavior.every(item => LOCAL_ONLY_MARKERS.has(item));
    });
    return dependencyIsApprovedLocalOnly ? decision : {
        ...decision,
        disposition: "undeclared",
        action: "disable",
        reason: "A required addon dependency lacks an approved local-only outbound declaration."
    };
}

export function classifyCommunityAddonOutbound(input: CommunityAddonPolicyInput, catalog: readonly CommunityAddonCatalogDeclaration[]): CommunityAddonOutboundDisposition {
    const fileName = safeFileName(input.fileName);
    if (!fileName || !input.integrityMatched) return "undeclared";
    const candidate = catalog.find(entry => entry.fileName.toLocaleLowerCase("en-US") === fileName.toLocaleLowerCase("en-US"));
    if (!candidate?.sourceSha256 || candidate.verification?.security !== "STATIC_REVIEWED") return "undeclared";
    const behavior = candidate.networkBehavior.map(item => item.trim().toLowerCase()).filter(Boolean);
    if (behavior.some(item => OUTBOUND_MARKERS.has(item))) return "outbound";
    if (behavior.length > 0 && behavior.every(item => LOCAL_ONLY_MARKERS.has(item))) return "local-only";
    return "undeclared";
}

export function planStrictCommunityAddonPolicy(inputs: readonly CommunityAddonPolicyInput[], catalog: readonly CommunityAddonCatalogDeclaration[]): CommunityAddonPolicyDecision[] {
    return inputs.flatMap(input => {
        const fileName = safeFileName(input.fileName);
        if (!fileName) return [];
        const disposition = classifyCommunityAddonOutbound({...input, fileName}, catalog);
        return [{
            fileName,
            integrityMatched: input.integrityMatched,
            disposition,
            action: disposition === "local-only" ? "keep" : "disable",
            reason: disposition === "local-only"
                ? "Exact reviewed bytes declare no outbound network surface."
                : disposition === "outbound"
                    ? "Reviewed source declares outbound access and requires separate approval."
                    : "Outbound behavior is undeclared or the installed bytes do not match the reviewed source."
        }];
    });
}
