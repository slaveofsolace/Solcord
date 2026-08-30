import {afterEach, beforeEach, describe, expect, mock, test} from "bun:test";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

import {SOLCORD_RUNTIME_ADDONS, SOLCORD_RUNTIME_THEMES} from "../../src/common/solcord/addon-catalog.generated";
import {SOLCORD_V2_REPLACEMENT_MANIFEST} from "../../src/common/solcord/v2-replacement-manifest";


let appDataPath = "";
let encryptionAvailable = true;
let oversizedWrappedKey = false;

mock.module("electron", () => ({
    app: {getPath: (name: string) => name === "userData" ? path.join(appDataPath, "Discord") : appDataPath},
    net: {fetch: async () => {throw new Error("Unexpected network request in storage security test.");}},
    safeStorage: {
        isEncryptionAvailable: () => encryptionAvailable,
        encryptString: (value: string) => oversizedWrappedKey ? Buffer.alloc(9 * 1024, 1) : Buffer.from(`solcord-test:${value}`, "utf8"),
        decryptString: (value: Buffer) => {
            const decoded = value.toString("utf8");
            if (!decoded.startsWith("solcord-test:")) throw new Error("Invalid wrapped test key.");
            return decoded.slice("solcord-test:".length);
        }
    }
}));

const {SolcordSetupTransactions, isReviewedLegacySolcordTheme, validatePinnedSourceUrl} = await import("../../src/electron/main/modules/solcord-setup");
const {SolcordTimelineStorage} = await import("../../src/electron/main/modules/solcord-timeline");
const {SolcordFriendWatchStorage} = await import("../../src/electron/main/modules/solcord-friend-watch");
const {SolcordAudienceGuardStorage} = await import("../../src/electron/main/modules/solcord-audience-guard");
const {SolcordPeopleStateStorage} = await import("../../src/electron/main/modules/solcord-people-state");
const {SolcordTranslationCredentialStorage} = await import("../../src/electron/main/modules/solcord-translation-credentials");
const {SolcordLocalIdentityNotesStorage} = await import("../../src/electron/main/modules/solcord-local-identity-notes");
const {SolcordProviderArchive, hasCompiledSolcordV2Replacement} = await import("../../src/electron/main/modules/solcord-provider-archive");

const temporaryRoots: string[] = [];

const LEGACY_DEFAULT_THEME_FIXTURE = path.resolve(process.cwd(), "tests", "fixtures", "solcord-legacy-default.theme.css.b64");

function readLegacyDefaultThemeFixture(): string {
    const encoded = fs.readFileSync(LEGACY_DEFAULT_THEME_FIXTURE, "utf8").trim();
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    if (!decoded) throw new Error("Legacy theme compatibility fixture is empty.");
    return decoded;
}

function makeAppData(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "solcord-storage-security-"));
    temporaryRoots.push(root);
    return root;
}

function timelineEvent(overrides: Record<string, unknown> = {}) {
    return {
        eventId: "evt-1",
        kind: "create",
        observedAt: Date.now(),
        messageId: "123456789",
        channelId: "987654321",
        authorLabel: "local-label",
        content: "private-message-sentinel-25e14565",
        ...overrides
    };
}

function timelineRequest(overrides: Record<string, unknown> = {}) {
    return {
        events: [timelineEvent()],
        policy: {retention: "7-days"},
        ...overrides
    };
}

function firstTimelineStore(): string {
    const root = path.join(appDataPath, "BetterDiscord", "solcord-timeline-v1");
    const name = fs.readdirSync(root).find(entry => entry.startsWith("store-"));
    if (!name) throw new Error("Timeline account store was not created.");
    return path.join(root, name);
}

function firstFriendWatchStore(): string {
    const root = path.join(appDataPath, "BetterDiscord", "solcord-friend-watch-v1");
    const name = fs.readdirSync(root).find(entry => entry.startsWith("store-"));
    if (!name) throw new Error("Friend Watch account store was not created.");
    return path.join(root, name);
}

function friendWatchEvent(overrides: Record<string, unknown> = {}) {
    return {
        eventId: "friend_evt_1",
        subjectId: "123456789",
        transition: "relationship-ended",
        observedAt: Date.now(),
        label: "Relationship ended - cause unavailable",
        source: "observed-store-transition",
        confidence: "unknown",
        displayLabel: "private-profile-sentinel-f99b0a",
        schemaVersion: 1,
        ...overrides
    };
}

const recoveryTheme = SOLCORD_RUNTIME_THEMES[0];
const heldAddon = SOLCORD_RUNTIME_ADDONS[0];

interface RecoveryFixtureFile {
    kind: "theme";
    fileName: string;
    sha256: string;
}

interface RecoveryFixture {
    transactionId: string;
    file: RecoveryFixtureFile;
    journalRoot: string;
    stage: string;
    stageFile: string;
    target: string;
}

