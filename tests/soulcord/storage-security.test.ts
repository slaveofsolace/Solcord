import {afterEach, beforeEach, describe, expect, mock, test} from "bun:test";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

import {SOULCORD_RUNTIME_ADDONS, SOULCORD_RUNTIME_THEMES} from "../../src/common/soulcord/addon-catalog.generated";


let appDataPath = "";
let encryptionAvailable = true;
let oversizedWrappedKey = false;

mock.module("electron", () => ({
    app: {getPath: (name: string) => name === "userData" ? path.join(appDataPath, "Discord") : appDataPath},
    net: {fetch: async () => {throw new Error("Unexpected network request in storage security test.");}},
    safeStorage: {
        isEncryptionAvailable: () => encryptionAvailable,
        encryptString: (value: string) => oversizedWrappedKey ? Buffer.alloc(9 * 1024, 1) : Buffer.from(`soulcord-test:${value}`, "utf8"),
        decryptString: (value: Buffer) => {
            const decoded = value.toString("utf8");
            if (!decoded.startsWith("soulcord-test:")) throw new Error("Invalid wrapped test key.");
            return decoded.slice("soulcord-test:".length);
        }
    }
}));

const {SoulCordSetupTransactions, validatePinnedSourceUrl} = await import("../../src/electron/main/modules/soulcord-setup");
const {SoulCordTimelineStorage} = await import("../../src/electron/main/modules/soulcord-timeline");
const {SoulCordFriendWatchStorage} = await import("../../src/electron/main/modules/soulcord-friend-watch");

const temporaryRoots: string[] = [];

function makeAppData(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "soulcord-storage-security-"));
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
    const root = path.join(appDataPath, "BetterDiscord", "soulcord-timeline-v1");
    const name = fs.readdirSync(root).find(entry => entry.startsWith("store-"));
    if (!name) throw new Error("Timeline account store was not created.");
    return path.join(root, name);
}

function firstFriendWatchStore(): string {
    const root = path.join(appDataPath, "BetterDiscord", "soulcord-friend-watch-v1");
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

const recoveryTheme = SOULCORD_RUNTIME_THEMES[0];
const heldAddon = SOULCORD_RUNTIME_ADDONS[0];

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
    const journalRoot = path.join(betterDiscordRoot, "soulcord-transactions-v1");
    const stage = path.join(betterDiscordRoot, "soulcord-staging-v1", transactionId);
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
    const setup = new SoulCordSetupTransactions();
    await setup.apply({selectedAddons: [heldAddon.name], selectedTheme: recoveryTheme.id});
}

beforeEach(() => {
    appDataPath = makeAppData();
    encryptionAvailable = true;
    oversizedWrappedKey = false;
});

afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
        const resolved = path.resolve(root);
        if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith("soulcord-storage-security-")) throw new Error("Refusing unsafe test cleanup.");
        fs.rmSync(resolved, {recursive: true, force: true});
    }
});

