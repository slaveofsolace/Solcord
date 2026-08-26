// SPDX-License-Identifier: Apache-2.0

export interface SolcordAttachmentInspection {
    valid: boolean;
    host?: string;
    filename?: string;
    extension?: string;
    declaredMime?: string;
    risk: "ordinary" | "review" | "block";
    reasons: string[];
}

const EXECUTABLE_EXTENSIONS = new Set(["bat", "cmd", "com", "cpl", "exe", "hta", "js", "jse", "lnk", "msi", "msp", "ps1", "reg", "scr", "vbe", "vbs", "wsf"]);
const ARCHIVE_EXTENSIONS = new Set(["7z", "cab", "gz", "img", "iso", "rar", "tar", "zip"]);
const SAFE_MIME_BY_EXTENSION: Record<string, readonly string[]> = {
    pdf: ["application/pdf"],
    png: ["image/png"],
    jpg: ["image/jpeg"],
    jpeg: ["image/jpeg"],
    webp: ["image/webp"],
    gif: ["image/gif"],
    mp3: ["audio/mpeg"],
    mp4: ["video/mp4"],
    webm: ["video/webm"],
    txt: ["text/plain"]
};

function stripControlCharacters(value: string): string {
    return [...value].filter(character => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint >= 32 && codePoint !== 127;
    }).join("");
}

export function inspectSolcordAttachment(input: string, declaredMime?: string): SolcordAttachmentInspection {
    let url: URL;
    try {url = new URL(input);}
    catch {return {valid: false, risk: "block", reasons: ["The attachment URL is malformed."]};}
    if (url.protocol !== "https:") return {valid: false, risk: "block", reasons: ["Attachments require HTTPS."]};
    let filename = "";
    try {filename = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");}
    catch {return {valid: false, host: url.hostname.toLowerCase(), risk: "block", reasons: ["The filename encoding is malformed."]};}
    filename = stripControlCharacters(filename).slice(0, 260);
    if (!filename) return {valid: false, host: url.hostname.toLowerCase(), risk: "block", reasons: ["The attachment has no visible filename."]};
    const reasons: string[] = [];
    const windowsNormalized = filename.replace(/[ .]+$/g, "");
    if (windowsNormalized !== filename) reasons.push("Windows ignores trailing spaces and periods in this filename");
    filename = windowsNormalized;
    if (!filename) return {valid: false, host: url.hostname.toLowerCase(), risk: "block", reasons: ["The attachment filename becomes empty after Windows normalization."]};
    const extension = filename.includes(".") ? filename.split(".").at(-1)!.toLowerCase() : "";
    const mime = typeof declaredMime === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(declaredMime.trim()) ? declaredMime.trim().toLowerCase() : undefined;
    let risk: SolcordAttachmentInspection["risk"] = reasons.length ? "review" : "ordinary";
    if (/[\u202A-\u202E\u2066-\u2069]/u.test(filename)) {risk = "block"; reasons.push("Bidirectional filename control character");}
    if (EXECUTABLE_EXTENSIONS.has(extension)) {risk = "block"; reasons.push(`Executable or script extension .${extension}`);}
    else if (ARCHIVE_EXTENSIONS.has(extension)) {risk = "review"; reasons.push(`Archive or disk-image extension .${extension}`);}
    if (filename.split(".").length > 2 && EXECUTABLE_EXTENSIONS.has(extension)) reasons.push("Double-extension filename");
    const expected = SAFE_MIME_BY_EXTENSION[extension];
    if (mime && expected && !expected.includes(mime)) {if (risk === "ordinary") risk = "review"; reasons.push(`Declared MIME ${mime} does not match .${extension}`);}
    if (!extension) {risk = "review"; reasons.push("No filename extension");}
    else if (!EXECUTABLE_EXTENSIONS.has(extension) && !ARCHIVE_EXTENSIONS.has(extension) && !Object.hasOwn(SAFE_MIME_BY_EXTENSION, extension)) {
        risk = "review";
        reasons.push(`Unrecognized extension .${extension}`);
    }
    return {valid: true, host: url.hostname.toLowerCase(), filename, extension: extension || undefined, declaredMime: mime, risk, reasons};
}