function createRecoveryFixture(suffix: string): RecoveryFixture {
    const transactionId = `fixture-${suffix}`;
    const betterDiscordRoot = path.join(appDataPath, "BetterDiscord");
    const journalRoot = path.join(betterDiscordRoot, "solcord-transactions-v1");
    const stage = path.join(betterDiscordRoot, "solcord-staging-v1", transactionId);
    const themes = path.join(betterDiscordRoot, "themes");
    fs.mkdirSync(journalRoot, {recursive: true});
    fs.mkdirSync(stage, {recursive: true});
    fs.mkdirSync(themes, {recursive: true});

    const file: RecoveryFixtureFile = {kind: "theme", fileName: recoveryTheme.fileName, sha256: recoveryTheme.sourceSha256};
    const stageFile = path.join(stage, file.fileName);
    fs.writeFileSync(stageFile, recoveryTheme.content, {encoding: "utf8", flag: "wx"});
    fs.writeFileSync(path.join(journalRoot, `${transactionId}.intent.json`), `${JSON.stringify({
        version: 1,
        transactionId,
        createdAt: Date.now(),
        planned: [file],
        reused: [],
        legacyThemes: [],
        selectedAddons: [],
        selectedTheme: recoveryTheme.id
    }, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
    return {transactionId, file, journalRoot, stage, stageFile, target: path.join(themes, file.fileName)};
}

function writeRecoveryReceipt(fixture: RecoveryFixture, target: string): void {
    const stat = fs.lstatSync(target, {bigint: true});
    const key = crypto.createHash("sha256").update(`${fixture.file.kind}\0${fixture.file.fileName}`).digest("hex").slice(0, 32);
    fs.writeFileSync(path.join(fixture.journalRoot, `${fixture.transactionId}.${key}.receipt.json`), `${JSON.stringify({
        version: 1,
        transactionId: fixture.transactionId,
        file: fixture.file,
        device: stat.dev.toString(),
        inode: stat.ino.toString()
    }, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
}

async function triggerRecovery(): Promise<void> {
    const setup = new SolcordSetupTransactions();
    await setup.apply({selectedAddons: [heldAddon.name], selectedTheme: recoveryTheme.id});
}

beforeEach(() => {
    appDataPath = makeAppData();
    encryptionAvailable = true;
    oversizedWrappedKey = false;
});

describe("Solcord Audience Guard storage security", () => {
    test("reports durable safeStorage capability before a denylist exists and survives restart", async () => {
        const storage = new SolcordAudienceGuardStorage();

        expect(storage.status()).toEqual({persistent: true, sessionOnly: false});
        expect(await storage.read("111222333", {})).toEqual({policy: {version: 1, entries: []}, persistent: true, complete: true});

        await storage.write("111222333", {policy: {version: 1, entries: [{userId: "999888777", label: "Private label"}]}});
        const restarted = new SolcordAudienceGuardStorage();

        expect(restarted.status()).toEqual({persistent: true, sessionOnly: false});
        expect((await restarted.read("111222333", {})).policy.entries).toEqual([{userId: "999888777", label: "Private label"}]);
        expect((await restarted.read("444555666", {})).policy.entries).toEqual([]);
    });

    test("uses safeStorage for an account-isolated denylist without identifiers in paths", async () => {
        const storage = new SolcordAudienceGuardStorage();
        const written = await storage.write("111222333", {policy: {version: 1, entries: [{userId: "999888777", label: "Private label"}]}});
        const root = path.join(appDataPath, "BetterDiscord", "solcord-audience-guard-v1");
        const files = fs.readdirSync(root, {recursive: true, encoding: "utf8"}).map(String);

        expect(written).toEqual(expect.objectContaining({persistent: true, complete: true}));
        expect(files.join("\n")).not.toContain("111222333");
        expect(files.join("\n")).not.toContain("999888777");
        for (const relative of files) {
            const file = path.join(root, relative);
            if (!fs.lstatSync(file).isFile()) continue;
            expect(fs.readFileSync(file, "utf8")).toStartWith("solcord-test:");
        }

        const loaded = await storage.read("111222333", {});
        expect(loaded.policy.entries).toEqual([{userId: "999888777", label: "Private label"}]);
        const cleared = await storage.clear("111222333", {});
        expect(cleared.complete).toBeTrue();
        expect((await storage.read("111222333", {})).policy.entries).toEqual([]);
    });

    test("replaces an existing Windows policy transactionally and survives another restart", async () => {
        const storage = new SolcordAudienceGuardStorage();
        await storage.write("111222333", {policy: {version: 1, entries: [{userId: "999888777", label: "First"}]}});

        const updated = await storage.write("111222333", {policy: {version: 1, entries: [{userId: "222333444", label: "Updated"}]}});
        const restarted = new SolcordAudienceGuardStorage();
        const root = path.join(appDataPath, "BetterDiscord", "solcord-audience-guard-v1");
        const accountStore = path.join(root, fs.readdirSync(root).find(entry => entry.startsWith("store-"))!);

        expect(updated).toMatchObject({persistent: true, complete: true});
        expect((await restarted.read("111222333", {})).policy.entries).toEqual([{userId: "222333444", label: "Updated"}]);
        expect(fs.readdirSync(accountStore).filter(name => name.endsWith(".old") || name.endsWith(".tmp"))).toEqual([]);
    });

    test("recovers a known-good policy after an interrupted Windows replacement", async () => {
        const storage = new SolcordAudienceGuardStorage();
        await storage.write("111222333", {policy: {version: 1, entries: [{userId: "999888777", label: "Known good"}]}});
        const root = path.join(appDataPath, "BetterDiscord", "solcord-audience-guard-v1");
        const accountStore = path.join(root, fs.readdirSync(root).find(entry => entry.startsWith("store-"))!);
        const target = path.join(accountStore, "policy.scdb");
        const backup = `${target}.1234.abcdef12.old`;
        const temporary = `${target}.1234.1234abcd.tmp`;
        fs.renameSync(target, backup);
        fs.writeFileSync(temporary, "interrupted-new-envelope", "utf8");

        const recovered = await new SolcordAudienceGuardStorage().read("111222333", {});

        expect(recovered).toMatchObject({persistent: true, complete: true});
        expect(recovered.policy.entries).toEqual([{userId: "999888777", label: "Known good"}]);
        expect(fs.existsSync(target)).toBeTrue();
        expect(fs.existsSync(backup)).toBeFalse();
        expect(fs.existsSync(temporary)).toBeFalse();
    });

    test("uses an account-isolated memory fallback and rejects renderer-selected authority", async () => {
        encryptionAvailable = false;
        const storage = new SolcordAudienceGuardStorage();

        expect((await storage.write("111222333", {policy: {entries: [{userId: "999888777"}]}})).persistent).toBeFalse();
        expect((await storage.read("111222333", {})).policy.entries).toEqual([{userId: "999888777"}]);
        expect((await storage.read("444555666", {})).policy.entries).toEqual([]);
        expect(fs.existsSync(path.join(appDataPath, "BetterDiscord", "solcord-audience-guard-v1"))).toBeFalse();
        expect(() => storage.write("111222333", {accountId: "444555666", policy: {entries: []}})).toThrow();
        expect(() => storage.read("111222333", {accountScope: "444555666"})).toThrow();
    });
});

describe("Solcord People and Spaces private state", () => {
    test("encrypts restart-persistent account state without identifiers in paths", async () => {
        const storage = new SolcordPeopleStateStorage();
        const state = {
            pinnedDmIds: ["111222333"],
            hiddenGuildIds: ["444555666"],
            guildAliases: {444555666: "Private workshop"},
            favoriteFriendIds: ["555666777"],
            hiddenFriendIds: ["888999000"],
            ignoredVoiceChannelIds: ["111999222"],
            ignoredVoiceGuildIds: ["333999444"]
        };

        expect(await storage.write("777888999", {state})).toEqual(expect.objectContaining({persistent: true, complete: true}));
        const restarted = new SolcordPeopleStateStorage();
        expect((await restarted.read("777888999", {})).state).toEqual({version: 3, ...state});
        expect((await restarted.read("999888777", {})).state).toEqual({version: 3, pinnedDmIds: [], hiddenGuildIds: [], guildAliases: {}, favoriteFriendIds: [], hiddenFriendIds: [], ignoredVoiceChannelIds: [], ignoredVoiceGuildIds: []});

        const root = path.join(appDataPath, "BetterDiscord", "solcord-people-state-v1");
        const names = fs.readdirSync(root, {recursive: true, encoding: "utf8"}).map(String).join("\n");
        expect(names).not.toContain("777888999");
        expect(names).not.toContain("111222333");
        expect(names).not.toContain("444555666");
        expect(names).not.toContain("Private workshop");
        for (const relative of fs.readdirSync(root, {recursive: true, encoding: "utf8"}).map(String)) {
            const file = path.join(root, relative);
            if (fs.lstatSync(file).isFile()) expect(fs.readFileSync(file, "utf8")).toStartWith("solcord-test:");
        }
    });

    test("uses an account-isolated memory fallback and rejects renderer-selected authority", async () => {
        encryptionAvailable = false;
        const storage = new SolcordPeopleStateStorage();
        const state = {pinnedDmIds: ["111222333", "../bad", "111222333"], hiddenGuildIds: [], guildAliases: {"111222333": "  Alias\u0000 name  ", "../bad": "blocked"}};

        expect(storage.status()).toEqual(expect.objectContaining({persistent: false, sessionOnly: true}));
        const written = await storage.write("777888999", {state});
        expect(written).toEqual({
            state: {version: 3, pinnedDmIds: ["111222333"], hiddenGuildIds: [], guildAliases: {111222333: "Alias name"}, favoriteFriendIds: [], hiddenFriendIds: [], ignoredVoiceChannelIds: [], ignoredVoiceGuildIds: []},
            persistent: false,
            complete: true
        });
        expect((await storage.read("999888777", {})).state.pinnedDmIds).toEqual([]);
        expect(fs.existsSync(path.join(appDataPath, "BetterDiscord", "solcord-people-state-v1"))).toBeFalse();
        expect(() => storage.write("777888999", {accountId: "999888777", state})).toThrow();
        expect(() => storage.read("777888999", {accountScope: "999888777"})).toThrow();
        expect((await storage.clear("777888999", {})).complete).toBeTrue();
        expect((await storage.read("777888999", {})).state.pinnedDmIds).toEqual([]);
    });

    test("replaces private state atomically and leaves no recovery debris", async () => {
        const storage = new SolcordPeopleStateStorage();
        await storage.write("777888999", {state: {pinnedDmIds: ["111222333"], hiddenGuildIds: [], guildAliases: {}}});
        await storage.write("777888999", {state: {pinnedDmIds: [], hiddenGuildIds: ["444555666"], guildAliases: {444555666: "Updated"}}});

        expect((await new SolcordPeopleStateStorage().read("777888999", {})).state).toEqual({version: 3, pinnedDmIds: [], hiddenGuildIds: ["444555666"], guildAliases: {444555666: "Updated"}, favoriteFriendIds: [], hiddenFriendIds: [], ignoredVoiceChannelIds: [], ignoredVoiceGuildIds: []});
        const root = path.join(appDataPath, "BetterDiscord", "solcord-people-state-v1");
        expect(fs.readdirSync(root, {recursive: true, encoding: "utf8"}).map(String).some(name => /\.(?:old|tmp)$/.test(name))).toBeFalse();
    });
});

describe("Solcord translation credential security", () => {
    test("binds encrypted credentials to account, provider, and exact endpoint", async () => {
        const storage = new SolcordTranslationCredentialStorage();
        const endpoint = "https://translate.example/translate";
        expect(await storage.write("111222333", {provider: "libretranslate", endpoint, credential: "private-api-key"})).toEqual({persistent: true, complete: true});
        expect((await storage.read("111222333", {provider: "libretranslate", endpoint})).credential).toBe("private-api-key");
        expect((await storage.read("444555666", {provider: "libretranslate", endpoint})).credential).toBe("");
        expect((await storage.read("111222333", {provider: "libretranslate", endpoint: "https://other.example/translate"})).credential).toBe("");
        const root = path.join(appDataPath, "BetterDiscord", "solcord-translation-credentials-v1");
        const names = fs.readdirSync(root, {recursive: true, encoding: "utf8"}).map(String).join("\n");
        expect(names).not.toContain("111222333");
        expect(names).not.toContain("private-api-key");
        expect(fs.readFileSync(path.join(root, "identity.sc-key"), "utf8")).toStartWith("solcord-test:");
    });

    test("keeps credentials memory-only when safeStorage is unavailable", async () => {
        encryptionAvailable = false;
        const storage = new SolcordTranslationCredentialStorage();
        const endpoint = "https://api-free.deepl.com/v2/translate";
        expect(await storage.write("111222333", {provider: "deepl", endpoint, credential: "memory-key"})).toEqual({persistent: false, complete: true});
        expect((await storage.read("111222333", {provider: "deepl", endpoint})).credential).toBe("memory-key");
        expect(fs.existsSync(path.join(appDataPath, "BetterDiscord", "solcord-translation-credentials-v1"))).toBeFalse();
    });

    test("replaces an encrypted credential atomically on Windows and survives restart", async () => {
        const endpoint = "https://translate.example/translate";
        const storage = new SolcordTranslationCredentialStorage();

        expect(await storage.write("111222333", {provider: "libretranslate", endpoint, credential: "first-key"})).toEqual({persistent: true, complete: true});
        expect(await storage.write("111222333", {provider: "libretranslate", endpoint, credential: "rotated-key"})).toEqual({persistent: true, complete: true});

        const restarted = new SolcordTranslationCredentialStorage();
        expect(await restarted.read("111222333", {provider: "libretranslate", endpoint})).toEqual({credential: "rotated-key", persistent: true, complete: true});
        const root = path.join(appDataPath, "BetterDiscord", "solcord-translation-credentials-v1");
        expect(fs.readdirSync(root, {recursive: true, encoding: "utf8"}).map(String).some(name => /\.(?:old|tmp)$/.test(name))).toBeFalse();
    });

    test("keeps a newer session credential authoritative after a durable write failure", async () => {
        const endpoint = "https://translate.example/translate";
        const storage = new SolcordTranslationCredentialStorage();
        expect(await storage.write("111222333", {provider: "libretranslate", endpoint, credential: "durable-key"})).toEqual({persistent: true, complete: true});

        oversizedWrappedKey = true;
        expect(await storage.write("111222333", {provider: "libretranslate", endpoint, credential: "session-key"})).toEqual({persistent: false, complete: false});
        oversizedWrappedKey = false;

        expect(await storage.read("111222333", {provider: "libretranslate", endpoint})).toEqual({credential: "session-key", persistent: false, complete: true});
        expect(await new SolcordTranslationCredentialStorage().read("111222333", {provider: "libretranslate", endpoint})).toEqual({credential: "durable-key", persistent: true, complete: true});
    });

    test("leaves a durable clear marker and never revives a credential after interrupted deletion", async () => {
        const endpoint = "https://translate.example/translate";
        const storage = new SolcordTranslationCredentialStorage();
        await storage.write("111222333", {provider: "libretranslate", endpoint, credential: "must-not-revive"});
        const root = path.join(appDataPath, "BetterDiscord", "solcord-translation-credentials-v1");
        const credential = fs.readdirSync(root, {recursive: true, encoding: "utf8"}).map(String).find(name => name.endsWith(".scdb"));
        if (!credential) throw new Error("Encrypted credential fixture was not created.");
        const credentialFile = path.join(root, credential);
        const originalUnlink = fs.unlinkSync;
        let refused = false;
        Object.defineProperty(fs, "unlinkSync", {
            configurable: true,
            value: (target: fs.PathLike) => {
                if (!refused && path.resolve(String(target)) === path.resolve(credentialFile)) {
                    refused = true;
                    throw new Error("simulated locked credential");
                }
                return originalUnlink(target);
            }
        });
        try {
            expect(await storage.clear("111222333", {provider: "libretranslate", endpoint})).toEqual({persistent: false, complete: false});
        }
        finally {Object.defineProperty(fs, "unlinkSync", {configurable: true, value: originalUnlink});}

        expect(fs.existsSync(`${credentialFile}.clear-pending`)).toBeTrue();
        expect(await new SolcordTranslationCredentialStorage().read("111222333", {provider: "libretranslate", endpoint})).toEqual({credential: "", persistent: true, complete: true});
        expect(fs.existsSync(credentialFile)).toBeFalse();
        expect(fs.existsSync(`${credentialFile}.clear-pending`)).toBeFalse();
    });
});

describe("Solcord Local Identity Notes storage security", () => {
    test("encrypts account-isolated notes without identifiers or plaintext in paths", async () => {
        const storage = new SolcordLocalIdentityNotesStorage();
        const saved = await storage.write("111222333", {subjectId: "999888777", note: "Private note sentinel 8e47f8", tags: ["friend", "local"], storage: "secure-only"});
        const root = path.join(appDataPath, "BetterDiscord", "solcord-local-identity-notes-v1");
        const files = fs.readdirSync(root, {recursive: true, encoding: "utf8"}).map(String);

        expect(saved).toEqual(expect.objectContaining({persistent: true, complete: true, note: expect.objectContaining({subjectId: "999888777"})}));
        expect(files.join("\n")).not.toContain("111222333");
        expect(files.join("\n")).not.toContain("999888777");
        expect(files.join("\n")).not.toContain("Private note sentinel");
        for (const relative of files) {
            const file = path.join(root, relative);
            if (!fs.lstatSync(file).isFile()) continue;
            expect(fs.readFileSync(file, "utf8")).toStartWith("solcord-test:");
        }

        expect((await storage.read("111222333", {})).notes).toEqual([saved.note]);
        expect((await storage.read("444555666", {})).notes).toEqual([]);
        expect(await storage.remove("111222333", {subjectId: "999888777"})).toEqual({removed: true, persistent: true, complete: true});
        expect((await storage.read("111222333", {})).notes).toEqual([]);
    });

    test("uses a bounded account-isolated session fallback and rejects renderer-selected authority", async () => {
        encryptionAvailable = false;
        const storage = new SolcordLocalIdentityNotesStorage();

        expect(storage.status()).toEqual(expect.objectContaining({persistent: false, sessionOnly: true}));
        expect((await storage.write("111222333", {subjectId: "999888777", note: "Session-only", tags: [], storage: "secure-only"})).persistent).toBeFalse();
        expect((await storage.read("111222333", {})).notes).toHaveLength(1);
        expect((await storage.read("444555666", {})).notes).toEqual([]);
        expect(fs.existsSync(path.join(appDataPath, "BetterDiscord", "solcord-local-identity-notes-v1"))).toBeFalse();
        expect(() => storage.write("111222333", {accountId: "444555666", subjectId: "999888777", note: "blocked", tags: [], storage: "secure-only"})).toThrow();
        expect(() => storage.read("111222333", {accountScope: "444555666"})).toThrow();
        expect(() => storage.write("111222333", {subjectId: "999888777", note: "x".repeat(281), tags: [], storage: "secure-only"})).toThrow();
        expect(() => storage.write("111222333", {subjectId: "999888777", note: "blocked", tags: [], storage: "ordinary-local"})).toThrow();
        expect((await storage.clear("111222333", {})).cleared).toBe(1);
        expect((await storage.read("111222333", {})).notes).toEqual([]);
    });

    test("replaces encrypted notes atomically on Windows and survives restart", async () => {
        const storage = new SolcordLocalIdentityNotesStorage();
        expect((await storage.write("111222333", {subjectId: "999888777", note: "First note", tags: ["local"], storage: "secure-only"})).persistent).toBeTrue();
        expect((await storage.write("111222333", {subjectId: "999888777", note: "Updated note", tags: ["trusted"], storage: "secure-only"})).persistent).toBeTrue();

        const restarted = new SolcordLocalIdentityNotesStorage();
        expect(await restarted.read("111222333", {})).toEqual({
            notes: [expect.objectContaining({subjectId: "999888777", text: "Updated note", tags: ["trusted"]})],
            persistent: true,
            complete: true
        });
        const root = path.join(appDataPath, "BetterDiscord", "solcord-local-identity-notes-v1");
        expect(fs.readdirSync(root, {recursive: true, encoding: "utf8"}).map(String).some(name => /\.(?:old|tmp)$/.test(name))).toBeFalse();
    });
});

describe("Solcord V2 provider archive", () => {
    const attestedArchive = (options: ConstructorParameters<typeof SolcordProviderArchive>[0] = {}) => new SolcordProviderArchive({
        attestReplacementHealth: () => true,
        ...options
    });

    test("fails closed when main has no independent replacement-health attestor", async () => {
        const pluginRoot = path.join(appDataPath, "BetterDiscord", "plugins");
        fs.mkdirSync(pluginRoot, {recursive: true});
        const file = path.join(pluginRoot, "DoNotTrack.plugin.js");
        fs.writeFileSync(file, "// owner provider\n", "utf8");

        const archive = new SolcordProviderArchive();
        const preview = await archive.preview({replacementReadyFiles: ["DoNotTrack.plugin.js"]});

        expect(preview.records).toEqual([]);
        expect(preview.plan.blockers).toContainEqual(expect.objectContaining({fileName: "DoNotTrack.plugin.js", reason: "replacement-not-ready"}));
        await expect(archive.apply(preview.previewId)).rejects.toThrow("preview expired");
        expect(fs.readFileSync(file, "utf8")).toContain("owner provider");
    });

    test("the production attestor accepts only replacement contracts compiled into this build", () => {
        expect(hasCompiledSolcordV2Replacement("DoNotTrack.plugin.js")).toBeTrue();
        expect(hasCompiledSolcordV2Replacement("MessageLoggerV2.plugin.js")).toBeTrue();
        expect(hasCompiledSolcordV2Replacement("0BDFDB.plugin.js")).toBeTrue();
        expect(hasCompiledSolcordV2Replacement("../DoNotTrack.plugin.js")).toBeFalse();
        expect(hasCompiledSolcordV2Replacement("OwnerTool.plugin.js")).toBeFalse();
    });

    test("moves only replacement-ready exact files outside the scanned plugin directory and restores them", async () => {
        const pluginRoot = path.join(appDataPath, "BetterDiscord", "plugins");
        fs.mkdirSync(pluginRoot, {recursive: true});
        fs.writeFileSync(path.join(pluginRoot, "DoNotTrack.plugin.js"), "// exact owner provider\n", "utf8");
        fs.writeFileSync(path.join(pluginRoot, "Translator.plugin.js"), "// leave until replacement ready\n", "utf8");
        const archive = attestedArchive();
        const preview = await archive.preview({replacementReadyFiles: ["DoNotTrack.plugin.js"], retainedBdfdbConsumers: ["OwnerTool.plugin.js"]});
        expect(preview.records.map(record => record.fileName)).toEqual(["DoNotTrack.plugin.js"]);
        expect(preview.plan.blockers).toContainEqual(expect.objectContaining({fileName: "Translator.plugin.js", reason: "replacement-not-ready"}));
        const applied = await archive.apply(preview.previewId);
        expect(fs.existsSync(path.join(pluginRoot, "DoNotTrack.plugin.js"))).toBeFalse();
        expect(fs.readFileSync(path.join(pluginRoot, "Translator.plugin.js"), "utf8")).toContain("leave until");
        expect(fs.readFileSync(path.join(applied.archiveDirectory, "DoNotTrack.plugin.js"), "utf8")).toContain("exact owner");
        const restored = await archive.rollback(applied.transactionId);
        expect(restored.complete).toBeTrue();
        expect(fs.readFileSync(path.join(pluginRoot, "DoNotTrack.plugin.js"), "utf8")).toContain("exact owner");
    });

    test("archives the complete 24-file provider set, keeps MessageLogger data, retires BDFDB last, and restores every byte", async () => {
        const pluginRoot = path.join(appDataPath, "BetterDiscord", "plugins");
        fs.mkdirSync(pluginRoot, {recursive: true});
        const originals = new Map(SOLCORD_V2_REPLACEMENT_MANIFEST.entries.map((entry, index) => {
            const bytes = `// exact provider ${index}: ${entry.fileName}\n`;
            fs.writeFileSync(path.join(pluginRoot, entry.fileName), bytes, "utf8");
            return [entry.fileName, bytes];
        }));
        fs.writeFileSync(path.join(pluginRoot, "MessageLoggerV2.config.json"), "private-config-sentinel", "utf8");
        fs.writeFileSync(path.join(pluginRoot, "MessageLoggerV2Data.config.json"), "private-data-sentinel", "utf8");
        fs.mkdirSync(path.join(pluginRoot, "MLV2_IMAGE_CACHE"));
        fs.writeFileSync(path.join(pluginRoot, "MLV2_IMAGE_CACHE", "private-media-sentinel.bin"), "private-media-sentinel", "utf8");

        const archive = attestedArchive();
        const replacementReadyFiles = SOLCORD_V2_REPLACEMENT_MANIFEST.entries.map(entry => entry.fileName);
        const preview = await archive.preview({replacementReadyFiles, retainedBdfdbConsumers: []});

        expect(preview.records).toHaveLength(24);
        expect(preview.plan.blockers).toEqual([]);
        expect(preview.plan.steps.at(-1)?.fileName).toBe("0BDFDB.plugin.js");
        expect(preview.plan.steps.find(step => step.fileName === "MessageLoggerV2.plugin.js")?.preservePrivateData).toBeTrue();

        const applied = await archive.apply(preview.previewId);
        expect(replacementReadyFiles.every(fileName => !fs.existsSync(path.join(pluginRoot, fileName)))).toBeTrue();
        expect(fs.readFileSync(path.join(pluginRoot, "MessageLoggerV2.config.json"), "utf8")).toBe("private-config-sentinel");
        expect(fs.readFileSync(path.join(pluginRoot, "MessageLoggerV2Data.config.json"), "utf8")).toBe("private-data-sentinel");
        expect(fs.readFileSync(path.join(pluginRoot, "MLV2_IMAGE_CACHE", "private-media-sentinel.bin"), "utf8")).toBe("private-media-sentinel");

        const restored = await archive.rollback(applied.transactionId);
        expect(restored.complete).toBeTrue();
        for (const [fileName, bytes] of originals) expect(fs.readFileSync(path.join(pluginRoot, fileName), "utf8")).toBe(bytes);
        expect(fs.readFileSync(path.join(pluginRoot, "MessageLoggerV2Data.config.json"), "utf8")).toBe("private-data-sentinel");
    });

    test("rejects a provider that changes after preview without moving it", async () => {
        const pluginRoot = path.join(appDataPath, "BetterDiscord", "plugins");
        fs.mkdirSync(pluginRoot, {recursive: true});
        const file = path.join(pluginRoot, "InvisibleTyping.plugin.js");
        fs.writeFileSync(file, "// reviewed A\n", "utf8");
        const archive = attestedArchive();
        const preview = await archive.preview({replacementReadyFiles: ["InvisibleTyping.plugin.js"]});
        fs.writeFileSync(file, "// owner changed B\n", "utf8");
        await expect(archive.apply(preview.previewId)).rejects.toThrow("changed after review");
        expect(fs.readFileSync(file, "utf8")).toContain("owner changed B");
    });

    test("re-attests replacement health immediately before apply", async () => {
        const pluginRoot = path.join(appDataPath, "BetterDiscord", "plugins");
        fs.mkdirSync(pluginRoot, {recursive: true});
        const file = path.join(pluginRoot, "DoNotTrack.plugin.js");
        fs.writeFileSync(file, "// reviewed provider\n", "utf8");
        let healthy = true;
        const archive = new SolcordProviderArchive({attestReplacementHealth: () => healthy});
        const preview = await archive.preview({replacementReadyFiles: ["DoNotTrack.plugin.js"]});

        healthy = false;
        await expect(archive.apply(preview.previewId)).rejects.toThrow("replacement health changed after review");
        expect(fs.readFileSync(file, "utf8")).toContain("reviewed provider");
    });

    test("rejects an oversized readiness array before mapping it", async () => {
        let firstElementRead = false;
        const replacementReadyFiles = new Array(257);
        Object.defineProperty(replacementReadyFiles, 0, {
            configurable: true,
            get: () => {firstElementRead = true; return "DoNotTrack.plugin.js";}
        });
        const archive = attestedArchive();

        await expect(archive.preview({replacementReadyFiles})).rejects.toThrow("exceeds its limit");
        expect(firstElementRead).toBeFalse();
    });

    test("caps outstanding attested previews", async () => {
        const pluginRoot = path.join(appDataPath, "BetterDiscord", "plugins");
        fs.mkdirSync(pluginRoot, {recursive: true});
        fs.writeFileSync(path.join(pluginRoot, "DoNotTrack.plugin.js"), "// preview pressure fixture\n", "utf8");
        const archive = attestedArchive();

        for (let index = 0; index < 16; index++) {
            const preview = await archive.preview({replacementReadyFiles: ["DoNotTrack.plugin.js"]});
            expect(preview.records).toHaveLength(1);
        }
        await expect(archive.preview({replacementReadyFiles: ["DoNotTrack.plugin.js"]})).rejects.toThrow("Too many outstanding");
    });

    test("detects an apply identity swap and restores the raced owner file", async () => {
        const pluginRoot = path.join(appDataPath, "BetterDiscord", "plugins");
        fs.mkdirSync(pluginRoot, {recursive: true});
        const file = path.join(pluginRoot, "DoNotTrack.plugin.js");
        const displaced = `${file}.displaced`;
        fs.writeFileSync(file, "// reviewed identity\n", "utf8");
        let raced = false;
        const archive = attestedArchive({
            moveCheckpoint: (checkpoint: string, paths: {source: string;}) => {
                if (checkpoint !== "apply-after-source-check" || raced) return;
                raced = true;
                fs.renameSync(paths.source, displaced);
                fs.writeFileSync(paths.source, "// owner raced identity\n", "utf8");
            }
        });
        const preview = await archive.preview({replacementReadyFiles: ["DoNotTrack.plugin.js"]});

        await expect(archive.apply(preview.previewId)).rejects.toThrow("changed during apply");
        expect(fs.readFileSync(file, "utf8")).toContain("owner raced identity");
        expect(fs.readFileSync(displaced, "utf8")).toContain("reviewed identity");
    });

    test("rollback never overwrites a destination created after its absence check", async () => {
        const pluginRoot = path.join(appDataPath, "BetterDiscord", "plugins");
        fs.mkdirSync(pluginRoot, {recursive: true});
        const file = path.join(pluginRoot, "DoNotTrack.plugin.js");
        fs.writeFileSync(file, "// reviewed provider\n", "utf8");
        let raceRollback = false;
        const archive = attestedArchive({
            moveCheckpoint: (checkpoint: string, paths: {destination: string;}) => {
                if (checkpoint !== "rollback-after-staged-rename" || raceRollback) return;
                raceRollback = true;
                fs.writeFileSync(paths.destination, "// owner destination\n", {encoding: "utf8", flag: "wx"});
            }
        });
        const preview = await archive.preview({replacementReadyFiles: ["DoNotTrack.plugin.js"]});
        const applied = await archive.apply(preview.previewId);

        const restored = await archive.rollback(applied.transactionId);
        expect(restored.complete).toBeFalse();
        expect(restored.blocked).toEqual(["DoNotTrack.plugin.js"]);
        expect(fs.readFileSync(file, "utf8")).toContain("owner destination");
        expect(fs.readFileSync(path.join(applied.archiveDirectory, "DoNotTrack.plugin.js"), "utf8")).toContain("reviewed provider");
    });
});

afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
        const resolved = path.resolve(root);
        if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith("solcord-storage-security-")) throw new Error("Refusing unsafe test cleanup.");
        fs.rmSync(resolved, {recursive: true, force: true});
    }
});

