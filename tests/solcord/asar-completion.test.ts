// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {Writable} from "node:stream";
import {finishSolcordAsar} from "../../scripts/helpers/finish-asar";

const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));

describe("ASAR write completion", () => {
    test("does not permit hashing while the final write is still pending", async () => {
        let completeWrite!: () => void;
        const stream = new Writable({
            write(_chunk, _encoding, callback) {callback();},
            final(callback) {completeWrite = callback;}
        });
        stream.end("archive bytes");
        let completed = false;
        const barrier = finishSolcordAsar(Promise.resolve(stream)).then(() => {completed = true;});
        await nextTurn();
        expect(completed).toBeFalse();
        expect(stream.writableFinished).toBeFalse();
        completeWrite();
        await barrier;
        expect(completed).toBeTrue();
        expect(stream.writableFinished).toBeTrue();
    });

    test("rejects a failed final write instead of publishing partial bytes", async () => {
        let completeWrite!: (error?: Error | null) => void;
        const stream = new Writable({final(callback) {completeWrite = callback;}});
        stream.end();
        const barrier = finishSolcordAsar(Promise.resolve(stream));
        await nextTurn();
        completeWrite(new Error("fixture disk write failed"));
        await expect(barrier).rejects.toThrow("fixture disk write failed");
    });

    test("propagates creation failure and accepts an already finished stream", async () => {
        await expect(finishSolcordAsar(Promise.reject(new Error("fixture archive creation failed")))).rejects.toThrow("fixture archive creation failed");
        const stream = new Writable({write(_chunk, _encoding, callback) {callback();}});
        stream.end("done");
        await nextTurn();
        await finishSolcordAsar(Promise.resolve(stream));
        expect(stream.writableFinished).toBeTrue();
    });
});
