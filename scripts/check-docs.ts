import {execFileSync} from "node:child_process";
import {existsSync, readFileSync, realpathSync, statSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

export interface DocumentationLink {target: string; line: number;}
export interface DocumentationIssue extends DocumentationLink {file: string; reason: string;}

function proseOnly(source: string, preserveInlineText = false): string {
    let fence: string | undefined;
    return source.split(/\r?\n/).map(line => {
        const marker = line.match(/^\s*(`{3,}|~{3,})/);
        if (marker && (!fence || (marker[1][0] === fence[0] && marker[1].length >= fence.length))) {
            fence = fence ? undefined : marker[1];
            return " ".repeat(line.length);
        }
        return fence ? " ".repeat(line.length) : line;
    }).join("\n").replace(/<!--[^]*?-->/g, text => text.replace(/[^\n]/g, " "))
        .replace(/(`+)[^\n]*?\1/g, text => preserveInlineText ? text.replace(/`/g, "") : " ".repeat(text.length));
}

export function documentationLinks(source: string): DocumentationLink[] {
    const prose = proseOnly(source);
    const patterns = [
        /!?\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(?:\s+["'][^\n]*?["'])?\s*\)/g,
        /^\s{0,3}\[[^\]\n]+\]:\s*(?:<([^>\n]+)>|(\S+))/gm,
        /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi
    ];
    return patterns.flatMap(pattern => [...prose.matchAll(pattern)].map(match => ({
        target: match[1] ?? match[2],
        line: prose.slice(0, match.index).split("\n").length
    })));
}

export function documentationAnchors(source: string): Set<string> {
    const prose = proseOnly(source, true);
    const anchors = new Set<string>();
    for (const match of prose.matchAll(/\b(?:id|name)\s*=\s*["']([^"']+)["']/gi)) anchors.add(match[1]);
    for (const match of prose.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
        const base = match[1].replace(/<[^>]*>/g, "").replace(/[^\p{L}\p{N}_\-\s]/gu, "").trim().toLowerCase().replace(/\s/g, "-");
        let anchor = base;
        for (let suffix = 1; anchors.has(anchor); suffix++) anchor = `${base}-${suffix}`;
        anchors.add(anchor);
    }
    return anchors;
}

function isWithin(root: string, target: string): boolean {
    const relative = path.relative(root, target);
    return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function checkDocumentation(root: string, files: string[]): {files: number; links: number; issues: DocumentationIssue[];} {
    const physicalRoot = realpathSync(root);
    const issues: DocumentationIssue[] = [];
    const anchorCache = new Map<string, Set<string>>();
    let links = 0;
    for (const file of files) {
        const sourcePath = path.resolve(physicalRoot, file);
        if (!isWithin(physicalRoot, sourcePath) || !isWithin(physicalRoot, realpathSync(sourcePath))) throw new Error(`Documentation source is outside the repository: ${file}`);
        for (const link of documentationLinks(readFileSync(sourcePath, "utf8"))) {
            if (/^(?:https?:|mailto:|tel:|\/\/)/i.test(link.target)) continue;
            links++;
            let reason: string | undefined;
            try {
                if (/^[a-z][a-z\d+.-]*:/i.test(link.target)) throw new Error("unsupported local link scheme");
                const hashIndex = link.target.indexOf("#");
                const location = hashIndex < 0 ? link.target : link.target.slice(0, hashIndex);
                const fragment = hashIndex < 0 ? "" : decodeURIComponent(link.target.slice(hashIndex + 1));
                const name = decodeURIComponent(location.split("?")[0]);
                const target = name ? path.resolve(path.dirname(sourcePath), name) : sourcePath;
                if (!isWithin(physicalRoot, target)) throw new Error("link leaves the repository");
                if (!existsSync(target)) throw new Error("target does not exist");
                if (!isWithin(physicalRoot, realpathSync(target))) throw new Error("linked target leaves the repository");
                if (fragment && /\.md$/i.test(target) && statSync(target).isFile()) {
                    if (!anchorCache.has(target)) anchorCache.set(target, documentationAnchors(readFileSync(target, "utf8")));
                    if (!anchorCache.get(target)!.has(fragment)) throw new Error("heading or anchor does not exist");
                }
            }
            catch (error) {reason = error instanceof Error ? error.message : "invalid link";}
            if (reason) issues.push({file, ...link, reason});
        }
    }
    return {files: files.length, links, issues};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const root = process.cwd();
    const files = [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {cwd: root, encoding: "utf8"})
        .split("\0").filter(file => /\.md$/i.test(file) && existsSync(path.resolve(root, file))))].sort();
    const result = checkDocumentation(root, files);
    for (const issue of result.issues) console.error(`${issue.file}:${issue.line}: ${issue.target} — ${issue.reason}`);
    console.log(`Documentation: ${result.files} files, ${result.links} local links, ${result.issues.length} broken.`);
    if (result.issues.length) process.exitCode = 1;
}
