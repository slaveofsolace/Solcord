// SPDX-License-Identifier: Apache-2.0

import {mkdir, writeFile} from "node:fs/promises";
import {isAbsolute, join} from "node:path";
import {PropertySymbol} from "happy-dom";

import {
    SolcordAudioConsoleController,
    SolcordCallContextController,
    SolcordChannelGlanceController,
    SolcordComposerToolkitController,
    SolcordLocalIdentityNotesController,
    SolcordMotionStudioController,
    SolcordNotificationReviewController,
    SolcordPeopleSpacesController,
    SolcordPermissionLensController,
    SolcordTranslationDeskController,
    SolcordV2Lifecycle,
    SolcordVoiceHealthController,
    SolcordVoiceNoteStudioController
} from "../src/common/solcord/v2-feature-models";
import {SolcordBaselineSuite} from "../src/betterdiscord/modules/solcord/baseline-suite";
import {SolcordDisposalScope, type SolcordResourceKind} from "../src/betterdiscord/modules/solcord/disposal";
import {SolcordStreamAudienceGuard, type SolcordAudienceGuardAdapter} from "../src/betterdiscord/modules/solcord/stream-audience-guard";

const EVIDENCE_KIND = "non-live synthetic backend lifecycle soak";
const DEFAULT_DURATION_MS = 30 * 60 * 1_000;
const DEFAULT_CYCLE_DELAY_MS = 100;
const DEFAULT_SAMPLE_INTERVAL_MS = 30_000;
const DEFAULT_HEAP_GROWTH_LIMIT_BYTES = 64 * 1024 * 1024;
const MAX_MEMORY_SAMPLES = 256;
const RESOURCE_KINDS: readonly SolcordResourceKind[] = [
    "listener", "timer", "interval", "observer", "style", "element", "patch", "cache", "media",
    "audio-context", "track", "object-url", "other"
];

export interface SolcordBackendSoakOptions {
    durationMs?: number;
    cycleDelayMs?: number;
    sampleIntervalMs?: number;
    heapGrowthLimitBytes?: number;
    maxCycles?: number;
    scenario?: SolcordBackendSoakScenario;
}

export type SolcordBackendSoakScenario = "all" | "disposal" | "dom-control" | "baseline" | "layout" | "embed" | "autoscroll" | "link-preview" | "controllers" | "audience";

export interface SolcordBackendSoakMemorySample {
    elapsedMs: number;
    rssBytes: number;
    heapUsedBytes: number;
    externalBytes: number;
}

export interface SolcordBackendSoakReport {
    version: 1;
    evidenceKind: typeof EVIDENCE_KIND;
    startedAt: string;
    finishedAt: string;
    configuredDurationMs: number;
    scenario: SolcordBackendSoakScenario;
    elapsedMs: number;
    cycles: number;
    adapterExecutions: 0;
    maximumVoiceHealthSamples: number;
    maximumOwnedResources: number;
    fixtureQueryCacheResets: number;
    baselineHeapUsedBytes: number;
    finalHeapUsedBytes: number;
    finalHeapGrowthBytes: number;
    heapGrowthLimitBytes: number;
    peakHeapUsedBytes: number;
    peakRssBytes: number;
    memorySamples: SolcordBackendSoakMemorySample[];
    failures: string[];
    pass: boolean;
    nonclaims: string[];
}

interface DisposableController {
    resourceCounts(): Readonly<Record<string, number>>;
    dispose(): void;
}

interface CycleResult {
    maximumOwnedResources: number;
    voiceHealthSamples: number;
}

function finiteInteger(value: number | undefined, fallback: number, minimum: number, maximum: number, label: string): number {
    const candidate = value ?? fallback;
    if (!Number.isInteger(candidate) || candidate < minimum || candidate > maximum) throw new Error(`${label} must be an integer from ${minimum} through ${maximum}.`);
    return candidate;
}

function countResources(counts: Readonly<Record<string, number>>): number {
    return Object.values(counts).reduce((total, count) => total + count, 0);
}

function assertEmptyResources(label: string, counts: Readonly<Record<string, number>>): void {
    if (countResources(counts) !== 0) throw new Error(`${label} retained owned resources: ${JSON.stringify(counts)}`);
}

function forceGarbageCollection(): void {
    const runtime = Bun as typeof Bun & {gc?: (force?: boolean) => void;};
    runtime.gc?.(true);
}

function memorySample(startedAt: number): SolcordBackendSoakMemorySample {
    const usage = process.memoryUsage();
    return {
        elapsedMs: Date.now() - startedAt,
        rssBytes: usage.rss,
        heapUsedBytes: usage.heapUsed,
        externalBytes: usage.external
    };
}