describe("SoulCord setup transaction security", () => {
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
        const setup = new SoulCordSetupTransactions();
        await expect(setup.apply({selectedAddons: ["InvisibleTyping"], selectedTheme: "obsidian-thread"})).rejects.toThrow("runtime installation review");
        expect(fs.existsSync(path.join(appDataPath, "BetterDiscord", "plugins", "InvisibleTyping.plugin.js"))).toBeFalse();
    });

    test("installs embedded themes transactionally and preserves a changed file on rollback", async () => {
        const setup = new SoulCordSetupTransactions();
        const result = await setup.apply({selectedAddons: [], selectedTheme: "obsidian-thread"});
        expect(result.added).toHaveLength(5);

        const before = await setup.auditIntegrity();
        expect(before.filter(record => record.kind === "theme" && record.status === "match")).toHaveLength(5);
        expect(JSON.stringify(before)).not.toContain(appDataPath);

        const changed = path.join(appDataPath, "BetterDiscord", "themes", "SoulCord-ObsidianThread.theme.css");
        const reviewedContent = fs.readFileSync(changed, "utf8");
        fs.appendFileSync(changed, "\n/* owner change */\n", "utf8");
        const rollback = await setup.rollback(result.transactionId);
        expect(rollback.complete).toBeFalse();
        expect(rollback.removed).toHaveLength(4);
        expect(rollback.preserved).toHaveLength(1);
        expect(fs.readFileSync(changed, "utf8")).toContain("owner change");

        const after = await setup.auditIntegrity();
        expect(after.find(record => record.kind === "theme" && record.name === "Obsidian Thread")?.status).toBe("mismatch");
        expect(after.filter(record => record.kind === "theme" && record.status === "missing")).toHaveLength(4);

        fs.writeFileSync(changed, reviewedContent, "utf8");
        const retry = await setup.rollback(result.transactionId);
        expect(retry.complete).toBeTrue();
        expect(retry.removed).toHaveLength(1);
        expect(retry.preserved).toHaveLength(0);
        expect(fs.existsSync(changed)).toBeFalse();
    });

    test("acknowledges a settings-known prepared transaction after a renderer crash", async () => {
        const setup = new SoulCordSetupTransactions();
        const prepared = await setup.apply({selectedAddons: [], selectedTheme: recoveryTheme.id});
        const journalRoot = path.join(appDataPath, "BetterDiscord", "soulcord-transactions-v1");
        expect(fs.existsSync(path.join(journalRoot, `${prepared.transactionId}.prepared`))).toBeTrue();
        expect(fs.existsSync(path.join(journalRoot, `${prepared.transactionId}.complete`))).toBeFalse();

        const recovered = await new SoulCordSetupTransactions().reconcile([prepared.transactionId]);
        expect(recovered).toEqual({committed: [prepared.transactionId], rolledBack: []});
        expect(fs.existsSync(path.join(journalRoot, `${prepared.transactionId}.prepared`))).toBeFalse();
        expect(fs.existsSync(path.join(journalRoot, `${prepared.transactionId}.complete`))).toBeTrue();
        expect((await setup.auditIntegrity()).filter(record => record.kind === "theme" && record.status === "match")).toHaveLength(5);
    });

    test("rolls back a prepared transaction that renderer settings never recorded", async () => {
        const setup = new SoulCordSetupTransactions();
        const prepared = await setup.apply({selectedAddons: [], selectedTheme: recoveryTheme.id});
        const recovered = await new SoulCordSetupTransactions().reconcile([]);

        expect(recovered).toEqual({committed: [], rolledBack: [prepared.transactionId]});
        expect((await setup.auditIntegrity()).filter(record => record.kind === "theme" && record.status === "missing")).toHaveLength(5);
    });

    test("rejects a theme directory junction instead of writing through it", async () => {
        const betterDiscord = path.join(appDataPath, "BetterDiscord");
        const outside = makeAppData();
        fs.mkdirSync(betterDiscord, {recursive: true});
        fs.symlinkSync(outside, path.join(betterDiscord, "themes"), "junction");

        const setup = new SoulCordSetupTransactions();
        await expect(setup.apply({selectedAddons: [], selectedTheme: "obsidian-thread"})).rejects.toThrow(/link|directory/i);
        expect(fs.readdirSync(outside)).toHaveLength(0);
    });

    test("retries incomplete recovery without falsely journaling preserved owner changes as rolled back", async () => {
        const setup = new SoulCordSetupTransactions();
        const original = await setup.apply({selectedAddons: [], selectedTheme: "obsidian-thread"});
        await setup.acknowledge(original.transactionId);
        const changed = path.join(appDataPath, "BetterDiscord", "themes", "SoulCord-ObsidianThread.theme.css");
        const reviewedContent = fs.readFileSync(changed, "utf8");
        fs.appendFileSync(changed, "\n/* owner change during recovery */\n", "utf8");

        const journalRoot = path.join(appDataPath, "BetterDiscord", "soulcord-transactions-v1");
        fs.unlinkSync(path.join(journalRoot, `${original.transactionId}.complete`));
        await expect(setup.apply({selectedAddons: [], selectedTheme: "obsidian-thread"})).rejects.toThrow("ambiguous transaction journal");
        expect(fs.readFileSync(changed, "utf8")).toContain("owner change during recovery");
        expect(fs.existsSync(path.join(journalRoot, `${original.transactionId}.rolledback`))).toBeFalse();
        expect(fs.existsSync(path.join(journalRoot, `${original.transactionId}.incomplete`))).toBeTrue();

        fs.writeFileSync(changed, reviewedContent, "utf8");
        const retry = await setup.apply({selectedAddons: [], selectedTheme: "obsidian-thread"});
        expect(retry.transactionId).not.toBe(original.transactionId);
        expect(fs.existsSync(path.join(journalRoot, `${original.transactionId}.rolledback`))).toBeTrue();
        expect((await setup.auditIntegrity()).filter(record => record.kind === "theme" && record.status === "match")).toHaveLength(5);
    });
});

