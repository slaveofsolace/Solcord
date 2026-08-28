// SPDX-License-Identifier: Apache-2.0

export function portableTextByteLength(text) {
    if (typeof text !== "string") throw new TypeError("Text metrics require a string.");
    return Buffer.byteLength(text.replace(/\r\n?/g, "\n"), "utf8");
}
