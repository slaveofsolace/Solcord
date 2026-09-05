// SPDX-License-Identifier: Apache-2.0

import {spawn, type StdioOptions} from "node:child_process";
import {readdirSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function testBatches(directory = root) {
    const files = readdirSync(resolve(directory, "tests"), {recursive: true})
        .filter((file): file is string => typeof file === "string" && /\.test\.tsx?$/.test(file))
        .map(file => `tests/${file.replaceAll("\\", "/")}`).sort();
    const provenance = "tests/solcord/build-provenance.test.ts";
    if (!files.includes(provenance)) throw new Error("The build-provenance regression suite is missing.");
    // Git/ASAR integration gets a fresh runtime. Bun's full isolated Linux
    // run has stalled before its first test while the same suite passes alone.
    return [[provenance], files.filter(file => file !== provenance)];
}

export function runTestBatch(executable: string, args: string[], {cwd = root, timeoutMs = 120_000, stdio = "inherit"}: {cwd?: string; timeoutMs?: number; stdio?: StdioOptions;} = {}): Promise<{code: number | null; signal: NodeJS.Signals | null; timedOut: boolean;}> {
    return new Promise((resolveResult, reject) => {
        const child = spawn(executable, args, {cwd, stdio, windowsHide: true, detached: process.platform !== "win32"});
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            // Only the process (or POSIX process group) created above is owned.
            try {
                if (process.platform === "win32") child.kill("SIGKILL");
                else if (child.pid) process.kill(-child.pid, "SIGKILL");
            }
            catch (error) {if ((error as NodeJS.ErrnoException).code !== "ESRCH") reject(error);}
        }, timeoutMs);
        child.once("error", error => {clearTimeout(timer); reject(error);});
        child.once("close", (code, signal) => {
            clearTimeout(timer);
            resolveResult({code, signal, timedOut});
        });
    });
}

if (import.meta.main) {
    for (const [index, files] of testBatches().entries()) {
        console.log(`Test batch ${index + 1}: ${files.length} file(s), isolated runtime, 120-second limit.`);
        const result = await runTestBatch(process.execPath, ["test", "--isolate", ...files]);
        if (result.timedOut || result.code !== 0) {
            console.error(result.timedOut ? "Test batch timed out; no automatic retry or skipped tests." : `Test batch failed (${result.code ?? result.signal}).`);
            process.exitCode = 1;
            break;
        }
    }
}
