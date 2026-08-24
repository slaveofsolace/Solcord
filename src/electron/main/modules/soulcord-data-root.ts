// SPDX-License-Identifier: Apache-2.0

import fs from "fs";
import path from "path";

import {isSoulCordAcceptanceMode, SOULCORD_ACCEPTANCE_ROOT_ENV} from "@common/soulcord/acceptance-mode";


type PathImplementation = Pick<typeof path.win32, "dirname" | "isAbsolute" | "join" | "normalize" | "parse" | "relative" | "sep">;

function pathImplementation(value: string): PathImplementation {
    if (/^(?:[a-zA-Z]:[\\/]|\\\\)/.test(value)) return path.win32;
    if (path.posix.isAbsolute(value)) return path.posix;
    throw new TypeError("SoulCord user-data path must be absolute.");
}

function lstatIfPresent(target: string): fs.Stats | undefined {
    try {return fs.lstatSync(target);}
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
    }
}

function isOutside(implementation: PathImplementation, root: string, target: string): boolean {
    const relative = implementation.relative(root, target);
    return relative === ".." || relative.startsWith(`..${implementation.sep}`) || implementation.isAbsolute(relative);
}

/**
 * Re-check the existing disposable tree immediately before callers derive paths they mutate.
 * Lexical containment alone is insufficient when an ancestor has become a junction/reparse
 * point. Nonexistent descendants are safe to create only after their deepest existing parent
 * has been proven to resolve inside the canonical acceptance root.
 */
function assertCanonicalAcceptanceContainment(
    acceptanceRoot: string,
    target: string,
    implementation: PathImplementation
): void {
    const targetParent = implementation.dirname(target);
    if (!lstatIfPresent(acceptanceRoot) && !lstatIfPresent(targetParent)) return;

    const rootStat = lstatIfPresent(acceptanceRoot);
    if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) {
        throw new TypeError("SoulCord acceptance root must be an existing directory without a junction or reparse point.");
    }
    const canonicalRoot = fs.realpathSync.native(acceptanceRoot);

    const relative = implementation.relative(acceptanceRoot, target);
    let current = acceptanceRoot;
    for (const component of relative.split(/[\\/]+/).filter(Boolean)) {
        current = implementation.join(current, component);
        const stat = lstatIfPresent(current);
        if (!stat) break;
        if (stat.isSymbolicLink()) {
            throw new TypeError("SoulCord disposable data path crosses a junction or reparse point.");
        }
        const canonical = fs.realpathSync.native(current);
        if (isOutside(implementation, canonicalRoot, canonical)) {
            throw new TypeError("SoulCord disposable data path resolves outside the canonical acceptance root.");
        }
    }
}

/**
 * BetterDiscord-compatible data lives beside Discord's userData directory.
 * Deriving from userData, rather than the process-wide appData directory,
 * keeps disposable Discord profiles and their SoulCord state in one root.
 */
export function resolveSoulCordBetterDiscordRoot(
    userDataPath: string,
    environment: Readonly<Record<string, string | undefined>> = process.env
): string {
    if (typeof userDataPath !== "string" || userDataPath.trim().length === 0 || userDataPath.includes("\0")) {
        throw new TypeError("SoulCord user-data path is invalid.");
    }

    const implementation = pathImplementation(userDataPath);
    if (!implementation.isAbsolute(userDataPath)) throw new TypeError("SoulCord user-data path must be absolute.");
    const normalized = implementation.normalize(userDataPath);
    if (normalized === implementation.parse(normalized).root) throw new TypeError("SoulCord user-data path cannot be a filesystem root.");

    const parent = implementation.dirname(normalized);
    if (parent === normalized) throw new TypeError("SoulCord user-data path has no safe parent.");
    const betterDiscordRoot = implementation.join(parent, "BetterDiscord");

    if (isSoulCordAcceptanceMode(environment)) {
        const acceptanceRootValue = environment[SOULCORD_ACCEPTANCE_ROOT_ENV];
        if (!acceptanceRootValue || acceptanceRootValue.includes("\0")) throw new TypeError("SoulCord acceptance root is missing or invalid.");
        const acceptanceImplementation = pathImplementation(acceptanceRootValue);
        if (acceptanceImplementation !== implementation || !implementation.isAbsolute(acceptanceRootValue)) {
            throw new TypeError("SoulCord acceptance and user-data paths use incompatible roots.");
        }
        const acceptanceRoot = implementation.normalize(acceptanceRootValue);
        if (acceptanceRoot === implementation.parse(acceptanceRoot).root) throw new TypeError("SoulCord acceptance root cannot be a filesystem root.");
        const relative = implementation.relative(acceptanceRoot, betterDiscordRoot);
        if (!relative || relative === ".." || relative.startsWith(`..${implementation.sep}`) || implementation.isAbsolute(relative)) {
            throw new TypeError("SoulCord data root escapes the disposable acceptance root.");
        }
        assertCanonicalAcceptanceContainment(acceptanceRoot, betterDiscordRoot, implementation);
    }

    return betterDiscordRoot;
}