describe("Solcord setup transaction security", () => {
    test("accepts only immutable, credential-free raw GitHub source URLs", () => {
        expect(validatePinnedSourceUrl("https://raw.githubusercontent.com/owner/repo/0123456789abcdef0123456789abcdef01234567/addon.plugin.js").hostname).toBe("raw.githubusercontent.com");
        for (const value of [
            "http://raw.githubusercontent.com/owner/repo/0123456789abcdef0123456789abcdef01234567/addon.plugin.js",
            "https://raw.githubusercontent.com/owner/repo/main/addon.plugin.js",
            "https://user:password@raw.githubusercontent.com/owner/repo/0123456789abcdef0123456789abcdef01234567/addon.plugin.js",
            "https://raw.githubusercontent.com/owner/repo/0123456789abcdef0123456789abcdef01234567/addon.plugin.js?raw=1",
            "https://raw.githubusercontent.com/owner/repo/0123456789abcdef0123456789abcdef01234567/%2e%2e/addon.plugin.js"
        ]) expect(() => validatePinnedSourceUrl(value)).toThrow();
    });

    test("refuses every addon that has not passed runtime installation review", async () => {
        const setup = new SolcordSetupTransactions();
        await expect(setup.apply({selectedAddons: ["InvisibleTyping"], selectedTheme: "obsidian-thread"})).rejects.toThrow("runtime installation review");
        expect(fs.existsSync(path.join(appDataPath, "BetterDiscord", "plugins", "InvisibleTyping.plugin.js"))).toBeFalse();
    });

    test("installs embedded themes transactionally and preserves a changed file on rollback", async () => {
        const setup = new SolcordSetupTransactions();
        const result = await setup.apply({selectedAddons: [], selectedTheme: "obsidian-thread"});
        expect(result.added).toHaveLength(SOLCORD_RUNTIME_THEMES.length);

        const before = await setup.auditIntegrity();
        expect(before.filter(record => record.kind === "theme" && record.status === "match")).toHaveLength(SOLCORD_RUNTIME_THEMES.length);
        expect(JSON.stringify(before)).not.toContain(appDataPath);

        const changed = path.join(appDataPath, "BetterDiscord", "themes", "Solcord-ObsidianThread.theme.css");
        const reviewedContent = fs.readFileSync(changed, "utf8");
        fs.appendFileSync(changed, "\n/* owner change */\n", "utf8");
        const rollback = await setup.rollback(result.transactionId);
        expect(rollback.complete).toBeFalse();
        expect(rollback.removed).toHaveLength(SOLCORD_RUNTIME_THEMES.length - 1);
        expect(rollback.preserved).toHaveLength(1);
        expect(fs.readFileSync(changed, "utf8")).toContain("owner change");

        const after = await setup.auditIntegrity();
        expect(after.find(record => record.kind === "theme" && record.name === "Obsidian Thread")?.status).toBe("mismatch");
        expect(after.filter(record => record.kind === "theme" && record.status === "missing")).toHaveLength(SOLCORD_RUNTIME_THEMES.length - 1);

        fs.writeFileSync(changed, reviewedContent, "utf8");
        const retry = await setup.rollback(result.transactionId);
        expect(retry.complete).toBeTrue();
        expect(retry.removed).toHaveLength(1);
        expect(retry.preserved).toHaveLength(0);
        expect(fs.existsSync(changed)).toBeFalse();
    });

    test("replaces only the exact malformed Solcord v1 theme and restores it on rollback", async () => {
        const themesRoot = path.join(appDataPath, "BetterDiscord", "themes");
        fs.mkdirSync(themesRoot, {recursive: true});
        const legacyContent = readLegacyDefaultThemeFixture();
        const target = path.join(themesRoot, "Solcord-Default.theme.css");
        fs.writeFileSync(target, legacyContent, {encoding: "utf8", flag: "wx"});

        const setup = new SolcordSetupTransactions();
        const applied = await setup.apply({selectedAddons: [], selectedTheme: recoveryTheme.id});
        const reviewed = SOLCORD_RUNTIME_THEMES.find(theme => theme.fileName === "Solcord-Default.theme.css")!;
        const journalRoot = path.join(appDataPath, "BetterDiscord", "solcord-transactions-v1");

        expect(fs.readFileSync(target, "utf8")).toBe(reviewed.content);
        expect(fs.readdirSync(journalRoot).filter(file => file.endsWith(".legacy-theme-backup"))).toHaveLength(1);

        const rollback = await setup.rollback(applied.transactionId);
        expect(rollback.complete).toBeTrue();
        expect(fs.readFileSync(target, "utf8")).toBe(legacyContent);
        expect(fs.readdirSync(journalRoot).filter(file => file.endsWith(".legacy-theme-backup"))).toHaveLength(0);
        expect((await setup.auditIntegrity()).filter(record => record.kind === "theme" && record.status === "missing")).toHaveLength(SOLCORD_RUNTIME_THEMES.length - 1);
    });

    test("recognizes every exact owner-installed v1.1 theme hash without widening filename or hash policy", () => {
        const reviewed = {
            "Solcord-Default.theme.css": "0056bcf888af2f5c9e43ae14ae299fa63dfa6ef0f1f29ece9af6e42536ac0765",
            "Solcord-ObsidianThread.theme.css": "7cdb781861ec59bab0378b8b0e64dda97ba2eb43531b7fdcd2888e4350a2c128",
            "Solcord-CarbonEmber.theme.css": "ac8bcca42f1712538d840f669551ddb119b36d9490978bfb9fd07e1dbb826184",
            "Solcord-MidnightGlass.theme.css": "1d7ff58696b495a6a3cd67d0702ef95f8d3e90d77993e95ab2143e3992ccb483",
            "Solcord-PaperSignal.theme.css": "9c6fc63aa4299881ebf3b7f6a442a7e27aca376e751f7e5f0b82900c6e9c46b9"
        } as const;
        for (const [fileName, sha256] of Object.entries(reviewed)) {
            expect(isReviewedLegacySolcordTheme(fileName, sha256)).toBeTrue();
            expect(isReviewedLegacySolcordTheme(fileName, `${sha256.slice(0, -1)}0`)).toBeFalse();
        }
        expect(isReviewedLegacySolcordTheme("Owner.theme.css", reviewed["Solcord-Default.theme.css"])).toBeFalse();
        expect(isReviewedLegacySolcordTheme("../Solcord-Default.theme.css", reviewed["Solcord-Default.theme.css"])).toBeFalse();
    });

    test("accepts a completed transaction containing an exact reviewed historical theme after a catalog upgrade", async () => {
        const setup = new SolcordSetupTransactions();
        const historical = await setup.apply({selectedAddons: [], selectedTheme: recoveryTheme.id});
        await setup.acknowledge(historical.transactionId);

        const legacyContent = readLegacyDefaultThemeFixture();
        const legacySha256 = crypto.createHash("sha256").update(legacyContent).digest("hex");
        const themesRoot = path.join(appDataPath, "BetterDiscord", "themes");
        const target = path.join(themesRoot, recoveryTheme.fileName);
        fs.writeFileSync(target, legacyContent, "utf8");

        const journalRoot = path.join(appDataPath, "BetterDiscord", "solcord-transactions-v1");
        const journalFile = path.join(journalRoot, `${historical.transactionId}.json`);
        const journal = JSON.parse(fs.readFileSync(journalFile, "utf8"));
        const historicalFile = journal.added.find((file: RecoveryFixtureFile) => file.kind === "theme" && file.fileName === recoveryTheme.fileName);
        if (!historicalFile) throw new Error("Expected the completed transaction to own the recovery theme.");
        historicalFile.sha256 = legacySha256;
        const serializedJournal = `${JSON.stringify(journal, null, 2)}\n`;
        fs.writeFileSync(journalFile, serializedJournal, "utf8");

        const receiptFile = fs.readdirSync(journalRoot).find(file => {
            if (!file.startsWith(`${historical.transactionId}.`) || !file.endsWith(".receipt.json")) return false;
            const receipt = JSON.parse(fs.readFileSync(path.join(journalRoot, file), "utf8"));
            return receipt.file?.kind === "theme" && receipt.file?.fileName === recoveryTheme.fileName;
        });
        if (!receiptFile) throw new Error("Expected a durable ownership receipt for the recovery theme.");
        const receiptPath = path.join(journalRoot, receiptFile);
        const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
        receipt.file.sha256 = legacySha256;
        fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
        fs.writeFileSync(
            path.join(journalRoot, `${historical.transactionId}.complete`),
            `${crypto.createHash("sha256").update(serializedJournal).digest("hex")}\n`,
            "utf8"
        );

        const upgraded = await new SolcordSetupTransactions().apply({selectedAddons: [], selectedTheme: recoveryTheme.id});

        expect(upgraded.added.map(file => file.fileName)).toEqual([recoveryTheme.fileName]);
        expect(upgraded.reused).toHaveLength(SOLCORD_RUNTIME_THEMES.length - 1);
        expect(fs.readFileSync(target, "utf8")).toBe(recoveryTheme.content);
    });

    test("accepts two completed theme generations when the prior Paper Signal hash is reviewed", async () => {
        const setup = new SolcordSetupTransactions();
        const first = await setup.apply({selectedAddons: [], selectedTheme: recoveryTheme.id});
        await setup.acknowledge(first.transactionId);

        const journalRoot = path.join(appDataPath, "BetterDiscord", "solcord-transactions-v1");
        const secondTransactionId = "mt9b64lt-64f182d94c6ba9aa";
        const priorPaperSignalSha256 = "8f135c69e61499b660850016a6acbee7b92cf971264de5fd4bf595622690e00d";
        const secondJournal = {
            version: 1,
            transactionId: secondTransactionId,
            createdAt: Date.now(),
            added: SOLCORD_RUNTIME_THEMES.map(theme => ({
                kind: "theme",
                fileName: theme.fileName,
                sha256: theme.fileName === "Solcord-PaperSignal.theme.css" ? priorPaperSignalSha256 : theme.sourceSha256
            })),
            reused: [],
            legacyThemes: [],
            selectedAddons: [],
            selectedTheme: "paper-signal"
        };
        const serializedJournal = `${JSON.stringify(secondJournal, null, 2)}\n`;
        fs.writeFileSync(path.join(journalRoot, `${secondTransactionId}.json`), serializedJournal, {encoding: "utf8", flag: "wx"});
        fs.writeFileSync(
            path.join(journalRoot, `${secondTransactionId}.complete`),
            `${crypto.createHash("sha256").update(serializedJournal).digest("hex")}\n`,
            {encoding: "utf8", flag: "wx"}
        );

        const next = await new SolcordSetupTransactions().apply({selectedAddons: [], selectedTheme: recoveryTheme.id});

        expect(next.added).toHaveLength(0);
        expect(next.reused).toHaveLength(SOLCORD_RUNTIME_THEMES.length);
    });

    test("keeps completed transaction history fail-closed for an unreviewed historical theme hash", async () => {
        const setup = new SolcordSetupTransactions();
        const historical = await setup.apply({selectedAddons: [], selectedTheme: recoveryTheme.id});
        await setup.acknowledge(historical.transactionId);

        const journalRoot = path.join(appDataPath, "BetterDiscord", "solcord-transactions-v1");
        const journalFile = path.join(journalRoot, `${historical.transactionId}.json`);
        const journal = JSON.parse(fs.readFileSync(journalFile, "utf8"));
        const historicalFile = journal.added.find((file: RecoveryFixtureFile) => file.kind === "theme" && file.fileName === recoveryTheme.fileName);
        if (!historicalFile) throw new Error("Expected the completed transaction to own the recovery theme.");
        historicalFile.sha256 = "f".repeat(64);
        const serializedJournal = `${JSON.stringify(journal, null, 2)}\n`;
        fs.writeFileSync(journalFile, serializedJournal, "utf8");
        fs.writeFileSync(
            path.join(journalRoot, `${historical.transactionId}.complete`),
            `${crypto.createHash("sha256").update(serializedJournal).digest("hex")}\n`,
            "utf8"
        );

        await expect(new SolcordSetupTransactions().apply({selectedAddons: [], selectedTheme: recoveryTheme.id})).rejects.toThrow("ambiguous transaction journal");
    });

    test("preserves the installed themes when an expected legacy backup is missing", async () => {
        const themesRoot = path.join(appDataPath, "BetterDiscord", "themes");
        fs.mkdirSync(themesRoot, {recursive: true});
        const legacyContent = readLegacyDefaultThemeFixture();
        const target = path.join(themesRoot, "Solcord-Default.theme.css");
        fs.writeFileSync(target, legacyContent, {encoding: "utf8", flag: "wx"});

        const setup = new SolcordSetupTransactions();
        const applied = await setup.apply({selectedAddons: [], selectedTheme: recoveryTheme.id});
        const journalRoot = path.join(appDataPath, "BetterDiscord", "solcord-transactions-v1");
        const backup = fs.readdirSync(journalRoot).find(file => file.endsWith(".legacy-theme-backup"));
        if (!backup) throw new Error("Expected a legacy theme backup.");
        fs.unlinkSync(path.join(journalRoot, backup));

        const rollback = await setup.rollback(applied.transactionId);
        expect(rollback.complete).toBeFalse();
        expect(rollback.removed).toHaveLength(0);
        expect(rollback.preserved).toHaveLength(SOLCORD_RUNTIME_THEMES.length);
        expect(fs.readFileSync(target, "utf8")).toBe(recoveryTheme.content);
    });

    test("preserves the installed themes when an expected legacy backup is corrupt", async () => {
        const themesRoot = path.join(appDataPath, "BetterDiscord", "themes");
        fs.mkdirSync(themesRoot, {recursive: true});
        const legacyContent = readLegacyDefaultThemeFixture();
        const target = path.join(themesRoot, "Solcord-Default.theme.css");
        fs.writeFileSync(target, legacyContent, {encoding: "utf8", flag: "wx"});

        const setup = new SolcordSetupTransactions();
        const applied = await setup.apply({selectedAddons: [], selectedTheme: recoveryTheme.id});
        const journalRoot = path.join(appDataPath, "BetterDiscord", "solcord-transactions-v1");
        const backup = fs.readdirSync(journalRoot).find(file => file.endsWith(".legacy-theme-backup"));
        if (!backup) throw new Error("Expected a legacy theme backup.");
        fs.writeFileSync(path.join(journalRoot, backup), "corrupt-backup", "utf8");

        const rollback = await setup.rollback(applied.transactionId);
        expect(rollback.complete).toBeFalse();
        expect(rollback.removed).toHaveLength(0);
        expect(rollback.preserved).toHaveLength(SOLCORD_RUNTIME_THEMES.length);
        expect(fs.readFileSync(target, "utf8")).toBe(recoveryTheme.content);
    });

    test("completes a rollback retry when the exact legacy target was already restored", async () => {
        const themesRoot = path.join(appDataPath, "BetterDiscord", "themes");
        fs.mkdirSync(themesRoot, {recursive: true});
        const legacyContent = readLegacyDefaultThemeFixture();
        const target = path.join(themesRoot, "Solcord-Default.theme.css");
        fs.writeFileSync(target, legacyContent, {encoding: "utf8", flag: "wx"});

        const setup = new SolcordSetupTransactions();
        const applied = await setup.apply({selectedAddons: [], selectedTheme: recoveryTheme.id});
        const journalRoot = path.join(appDataPath, "BetterDiscord", "solcord-transactions-v1");
        const backup = fs.readdirSync(journalRoot).find(file => file.endsWith(".legacy-theme-backup"));
        if (!backup) throw new Error("Expected a legacy theme backup.");
        fs.unlinkSync(target);
        fs.renameSync(path.join(journalRoot, backup), target);

        const rollback = await setup.rollback(applied.transactionId);
        expect(rollback.complete).toBeTrue();
        expect(rollback.preserved).toHaveLength(0);
        expect(fs.readFileSync(target, "utf8")).toBe(legacyContent);
    });

    test("preserves a modified malformed Solcord theme instead of treating it as a reviewed migration", async () => {
        const themesRoot = path.join(appDataPath, "BetterDiscord", "themes");
        fs.mkdirSync(themesRoot, {recursive: true});
        const legacyContent = readLegacyDefaultThemeFixture();
        const target = path.join(themesRoot, "Solcord-Default.theme.css");
        const modified = `${legacyContent}\n/* owner change */\n`;
        fs.writeFileSync(target, modified, {encoding: "utf8", flag: "wx"});

        await expect(new SolcordSetupTransactions().apply({selectedAddons: [], selectedTheme: recoveryTheme.id})).rejects.toThrow("different hash");
        expect(fs.readFileSync(target, "utf8")).toBe(modified);
    });

    test("acknowledges a settings-known prepared transaction after a renderer crash", async () => {
        const setup = new SolcordSetupTransactions();
        const prepared = await setup.apply({selectedAddons: [], selectedTheme: recoveryTheme.id});
        const journalRoot = path.join(appDataPath, "BetterDiscord", "solcord-transactions-v1");
        expect(fs.existsSync(path.join(journalRoot, `${prepared.transactionId}.prepared`))).toBeTrue();
        expect(fs.existsSync(path.join(journalRoot, `${prepared.transactionId}.complete`))).toBeFalse();

        const recovered = await new SolcordSetupTransactions().reconcile([prepared.transactionId]);
        expect(recovered).toEqual({committed: [prepared.transactionId], rolledBack: []});
        expect(fs.existsSync(path.join(journalRoot, `${prepared.transactionId}.prepared`))).toBeFalse();
        expect(fs.existsSync(path.join(journalRoot, `${prepared.transactionId}.complete`))).toBeTrue();
        expect((await setup.auditIntegrity()).filter(record => record.kind === "theme" && record.status === "match")).toHaveLength(SOLCORD_RUNTIME_THEMES.length);
    });

    test("rolls back a prepared transaction that renderer settings never recorded", async () => {
        const setup = new SolcordSetupTransactions();
        const prepared = await setup.apply({selectedAddons: [], selectedTheme: recoveryTheme.id});
        const recovered = await new SolcordSetupTransactions().reconcile([]);

        expect(recovered).toEqual({committed: [], rolledBack: [prepared.transactionId]});
        expect((await setup.auditIntegrity()).filter(record => record.kind === "theme" && record.status === "missing")).toHaveLength(SOLCORD_RUNTIME_THEMES.length);
    });

    test("rejects a theme directory junction instead of writing through it", async () => {
        const betterDiscord = path.join(appDataPath, "BetterDiscord");
        const outside = makeAppData();
        fs.mkdirSync(betterDiscord, {recursive: true});
        fs.symlinkSync(outside, path.join(betterDiscord, "themes"), "junction");

        const setup = new SolcordSetupTransactions();
        await expect(setup.apply({selectedAddons: [], selectedTheme: "obsidian-thread"})).rejects.toThrow(/link|directory/i);
        expect(fs.readdirSync(outside)).toHaveLength(0);
    });

    test("retries incomplete recovery without falsely journaling preserved owner changes as rolled back", async () => {
        const setup = new SolcordSetupTransactions();
        const original = await setup.apply({selectedAddons: [], selectedTheme: "obsidian-thread"});
        await setup.acknowledge(original.transactionId);
        const changed = path.join(appDataPath, "BetterDiscord", "themes", "Solcord-ObsidianThread.theme.css");
        const reviewedContent = fs.readFileSync(changed, "utf8");
        fs.appendFileSync(changed, "\n/* owner change during recovery */\n", "utf8");

        const journalRoot = path.join(appDataPath, "BetterDiscord", "solcord-transactions-v1");
        fs.unlinkSync(path.join(journalRoot, `${original.transactionId}.complete`));
        await expect(setup.apply({selectedAddons: [], selectedTheme: "obsidian-thread"})).rejects.toThrow("ambiguous transaction journal");
        expect(fs.readFileSync(changed, "utf8")).toContain("owner change during recovery");
        expect(fs.existsSync(path.join(journalRoot, `${original.transactionId}.rolledback`))).toBeFalse();
        expect(fs.existsSync(path.join(journalRoot, `${original.transactionId}.incomplete`))).toBeTrue();

        fs.writeFileSync(changed, reviewedContent, "utf8");
        const retry = await setup.apply({selectedAddons: [], selectedTheme: "obsidian-thread"});
        expect(retry.transactionId).not.toBe(original.transactionId);
        expect(fs.existsSync(path.join(journalRoot, `${original.transactionId}.rolledback`))).toBeTrue();
        expect((await setup.auditIntegrity()).filter(record => record.kind === "theme" && record.status === "match")).toHaveLength(SOLCORD_RUNTIME_THEMES.length);
    });
});

