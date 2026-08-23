import React from "react";

import {useStateFromStores} from "@ui/hooks";
import PluginManager from "@modules/pluginmanager";
import ThemeManager from "@modules/thememanager";
import SoulCordRuntime from "@modules/soulcord/runtime";
import SoulCordSettings, {SOULCORD_PRESET_ADDONS, SOULCORD_THEMES} from "@modules/soulcord/store";
import type {SoulCordAddonMode, SoulCordSettingsDocument, SoulCordSetupDraft, SoulCordThemeId, SoulCordTimelinePolicy} from "@modules/soulcord/contracts";
import {SOULCORD_REVIEWED_OPTIONALS, SOULCORD_RUNTIME_ADDONS, SOULCORD_RUNTIME_DEPENDENCIES, SOULCORD_RUNTIME_THEMES} from "@common/soulcord/addon-catalog.generated";

import {SOULCORD_ADDON_GROUPS, SOULCORD_OPTIONAL_ADDONS, SOULCORD_POWER_LAB} from "./catalog";

const {useMemo, useState} = React;

const WIZARD_STEPS = ["Current state", "Theme", "Daily pack", "Outgoing and Timeline", "Power Lab", "Review"] as const;

const THEME_NOTES: Record<SoulCordThemeId, string> = {
    "obsidian-thread": "Graphite, warm bone, oxidized teal, and restrained ember.",
    "carbon-ember": "Charcoal and ash with copper and burgundy accents.",
    "midnight-glass": "Navy-black, silver, ice cyan, and restrained translucency.",
    "paper-signal": "Warm paper, ink, coral, and teal for a light workspace."
};

function defaultTimeline(): SoulCordTimelinePolicy {
    return {
        enabled: true,
        scope: "dm-only",
        serverChannelIds: [],
        retention: "7-days",
        content: "text-only",
        textBudgetBytes: 262_144_000,
        mediaBudgetBytes: 1_073_741_824
    };
}

function draftFrom(document: SoulCordSettingsDocument): SoulCordSetupDraft {
    const completed = document.onboarding.status === "complete";
    return {
        selectedTheme: completed ? document.selectedTheme : "obsidian-thread",
        selectedAddons: completed
            ? SOULCORD_PRESET_ADDONS.filter(name => document.curatedAddons[name]?.selected)
            : [...SOULCORD_PRESET_ADDONS],
        addonModes: Object.fromEntries(SOULCORD_PRESET_ADDONS.map(name => [name, completed ? document.curatedAddons[name]?.mode ?? "default" : name === "SplitLargeMessages" ? "guarded" : "default"])),
        timelinePolicy: completed ? document.timelinePolicy : defaultTimeline()
    };
}

