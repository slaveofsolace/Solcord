import {afterEach, describe, expect, test} from "bun:test";
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {checkDocumentation, documentationAnchors, documentationLinks} from "../../scripts/check-docs";

const fixtures: string[] = [];

function fixture(files: Record<string, string>): string {
    const root = mkdtempSync(path.join(tmpdir(), "solcord-doc-links-"));
    fixtures.push(root);
    for (const [file, content] of Object.entries(files)) {
        const target = path.join(root, file);
        mkdirSync(path.dirname(target), {recursive: true});
        writeFileSync(target, content);
    }
    return root;
}

afterEach(() => {
    for (const root of fixtures.splice(0)) {
        if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith("solcord-doc-links-")) throw new Error("Unexpected documentation fixture root");
        rmSync(root, {recursive: true, force: true});
    }
});

describe("documentation links", () => {
    test("checks Markdown, reference, image, and HTML destinations without reading examples", () => {
        const source = "[Install](docs/install.md)\n![Mark](assets/mark.svg)\n[guide]: docs/guide.md\n<a href=\"docs/help.md\">Help</a>\n`[example](missing.md)`\n```md\n[example](missing.md)\n```\n<!-- [old](missing.md) -->";
        expect(documentationLinks(source).map(link => link.target)).toEqual(["docs/install.md", "assets/mark.svg", "docs/guide.md", "docs/help.md"]);
    });

    test("supports encoded paths, duplicate headings, and explicit anchors", () => {
        const root = fixture({"README.md": "[Install](docs/Quick%20start.md#install-1)\n[Recovery](docs/Quick%20start.md#recovery)", "docs/Quick start.md": "# Install\n# Install\n<a id=\"recovery\"></a>"});
        expect(checkDocumentation(root, ["README.md"]).issues).toEqual([]);
        expect(documentationAnchors("# Install\n# Install\n# Install-1")).toEqual(new Set(["install", "install-1", "install-1-1"]));
        expect(documentationAnchors("## Run `bun test`\n")).toEqual(new Set(["run-bun-test"]));
    });

    test("reports missing files and headings at their source lines", () => {
        const root = fixture({"README.md": "# Solcord\n[Missing](missing.md)\n[Wrong heading](docs/guide.md#missing)", "docs/guide.md": "# Guide"});
        expect(checkDocumentation(root, ["README.md"]).issues.map(({line, reason}) => ({line, reason}))).toEqual([
            {line: 2, reason: "target does not exist"},
            {line: 3, reason: "heading or anchor does not exist"}
        ]);
    });

    test("refuses traversal and malformed encodings without opening external targets", () => {
        const root = fixture({"README.md": "[Escape](../private.md)\n[Invalid](bad%ZZ.md)\n[Local](file:///private.md)\n[Remote](https://example.invalid/guide)"});
        const result = checkDocumentation(root, ["README.md"]);
        expect(result.links).toBe(3);
        expect(result.issues).toHaveLength(3);
        expect(result.issues[0].reason).toBe("link leaves the repository");
        expect(result.issues[2].reason).toBe("unsupported local link scheme");
    });
});
