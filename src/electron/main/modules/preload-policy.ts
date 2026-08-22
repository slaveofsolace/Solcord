import path from "node:path";


export type PreloadPathFlavor = "win32" | "posix";

export type PreloadPolicyReason =
    | "accepted-same-package"
    | "invalid-original"
    | "invalid-candidate"
    | "invalid-discord-root"
    | "mixed-path-flavor"
    | "untrusted-original"
    | "different-package"
    | "assignment-limit"
    | "unsupported-extension"
    | "canonicalization-failed"
    | "canonical-root-mismatch";

export interface PreloadPolicyDecision {
    accepted: boolean;
    reason: PreloadPolicyReason;
    candidateFile?: string;
    packageFile?: string;
}

export interface PreloadPolicyOptions {
    /** Discord's version directory captured from process.resourcesPath before injection. */
    discordTrustRoot: string;
    /**
     * Optional filesystem canonicalizer. Runtime callers use realpath on the package
     * boundary; tests inject a deterministic implementation. A supplied canonicalizer
     * must succeed for both roots or the policy fails closed.
     */
    canonicalizeRoot?: (root: string) => string | undefined;
}

interface NormalizedPath {
    flavor: PreloadPathFlavor;
    value: string;
    comparison: string;
}

const PRELOAD_EXTENSIONS = new Set([".js", ".cjs", ".mjs"]);
const WINDOWS_DEVICE_PREFIX = /^(?:\\\\[?.]\\|\\[?.]\\)/;

function hasTraversal(value: string, separator: RegExp): boolean {
    return value.split(separator).some(segment => segment === "." || segment === "..");
}

function detectFlavor(value: string): PreloadPathFlavor | undefined {
    if (/^[A-Za-z]:[\\/]/.test(value) || /^\\\\[^\\/]+[\\/][^\\/]+/.test(value)) return "win32";
    if (value.startsWith("/")) return "posix";
    return undefined;
}

function normalizeAbsolute(value: unknown): NormalizedPath | undefined {
    if (typeof value !== "string" || !value || value.includes("\0")) return undefined;
    const flavor = detectFlavor(value);
    if (!flavor) return undefined;

    if (flavor === "win32") {
        if (WINDOWS_DEVICE_PREFIX.test(value) || hasTraversal(value, /[\\/]+/)) return undefined;
        const normalized = path.win32.normalize(value.replaceAll("/", "\\"));
        if (!path.win32.isAbsolute(normalized)) return undefined;
        return {flavor, value: normalized, comparison: normalized.toLocaleLowerCase("en-US")};
    }

    if (value.includes("\\") || hasTraversal(value, /\/+?/)) return undefined;
    const normalized = path.posix.normalize(value);
    if (!path.posix.isAbsolute(normalized)) return undefined;
    return {flavor, value: normalized, comparison: normalized};
}

function pathApi(flavor: PreloadPathFlavor): typeof path.win32 | typeof path.posix {
    return flavor === "win32" ? path.win32 : path.posix;
}

function comparisonValue(value: string, flavor: PreloadPathFlavor): string {
    return flavor === "win32" ? value.toLocaleLowerCase("en-US") : value;
}

function packageBoundary(normalized: NormalizedPath): string {
    const api = pathApi(normalized.flavor);
    const parsed = api.parse(normalized.value);
    const remainder = normalized.value.slice(parsed.root.length);
    const segments = remainder.split(api.sep).filter(Boolean);
    const asarIndex = segments.findIndex(segment => segment.toLocaleLowerCase("en-US").endsWith(".asar"));
    if (asarIndex < 0) return api.dirname(normalized.value);
    return api.join(parsed.root, ...segments.slice(0, asarIndex + 1));
}

function relativeWithin(root: string, candidate: string, flavor: PreloadPathFlavor): boolean {
    const api = pathApi(flavor);
    const relative = api.relative(root, candidate);
    return relative === "" || (!relative.startsWith(`..${api.sep}`) && relative !== ".." && !api.isAbsolute(relative));
}

function canonicalizePair(
    left: string,
    right: string,
    flavor: PreloadPathFlavor,
    canonicalize?: (root: string) => string | undefined
): {left: string; right: string;} | undefined {
    if (!canonicalize) return {left, right};
    const canonicalLeft = canonicalize(left);
    const canonicalRight = canonicalize(right);
    if (!canonicalLeft || !canonicalRight) return undefined;
    const normalizedLeft = normalizeAbsolute(canonicalLeft);
    const normalizedRight = normalizeAbsolute(canonicalRight);
    if (!normalizedLeft || !normalizedRight || normalizedLeft.flavor !== flavor || normalizedRight.flavor !== flavor) return undefined;
    return {left: normalizedLeft.value, right: normalizedRight.value};
}

export function preloadTrustRoot(value: unknown): string | undefined {
    const normalized = normalizeAbsolute(value);
    return normalized ? packageBoundary(normalized) : undefined;
}

export function isPathWithin(root: unknown, candidate: unknown): boolean {
    const normalizedRoot = normalizeAbsolute(root);
    const normalizedCandidate = normalizeAbsolute(candidate);
    if (!normalizedRoot || !normalizedCandidate || normalizedRoot.flavor !== normalizedCandidate.flavor) return false;
    return relativeWithin(normalizedRoot.value, normalizedCandidate.value, normalizedRoot.flavor);
}