function bytesLabel(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function requiresCommunityFile(draft: SoulCordSetupDraft, name: string): boolean {
    return name !== "SplitLargeMessages" || draft.addonModes[name] !== "guarded";
}

function candidateReviewLabel(candidate: (typeof SOULCORD_RUNTIME_ADDONS)[number]): string {
    if (candidate.installable) return "runtime accepted";
    if (candidate.securityDisposition === "SAFE_TO_RUNTIME_TEST") return "runtime pending";
    if (candidate.securityDisposition === "ACTION_GATED_TEST") return "action gate pending";
    return candidate.securityDisposition.toLocaleLowerCase();
}

function optionalReviewLabel(candidate: {installable: boolean; reviewStatus: string;} | undefined): string {
    if (!candidate) return "not in snapshot";
    if (candidate.installable) return "accepted";
    return candidate.reviewStatus === "STATIC_PASS_RUNTIME_REQUIRED" ? "runtime pending" : "hold";
}

function setupBlockers(draft: SoulCordSetupDraft): string[] {
    const selected = SOULCORD_RUNTIME_ADDONS.filter(candidate => draft.selectedAddons.includes(candidate.name) && requiresCommunityFile(draft, candidate.name));
    const blockers: string[] = selected.filter(candidate => !candidate.installable).map(candidate => candidate.name);
    const dependencyNames = new Set(selected.flatMap(candidate => [...candidate.dependencies]));
    blockers.push(...SOULCORD_RUNTIME_DEPENDENCIES.filter(candidate => dependencyNames.has(candidate.name) && !candidate.installable).map(candidate => `${candidate.name} dependency`));
    return [...new Set(blockers)];
}

function StepNavigation({step, setStep}: {step: number; setStep(step: number): void;}) {
    return <ol className="soulcord-wizard-steps" aria-label="SoulCord setup steps">
        {WIZARD_STEPS.map((label, index) => <li key={label}>
            <button type="button" aria-current={index === step ? "step" : undefined} onClick={() => setStep(index)}>
                <span>{index + 1}</span>{label}
            </button>
        </li>)}
    </ol>;
}

function CurrentStateStep() {
    const state = useStateFromStores([PluginManager, ThemeManager], () => ({
        installed: SOULCORD_RUNTIME_ADDONS.filter(addon => Boolean(PluginManager.resolveAddon(addon.fileName))).length,
        enabled: SOULCORD_RUNTIME_ADDONS.filter(addon => PluginManager.isEnabled(addon.fileName)).length,
        soulCordThemes: SOULCORD_THEMES.filter(theme => Boolean(ThemeManager.resolveAddon(theme.fileName))).length,
        activeSoulCordThemes: SOULCORD_THEMES.filter(theme => ThemeManager.isEnabled(theme.fileName)).length
    }));
    return <div className="soulcord-wizard-body">
        <h3>Nothing changes before Finish</h3>
        <p>SoulCord stages only addons that have passed both static review and disposable Discord runtime acceptance. It then verifies every hash and dependency and journals only the files and enabled states it changes. A differing local file aborts the transaction instead of being overwritten.</p>
        <dl className="soulcord-facts">
            <div><dt>Preset files already present</dt><dd>{state.installed} of 36</dd></div>
            <div><dt>Preset features currently enabled</dt><dd>{state.enabled}</dd></div>
            <div><dt>SoulCord themes present</dt><dd>{state.soulCordThemes} of 4</dd></div>
            <div><dt>SoulCord themes active</dt><dd>{state.activeSoulCordThemes}</dd></div>
        </dl>
        <p className="soulcord-callout">Existing MessageLogger data, unrelated plugins, themes, custom CSS, settings, and the vanilla Activities launcher are outside this transaction and remain untouched.</p>
    </div>;
}

function ThemeStep({value, onChange}: {value: SoulCordThemeId; onChange(value: SoulCordThemeId): void;}) {
    return <div className="soulcord-wizard-body">
        <h3>Choose one SoulCord base theme</h3>
        <p>All four are self-contained and use the same dense, keyboard-focused layout foundation. Preview selection does not activate a theme.</p>
        <div className="soulcord-theme-options">
            {SOULCORD_THEMES.map(theme => <label key={theme.id} className={`soulcord-theme-option soulcord-theme-${theme.id}`}>
                <input type="radio" name="soulcord-theme" value={theme.id} checked={value === theme.id} onChange={() => onChange(theme.id)} />
                <span className="soulcord-theme-swatch" aria-hidden="true"><i /><i /><i /><i /></span>
                <span><strong>{theme.name}</strong><small>{THEME_NOTES[theme.id]}</small></span>
            </label>)}
        </div>
        <p className="soulcord-callout">Only the selected SoulCord theme is enabled. Existing third-party themes are not modified; possible visual overlap is shown in the final review.</p>
    </div>;
}

function AddonStep({selected, toggle}: {selected: ReadonlySet<string>; toggle(name: string, enabled: boolean): void;}) {
    return <div className="soulcord-wizard-body">
        <div className="soulcord-wizard-inline-heading"><div><h3>Aggressive daily pack</h3><p>{selected.size} of 36 feature plugins selected. BDFDB is resolved separately as a dependency.</p></div><div className="soulcord-actions"><button type="button" className="soulcord-action" onClick={() => SOULCORD_PRESET_ADDONS.forEach(name => toggle(name, true))}>Select all</button><button type="button" className="soulcord-action" onClick={() => SOULCORD_PRESET_ADDONS.forEach(name => toggle(name, false))}>Clear</button></div></div>
        <div className="soulcord-addon-groups">
            {SOULCORD_ADDON_GROUPS.map(group => <fieldset key={group.id} className="soulcord-addon-group">
                <legend>{group.title} <small>{group.summary}</small></legend>
                {group.addons.map(addon => {
                    const candidate = SOULCORD_RUNTIME_ADDONS.find(item => item.name === addon.name)!;
                    return <label key={addon.name} className="soulcord-addon-choice">
                        <input type="checkbox" checked={selected.has(addon.name)} onChange={event => toggle(addon.name, event.currentTarget.checked)} />
                        <span><strong>{addon.label}</strong><small>{addon.summary}</small></span>
                        <span className="soulcord-review-chip">{candidateReviewLabel(candidate)}</span>
                    </label>;
                })}
            </fieldset>)}
        </div>
        <div className="soulcord-optional-queue">
            <div><strong>Optional review queue</strong><p>Shown for completeness, not preselected. These remain unavailable until their own runtime and conflict gates pass.</p></div>
            <ul>{SOULCORD_OPTIONAL_ADDONS.map(optional => {
                const candidate = SOULCORD_REVIEWED_OPTIONALS.find(item => item.name === optional.catalogName);
                return <li key={optional.catalogName}><span>{optional.label}</span><span className="soulcord-review-chip">{optionalReviewLabel(candidate)}</span></li>;
            })}</ul>
        </div>
    </div>;
}

function OutgoingTimelineStep({draft, updateMode, updateTimeline}: {draft: SoulCordSetupDraft; updateMode(name: string, value: SoulCordAddonMode): void; updateTimeline(value: Partial<SoulCordTimelinePolicy>): void;}) {
    const splitterSelected = draft.selectedAddons.includes("SplitLargeMessages");
    const translatorSelected = draft.selectedAddons.includes("Translator");
    const voiceSelected = draft.selectedAddons.includes("VoiceMessages");
    return <div className="soulcord-wizard-body soulcord-settings-stack">
        <div>
            <h3>Outgoing behavior stays deliberate</h3>
            {splitterSelected && <fieldset className="soulcord-choice-fieldset"><legend>Split Large Messages</legend>
                <label><input type="radio" name="split-mode" checked={draft.addonModes.SplitLargeMessages === "guarded"} onChange={() => updateMode("SplitLargeMessages", "guarded")} /><span><strong>Guarded</strong><small>SoulCord previews part count, order, and delay. Confirm copies the ordered parts; it does not auto-send.</small></span></label>
                <label><input type="radio" name="split-mode" checked={draft.addonModes.SplitLargeMessages === "native"} onChange={() => updateMode("SplitLargeMessages", "native")} /><span><strong>Native</strong><small>Requests the community plugin’s user-initiated multi-send behavior. It remains blocked until its dependency, security, and runtime gates pass.</small></span></label>
            </fieldset>}
            {translatorSelected && <p className="soulcord-callout soulcord-callout-danger"><strong>Translator is rejected for V1:</strong> static review found ordinary-settings API credentials, multiple external providers, arbitrary endpoint support, and a composer-send transform. No translation text will leave the client through SoulCord.</p>}
            {voiceSelected && <p className="soulcord-callout"><strong>Voice Messages is held:</strong> record, preview, cancel, and upload controls still need isolated runtime acceptance. SoulCord will not record or upload during setup or acceptance.</p>}
        </div>
        <div>
            <h3>Private Message Timeline</h3>
            <label className="soulcord-addon-choice"><input type="checkbox" checked={draft.timelinePolicy.enabled} onChange={event => updateTimeline({enabled: event.currentTarget.checked})} /><span><strong>Enable after Finish</strong><small>Observe create, edit, and delete events already seen by this running client.</small></span></label>
            <div className="soulcord-form-grid">
                <label>Scope<select value={draft.timelinePolicy.scope} onChange={event => updateTimeline({scope: event.currentTarget.value as SoulCordTimelinePolicy["scope"]})}><option value="dm-only">DMs and group DMs only</option><option value="selected-channels">DMs plus explicitly selected servers</option></select></label>
                <label>Retention<select value={draft.timelinePolicy.retention} onChange={event => updateTimeline({retention: event.currentTarget.value as SoulCordTimelinePolicy["retention"]})}><option value="session">Session only</option><option value="24-hours">24 hours</option><option value="7-days">7 days</option><option value="30-days">30 days</option><option value="90-days">90 days</option><option value="manual">Until manually cleared</option></select></label>
                <label>Content<select value={draft.timelinePolicy.content} onChange={event => updateTimeline({content: event.currentTarget.value as SoulCordTimelinePolicy["content"]})}><option value="text-only">Text only</option><option value="text-and-metadata">Text plus attachment metadata</option><option value="encrypted-media" disabled>Encrypted media cache — not accepted in V1</option></select></label>
                <label>Text cap<input value="250 MiB hard cap" readOnly /></label>
            </div>
            <p className="soulcord-callout">No API backfill, hidden-channel access, offline recovery, deleted-message fetching, or import from MessageLoggerV2. Persistent records require Electron safeStorage; otherwise Timeline becomes session-only.</p>
        </div>
    </div>;
}

function PowerLabStep() {
    return <div className="soulcord-wizard-body">
        <h3>Private experiments are not part of V1 acceptance</h3>
        <p>Every experiment is off, unavailable, and requires separate provenance, adapter validation, teardown testing, drift behavior, versioned consent, and fresh action-time confirmation.</p>
        <div className="soulcord-power-list">
            {SOULCORD_POWER_LAB.map(experiment => <label key={experiment.id} className="soulcord-addon-choice soulcord-unavailable"><input type="checkbox" checked={false} disabled /><span><strong>{experiment.name}</strong><small>{experiment.summary}</small></span><span className="soulcord-review-chip">unavailable</span></label>)}
        </div>
        <p className="soulcord-callout">SoulCord V1 does not extract tokens, forge entitlements, self-bot, automate quests, auto-join, hide sends/uploads, or generate covert microphone traffic.</p>
    </div>;
}

function ReviewStep({draft}: {draft: SoulCordSetupDraft;}) {
    const selected = useMemo(() => new Set(draft.selectedAddons), [draft.selectedAddons]);
    const candidates = SOULCORD_RUNTIME_ADDONS.filter(candidate => selected.has(candidate.name));
    const dependencyNames = new Set(candidates.flatMap(candidate => [...candidate.dependencies]));
    const dependencies = SOULCORD_RUNTIME_DEPENDENCIES.filter(candidate => dependencyNames.has(candidate.name));
    const themeBytes = SOULCORD_RUNTIME_THEMES.reduce((sum, theme) => sum + new TextEncoder().encode(theme.content).byteLength, 0);
    const diskBytes = candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0) + dependencies.reduce((sum, dependency) => sum + dependency.sizeBytes, 0) + themeBytes;
    const conflicts = [...new Set(candidates.flatMap(candidate => [...candidate.conflicts]))];
    const blockers = setupBlockers(draft);
    const acceptedCount = candidates.filter(candidate => !requiresCommunityFile(draft, candidate.name) || candidate.installable).length;
    const changes = SoulCordRuntime.previewSetup(draft);
    return <div className="soulcord-wizard-body">
        <h3>Complete transaction preview</h3>
        <dl className="soulcord-facts">
            <div><dt>Selected features</dt><dd>{candidates.length} of 36</dd></div>
            <div><dt>Runtime accepted</dt><dd>{acceptedCount} of {candidates.length}</dd></div>
            <div><dt>Dependencies</dt><dd>{dependencies.map(item => item.name).join(", ") || "none"}</dd></div>
            <div><dt>Theme</dt><dd>{SOULCORD_THEMES.find(theme => theme.id === draft.selectedTheme)?.name}</dd></div>
            <div><dt>Maximum staged disk use</dt><dd>{bytesLabel(diskBytes)}</dd></div>
            <div><dt>Timeline</dt><dd>{draft.timelinePolicy.enabled ? `${draft.timelinePolicy.scope}, ${draft.timelinePolicy.retention}, ${draft.timelinePolicy.content}` : "off"}</dd></div>
            <div><dt>Power Lab</dt><dd>all off and unavailable</dd></div>
        </dl>
        <div className="soulcord-review-columns">
            <div><strong>Settings diff</strong>{changes.length ? <ul>{changes.map(change => <li key={change}>{change}</li>)}</ul> : <p>No stored-selection difference; Finish still verifies and tests selected files.</p>}</div>
            <div><strong>Known conflict checks</strong>{conflicts.length ? <ul>{conflicts.map(conflict => <li key={conflict}>{conflict}</li>)}</ul> : <p>No catalog-declared conflicts in this selection.</p>}</div>
        </div>
        {blockers.length ? <p className="soulcord-callout soulcord-callout-danger"><strong>Finish is paused:</strong> {blockers.length} selected security, action, dependency, or runtime gate(s) remain pending. Examples: {blockers.slice(0, 6).join(", ")}{blockers.length > 6 ? `, and ${blockers.length - 6} more` : ""}. SoulCord will not turn a catalog hash into a working-addon claim.</p> : <p className="soulcord-callout">Finish stages the complete dependency closure, verifies hashes, refuses differing local files, enables one addon at a time, quarantines failures, activates one SoulCord theme, and keeps a one-click rollback record.</p>}
    </div>;
}

