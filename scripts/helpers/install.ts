import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function digest(file: string): string {
    return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function stageReleaseArtifact(source: string, target: string): string {
    if (!path.isAbsolute(source) || !path.isAbsolute(target)) throw new TypeError("Release source and target must be absolute paths.");
    if (!fs.existsSync(source) || !fs.statSync(source).isFile() || fs.statSync(source).size === 0) throw new Error(`SoulCord release artifact is missing or empty: ${source}`);

    const sourceDigest = digest(source);
    const temporary = `${target}.${process.pid}.${Date.now().toString(36)}.tmp`;
    fs.mkdirSync(path.dirname(target), {recursive: true});
    try {
        fs.copyFileSync(source, temporary);
        const handle = fs.openSync(temporary, "r+");
        try {fs.fsyncSync(handle);}
        finally {fs.closeSync(handle);}
        if (digest(temporary) !== sourceDigest) throw new Error("Staged SoulCord artifact failed SHA-256 verification.");
        fs.renameSync(temporary, target);
        if (digest(target) !== sourceDigest) throw new Error("Installed SoulCord artifact failed SHA-256 verification.");
    }
    catch (error) {
        try {
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
        }
        catch {/* best-effort cleanup of the uniquely named staging file */}
        throw error;
    }
    return sourceDigest;
}