function resetFixtureDom(): void {
    document.documentElement.className = "";
    document.head.replaceChildren();
    document.body.innerHTML = `
        <main id="solcord-soak-root">
            <nav aria-label="Servers"><div data-list-id="guildsnav"></div></nav>
            <nav aria-label="Channels"><div data-list-id="channels-200"></div></nav>
            <aside aria-label="Members"><div data-list-id="members-200" role="list"></div></aside>
            <article id="chat-messages-1">
                <div class="messageListItem_soak">
                    <div class="embedWrapper_soak"><a href="https://example.invalid/loaded-embed">Loaded embed</a></div>
                    <a id="solcord-soak-link" href="https://discord.com/channels/@me/200/300">Loaded message</a>
                </div>
            </article>
        </main>
    `;
}

function runDisposalScopeCycle(): number {
    const scope = new SolcordDisposalScope();
    for (const kind of RESOURCE_KINDS) scope.own(() => {}, kind);
    const owned = countResources(scope.counts());
    if (owned !== RESOURCE_KINDS.length) throw new Error(`Disposal scope owned ${owned} of ${RESOURCE_KINDS.length} expected resources.`);
    scope.dispose();
    scope.dispose();
    assertEmptyResources("Disposal scope", scope.counts());
    return owned;
}

function runBaselineSuiteCycle(scenario: "baseline" | "layout" | "embed" | "autoscroll" | "link-preview" = "baseline"): number {
    resetFixtureDom();
    const suite = new SolcordBaselineSuite({
        getLoadedMessage: () => ({id: "300", content: "Loaded locally for teardown evidence.", author: {username: "Local fixture"}})
    });
    const started = suite.start({
        layoutCollapse: scenario === "baseline" || scenario === "layout",
        collapsedRegions: ["guilds", "channels", "members"],
        embedControls: scenario === "baseline" || scenario === "embed",
        crossPlatformAutoscroll: scenario === "baseline" || scenario === "autoscroll",
        messageLinkPreview: scenario === "baseline" || scenario === "link-preview",
        mediaShelf: []
    });
    const owned = countResources(started.resources);
    const expectedAdapters = scenario === "baseline" ? 4 : 1;
    if (!started.active || started.enabled.length !== expectedAdapters || started.unavailable.length) throw new Error(`Baseline Suite did not start the expected ${scenario} adapters.`);
    if (scenario === "baseline" || scenario === "embed") {
        if (!document.querySelector(".solcord-embed-control")) throw new Error("Embed Controls did not attach its reversible control.");
    }
    if (scenario === "baseline" || scenario === "link-preview") {
        const link = document.getElementById("solcord-soak-link");
        link?.dispatchEvent(new MouseEvent("mouseover", {bubbles: true}));
        if (!document.querySelector(".solcord-message-link-preview")) throw new Error("Message Link Preview did not attach its reversible preview.");
    }
    suite.stop();
    assertEmptyResources("Baseline Suite", suite.status().resources);
    const residue = document.querySelector([
        ".solcord-embed-control",
        ".solcord-message-link-preview",
        "#solcord-layout-collapse-runtime",
        "#solcord-embed-controls-runtime",
        "#solcord-autoscroll-runtime",
        "#solcord-message-link-preview-runtime"
    ].join(","));
    if (residue) throw new Error(`Baseline Suite left DOM residue: ${residue.className || residue.id || residue.tagName}`);
    if ([...document.documentElement.classList].some(name => name.startsWith("solcord-"))) throw new Error("Baseline Suite left document classes after stop.");
    document.head.replaceChildren();
    document.body.replaceChildren();
    return owned;
}