describe("Solcord setup transaction recovery ownership", () => {
    test("makes rollback replay a no-op after the durable rolledback marker", async () => {
        const setup = new SolcordSetupTransactions();
        const applied = await setup.apply({selectedAddons: [], selectedTheme: recoveryTheme.id});
        const first = await setup.rollback(applied.transactionId);
        expect(first.complete).toBeTrue();
        expect(first.removed).toHaveLength(SOLCORD_RUNTIME_THEMES.length);

        const restored = path.join(appDataPath, "BetterDiscord", "themes", recoveryTheme.fileName);
        fs.writeFileSync(restored, recoveryTheme.content, {encoding: "utf8", flag: "wx"});
        const replay = await setup.rollback(applied.transactionId);
        expect(replay).toEqual({complete: true, removed: [], preserved: []});
        expect(fs.readFileSync(restored, "utf8")).toBe(recoveryTheme.content);
    });

    test("preserves an exact owner file created before any transaction copy", async () => {
        const fixture = createRecoveryFixture("1111111111111111");
        fs.writeFileSync(fixture.target, recoveryTheme.content, {encoding: "utf8", flag: "wx"});

        await expect(triggerRecovery()).rejects.toThrow("ambiguous transaction journal");
        expect(fs.readFileSync(fixture.target, "utf8")).toBe(recoveryTheme.content);
        expect(fs.existsSync(path.join(fixture.journalRoot, `${fixture.transactionId}.rolledback`))).toBeFalse();
        expect(fs.existsSync(path.join(fixture.journalRoot, `${fixture.transactionId}.incomplete`))).toBeTrue();
    });

    test("removes a transaction-owned hard link after a crash before receipt persistence", async () => {
        const fixture = createRecoveryFixture("2222222222222222");
        fs.linkSync(fixture.stageFile, fixture.target);

        await expect(triggerRecovery()).rejects.toThrow("runtime installation review");
        expect(fs.existsSync(fixture.target)).toBeFalse();
        expect(fs.existsSync(fixture.stage)).toBeFalse();
        expect(fs.existsSync(path.join(fixture.journalRoot, `${fixture.transactionId}.rolledback`))).toBeTrue();
    });

    test("treats an exact allowlisted legacy target as already restored after a crash before backup", async () => {
        const fixture = createRecoveryFixture("2424242424242424");
        const legacyContent = readLegacyDefaultThemeFixture();
        const legacySha256 = crypto.createHash("sha256").update(legacyContent).digest("hex");
        fs.writeFileSync(fixture.target, legacyContent, {encoding: "utf8", flag: "wx"});

        const intentFile = path.join(fixture.journalRoot, `${fixture.transactionId}.intent.json`);
        const intent = JSON.parse(fs.readFileSync(intentFile, "utf8"));
        intent.legacyThemes = [{fileName: fixture.file.fileName, sha256: legacySha256}];
        fs.writeFileSync(intentFile, `${JSON.stringify(intent, null, 2)}\n`, "utf8");

        await expect(triggerRecovery()).rejects.toThrow("runtime installation review");
        expect(fs.readFileSync(fixture.target, "utf8")).toBe(legacyContent);
        expect(fs.existsSync(path.join(fixture.journalRoot, `${fixture.transactionId}.rolledback`))).toBeTrue();
        expect(fs.existsSync(path.join(fixture.journalRoot, `${fixture.transactionId}.incomplete`))).toBeFalse();
    });

    test("preserves an owner replacement whose identity differs from the durable receipt", async () => {
        const fixture = createRecoveryFixture("3333333333333333");
        fs.linkSync(fixture.stageFile, fixture.target);
        writeRecoveryReceipt(fixture, fixture.target);
        fs.unlinkSync(fixture.target);
        fs.writeFileSync(fixture.target, recoveryTheme.content, {encoding: "utf8", flag: "wx"});

        await expect(triggerRecovery()).rejects.toThrow("ambiguous transaction journal");
        expect(fs.readFileSync(fixture.target, "utf8")).toBe(recoveryTheme.content);
        expect(fs.existsSync(path.join(fixture.journalRoot, `${fixture.transactionId}.rolledback`))).toBeFalse();
        expect(fs.existsSync(path.join(fixture.journalRoot, `${fixture.transactionId}.incomplete`))).toBeTrue();
    });
});

