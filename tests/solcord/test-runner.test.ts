// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {readdirSync} from "node:fs";
import {resolve} from "node:path";
import {runTestBatch, testBatches} from "../../scripts/run-tests";

describe("bounded test process ownership", () => {
    test("runs every test file exactly once and starts provenance in a fresh runtime", () => {
        const batches = testBatches();
        const expected = readdirSync(resolve(import.meta.dir, ".."), {recursive: true})
            .filter((file): file is string => typeof file === "string" && /\.test\.tsx?$/.test(file)).map(file => `tests/${file.replaceAll("\\", "/")}`).sort();
        expect(batches[0]).toEqual(["tests/solcord/build-provenance.test.ts"]);
        expect(batches.flat().sort()).toEqual(expected);
        expect(new Set(batches.flat()).size).toBe(expected.length);
    });

    test("propagates process success and failure", async () => {
        expect(await runTestBatch(process.execPath, ["-e", "process.exit(0)"], {stdio: "ignore"})).toMatchObject({code: 0, timedOut: false});
        expect(await runTestBatch(process.execPath, ["-e", "process.exit(7)"], {stdio: "ignore"})).toMatchObject({code: 7, timedOut: false});
    });

    test("terminates its exact stalled process and never reports a timeout as success", async () => {
        const result = await runTestBatch(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {timeoutMs: 500, stdio: "ignore"});
        expect(result.timedOut).toBe(true);
        expect(result.code === 0 && result.signal === null).toBe(false);
    });
});