function runV2ControllerCycle(sequence: number): {owned: number; voiceHealthSamples: number;} {
    const controllers: DisposableController[] = [];
    const lifecycle = new SolcordV2Lifecycle();
    for (const kind of RESOURCE_KINDS) lifecycle.own(kind, () => {});
    controllers.push(lifecycle);

    const now = 10_000 + sequence;
    const composer = new SolcordComposerToolkitController(() => now);
    const composerPreview = composer.previewDraft("Synthetic local draft. ".repeat(12), 200);
    composer.confirmCopy(composerPreview.id);
    composer.confirmReply("300");
    controllers.push(composer);

    const call = new SolcordCallContextController();
    call.observe({channelId: "200", connectedAt: now - 1_000, participantCount: 3, speakerCount: 1, viewerCount: 0});
    call.summary(now);
    controllers.push(call);

    const audio = new SolcordAudioConsoleController(() => now);
    audio.previewVolume("10000000000000301", 100, 125);
    audio.confirmVolume();
    controllers.push(audio);

    const voice = new SolcordVoiceNoteStudioController(() => now);
    voice.beginFromUserGesture(true);
    voice.attachPreview({recordingId: `fixture-${sequence}`, durationMs: 500, sizeBytes: 1_024, mime: "audio/webm", waveform: []});
    voice.confirmUpload("200");
    voice.completeUpload(`fixture-${sequence}`);
    controllers.push(voice);

    const translation = new SolcordTranslationDeskController(() => now);
    const translationPreview = translation.preview("libretranslate", "https://translate.example/api", "en", "es", "Synthetic local text.");
    translation.confirm(translationPreview.id);
    controllers.push(translation);

    const people = new SolcordPeopleSpacesController();
    people.pinDm("400");
    people.hideGuild("500");
    people.aliasGuild("500", "Local fixture");
    people.snapshot();
    controllers.push(people);

    const glance = new SolcordChannelGlanceController();
    glance.showAlreadyLoaded(true, [{id: "600", authorLabel: "Local fixture", text: "Already loaded.", timestamp: now}]);
    controllers.push(glance);

    const notifications = new SolcordNotificationReviewController(() => now);
    const notificationPreview = notifications.preview("mentions", ["700", "701"]);
    notifications.confirm(notificationPreview.id);
    controllers.push(notifications);

    const motion = new SolcordMotionStudioController();
    motion.configure({reducedMotion: sequence % 2 === 0, intensity: 0.6, durationMs: 180, effectsEnabled: true});
    controllers.push(motion);

    const permissions = new SolcordPermissionLensController();
    permissions.explainFromCache(true, ["VIEW_CHANNEL", "CONNECT", "STREAM"]);
    controllers.push(permissions);

    const health = new SolcordVoiceHealthController();
    for (let index = 0; index < 130; index++) health.add({timestamp: now + index, rttMs: 20, jitterMs: 5, packetLossPercent: 1});
    const voiceHealthSamples = health.summary().sampleCount;
    if (voiceHealthSamples !== 120) throw new Error(`Voice Health retained ${voiceHealthSamples} samples instead of its 120-sample bound.`);
    controllers.push(health);

    const notes = new SolcordLocalIdentityNotesController(() => now);
    notes.preview({subjectId: "800", text: "Synthetic local note.", tags: ["fixture"]});
    if (notes.redactedExport().containsPlaintext) throw new Error("Local Identity Notes exposed plaintext in its normal export.");
    notes.confirmSecureWrite("800");
    controllers.push(notes);

    const owned = Math.max(...controllers.map(controller => countResources(controller.resourceCounts())));
    for (const controller of controllers.reverse()) {
        controller.dispose();
        controller.dispose();
        assertEmptyResources(controller.constructor.name, controller.resourceCounts());
    }
    return {owned, voiceHealthSamples};
}

function runAudienceGuardCycle(): number {
    let listeners = 0;
    let patches = 0;
    let timers = 0;
    let stopRequests = 0;
    let startDecision: (() => boolean) | undefined;
    const adapter: SolcordAudienceGuardAdapter = {
        currentAccountId: () => "10000000000000100",
        currentVoiceChannelId: () => "10000000000000200",
        currentStream: () => undefined,
        voiceMemberIds: () => [],
        viewerIds: () => [],
        stopOwnStream: () => {stopRequests++;},
        interceptStreamStart: decision => {
            patches++;
            startDecision = decision;
            return () => {patches--;};
        },
        subscribe: () => {
            listeners++;
            return () => {listeners--;};
        },
        setTimer: callback => {
            timers++;
            return {callback};
        },
        clearTimer: () => {timers--;}
    };
    const guard = new SolcordStreamAudienceGuard(adapter);
    if (!guard.start()) throw new Error("Audience Guard rejected its structurally complete synthetic adapter.");
    if (!guard.arm([{userId: "10000000000000300", label: "Synthetic entry"}], {preventStart: true, stopOnJoin: false, stopOnWatch: false})) throw new Error("Audience Guard did not arm in the synthetic call.");
    guard.synchronize();
    if (startDecision?.() !== true) throw new Error("Audience Guard blocked a start when no denied member was present.");
    const owned = listeners + patches + timers;
    guard.disarm();
    guard.stop();
    guard.stop();
    if (listeners || patches || timers) throw new Error(`Audience Guard retained listeners=${listeners}, patches=${patches}, timers=${timers}.`);
    if (stopRequests) throw new Error("Audience Guard executed a synthetic stream-stop request.");
    return owned;
}