describe("Solcord Message Timeline storage security", () => {
    test("falls back to account-isolated memory without creating plaintext files", async () => {
        encryptionAvailable = false;
        const timeline = new SolcordTimelineStorage();
        expect(await timeline.append("111222333", timelineRequest())).toEqual({stored: 1, persistent: false, retentionApplied: true});
        expect((await timeline.read("111222333", {policy: {retention: "7-days"}})).events).toHaveLength(1);
        expect((await timeline.read("444555666", {policy: {retention: "7-days"}})).events).toHaveLength(0);
        expect(fs.existsSync(path.join(appDataPath, "BetterDiscord"))).toBeFalse();
    });

    test("keeps the complete append batch in memory when an encrypted segment write fails", async () => {
        const originalWriteFileSync = fs.writeFileSync;
        const writableFs = fs as unknown as {writeFileSync: typeof fs.writeFileSync;};
        writableFs.writeFileSync = ((file: unknown, ...args: unknown[]) => {
            if (String(file).includes(".scseg.")) throw new Error("synthetic segment write failure");
            return (originalWriteFileSync as unknown as (target: unknown, ...values: unknown[]) => void)(file, ...args);
        }) as typeof fs.writeFileSync;
        try {
            const timeline = new SolcordTimelineStorage();
            const result = await timeline.append("111222333", timelineRequest({events: [
                timelineEvent({eventId: "write-failure-a", content: "first"}),
                timelineEvent({eventId: "write-failure-b", content: "second"})
            ]}));
            expect(result).toEqual({stored: 2, persistent: false, retentionApplied: false});
            expect(timeline.status()).toEqual(expect.objectContaining({persistent: false, sessionOnly: true}));
            const read = await timeline.read("111222333", {policy: {retention: "7-days"}});
            expect(read.events.map(event => event.eventId)).toEqual(["write-failure-a", "write-failure-b"]);
        }
        finally {writableFs.writeFileSync = originalWriteFileSync;}
    });

    test("encrypts persistent records, obscures the account directory, and completely clears its store", async () => {
        const timeline = new SolcordTimelineStorage();
        expect(await timeline.append("111222333", timelineRequest())).toEqual({stored: 1, persistent: true, retentionApplied: true});
        const store = firstTimelineStore();
        expect(path.basename(store)).not.toContain("111222333");
        const segment = fs.readdirSync(store).find(file => file.endsWith(".scseg"));
        if (!segment) throw new Error("Encrypted segment was not created.");
        const serialized = fs.readFileSync(path.join(store, segment), "utf8");
        expect(serialized).not.toContain("private-message-sentinel-25e14565");
        expect(serialized).not.toContain("local-label");

        const read = await timeline.read("111222333", {policy: {retention: "7-days"}});
        expect(read.persistent).toBeTrue();
        expect(read.events[0]?.content).toBe("private-message-sentinel-25e14565");
        const clear = await timeline.clear("111222333", {policy: {retention: "7-days"}});
        expect(clear.complete).toBeTrue();
        expect(clear.remaining).toBe(0);
        expect(clear.requiresOpaqueRecovery).toBeFalse();
        expect(fs.existsSync(store)).toBeFalse();
    });

    test("ignores an oversized forged segment before parsing it", async () => {
        const timeline = new SolcordTimelineStorage();
        await timeline.append("111222333", timelineRequest());
        const store = firstTimelineStore();
        fs.writeFileSync(path.join(store, "9999999999999999-aaaaaaaaaaaaaaaa.scseg"), "x".repeat(160 * 1024 + 1), "utf8");
        const read = await timeline.read("111222333", {policy: {retention: "7-days"}});
        expect(read.events).toHaveLength(1);
        expect(read.events[0]?.content).toBe("private-message-sentinel-25e14565");
        expect(read.complete).toBeFalse();
        expect(read.truncated).toBeFalse();
        expect(read.unreadableSegments).toBe(1);
        expect(read.retentionApplied).toBeFalse();
    });

    test("physically purges expired segments and the wrapped store key when retention becomes shorter", async () => {
        const timeline = new SolcordTimelineStorage();
        await timeline.append("111222333", timelineRequest({
            events: [timelineEvent({eventId: "evt-expired", observedAt: Date.now() - 172_800_000})],
            policy: {retention: "manual"}
        }));
        const store = firstTimelineStore();
        expect(fs.existsSync(path.join(store, "data.sc-key"))).toBeTrue();

        const read = await timeline.read("111222333", {policy: {retention: "24-hours"}});

        expect(read).toEqual({
            events: [],
            persistent: true,
            complete: true,
            truncated: false,
            omittedSegments: 0,
            unreadableSegments: 0,
            retentionApplied: true
        });
        expect(fs.existsSync(store)).toBeFalse();
        expect((await timeline.read("111222333", {policy: {retention: "manual"}})).events).toHaveLength(0);
    });

    test("session retention removes the persistent account store before returning memory", async () => {
        const timeline = new SolcordTimelineStorage();
        await timeline.append("111222333", timelineRequest({policy: {retention: "7-days"}}));
        const store = firstTimelineStore();

        const session = await timeline.read("111222333", {policy: {retention: "session"}});

        expect(session.complete).toBeTrue();
        expect(session.retentionApplied).toBeTrue();
        expect(session.persistent).toBeFalse();
        expect(session.events).toHaveLength(0);
        expect(fs.existsSync(store)).toBeFalse();
        expect((await timeline.read("111222333", {policy: {retention: "manual"}})).events).toHaveLength(0);
    });

    test("session retention preserves every opaque account store until explicit recovery", async () => {
        const writer = new SolcordTimelineStorage();
        await writer.append("111222333", timelineRequest({events: [timelineEvent({eventId: "account-a"})]}));
        await writer.append("444555666", timelineRequest({events: [timelineEvent({eventId: "account-b"})]}));
        const root = path.join(appDataPath, "BetterDiscord", "solcord-timeline-v1");
        const stores = fs.readdirSync(root).filter(entry => entry.startsWith("store-")).sort();
        expect(stores).toHaveLength(2);

        encryptionAvailable = false;
        const recovery = new SolcordTimelineStorage();
        const session = await recovery.read("111222333", {policy: {retention: "session"}});

        expect(session.persistent).toBeFalse();
        expect(session.complete).toBeFalse();
        expect(session.retentionApplied).toBeFalse();
        expect(session.events).toHaveLength(0);
        expect(fs.readdirSync(root).filter(entry => entry.startsWith("store-")).sort()).toEqual(stores);
        for (const store of stores) expect(fs.readdirSync(path.join(root, store)).some(entry => entry.endsWith(".scseg"))).toBeTrue();
    });

    test("memory-only reads apply a newly shortened retention policy", async () => {
        encryptionAvailable = false;
        const timeline = new SolcordTimelineStorage();
        await timeline.append("111222333", timelineRequest({
            events: [timelineEvent({eventId: "memory-expired", observedAt: Date.now() - 172_800_000})],
            policy: {retention: "7-days"}
        }));

        const read = await timeline.read("111222333", {policy: {retention: "24-hours"}});

        expect(read).toEqual({
            events: [],
            persistent: false,
            complete: true,
            truncated: false,
            omittedSegments: 0,
            unreadableSegments: 0,
            retentionApplied: true
        });
        expect((await timeline.read("111222333", {policy: {retention: "manual"}})).events).toHaveLength(0);
    });

    test("returns the newest bounded suffix and explicitly reports export truncation", async () => {
        const timeline = new SolcordTimelineStorage({readEvents: 1});
        const now = Date.now();
        await timeline.append("111222333", timelineRequest({
            events: [
                timelineEvent({eventId: "evt-older", observedAt: now - 10, content: "older"}),
                timelineEvent({eventId: "evt-newer", observedAt: now, content: "newer"})
            ],
            policy: {retention: "manual"}
        }));

        const read = await timeline.read("111222333", {policy: {retention: "manual"}});

        expect(read.events.map(event => event.content)).toEqual(["newer"]);
        expect(read.complete).toBeFalse();
        expect(read.truncated).toBeTrue();
        expect(read.omittedSegments).toBe(1);
        expect(read.unreadableSegments).toBe(0);
        expect(read.retentionApplied).toBeTrue();
    });

    test("fails closed to session-only when a wrapped key is corrupted", async () => {
        const timeline = new SolcordTimelineStorage();
        await timeline.append("111222333", timelineRequest());
        fs.writeFileSync(path.join(firstTimelineStore(), "data.sc-key"), "not-valid-wrapped-key", "utf8");
        const read = await timeline.read("111222333", {policy: {retention: "7-days"}});
        expect(read).toEqual({
            events: [],
            persistent: false,
            complete: false,
            truncated: false,
            omittedSegments: 0,
            unreadableSegments: 0,
            retentionApplied: false
        });
        expect(timeline.status().sessionOnly).toBeTrue();
        expect(timeline.status().reason).not.toContain(appDataPath);
    });

    test("rejects a timeline-root junction and keeps the event in memory", async () => {
        const betterDiscord = path.join(appDataPath, "BetterDiscord");
        const outside = makeAppData();
        fs.mkdirSync(betterDiscord, {recursive: true});
        fs.symlinkSync(outside, path.join(betterDiscord, "solcord-timeline-v1"), "junction");

        const timeline = new SolcordTimelineStorage();
        expect(await timeline.append("111222333", timelineRequest())).toEqual({stored: 1, persistent: false, retentionApplied: false});
        expect(timeline.status().sessionOnly).toBeTrue();
        expect(fs.readdirSync(outside)).toHaveLength(0);
    });

    test("rejects renderer account selection in every storage request", async () => {
        const timeline = new SolcordTimelineStorage();
        expect(() => timeline.append("111222333", {...timelineRequest(), accountId: "444555666"})).toThrow("cannot select an account");
        expect(() => timeline.read("111222333", {accountId: "444555666", policy: {retention: "7-days"}})).toThrow("cannot select an account");
        expect(() => timeline.clear("111222333", {accountId: "444555666", policy: {retention: "7-days"}})).toThrow("cannot select an account");
    });

    test("reports opaque persistent data and clears it only through explicit recovery", async () => {
        const writer = new SolcordTimelineStorage();
        await writer.append("111222333", timelineRequest());
        const store = firstTimelineStore();
        const timelineRoot = path.dirname(store);
        const identityTemporary = path.join(timelineRoot, "identity.sc-key.1234.cccccccc.tmp");
        fs.writeFileSync(identityTemporary, "wrapped-identity-key-fragment", "utf8");
        const segment = fs.readdirSync(store).find(file => file.endsWith(".scseg"));
        if (!segment) throw new Error("Encrypted segment was not created.");

        encryptionAvailable = false;
        const recovery = new SolcordTimelineStorage();
        const normal = await recovery.clear("111222333", {policy: {retention: "7-days"}});
        expect(normal.complete).toBeFalse();
        expect(normal.requiresOpaqueRecovery).toBeTrue();
        expect(normal.opaqueStores).toBe(1);
        expect(fs.existsSync(path.join(store, segment))).toBeTrue();
        expect(fs.existsSync(identityTemporary)).toBeTrue();

        const explicit = await recovery.clear("111222333", {policy: {retention: "7-days"}, clearOpaqueStores: true});
        expect(explicit.complete).toBeTrue();
        expect(explicit.remaining).toBe(0);
        expect(explicit.opaqueStores).toBe(1);
        expect(fs.existsSync(store)).toBeFalse();
        expect(fs.existsSync(identityTemporary)).toBeFalse();
    });

    test("clear removes recent temporary artifacts and the wrapped store key", async () => {
        const timeline = new SolcordTimelineStorage();
        await timeline.append("111222333", timelineRequest());
        const store = firstTimelineStore();
        const temporary = path.join(store, "9999999999999999-aaaaaaaaaaaaaaaa.scseg.1234.bbbbbbbb.tmp");
        fs.writeFileSync(temporary, "partial", "utf8");

        const result = await timeline.clear("111222333", {policy: {retention: "7-days"}});
        expect(result.complete).toBeTrue();
        expect(result.remaining).toBe(0);
        expect(fs.existsSync(store)).toBeFalse();
    });

    test("keeps and reports an unexpected root file during opaque recovery", async () => {
        const timeline = new SolcordTimelineStorage();
        await timeline.append("111222333", timelineRequest());
        const root = path.dirname(firstTimelineStore());
        const unexpected = path.join(root, "orphaned-segment.bin");
        fs.writeFileSync(unexpected, "encrypted-residue", "utf8");

        const result = await timeline.clear("111222333", {policy: {retention: "7-days"}, clearOpaqueStores: true});

        expect(result.complete).toBeFalse();
        expect(result.remaining).toBeGreaterThanOrEqual(1);
        expect(result.requiresOpaqueRecovery).toBeTrue();
        expect(fs.readFileSync(unexpected, "utf8")).toBe("encrypted-residue");
    });

    test("keeps and reports an unexpected root directory during opaque recovery", async () => {
        const timeline = new SolcordTimelineStorage();
        await timeline.append("111222333", timelineRequest());
        const root = path.dirname(firstTimelineStore());
        const unexpected = path.join(root, "legacy-store-format");
        fs.mkdirSync(unexpected);
        fs.writeFileSync(path.join(unexpected, "payload.scseg"), "encrypted-residue", "utf8");

        const result = await timeline.clear("111222333", {policy: {retention: "7-days"}, clearOpaqueStores: true});

        expect(result.complete).toBeFalse();
        expect(result.remaining).toBeGreaterThanOrEqual(1);
        expect(result.requiresOpaqueRecovery).toBeTrue();
        expect(fs.readFileSync(path.join(unexpected, "payload.scseg"), "utf8")).toBe("encrypted-residue");
    });

    test("keeps and reports an unexpected root symlink or reparse point", async () => {
        const timeline = new SolcordTimelineStorage();
        await timeline.append("111222333", timelineRequest());
        const root = path.dirname(firstTimelineStore());
        const outside = makeAppData();
        const sentinel = path.join(outside, "outside-sentinel.txt");
        fs.writeFileSync(sentinel, "outside", "utf8");
        const unexpected = path.join(root, "unreviewed-reparse");
        fs.symlinkSync(outside, unexpected, process.platform === "win32" ? "junction" : "dir");

        const result = await timeline.clear("111222333", {policy: {retention: "7-days"}, clearOpaqueStores: true});

        expect(result.complete).toBeFalse();
        expect(result.remaining).toBeGreaterThanOrEqual(1);
        expect(result.requiresOpaqueRecovery).toBeTrue();
        expect(fs.readFileSync(sentinel, "utf8")).toBe("outside");
        expect(fs.lstatSync(unexpected).isSymbolicLink()).toBeTrue();
    });

    test("retains the known identity key and removes its recognized temporary file", async () => {
        const timeline = new SolcordTimelineStorage();
        await timeline.append("111222333", timelineRequest());
        const root = path.dirname(firstTimelineStore());
        const identity = path.join(root, "identity.sc-key");
        const temporary = path.join(root, "identity.sc-key.1234.abcdef12.tmp");
        fs.writeFileSync(temporary, "wrapped-fragment", "utf8");

        const result = await timeline.clear("111222333", {policy: {retention: "7-days"}, clearOpaqueStores: true});

        expect(result.complete).toBeTrue();
        expect(result.remaining).toBe(0);
        expect(fs.existsSync(identity)).toBeTrue();
        expect(fs.existsSync(temporary)).toBeFalse();
    });
});

