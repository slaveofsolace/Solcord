// SPDX-License-Identifier: Apache-2.0

export function normalizePortableText(text) {
    if (typeof text !== "string") throw new TypeError("Text metrics require a string.");
    return text.replace(/\r\n?/g, "\n");
}

export function portableTextByteLength(text) {
    return Buffer.byteLength(normalizePortableText(text), "utf8");
}