export function evaluateDiscordPreloadOverride(
    originalPreload: unknown,
    candidatePreload: unknown,
    options: PreloadPolicyOptions
): PreloadPolicyDecision {
    const original = normalizeAbsolute(originalPreload);
    if (!original) return {accepted: false, reason: "invalid-original"};
    const candidate = normalizeAbsolute(candidatePreload);
    if (!candidate) return {accepted: false, reason: "invalid-candidate"};
    const discordRoot = normalizeAbsolute(options.discordTrustRoot);
    if (!discordRoot) return {accepted: false, reason: "invalid-discord-root"};
    if (original.flavor !== candidate.flavor || original.flavor !== discordRoot.flavor) {
        return {accepted: false, reason: "mixed-path-flavor"};
    }

    const api = pathApi(original.flavor);
    const candidateFile = api.basename(candidate.value);
    const packageRoot = packageBoundary(original);
    const candidatePackageRoot = packageBoundary(candidate);
    const packageFile = api.basename(packageRoot);
    if (!PRELOAD_EXTENSIONS.has(api.extname(candidateFile).toLocaleLowerCase("en-US"))) {
        return {accepted: false, reason: "unsupported-extension", candidateFile, packageFile};
    }

    if (!relativeWithin(discordRoot.value, packageRoot, original.flavor)) {
        return {accepted: false, reason: "untrusted-original", candidateFile, packageFile};
    }
    if (comparisonValue(packageRoot, original.flavor) !== comparisonValue(candidatePackageRoot, original.flavor)) {
        return {accepted: false, reason: "different-package", candidateFile, packageFile};
    }

    const canonicalPackage = canonicalizePair(packageRoot, candidatePackageRoot, original.flavor, options.canonicalizeRoot);
    const canonicalDiscord = canonicalizePair(discordRoot.value, packageRoot, original.flavor, options.canonicalizeRoot);
    if (!canonicalPackage || !canonicalDiscord) {
        return {accepted: false, reason: "canonicalization-failed", candidateFile, packageFile};
    }
    if (comparisonValue(canonicalPackage.left, original.flavor) !== comparisonValue(canonicalPackage.right, original.flavor)
        || !relativeWithin(canonicalDiscord.left, canonicalDiscord.right, original.flavor)) {
        return {accepted: false, reason: "canonical-root-mismatch", candidateFile, packageFile};
    }

    const isAsarPackage = api.basename(packageRoot).toLocaleLowerCase("en-US").endsWith(".asar");
    if (!isAsarPackage && options.canonicalizeRoot) {
        const canonicalFiles = canonicalizePair(original.value, candidate.value, original.flavor, options.canonicalizeRoot);
        if (!canonicalFiles) return {accepted: false, reason: "canonicalization-failed", candidateFile, packageFile};
        if (!relativeWithin(canonicalPackage.left, canonicalFiles.left, original.flavor)
            || !relativeWithin(canonicalPackage.left, canonicalFiles.right, original.flavor)) {
            return {accepted: false, reason: "canonical-root-mismatch", candidateFile, packageFile};
        }
    }

    return {accepted: true, reason: "accepted-same-package", candidateFile, packageFile};
}

export interface PreloadAssignmentResult extends PreloadPolicyDecision {
    action: "accepted-discord" | "accepted-unrestricted" | "duplicate" | "rejected";
}

export interface PreloadPropertyTarget {
    preload?: string;
}

export function installPreloadAssignmentPolicy(
    target: PreloadPropertyTarget,
    originalPreload: string,
    injectedPreload: string,
    options: PreloadPolicyOptions,
    allowUnrestricted: () => boolean,
    onDecision: (result: PreloadAssignmentResult, unrestricted: boolean) => void = () => {}
): PreloadAssignmentGuard {
    const guard = new PreloadAssignmentGuard(originalPreload, injectedPreload, options);
    target.preload = injectedPreload;
    Object.defineProperty(target, "preload", {
        configurable: false,
        enumerable: true,
        get: () => guard.value,
        set(candidate: unknown) {
            const unrestricted = allowUnrestricted() === true;
            const result = guard.assign(candidate, unrestricted);
            onDecision(result, unrestricted);
        }
    });
    return guard;
}

/** Owns one BrowserWindow options object and permits at most one policy-scoped late assignment. */
export class PreloadAssignmentGuard {
    #value: string;
    #acceptedDiscordAssignment = false;

    constructor(
        readonly originalPreload: string,
        injectedPreload: string,
        readonly options: PreloadPolicyOptions
    ) {
        this.#value = injectedPreload;
    }

    get value(): string {
        return this.#value;
    }

    assign(candidate: unknown, allowUnrestricted: boolean): PreloadAssignmentResult {
        if (typeof candidate === "string" && candidate === this.#value) {
            return {accepted: true, action: "duplicate", reason: "accepted-same-package"};
        }
        if (allowUnrestricted && typeof candidate === "string" && candidate.length > 0) {
            this.#value = candidate;
            return {accepted: true, action: "accepted-unrestricted", reason: "accepted-same-package"};
        }
        if (this.#acceptedDiscordAssignment) {
            const decision = evaluateDiscordPreloadOverride(this.originalPreload, candidate, this.options);
            return {...decision, accepted: false, action: "rejected", reason: decision.accepted ? "assignment-limit" : decision.reason};
        }

        const decision = evaluateDiscordPreloadOverride(this.originalPreload, candidate, this.options);
        if (!decision.accepted || typeof candidate !== "string") return {...decision, action: "rejected"};
        this.#acceptedDiscordAssignment = true;
        this.#value = candidate;
        return {...decision, action: "accepted-discord"};
    }
}
