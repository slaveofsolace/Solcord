// SPDX-License-Identifier: Apache-2.0

import fs from "fs";
import os from "os";
import path from "path";
import {afterEach, describe, expect, test} from "bun:test";

import {resolveSoulCordBetterDiscordRoot} from "../../src/electron/main/modules/soulcord-data-root";
import {isSoulCordAcceptanceMode} from "../../src/common/soulcord/acceptance-mode";


const temporaryRoots: string[] = [];
const temporaryLinks: string[] = [];

function temporaryRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "soulcord-data-root-"));
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
        if (!resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`) || !path.basename(resolved).startsWith("soulcord-data-root-")) {
            throw new Error("Refusing unsafe SoulCord data-root test cleanup.");
        }
        fs.rmSync(resolved, {recursive: true, force: true});
    }
});


describe("SoulCord BetterDiscord data-root isolation", () => {
    test("derives the BetterDiscord root beside Windows Discord user data", () => {
        expect(resolveSoulCordBetterDiscordRoot("C:\\Users\\owner\\AppData\\Roaming\\Discord"))
            .toBe("C:\\Users\\owner\\AppData\\Roaming\\BetterDiscord");
        expect(resolveSoulCordBetterDiscordRoot("c:/isolated/Discord-Acceptance/"))
            .toBe("c:\\isolated\\BetterDiscord");
    });

    test("keeps owner and disposable roots disjoint", () => {
        const owner = resolveSoulCordBetterDiscordRoot("C:\\Users\\owner\\AppData\\Roaming\\Discord");
        const disposable = resolveSoulCordBetterDiscordRoot("C:\\SoulCord-Acceptance\\Roaming\\Discord");

        expect(disposable).not.toBe(owner);
        expect(path.win32.relative(owner, disposable).startsWith("..")).toBeTrue();
        expect(path.win32.relative(disposable, owner).startsWith("..")).toBeTrue();
    });

    test("supports POSIX installations without weakening path validation", () => {
        expect(resolveSoulCordBetterDiscordRoot("/home/owner/.config/discord"))
            .toBe("/home/owner/.config/BetterDiscord");
    });

    test("rejects blank, relative, root, and NUL-containing paths", () => {
        for (const value of ["", "   ", "Discord", "C:\\", "/", "C:\\Discord\0escape"]) {
            expect(() => resolveSoulCordBetterDiscordRoot(value)).toThrow();
        }
    });

    test("acceptance mode requires and confines the declared root", () => {
        const environment = {SOULCORD_ACCEPTANCE_MODE: "1", SOULCORD_ACCEPTANCE_ROOT: "C:\\SoulCord-Acceptance"};
        expect(resolveSoulCordBetterDiscordRoot("C:\\SoulCord-Acceptance\\DiscordUserData\\discord", environment))
            .toBe("C:\\SoulCord-Acceptance\\DiscordUserData\\BetterDiscord");

        for (const invalid of [
            {SOULCORD_ACCEPTANCE_MODE: "1"},
            {SOULCORD_ACCEPTANCE_MODE: "1", SOULCORD_ACCEPTANCE_ROOT: "C:\\"},
            {SOULCORD_ACCEPTANCE_MODE: "1", SOULCORD_ACCEPTANCE_ROOT: "D:\\Other"}
        ]) expect(() => resolveSoulCordBetterDiscordRoot("C:\\SoulCord-Acceptance\\DiscordUserData\\discord", invalid)).toThrow();
    });

    test("rejects a disposable data path whose existing ancestor is a junction escape", () => {
        const acceptanceRoot = temporaryRoot();
        const outside = temporaryRoot();
        const escapedParent = path.join(outside, "Roaming");
        fs.mkdirSync(path.join(escapedParent, "discord"), {recursive: true});
        const junction = path.join(acceptanceRoot, "profile");
        fs.symlinkSync(outside, junction, process.platform === "win32" ? "junction" : "dir");
        temporaryLinks.push(junction);

        const environment = {SOULCORD_ACCEPTANCE_MODE: "1", SOULCORD_ACCEPTANCE_ROOT: acceptanceRoot};
        expect(() => resolveSoulCordBetterDiscordRoot(path.join(junction, "Roaming", "discord"), environment)).toThrow(/junction|reparse|canonical/i);
        expect(fs.readdirSync(escapedParent)).toEqual(["discord"]);
    });

    test("accepts an existing canonical disposable tree inside its declared root", () => {
        const acceptanceRoot = temporaryRoot();
        const userData = path.join(acceptanceRoot, "profile", "Roaming", "discord");
        fs.mkdirSync(userData, {recursive: true});
        const environment = {SOULCORD_ACCEPTANCE_MODE: "1", SOULCORD_ACCEPTANCE_ROOT: acceptanceRoot};

        expect(resolveSoulCordBetterDiscordRoot(userData, environment))
            .toBe(path.join(acceptanceRoot, "profile", "Roaming", "BetterDiscord"));
    });

    test("enables acceptance mode only for the exact opt-in value", () => {
        expect(isSoulCordAcceptanceMode({SOULCORD_ACCEPTANCE_MODE: "1"})).toBeTrue();
        for (const value of [undefined, "", "0", "true", "yes"]) {
            expect(isSoulCordAcceptanceMode({SOULCORD_ACCEPTANCE_MODE: value})).toBeFalse();
        }
    });
});
