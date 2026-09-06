// SPDX-License-Identifier: Apache-2.0

import {finished} from "node:stream/promises";

/** The ASAR API returns after end(), before the output stream necessarily finishes. */
export async function finishSolcordAsar(write: Promise<NodeJS.WritableStream>): Promise<void> {
    await finished(await write, {cleanup: true});
}