describe("Solcord Friend Watch storage security", () => {
    test("persists a subject-free account reconciliation marker", async () => {
        const storage = new SolcordFriendWatchStorage();
        const marker = {eventId: "reconcile_evt_1", observedAt: Date.now(), transition: "reconciled", label: "Session relationship snapshot reconciled", source: "reconciliation", confidence: "unknown", schemaVersion: 1};

        await storage.append("111222333", {events: [marker], retentionDays: 30});
        const [stored] = (await storage.read("111222333", {retentionDays: 30})).events;

        expect(stored).toMatchObject({eventId: "reconcile_evt_1", transition: "reconciled", source: "reconciliation"});
        expect(stored?.subjectId).toBeUndefined();
        expect(stored?.subjectKey).toBeUndefined();
    });

    test("falls back to account-isolated memory without writing plaintext", async () => {
        encryptionAvailable = false;
        const storage = new SolcordFriendWatchStorage();
        const appended = await storage.append("111222333", {events: [friendWatchEvent()], retentionDays: 30});
        expect(appended.persistent).toBeFalse();
        expect((await storage.read("111222333", {retentionDays: 30})).events).toHaveLength(1);
        expect((await storage.read("444555666", {retentionDays: 30})).events).toHaveLength(0);
        expect(fs.existsSync(path.join(appDataPath, "BetterDiscord"))).toBeFalse();
    });

    test("encrypts account-isolated history and clears only the bound store", async () => {
        const storage = new SolcordFriendWatchStorage();
        expect((await storage.append("111222333", {events: [friendWatchEvent()], retentionDays: 30})).persistent).toBeTrue();
        const store = firstFriendWatchStore();
        expect(path.basename(store)).not.toContain("111222333");
        const serialized = fs.readFileSync(path.join(store, "events.scdb"), "utf8");
        expect(serialized).not.toContain("private-profile-sentinel-f99b0a");
        expect(serialized).not.toContain("123456789");
        const storedEvent = (await storage.read("111222333", {retentionDays: 30})).events[0];
        expect(storedEvent?.displayLabel).toBe("private-profile-sentinel-f99b0a");
        expect(storedEvent?.subjectId).toBeUndefined();
        expect(storedEvent?.subjectKey).toMatch(/^[0-9a-f]{64}$/);
        expect(await storage.clear("111222333", {retentionDays: 30})).toMatchObject({complete: true});
        expect(fs.existsSync(store)).toBeFalse();
    });

    test("binds encrypted key-envelope pairs to the opaque account store", async () => {
        const writer = new SolcordFriendWatchStorage();
        await writer.append("111222333", {events: [friendWatchEvent({eventId: "friend_evt_account_a", displayLabel: "account-a"})], retentionDays: 30});
        const root = path.dirname(firstFriendWatchStore());
        const storeA = path.join(root, fs.readdirSync(root).find(entry => entry.startsWith("store-"))!);
        await writer.append("444555666", {events: [friendWatchEvent({eventId: "friend_evt_account_b", displayLabel: "account-b"})], retentionDays: 30});
        const storeB = path.join(root, fs.readdirSync(root).filter(entry => entry.startsWith("store-")).find(entry => path.join(root, entry) !== storeA)!);
        fs.copyFileSync(path.join(storeB, "data.sc-key"), path.join(storeA, "data.sc-key"));
        fs.copyFileSync(path.join(storeB, "events.scdb"), path.join(storeA, "events.scdb"));

        const swapped = await new SolcordFriendWatchStorage().read("111222333", {retentionDays: 30});

        expect(swapped).toMatchObject({persistent: false, complete: false, events: []});
        expect(JSON.stringify(swapped)).not.toContain("account-b");
    });

    test("rejects renderer account selection and a linked storage root", async () => {
        const storage = new SolcordFriendWatchStorage();
        expect(() => storage.append("111222333", {accountId: "444555666", events: [friendWatchEvent()], retentionDays: 30})).toThrow("cannot select an account");

        const betterDiscord = path.join(appDataPath, "BetterDiscord");
        const outside = makeAppData();
        fs.mkdirSync(betterDiscord, {recursive: true});
        fs.symlinkSync(outside, path.join(betterDiscord, "solcord-friend-watch-v1"), "junction");
        const fallback = await new SolcordFriendWatchStorage().append("111222333", {events: [friendWatchEvent()], retentionDays: 30});
        expect(fallback.persistent).toBeFalse();
        expect(fs.readdirSync(outside)).toHaveLength(0);
    });

    test("recovers one interrupted replacement and removes recognized temporary residue", async () => {
        const writer = new SolcordFriendWatchStorage();
        await writer.append("111222333", {events: [friendWatchEvent()], retentionDays: 30});
        const store = firstFriendWatchStore();
        const target = path.join(store, "events.scdb");
        const backup = path.join(store, "events.scdb.1234.abcdef12.old");
        const temporary = path.join(store, "events.scdb.1234.1234abcd.tmp");
        fs.renameSync(target, backup);
        fs.writeFileSync(temporary, "interrupted-new-envelope", "utf8");

        const recovered = await new SolcordFriendWatchStorage().read("111222333", {retentionDays: 30});

        expect(recovered).toMatchObject({persistent: true, complete: true});
        expect(recovered.events[0]?.displayLabel).toBe("private-profile-sentinel-f99b0a");
        expect(fs.existsSync(target)).toBeTrue();
        expect(fs.existsSync(backup)).toBeFalse();
        expect(fs.existsSync(temporary)).toBeFalse();
    });

    test("authenticates a replacement before discarding the known-good backup", async () => {
        const writer = new SolcordFriendWatchStorage();
        await writer.append("111222333", {events: [friendWatchEvent()], retentionDays: 30});
        const store = firstFriendWatchStore();
        const target = path.join(store, "events.scdb");
        const backup = path.join(store, "events.scdb.1234.abcdef12.old");
        fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);
        fs.writeFileSync(target, "corrupt-replacement", "utf8");

        const recovered = await new SolcordFriendWatchStorage().read("111222333", {retentionDays: 30});

        expect(recovered).toMatchObject({persistent: true, complete: true});
        expect(recovered.events[0]?.eventId).toBe("friend_evt_1");
        expect(fs.existsSync(backup)).toBeFalse();
        expect(fs.readFileSync(target, "utf8")).not.toBe("corrupt-replacement");
    });

    test("preserves and reports an unexpected account-store artifact during clear", async () => {
        const storage = new SolcordFriendWatchStorage();
        await storage.append("111222333", {events: [friendWatchEvent()], retentionDays: 30});
        const store = firstFriendWatchStore();
        const unexpected = path.join(store, "owner-residue.bin");
        fs.writeFileSync(unexpected, "preserve", "utf8");

        const result = await storage.clear("111222333", {retentionDays: 30});

        expect(result.complete).toBeFalse();
        expect(result.persistent).toBeFalse();
        expect(fs.readFileSync(unexpected, "utf8")).toBe("preserve");
    });

    test("fails closed to memory when secure storage returns an oversized wrapped key", async () => {
        oversizedWrappedKey = true;
        const storage = new SolcordFriendWatchStorage();

        const appended = await storage.append("111222333", {events: [friendWatchEvent()], retentionDays: 30});

        expect(appended.persistent).toBeFalse();
        expect(appended.events).toHaveLength(1);
        expect(storage.status().sessionOnly).toBeTrue();
        expect(fs.existsSync(path.join(appDataPath, "BetterDiscord", "solcord-friend-watch-v1", "identity.sc-key"))).toBeFalse();
    });
});
