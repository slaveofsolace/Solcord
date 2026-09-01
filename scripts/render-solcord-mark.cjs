#!/usr/bin/env node
"use strict";

const {access, mkdir, readFile, writeFile} = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "assets", "branding", "solcord-mark.svg");
const output = path.join(root, "assets", "branding", "icons");
const sizes = [16, 24, 32, 64, 256];

async function main() {
    const svg = await readFile(source);
    await mkdir(output, {recursive: true});
    let sharp;
    try {sharp = require("sharp");}
    catch {
        // Release checkouts already carry the reviewed PNG exports. Creating
        // the Windows ICO must not require an undeclared native dependency.
        await Promise.all(sizes.map((size) => access(path.join(output, `solcord-mark-${size}.png`))));
    }
    if (sharp) await Promise.all(sizes.map((size) => sharp(svg, {density: 384})
        .resize(size, size, {fit: "contain", kernel: sharp.kernel.lanczos3})
        .png({compressionLevel: 9, palette: false})
        .toFile(path.join(output, `solcord-mark-${size}.png`))));

    // Windows accepts a PNG-compressed 256px image inside an ICO container.
    // Keep the executable icon derived from the same reviewed vector master as
    // every other Solcord surface instead of maintaining a second brand asset.
    const png = await readFile(path.join(output, "solcord-mark-256.png"));
    const header = Buffer.alloc(22);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(1, 4);
    header.writeUInt8(0, 6);
    header.writeUInt8(0, 7);
    header.writeUInt8(0, 8);
    header.writeUInt8(0, 9);
    header.writeUInt16LE(1, 10);
    header.writeUInt16LE(32, 12);
    header.writeUInt32LE(png.length, 14);
    header.writeUInt32LE(header.length, 18);
    await writeFile(path.join(output, "solcord.ico"), Buffer.concat([header, png]));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
