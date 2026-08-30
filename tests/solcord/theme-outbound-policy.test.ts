import {describe, expect, test} from "bun:test";
import fs from "node:fs";
import path from "node:path";

import {strictCommunityThemeActivationDecision} from "../../src/betterdiscord/modules/solcord/theme-outbound-policy";

const ROOT = path.resolve(import.meta.dir, "../..");

describe("Solcord Strict Privacy theme policy", () => {
    test("keeps ordinary local-only CSS and inert embedded assets", () => {
        const css = `
            .root { color: #eee; mask: url(#local-mask); }
            .icon { background: url("data:image/png;base64,iVBORw0KGgo="); }
            @font-face { font-family: Local; src: url(data:font/woff2;base64,d09GMg==); }
        `;
        expect(strictCommunityThemeActivationDecision({fileName: "Local.theme.css", fileContent: css}).action).toBe("keep");
    });

    test("blocks every network-capable CSS source form", () => {
        const blocked = [
            `@import url("https://example.com/theme.css");`,
            `@\\69 mport "https://example.com/theme.css";`,
            `.a { background: url(https://example.com/a.png); }`,
            `.a { background: u\\72 l("//example.com/a.png"); }`,
            `.a { background: url("./relative.png"); }`,
            `.a { background: image-set("https://example.com/a.png" 1x); }`,
            `.a { background: src("https://example.com/a.png"); }`,
            `.a { background: url("data:image/svg+xml,%3Csvg/%3E"); }`
        ];
        for (const css of blocked) expect(strictCommunityThemeActivationDecision({fileName: "Remote.theme.css", fileContent: css}).action).toBe("disable");
    });

    test("fails closed for malformed identity, missing source, and obfuscated URL arguments", () => {
        expect(strictCommunityThemeActivationDecision({fileName: "../Remote.theme.css", fileContent: ".a{}"}).action).toBe("disable");
        expect(strictCommunityThemeActivationDecision({fileName: "Remote.theme.css"}).action).toBe("disable");
        expect(strictCommunityThemeActivationDecision({fileName: "Remote.theme.css", fileContent: `.a { background: url(var(--remote)); }`}).action).toBe("disable");
    });

    test("gates theme startup and watcher reloads through the shared activation boundary", () => {
        const core = fs.readFileSync(path.join(ROOT, "src/betterdiscord/modules/core.ts"), "utf8");
        const manager = fs.readFileSync(path.join(ROOT, "src/betterdiscord/modules/thememanager.ts"), "utf8");
        const runtime = fs.readFileSync(path.join(ROOT, "src/betterdiscord/modules/solcord/runtime.ts"), "utf8");
        expect(core).toContain("ThemeManager.setAddonActivationGuard(theme => SolcordRuntime.canActivateCommunityTheme(theme))");
        expect(manager).toContain("if (!this.approveAddonActivation(theme)) return false;");
        expect(runtime).toContain("strictCommunityThemeActivationDecision({fileName: theme.filename");
        expect(runtime).toContain("StrictPrivacyThemeDisableFailed");
        expect(runtime).toContain("kind: \"theme\"");
    });
});