describe("SoulCord setup transaction recovery ownership", () => {
    test("makes rollback replay a no-op after the durable rolledback marker", async () => {
        const setup = new SoulCordSetupTransactions();
        const applied = await setup.apply({selectedAddons: [], selectedTheme: recoveryTheme.id});
        const first = await setup.rollback(applied.transactionId);
        expect(first.complete).toBeTrue();
        expect(first.removed).toHaveLength(SOULCORD_RUNTIME_THEMES.length);

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

describe("SoulCord Message Timeline storage security", () => {
    test("falls back to account-isolated memory without creating plaintext files", async () => {
        encryptionAvailable = false;
        const timeline = new SoulCordTimelineStorage();
        expect(await timeline.append("111222333", timelineRequest())).toEqual({stored: 1, persistent: false, retentionApplied: true});
        expect((await timeline.read("111222333", {policy: {retention: "7-days"}})).events).toHaveLength(1);
        expect((await timeline.read("444555666", {policy: {retention: "7-days"}})).events).toHaveLength(0);
        expect(fs.existsSync(path.join(appDataPath, "BetterDiscord"))).toBeFalse();
    });

    test("encrypts persistent records, obscures the account directory, and completely clears its store", async () => {
        const timeline = new SoulCordTimelineStorage();
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
        const timeline = new SoulCordTimelineStorage();
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
        const timeline = new SoulCordTimelineStorage();
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
        const timeline = new SoulCordTimelineStorage();
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
        const writer = new SoulCordTimelineStorage();
        await writer.append("111222333", timelineRequest({events: [timelineEvent({eventId: "account-a"})]}));
        await writer.append("444555666", timelineRequest({events: [timelineEvent({eventId: "account-b"})]}));
        const root = path.join(appDataPath, "BetterDiscord", "soulcord-timeline-v1");
        const stores = fs.readdirSync(root).filter(entry => entry.startsWith("store-")).sort();
        expect(stores).toHaveLength(2);

        encryptionAvailable = false;
        const recovery = new SoulCordTimelineStorage();
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
        const timeline = new SoulCordTimelineStorage();
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
        const timeline = new SoulCordTimelineStorage({readEvents: 1});
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
        const timeline = new SoulCordTimelineStorage();
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
        fs.symlinkSync(outside, path.join(betterDiscord, "soulcord-timeline-v1"), "junction");

        const timeline = new SoulCordTimelineStorage();
        expect(await timeline.append("111222333", timelineRequest())).toEqual({stored: 1, persistent: false, retentionApplied: false});
        expect(timeline.status().sessionOnly).toBeTrue();
        expect(fs.readdirSync(outside)).toHaveLength(0);
    });

    test("rejects renderer account selection in every storage request", async () => {
        const timeline = new SoulCordTimelineStorage();
        expect(() => timeline.append("111222333", {...timelineRequest(), accountId: "444555666"})).toThrow("cannot select an account");
        expect(() => timeline.read("111222333", {accountId: "444555666", policy: {retention: "7-days"}})).toThrow("cannot select an account");
        expect(() => timeline.clear("111222333", {accountId: "444555666", policy: {retention: "7-days"}})).toThrow("cannot select an account");
    });

    test("reports opaque persistent data and clears it only through explicit recovery", async () => {
        const writer = new SoulCordTimelineStorage();
        await writer.append("111222333", timelineRequest());
        const store = firstTimelineStore();
        const timelineRoot = path.dirname(store);
        const identityTemporary = path.join(timelineRoot, "identity.sc-key.1234.cccccccc.tmp");
        fs.writeFileSync(identityTemporary, "wrapped-identity-key-fragment", "utf8");
        const segment = fs.readdirSync(store).find(file => file.endsWith(".scseg"));
        if (!segment) throw new Error("Encrypted segment was not created.");

        encryptionAvailable = false;
        const recovery = new SoulCordTimelineStorage();
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
        const timeline = new SoulCordTimelineStorage();
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
        const timeline = new SoulCordTimelineStorage();
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
        const timeline = new SoulCordTimelineStorage();
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
        const timeline = new SoulCordTimelineStorage();
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
        const timeline = new SoulCordTimelineStorage();
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

describe("SoulCord Friend Watch storage security", () => {
    test("persists a subject-free account reconciliation marker", async () => {
        const storage = new SoulCordFriendWatchStorage();
        const marker = {eventId: "reconcile_evt_1", observedAt: Date.now(), transition: "reconciled", label: "Session relationship snapshot reconciled", source: "reconciliation", confidence: "unknown", schemaVersion: 1};

        await storage.append("111222333", {events: [marker], retentionDays: 30});
        const [stored] = (await storage.read("111222333", {retentionDays: 30})).events;

        expect(stored).toMatchObject({eventId: "reconcile_evt_1", transition: "reconciled", source: "reconciliation"});
        expect(stored?.subjectId).toBeUndefined();
        expect(stored?.subjectKey).toBeUndefined();
    });

    test("falls back to account-isolated memory without writing plaintext", async () => {
        encryptionAvailable = false;
        const storage = new SoulCordFriendWatchStorage();
        const appended = await storage.append("111222333", {events: [friendWatchEvent()], retentionDays: 30});
        expect(appended.persistent).toBeFalse();
        expect((await storage.read("111222333", {retentionDays: 30})).events).toHaveLength(1);
        expect((await storage.read("444555666", {retentionDays: 30})).events).toHaveLength(0);
        expect(fs.existsSync(path.join(appDataPath, "BetterDiscord"))).toBeFalse();
    });

    test("encrypts account-isolated history and clears only the bound store", async () => {
        const storage = new SoulCordFriendWatchStorage();
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
        const writer = new SoulCordFriendWatchStorage();
        await writer.append("111222333", {events: [friendWatchEvent({eventId: "friend_evt_account_a", displayLabel: "account-a"})], retentionDays: 30});
        const root = path.dirname(firstFriendWatchStore());
        const storeA = path.join(root, fs.readdirSync(root).find(entry => entry.startsWith("store-"))!);
        await writer.append("444555666", {events: [friendWatchEvent({eventId: "friend_evt_account_b", displayLabel: "account-b"})], retentionDays: 30});
        const storeB = path.join(root, fs.readdirSync(root).filter(entry => entry.startsWith("store-")).find(entry => path.join(root, entry) !== storeA)!);
        fs.copyFileSync(path.join(storeB, "data.sc-key"), path.join(storeA, "data.sc-key"));
        fs.copyFileSync(path.join(storeB, "events.scdb"), path.join(storeA, "events.scdb"));

        const swapped = await new SoulCordFriendWatchStorage().read("111222333", {retentionDays: 30});

        expect(swapped).toMatchObject({persistent: false, complete: false, events: []});
        expect(JSON.stringify(swapped)).not.toContain("account-b");
    });

    test("rejects renderer account selection and a linked storage root", async () => {
        const storage = new SoulCordFriendWatchStorage();
        expect(() => storage.append("111222333", {accountId: "444555666", events: [friendWatchEvent()], retentionDays: 30})).toThrow("cannot select an account");

        const betterDiscord = path.join(appDataPath, "BetterDiscord");
        const outside = makeAppData();
        fs.mkdirSync(betterDiscord, {recursive: true});
        fs.symlinkSync(outside, path.join(betterDiscord, "soulcord-friend-watch-v1"), "junction");
        const fallback = await new SoulCordFriendWatchStorage().append("111222333", {events: [friendWatchEvent()], retentionDays: 30});
        expect(fallback.persistent).toBeFalse();
        expect(fs.readdirSync(outside)).toHaveLength(0);
    });

    test("recovers one interrupted replacement and removes recognized temporary residue", async () => {
        const writer = new SoulCordFriendWatchStorage();
        await writer.append("111222333", {events: [friendWatchEvent()], retentionDays: 30});
        const store = firstFriendWatchStore();
        const target = path.join(store, "events.scdb");
        const backup = path.join(store, "events.scdb.1234.abcdef12.old");
        const temporary = path.join(store, "events.scdb.1234.1234abcd.tmp");
        fs.renameSync(target, backup);
        fs.writeFileSync(temporary, "interrupted-new-envelope", "utf8");

        const recovered = await new SoulCordFriendWatchStorage().read("111222333", {retentionDays: 30});

        expect(recovered).toMatchObject({persistent: true, complete: true});
        expect(recovered.events[0]?.displayLabel).toBe("private-profile-sentinel-f99b0a");
        expect(fs.existsSync(target)).toBeTrue();
        expect(fs.existsSync(backup)).toBeFalse();
        expect(fs.existsSync(temporary)).toBeFalse();
    });

    test("authenticates a replacement before discarding the known-good backup", async () => {
        const writer = new SoulCordFriendWatchStorage();
        await writer.append("111222333", {events: [friendWatchEvent()], retentionDays: 30});
        const store = firstFriendWatchStore();
        const target = path.join(store, "events.scdb");
        const backup = path.join(store, "events.scdb.1234.abcdef12.old");
        fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);
        fs.writeFileSync(target, "corrupt-replacement", "utf8");

        const recovered = await new SoulCordFriendWatchStorage().read("111222333", {retentionDays: 30});

        expect(recovered).toMatchObject({persistent: true, complete: true});
        expect(recovered.events[0]?.eventId).toBe("friend_evt_1");
        expect(fs.existsSync(backup)).toBeFalse();
        expect(fs.readFileSync(target, "utf8")).not.toBe("corrupt-replacement");
    });

    test("preserves and reports an unexpected account-store artifact during clear", async () => {
        const storage = new SoulCordFriendWatchStorage();
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
        const storage = new SoulCordFriendWatchStorage();

        const appended = await storage.append("111222333", {events: [friendWatchEvent()], retentionDays: 30});

        expect(appended.persistent).toBeFalse();
        expect(appended.events).toHaveLength(1);
        expect(storage.status().sessionOnly).toBeTrue();
        expect(fs.existsSync(path.join(appDataPath, "BetterDiscord", "soulcord-friend-watch-v1", "identity.sc-key"))).toBeFalse();
    });
});
