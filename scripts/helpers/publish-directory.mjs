// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";

const RETRYABLE_WINDOWS_RENAME_ERRORS = new Set(["EACCES", "EBUSY", "EPERM"]);

const defaultWait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export async function publishGeneratedDirectory(source, destination, {
    attempts = 24,
    wait = defaultWait,
    rename = fs.renameSync
} = {}) {
    const resolvedSource = path.resolve(source);
    const resolvedDestination = path.resolve(destination);
    const parent = path.dirname(resolvedDestination);
    const expectedPrefix = `.${path.basename(resolvedDestination)}.staging-`;

    if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 60) {
        throw new TypeError("The publication retry count is invalid.");
    }
    if (path.dirname(resolvedSource) !== parent || !path.basename(resolvedSource).startsWith(expectedPrefix)) {
        throw new Error("Refusing to publish an unexpected installer staging directory.");
    }

    for (let attempt = 1; attempt <= attempts; attempt++) {
        if (fs.existsSync(resolvedDestination)) {
            throw new Error("The installer output directory appeared before publication completed.");
        }
        const entry = fs.lstatSync(resolvedSource);
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
            throw new Error("Refusing to publish a linked or invalid installer staging directory.");
        }

        try {
            rename(resolvedSource, resolvedDestination);
            return {attempts: attempt};
        }
        catch (error) {
            const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
            if (!RETRYABLE_WINDOWS_RENAME_ERRORS.has(code) || attempt === attempts) throw error;
            await wait(Math.min(250, 40 + attempt * 15));
        }
    }

    throw new Error("The installer output directory could not be published.");
}