function runOneCycle(sequence: number, scenario: SolcordBackendSoakScenario): CycleResult {
    const disposalOwned = scenario === "all" || scenario === "disposal" ? runDisposalScopeCycle() : 0;
    if (scenario === "dom-control") {
        resetFixtureDom();
        document.head.replaceChildren();
        document.body.replaceChildren();
    }
    const baselineScenario = scenario === "layout" || scenario === "embed" || scenario === "autoscroll" || scenario === "link-preview" ? scenario : "baseline";
    const baselineOwned = scenario === "all" || scenario === "baseline" || scenario === "layout" || scenario === "embed" || scenario === "autoscroll" || scenario === "link-preview"
        ? runBaselineSuiteCycle(baselineScenario)
        : 0;
    const controllers = scenario === "all" || scenario === "controllers" ? runV2ControllerCycle(sequence) : {owned: 0, voiceHealthSamples: 0};
    const audienceOwned = scenario === "all" || scenario === "audience" ? runAudienceGuardCycle() : 0;
    return {
        maximumOwnedResources: Math.max(disposalOwned, baselineOwned, controllers.owned, audienceOwned),
        voiceHealthSamples: controllers.voiceHealthSamples
    };
}

function normalizeScenario(value: unknown): SolcordBackendSoakScenario {
    if (value === undefined) return "all";
    if (value === "all" || value === "disposal" || value === "dom-control" || value === "baseline" || value === "layout" || value === "embed" || value === "autoscroll" || value === "link-preview" || value === "controllers" || value === "audience") return value;
    throw new Error("Scenario must be all, disposal, dom-control, baseline, layout, embed, autoscroll, link-preview, controllers, or audience.");
}

function assertSettledTeardown(): void {
    const residue = document.querySelector([
        ".solcord-embed-control",
        ".solcord-message-link-preview",
        "[id^=\"solcord-\"]",
        "[class*=\"solcord-\"]"
    ].join(","));
    if (residue) throw new Error(`A deferred callback left DOM residue: ${residue.className || residue.id || residue.tagName}`);
    if (document.head.childElementCount || document.body.childElementCount) throw new Error("A deferred callback repopulated the isolated DOM after teardown.");
    if ([...document.documentElement.classList].some(name => name.startsWith("solcord-"))) throw new Error("A deferred callback restored a Solcord document class after teardown.");
}

function clearDisposedFixtureQueryCache(): void {
    // Happy DOM 20.8.9 accumulates document-level selector dependencies even
    // after body/head mutations dispose every fixture node. Clear only that
    // test-runtime cache, after teardown assertions; never product resources.
    const clear = (document as unknown as Record<symbol, unknown>)[PropertySymbol.clearCache];
    if (typeof clear !== "function") throw new Error("The isolated DOM does not expose its verified query-cache maintenance hook.");
    clear.call(document);
}