export default function SetupWizard() {
    const document = useStateFromStores(SoulCordSettings, () => SoulCordSettings.snapshot());
    const [step, setStep] = useState(0);
    const [draft, setDraft] = useState<SoulCordSetupDraft>(() => draftFrom(document));
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");
    const selected = useMemo(() => new Set(draft.selectedAddons), [draft.selectedAddons]);
    const blockers = useMemo(() => setupBlockers(draft), [draft]);
    const toggle = (name: string, enabled: boolean) => setDraft(current => ({...current, selectedAddons: enabled ? [...new Set([...current.selectedAddons, name])] : current.selectedAddons.filter(item => item !== name)}));
    const updateMode = (name: string, mode: SoulCordAddonMode) => setDraft(current => ({...current, addonModes: {...current.addonModes, [name]: mode}}));
    const updateTimeline = (value: Partial<SoulCordTimelinePolicy>) => setDraft(current => ({...current, timelinePolicy: {...current.timelinePolicy, ...value}}));
    const finish = async () => {
        if (blockers.length) {
            setStatus(`Setup remains fail-closed: ${blockers.length} selected security, dependency, action, or runtime acceptance gate(s) are pending.`);
            return;
        }
        if (!window.confirm(`Stage, verify, and apply ${draft.selectedAddons.length} selected features plus the SoulCord theme? Existing differing files will abort without being overwritten.`)) return;
        setBusy(true);
        setStatus("Staging immutable sources and verifying hashes…");
        try {
            const result = await SoulCordRuntime.finishSetup(draft);
            setStatus(`Finished transaction ${result.transactionId}. ${result.enabled.length} enabled; ${result.quarantined.length} quarantined.`);
        }
        catch (error) {
            setStatus(`Setup stopped safely: ${error instanceof Error ? error.message : "unknown transaction failure"}`);
        }
        finally {
            setBusy(false);
        }
    };
    const skip = () => {
        if (!window.confirm("Skip setup? No plugin file, theme file, enabled state, or Timeline policy will change. You can reopen this wizard later.")) return;
        SoulCordSettings.skipOnboarding();
    };

    return <section className="soulcord-wizard" aria-labelledby="soulcord-setup-title">
        <div className="soulcord-wizard-title"><div><p className="soulcord-eyebrow">First-run setup · schema v3</p><h2 id="soulcord-setup-title">Build your SoulCord daily set</h2><p>Preview every local change. Nothing is downloaded, enabled, or replaced until Finish—and Finish stays blocked until every selected gate passes.</p></div><span>{step + 1} / {WIZARD_STEPS.length}</span></div>
        <StepNavigation step={step} setStep={setStep} />
        {step === 0 && <CurrentStateStep />}
        {step === 1 && <ThemeStep value={draft.selectedTheme} onChange={selectedTheme => setDraft(current => ({...current, selectedTheme}))} />}
        {step === 2 && <AddonStep selected={selected} toggle={toggle} />}
        {step === 3 && <OutgoingTimelineStep draft={draft} updateMode={updateMode} updateTimeline={updateTimeline} />}
        {step === 4 && <PowerLabStep />}
        {step === 5 && <ReviewStep draft={draft} />}
        <div className="soulcord-wizard-footer">
            <div className="soulcord-actions"><button type="button" className="soulcord-action" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || busy}>Back</button>{step < WIZARD_STEPS.length - 1 ? <button type="button" className="soulcord-action soulcord-action-accent" onClick={() => setStep(Math.min(WIZARD_STEPS.length - 1, step + 1))}>Next</button> : <button type="button" className="soulcord-action soulcord-action-accent" disabled={busy || blockers.length > 0} title={blockers.length ? "One or more security, dependency, action, or runtime gates are still pending." : undefined} onClick={() => void finish()}>{busy ? "Working…" : blockers.length ? `Finish paused (${blockers.length})` : "Finish"}</button>}<button type="button" className="soulcord-action" disabled={busy} onClick={skip}>Skip without changes</button></div>
            {status && <p role="status" className="soulcord-setup-status">{status}</p>}
        </div>
    </section>;
}
