import path from "path";
import fs from "fs";
import crypto from "crypto";
import asar from "@electron/asar";

import doSanityChecks from "./helpers/validate";
import buildPackage from "./helpers/package";


const dist = path.resolve(__dirname, "..", "dist");
const bundleFile = path.join(dist, "soulcord.asar");
const checksumsFile = path.join(dist, "checksums.txt");

const files = [
    "dist/main.js",
    "dist/package.json",
    "dist/preload.js",
    "dist/earlyRenderer.js",
    "dist/soulcord.js",
    "dist/editor/preload.js",
    "dist/editor/script.js",
    "dist/editor/index.html"
];

const makeHash = () => {
    const arr = Array<string>(files.length);

    for (let index = 0; index < files.length; index++) {
        const fp = files[index];

        const buffer = fs.readFileSync(fp);

        const sha256 = crypto.createHash("sha256").update(buffer).digest().toString("hex");

        arr[index] = `${sha256}  ${fp.slice(5)}`;
    }

    fs.writeFileSync(checksumsFile, `${arr.join("\n")}\n`);
    console.log(`    ✅ Successfully created checksums ${checksumsFile}`);
};

const makeBundle = async function () {
    console.log("");
    console.log("Generating bundle");
    await asar.createPackageFromFiles(dist, bundleFile, files);
    const bundleStats = fs.statSync(bundleFile);
    if (!bundleStats.isFile() || bundleStats.size === 0) throw new Error("The generated SoulCord asar is empty.");
    console.log(`    ✅ Successfully created bundle ${bundleFile}`);
    makeHash();
};

doSanityChecks(dist);
buildPackage(dist);
// cleanOldAsar();
await makeBundle();
