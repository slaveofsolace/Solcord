// SPDX-License-Identifier: Apache-2.0

import {afterEach, describe, expect, test} from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {publishGeneratedDirectory} from "../../scripts/helpers/publish-directory.mjs";

const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, {recursive: true, force: true});
});

function fixture(): {destination: string; source: string} {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "solcord-publish-test-"));
    roots.push(root);
    const destination = path.join(root, "candidate");
    const source = path.join(root, ".candidate.staging-fixture");
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, "receipt.txt"), "verified\n", {flag: "wx"});
    return {destination, source};
}

describe("installer directory publication", () => {
    test("retries a bounded transient Windows sharing failure without changing the bundle", async () => {
        const {destination, source} = fixture();
        let calls = 0;
        const waits: number[] = [];
        const result = await publishGeneratedDirectory(source, destination, {
            rename(from, to) {
                calls++;
                if (calls < 3) throw Object.assign(new Error("busy"), {code: "EPERM"});
                fs.renameSync(from, to);
            },
            wait(milliseconds) {
                waits.push(milliseconds);
                return Promise.resolve();
            }
        });

        expect(result).toEqual({attempts: 3});
        expect(waits).toEqual([55, 70]);
        expect(fs.readFileSync(path.join(destination, "receipt.txt"), "utf8")).toBe("verified\n");
        expect(fs.existsSync(source)).toBeFalse();
    });

    test("does not retry unrelated failures or replace an output created by another process", async () => {
        const first = fixture();
        let unrelatedCalls = 0;
        await expect(publishGeneratedDirectory(first.source, first.destination, {
            rename() {
                unrelatedCalls++;
                throw Object.assign(new Error("invalid"), {code: "EINVAL"});
            },
            wait: () => Promise.resolve()
        })).rejects.toThrow("invalid");
        expect(unrelatedCalls).toBe(1);

        const second = fixture();
        fs.mkdirSync(second.destination);
        await expect(publishGeneratedDirectory(second.source, second.destination, {
            wait: () => Promise.resolve()
        })).rejects.toThrow("appeared before publication completed");
        expect(fs.existsSync(second.source)).toBeTrue();
    });

    test("refuses a staging directory outside the destination parent and bounds retries", async () => {
        const {destination, source} = fixture();
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), "solcord-outside-stage-"));
        roots.push(outside);
        await expect(publishGeneratedDirectory(outside, destination)).rejects.toThrow("unexpected installer staging directory");
        await expect(publishGeneratedDirectory(source, destination, {attempts: 0})).rejects.toThrow("retry count is invalid");
    });
});
