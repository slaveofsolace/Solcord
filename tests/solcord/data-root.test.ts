// SPDX-License-Identifier: Apache-2.0

import fs from "fs";
import os from "os";
import path from "path";
import {afterEach, describe, expect, test} from "bun:test";

import {resolveSolcordBetterDiscordRoot} from "../../src/electron/main/modules/solcord-data-root";
import {isSolcordAcceptanceMode} from "../../src/common/solcord/acceptance-mode";


const temporaryRoots: string[] = [];
const temporaryLinks: string[] = [];

function temporaryRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "solcord-data-root-"));
    temporaryRoots.push(root);
    return root;
}

afterEach(() => {
    for (const link of temporaryLinks.splice(0)) {
        try {if (fs.lstatSync(link).isSymbolicLink()) fs.unlinkSync(link);}
        catch (error) {if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;}
    }
    for (const root of temporaryRoots.splice(0)) {
        const resolved = path.resolve(root);
        if (!resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`) || !path.basename(resolved).startsWith("solcord-data-root-")) {
            throw new Error("Refusing unsafe Solcord data-root test cleanup.");
        }
        fs.rmSync(resolved, {recursive: true, force: true});
    }
});


describe("Solcord BetterDiscord data-root isolation", () => {
    test("derives the BetterDiscord root beside Windows Discord user data", () => {
        expect(resolveSolcordBetterDiscordRoot("C:\\Users\\owner\\AppData\\Roaming\\Discord"))
            .toBe("C:\\Users\\owner\\AppData\\Roaming\\BetterDiscord");
        expect(resolveSolcordBetterDiscordRoot("c:/isolated/Discord-Acceptance/"))
            .toBe("c:\\isolated\\BetterDiscord");
    });

    test("keeps owner and disposable roots disjoint", () => {
        const owner = resolveSolcordBetterDiscordRoot("C:\\Users\\owner\\AppData\\Roaming\\Discord");
        const disposable = resolveSolcordBetterDiscordRoot("C:\\Solcord-Acceptance\\Roaming\\Discord");

        expect(disposable).not.toBe(owner);
        expect(path.win32.relative(owner, disposable).startsWith("..")).toBeTrue();
        expect(path.win32.relative(disposable, owner).startsWith("..")).toBeTrue();
    });

    test("supports POSIX installations without weakening path validation", () => {
        expect(resolveSolcordBetterDiscordRoot("/home/owner/.config/discord"))
            .toBe("/home/owner/.config/BetterDiscord");
    });

    test("rejects blank, relative, root, and NUL-containing paths", () => {
        for (const value of ["", "   ", "Discord", "C:\\", "/", "C:\\Discord\0escape"]) {
            expect(() => resolveSolcordBetterDiscordRoot(value)).toThrow();
        }
    });

    test("acceptance mode requires and confines the declared root", () => {
        const environment = {SOLCORD_ACCEPTANCE_MODE: "1", SOLCORD_ACCEPTANCE_ROOT: "C:\\Solcord-Acceptance"};
        expect(resolveSolcordBetterDiscordRoot("C:\\Solcord-Acceptance\\DiscordUserData\\discord", environment))
            .toBe("C:\\Solcord-Acceptance\\DiscordUserData\\BetterDiscord");

        for (const invalid of [
            {SOLCORD_ACCEPTANCE_MODE: "1"},
            {SOLCORD_ACCEPTANCE_MODE: "1", SOLCORD_ACCEPTANCE_ROOT: "C:\\"},
            {SOLCORD_ACCEPTANCE_MODE: "1", SOLCORD_ACCEPTANCE_ROOT: "D:\\Other"}
        ]) expect(() => resolveSolcordBetterDiscordRoot("C:\\Solcord-Acceptance\\DiscordUserData\\discord", invalid)).toThrow();
    });

    test("rejects a disposable data path whose existing ancestor is a junction escape", () => {
        const acceptanceRoot = temporaryRoot();
        const outside = temporaryRoot();
        const escapedParent = path.join(outside, "Roaming");
        fs.mkdirSync(path.join(escapedParent, "discord"), {recursive: true});
        const junction = path.join(acceptanceRoot, "profile");
        fs.symlinkSync(outside, junction, process.platform === "win32" ? "junction" : "dir");
        temporaryLinks.push(junction);

        const environment = {SOLCORD_ACCEPTANCE_MODE: "1", SOLCORD_ACCEPTANCE_ROOT: acceptanceRoot};
        expect(() => resolveSolcordBetterDiscordRoot(path.join(junction, "Roaming", "discord"), environment)).toThrow(/junction|reparse|canonical/i);
        expect(fs.readdirSync(escapedParent)).toEqual(["discord"]);
    });

    test("accepts an existing canonical disposable tree inside its declared root", () => {
        const acceptanceRoot = temporaryRoot();
        const userData = path.join(acceptanceRoot, "profile", "Roaming", "discord");
        fs.mkdirSync(userData, {recursive: true});
        const environment = {SOLCORD_ACCEPTANCE_MODE: "1", SOLCORD_ACCEPTANCE_ROOT: acceptanceRoot};

        expect(resolveSolcordBetterDiscordRoot(userData, environment))
            .toBe(path.join(acceptanceRoot, "profile", "Roaming", "BetterDiscord"));
    });

    test("accepts equivalent Windows short and long path spellings after canonical containment", () => {
        if (process.platform !== "win32") return;
        const acceptanceRoot = temporaryRoot();
        const userData = path.join(acceptanceRoot, "profile", "Roaming", "discord");
        fs.mkdirSync(userData, {recursive: true});
        fs.mkdirSync(path.join(acceptanceRoot, "profile", "Roaming", "BetterDiscord"));
        const rootAlias = path.join(path.dirname(acceptanceRoot), "SOLCOR~1");
        const canonical = (target: string) => path.win32.normalize(target).toLowerCase() === path.win32.normalize(rootAlias).toLowerCase()
            ? acceptanceRoot
            : target;
        const fileSystem = {
            lstatSync: (target: string) => fs.lstatSync(canonical(target)),
            realpathNative: (target: string) => fs.realpathSync.native(canonical(target))
        };
        const environment = {SOLCORD_ACCEPTANCE_MODE: "1", SOLCORD_ACCEPTANCE_ROOT: rootAlias};
        expect(resolveSolcordBetterDiscordRoot(userData, environment, fileSystem))
            .toBe(path.join(acceptanceRoot, "profile", "Roaming", "BetterDiscord"));
    });

    test("enables acceptance mode only for the exact opt-in value", () => {
        expect(isSolcordAcceptanceMode({SOLCORD_ACCEPTANCE_MODE: "1"})).toBeTrue();
        for (const value of [undefined, "", "0", "true", "yes"]) {
            expect(isSolcordAcceptanceMode({SOLCORD_ACCEPTANCE_MODE: value})).toBeFalse();
        }
    });
});
