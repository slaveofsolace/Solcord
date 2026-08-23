#!/usr/bin/env node
"use strict";

const {mkdir, readFile} = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "assets", "branding", "soulcord-mark.svg");
const output = path.join(root, "assets", "branding", "icons");
const sizes = [16, 24, 32, 64, 256];

async function main() {
    const svg = await readFile(source);
    await mkdir(output, {recursive: true});
    await Promise.all(sizes.map((size) => sharp(svg, {density: 384})
        .resize(size, size, {fit: "contain", kernel: sharp.kernel.lanczos3})
        .png({compressionLevel: 9, palette: false})
        .toFile(path.join(output, `soulcord-mark-${size}.png`))));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
