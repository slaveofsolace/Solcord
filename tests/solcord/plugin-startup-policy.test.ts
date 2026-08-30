import {describe, expect, test} from "bun:test";
import fs from "node:fs";
import path from "node:path";

import {bdfdbRequiredByEnabledAddon, pluginRuntimeHookRequirements} from "../../src/betterdiscord/modules/solcord/plugin-startup-policy";
import {communityAddonSourceSha256, strictCommunityAddonActivationDecision} from "../../src/betterdiscord/modules/solcord/addon-outbound-policy";

const ROOT = path.resolve(import.meta.dir, "../..");

describe("Solcord plugin startup policy", () => {
    test("loads BDFDB only when an enabled plugin declares the runtime dependency", () => {
        const addons = [
            {id: "BDFDB", filename: "0BDFDB.plugin.js", fileContent: "library"},
            {id: "Local", filename: "Local.plugin.js", fileContent: "class Local {}"},
            {id: "Consumer", filename: "Consumer.plugin.js", fileContent: "window.BDFDB_Global?.loaded"}
        ];
        expect(bdfdbRequiredByEnabledAddon(addons, {})).toBeFalse();
        expect(bdfdbRequiredByEnabledAddon(addons, {Local: true})).toBeFalse();
        expect(bdfdbRequiredByEnabledAddon(addons, {Consumer: true})).toBeTrue();
    });

    test("requests browser-wide hooks only for enabled plugin contracts", () => {
        const addons = [
            {id: "Plain", filename: "Plain.plugin.js", instance: {}},
            {id: "DOM", filename: "DOM.plugin.js", instance: {observer() {}}},
            {id: "Route", filename: "Route.plugin.js", instance: {onSwitch() {}}}
        ];
        expect(pluginRuntimeHookRequirements(addons, {})).toEqual({mutationObserver: false, navigationListener: false});
        expect(pluginRuntimeHookRequirements(addons, {Plain: true})).toEqual({mutationObserver: false, navigationListener: false});
        expect(pluginRuntimeHookRequirements(addons, {DOM: true})).toEqual({mutationObserver: true, navigationListener: false});
        expect(pluginRuntimeHookRequirements(addons, {Route: true})).toEqual({mutationObserver: false, navigationListener: true});
        expect(pluginRuntimeHookRequirements(addons, {DOM: true, Route: true})).toEqual({mutationObserver: true, navigationListener: true});
    });

    test("does not attach document-wide hooks while every plugin is disabled", () => {
        const source = fs.readFileSync(path.join(ROOT, "src/betterdiscord/modules/pluginmanager.ts"), "utf8");
        const setupStart = source.indexOf("    setupFunctions() {");
        const setup = source.slice(setupStart, source.indexOf("    #refreshRuntimeHooks()", setupStart));
        expect(setup).not.toContain("this.observer.observe(document");
        expect(setup).not.toContain("Events.on(\"navigate\"");
        expect(setup).toContain("this.#refreshRuntimeHooks()");
        expect(source).toContain("pluginRuntimeHookRequirements(this.addonList, this.state)");
        expect(source).toContain("this.addonActivationDisposition(addon) === \"allowed\"");
        expect(source).toContain("Cleanup failed after an unsuccessful start; manual recovery is required before retrying.");
        expect(source).toContain("Cleanup failed while disabling this addon; manual recovery is required before retrying.");
        expect(source).toContain("this.observer.disconnect()");
        expect(source).toContain("Events.off(\"navigate\", this.onSwitch)");
    });

    test("allows only exact reviewed local-only bytes under Strict Privacy", () => {
        const content = "/** @name Local */\nmodule.exports = class Local {}";
        const catalog = [{
            name: "Local",
            fileName: "Local.plugin.js",
            sourceSha256: communityAddonSourceSha256(content),
            networkBehavior: ["local-only"],
            dependencies: [],
            verification: {security: "STATIC_REVIEWED"}
        }];
        expect(strictCommunityAddonActivationDecision({fileName: "Local.plugin.js", fileContent: content}, catalog)?.action).toBe("keep");
        expect(strictCommunityAddonActivationDecision({fileName: "Local.plugin.js", fileContent: `${content}\nchanged`}, catalog)?.action).toBe("disable");
        expect(strictCommunityAddonActivationDecision({fileName: "Unknown.plugin.js", fileContent: content}, catalog)?.action).toBe("disable");
    });

    test("rechecks live source bytes and blocks undeclared dependencies", () => {
        const content = "/** @name Consumer */\nmodule.exports = class Consumer {}";
        const reviewedHash = communityAddonSourceSha256(content);
        const catalog = [{
            name: "Consumer",
            fileName: "Consumer.plugin.js",
            sourceSha256: reviewedHash,
            networkBehavior: ["local-only"],
            dependencies: ["Library"],
            verification: {security: "STATIC_REVIEWED"}
        }, {
            name: "Library",
            fileName: "Library.plugin.js",
            sourceSha256: null,
            networkBehavior: ["CODE_REVIEW_REQUIRED"],
            dependencies: [],
            verification: {security: "PENDING"}
        }];
        expect(strictCommunityAddonActivationDecision({
            fileName: "Consumer.plugin.js",
            fileContent: `${content}\nchanged`,
            sourceSha256: reviewedHash
        }, catalog)?.action).toBe("disable");
        expect(strictCommunityAddonActivationDecision({fileName: "Consumer.plugin.js", fileContent: content}, catalog)?.reason).toContain("dependency");
    });
});