function delay(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export async function runSolcordBackendSoak(options: SolcordBackendSoakOptions = {}): Promise<SolcordBackendSoakReport> {
    if (typeof document === "undefined" || typeof window === "undefined") throw new Error("The backend soak requires an isolated DOM fixture.");
    const durationMs = finiteInteger(options.durationMs, DEFAULT_DURATION_MS, 1, 24 * 60 * 60 * 1_000, "Duration");
    const cycleDelayMs = finiteInteger(options.cycleDelayMs, DEFAULT_CYCLE_DELAY_MS, 0, 60_000, "Cycle delay");
    const sampleIntervalMs = finiteInteger(options.sampleIntervalMs, DEFAULT_SAMPLE_INTERVAL_MS, 10, 10 * 60 * 1_000, "Sample interval");
    const heapGrowthLimitBytes = finiteInteger(options.heapGrowthLimitBytes, DEFAULT_HEAP_GROWTH_LIMIT_BYTES, 1, 1024 * 1024 * 1024, "Heap growth limit");
    const maxCycles = options.maxCycles === undefined ? undefined : finiteInteger(options.maxCycles, 1, 1, 10_000_000, "Maximum cycles");
    const scenario = normalizeScenario(options.scenario);
    const startedAtDate = new Date();
    const startedAt = Date.now();
    const failures: string[] = [];
    const samples: SolcordBackendSoakMemorySample[] = [];
    let cycles = 0;
    let maximumVoiceHealthSamples = 0;
    let maximumOwnedResources = 0;
    let fixtureQueryCacheResets = 0;

    forceGarbageCollection();
    samples.push(memorySample(startedAt));
    let nextSampleAt = startedAt + sampleIntervalMs;
    while (Date.now() - startedAt < durationMs) {
        if (maxCycles !== undefined && cycles >= maxCycles) break;
        try {
            const cycle = runOneCycle(cycles + 1, scenario);
            cycles++;
            maximumVoiceHealthSamples = Math.max(maximumVoiceHealthSamples, cycle.voiceHealthSamples);
            maximumOwnedResources = Math.max(maximumOwnedResources, cycle.maximumOwnedResources);
        }
        catch (error) {
            failures.push(error instanceof Error ? error.message : String(error));
            break;
        }
        const now = Date.now();
        if (now >= nextSampleAt && samples.length < MAX_MEMORY_SAMPLES - 1) {
            forceGarbageCollection();
            samples.push(memorySample(startedAt));
            nextSampleAt = now + sampleIntervalMs;
        }
        await delay(cycleDelayMs);
        try {
            assertSettledTeardown();
            clearDisposedFixtureQueryCache();
            fixtureQueryCacheResets++;
        }
        catch (error) {
            failures.push(error instanceof Error ? error.message : String(error));
            break;
        }
    }
    document.documentElement.className = "";
    document.head.replaceChildren();
    document.body.replaceChildren();
    forceGarbageCollection();
    samples.push(memorySample(startedAt));
    const baselineHeapUsedBytes = samples[0]?.heapUsedBytes ?? 0;
    const finalHeapUsedBytes = samples.at(-1)?.heapUsedBytes ?? 0;
    const finalHeapGrowthBytes = finalHeapUsedBytes - baselineHeapUsedBytes;
    if (cycles === 0) failures.push("The soak completed without a lifecycle cycle.");
    if (finalHeapGrowthBytes > heapGrowthLimitBytes) failures.push(`Final heap growth ${finalHeapGrowthBytes} exceeded the ${heapGrowthLimitBytes} byte limit.`);
    const finishedAt = new Date();
    return {
        version: 1,
        evidenceKind: EVIDENCE_KIND,
        startedAt: startedAtDate.toISOString(),
        finishedAt: finishedAt.toISOString(),
        configuredDurationMs: durationMs,
        scenario,
        elapsedMs: finishedAt.getTime() - startedAt,
        cycles,
        adapterExecutions: 0,
        maximumVoiceHealthSamples,
        maximumOwnedResources,
        fixtureQueryCacheResets,
        baselineHeapUsedBytes,
        finalHeapUsedBytes,
        finalHeapGrowthBytes,
        heapGrowthLimitBytes,
        peakHeapUsedBytes: Math.max(...samples.map(sample => sample.heapUsedBytes)),
        peakRssBytes: Math.max(...samples.map(sample => sample.rssBytes)),
        memorySamples: samples,
        failures,
        pass: failures.length === 0,
        nonclaims: [
            "This does not launch or inspect Discord.",
            "This does not establish live renderer, owner-profile, Activity, installer, or human visual acceptance.",
            "Happy DOM document query caches are cleared after each asserted teardown; this is disclosed test-harness maintenance, not product cleanup.",
            "Intent objects are validated but never executed against an adapter."
        ]
    };
}

function argumentValue(name: string): string | undefined {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

function numericArgument(name: string): number | undefined {
    const value = argumentValue(name);
    if (value === undefined) return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${name} requires a finite number.`);
    return parsed;
}

async function main(): Promise<void> {
    if (typeof document === "undefined") {
        const {GlobalRegistrator} = await import("@happy-dom/global-registrator");
        GlobalRegistrator.register();
    }
    const proof = process.argv.includes("--proof");
    const output = argumentValue("--output");
    if (!output || !isAbsolute(output)) throw new Error("--output requires an absolute directory path.");
    const report = await runSolcordBackendSoak({
        durationMs: numericArgument("--duration-ms") ?? (proof ? 60_000 : DEFAULT_DURATION_MS),
        cycleDelayMs: numericArgument("--cycle-delay-ms") ?? (proof ? 0 : DEFAULT_CYCLE_DELAY_MS),
        sampleIntervalMs: numericArgument("--sample-interval-ms") ?? (proof ? 10 : DEFAULT_SAMPLE_INTERVAL_MS),
        heapGrowthLimitBytes: numericArgument("--heap-growth-limit-bytes"),
        maxCycles: numericArgument("--max-cycles") ?? (proof ? 50 : undefined),
        scenario: normalizeScenario(argumentValue("--scenario"))
    });
    await mkdir(output, {recursive: true});
    const reportPath = join(output, "backend-soak-report.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${report.pass ? "PASS" : "FAIL"} ${report.cycles} cycles; report: ${reportPath}\n`);
    if (!report.pass) process.exitCode = 1;
}

if (import.meta.main) await main();
