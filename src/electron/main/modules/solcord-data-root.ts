// SPDX-License-Identifier: Apache-2.0

import fs from "fs";
import path from "path";

import {isSolcordAcceptanceMode, SOLCORD_ACCEPTANCE_ROOT_ENV} from "@common/solcord/acceptance-mode";


type PathImplementation = Pick<typeof path.win32, "dirname" | "isAbsolute" | "join" | "normalize" | "parse" | "relative" | "sep">;
type FileSystemImplementation = {
    lstatSync(target: string): fs.Stats;
    realpathNative(target: string): string;
};

const defaultFileSystem: FileSystemImplementation = {
    lstatSync: target => fs.lstatSync(target),
    realpathNative: target => fs.realpathSync.native(target)
};

function pathImplementation(value: string): PathImplementation {
    if (/^(?:[a-zA-Z]:[\\/]|\\\\)/.test(value)) return path.win32;
    if (path.posix.isAbsolute(value)) return path.posix;
    throw new TypeError("Solcord user-data path must be absolute.");
}

function lstatIfPresent(target: string, fileSystem: FileSystemImplementation): fs.Stats | undefined {
    try {return fileSystem.lstatSync(target);}
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
    implementation: PathImplementation,
    fileSystem: FileSystemImplementation
): boolean {
    const targetParent = implementation.dirname(target);
    if (!lstatIfPresent(acceptanceRoot, fileSystem) && !lstatIfPresent(targetParent, fileSystem)) return false;

    const rootStat = lstatIfPresent(acceptanceRoot, fileSystem);
    if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) {
        throw new TypeError("Solcord acceptance root must be an existing directory without a junction or reparse point.");
    }
    const canonicalRoot = implementation.normalize(fileSystem.realpathNative(acceptanceRoot));

    // Windows may hand Electron a long path while the launcher environment retains
    // the equivalent 8.3 spelling (or vice versa). Walk to the deepest existing
    // target ancestor and compare physical paths so an alias cannot look like an
    // escape. Missing descendants are safe only beneath that proven ancestor.
    let deepestExisting = target;
    let deepestStat = lstatIfPresent(deepestExisting, fileSystem);
    while (!deepestStat) {
        const parent = implementation.dirname(deepestExisting);
        if (parent === deepestExisting) {
            throw new TypeError("Solcord disposable data path has no existing canonical ancestor.");
        }
        deepestExisting = parent;
        deepestStat = lstatIfPresent(deepestExisting, fileSystem);
    }
    if (deepestStat.isSymbolicLink()) {
        throw new TypeError("Solcord disposable data path crosses a junction or reparse point.");
    }
    const canonicalExisting = implementation.normalize(fileSystem.realpathNative(deepestExisting));
    if (isOutside(implementation, canonicalRoot, canonicalExisting)) {
        throw new TypeError("Solcord disposable data path resolves outside the canonical acceptance root.");
    }
    return true;
}

/**
 * BetterDiscord-compatible data lives beside Discord's userData directory.
 * Deriving from userData, rather than the process-wide appData directory,
 * keeps disposable Discord profiles and their Solcord state in one root.
 */
export function resolveSolcordBetterDiscordRoot(
    userDataPath: string,
    environment: Readonly<Record<string, string | undefined>> = process.env,
    fileSystem: FileSystemImplementation = defaultFileSystem
): string {
    if (typeof userDataPath !== "string" || userDataPath.trim().length === 0 || userDataPath.includes("\0")) {
        throw new TypeError("Solcord user-data path is invalid.");
    }

    const implementation = pathImplementation(userDataPath);
    if (!implementation.isAbsolute(userDataPath)) throw new TypeError("Solcord user-data path must be absolute.");
    const normalized = implementation.normalize(userDataPath);
    if (normalized === implementation.parse(normalized).root) throw new TypeError("Solcord user-data path cannot be a filesystem root.");

    const parent = implementation.dirname(normalized);
    if (parent === normalized) throw new TypeError("Solcord user-data path has no safe parent.");
    const betterDiscordRoot = implementation.join(parent, "BetterDiscord");

    if (isSolcordAcceptanceMode(environment)) {
        const acceptanceRootValue = environment[SOLCORD_ACCEPTANCE_ROOT_ENV];
        if (!acceptanceRootValue || acceptanceRootValue.includes("\0")) throw new TypeError("Solcord acceptance root is missing or invalid.");
        const acceptanceImplementation = pathImplementation(acceptanceRootValue);
        if (acceptanceImplementation !== implementation || !implementation.isAbsolute(acceptanceRootValue)) {
            throw new TypeError("Solcord acceptance and user-data paths use incompatible roots.");
        }
        const acceptanceRoot = implementation.normalize(acceptanceRootValue);
        if (acceptanceRoot === implementation.parse(acceptanceRoot).root) throw new TypeError("Solcord acceptance root cannot be a filesystem root.");
        const canonicalContainmentProven = assertCanonicalAcceptanceContainment(acceptanceRoot, betterDiscordRoot, implementation, fileSystem);
        if (!canonicalContainmentProven) {
            const relative = implementation.relative(acceptanceRoot, betterDiscordRoot);
            if (!relative || relative === ".." || relative.startsWith(`..${implementation.sep}`) || implementation.isAbsolute(relative)) {
                throw new TypeError("Solcord data root escapes the disposable acceptance root.");
            }
        }
    }

    return betterDiscordRoot;
}
