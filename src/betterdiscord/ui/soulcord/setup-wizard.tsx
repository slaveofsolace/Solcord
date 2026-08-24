import React from "react";

import {useStateFromStores} from "@ui/hooks";
import PluginManager from "@modules/pluginmanager";
import ThemeManager from "@modules/thememanager";
import SoulCordRuntime from "@modules/soulcord/runtime";
import SoulCordSettings, {SOULCORD_PRESET_ADDONS, SOULCORD_THEMES} from "@modules/soulcord/store";
import type {SoulCordAddonProvider, SoulCordSettingsDocument, SoulCordSetupDraft, SoulCordThemeId} from "@modules/soulcord/contracts";
import {SOULCORD_CATALOG_SNAPSHOT, SOULCORD_RUNTIME_ADDONS, SOULCORD_RUNTIME_DEPENDENCIES, SOULCORD_RUNTIME_THEMES} from "@common/soulcord/addon-catalog.generated";
import {communityAddonIsEnabled, isSoulCordBuiltInAddon, resolveCommunityAddon, type SoulCordProviderMigrationPlan} from "@common/soulcord/builtin-addons";
import {recommendedSoulCordSetupAddons, resolveSoulCordSetupPlan, type SoulCordSetupCandidateDecision} from "@common/soulcord/setup-catalog";

import {SOULCORD_ADDON_GROUPS} from "./catalog";

const {useMemo, useState} = React;

const WIZARD_STEPS = ["Current state", "Theme", "Ready tools", "Review"] as const;

const THEME_NOTES: Record<SoulCordThemeId, string> = {
    "soulcord-default": "Recommended · Graphite, warm text, oxidized teal, and ember reserved for warnings.",
    "obsidian-thread": "Graphite, warm bone, oxidized teal, and restrained ember.",
    "carbon-ember": "Charcoal and ash with copper and burgundy accents.",
    "midnight-glass": "Navy-black, silver, ice cyan, and restrained translucency.",
    "paper-signal": "Warm paper, ink, coral, and teal for a light workspace."
};

function draftFrom(document: SoulCordSettingsDocument): SoulCordSetupDraft {
    return {
        selectedTheme: document.selectedTheme,
        selectedAddons: SOULCORD_PRESET_ADDONS.filter(name => document.curatedAddons[name]?.selected),
        addonModes: Object.fromEntries(SOULCORD_PRESET_ADDONS.map(name => [name, document.curatedAddons[name]?.mode ?? (name === "SplitLargeMessages" ? "guarded" : "default")])),
        addonProviders: Object.fromEntries(SOULCORD_PRESET_ADDONS.map(name => [name, document.curatedAddons[name]?.provider ?? "prefer-community"])),
        timelinePolicy: document.timelinePolicy
    };
}

function bytesLabel(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function isReadyDecision(decision: SoulCordSetupCandidateDecision | undefined): boolean {
    return decision?.availability === "built-in" || decision?.availability === "accepted";
}

function revealCatalog(): void {
    const table = document.querySelector<HTMLElement>(".soulcord-catalog-table");
    const section = table?.closest<HTMLElement>(".soulcord-section");
    if (!section) return;
    section.scrollIntoView({block: "start"});
    section.querySelector<HTMLElement>("input, select, button, [href]")?.focus({preventScroll: true});
}

function StepNavigation({step, setStep, disabled}: {step: number; setStep(step: number): void; disabled: boolean;}) {
    return <ol className="soulcord-wizard-steps" aria-label="SoulCord setup steps">
        {WIZARD_STEPS.map((label, index) => <li key={label}>
            <button type="button" aria-current={index === step ? "step" : undefined} disabled={disabled} onClick={() => setStep(index)}>
                <span>{index + 1}</span>{label}
            </button>
        </li>)}
    </ol>;
}

function CurrentStateStep() {
    const state = useStateFromStores([PluginManager, ThemeManager], () => ({
        installed: SOULCORD_RUNTIME_ADDONS.filter(addon => Boolean(PluginManager.resolveAddon(addon.fileName))).length,
        enabled: SOULCORD_RUNTIME_ADDONS.filter(addon => communityAddonIsEnabled(PluginManager, addon.name, addon.fileName)).length,
        soulCordThemes: SOULCORD_THEMES.filter(theme => Boolean(ThemeManager.resolveAddon(theme.fileName))).length,
        activeSoulCordThemes: SOULCORD_THEMES.filter(theme => ThemeManager.isEnabled(theme.fileName)).length
    }));
    return <div className="soulcord-wizard-body">
        <h3>Protected starting point</h3>
        <p>No setting or file changes while you move through these four steps. Finish records a rollback transaction, validates the ready adapters, and stops without overwriting a different local file.</p>
        <dl className="soulcord-facts">
            <div><dt>Catalog files already present</dt><dd>{state.installed}</dd></div>
            <div><dt>Catalog features currently enabled</dt><dd>{state.enabled}</dd></div>
            <div><dt>SoulCord themes present</dt><dd>{state.soulCordThemes} of 5</dd></div>
            <div><dt>SoulCord themes active</dt><dd>{state.activeSoulCordThemes}</dd></div>
        </dl>
        <p className="soulcord-callout">Existing MessageLogger data, unrelated plugins, themes, custom CSS, settings, and the vanilla Activities launcher are outside this transaction and remain untouched.</p>
        <p className="soulcord-callout">On a new setup, Message Timeline stays off. Configure it later in its own section; this wizard does not change its policy.</p>
    </div>;
}

function ThemeStep({value, onChange}: {value: SoulCordThemeId; onChange(value: SoulCordThemeId): void;}) {
    return <div className="soulcord-wizard-body">
        <h3>Base theme</h3>
        <p>Each theme is self-contained and uses the same compact layout, visible keyboard focus, and reduced-motion rules. Choosing here does not activate it.</p>
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

function AddonStep({draft, toggle, selectRecommended, setProvider}: {draft: SoulCordSetupDraft; toggle(name: string, enabled: boolean): void; selectRecommended(): void; setProvider(name: string, provider: SoulCordAddonProvider): void;}) {
    const selected = useMemo(() => new Set(draft.selectedAddons), [draft.selectedAddons]);
    const plan = useMemo(() => resolveSoulCordSetupPlan(draft.selectedAddons, draft.addonModes), [draft.addonModes, draft.selectedAddons]);
    const decisions = useMemo(() => new Map(plan.decisions.map(decision => [decision.name, decision])), [plan.decisions]);
    const readyGroups = useMemo(() => SOULCORD_ADDON_GROUPS.map(group => ({
        ...group,
        addons: group.addons.filter(addon => isReadyDecision(decisions.get(addon.name)))
    })).filter(group => group.addons.length > 0), [decisions]);
    const readyDecisions = useMemo(() => plan.decisions.filter(isReadyDecision), [plan.decisions]);
    const pendingDecisions = useMemo(() => plan.decisions.filter(decision => !isReadyDecision(decision)), [plan.decisions]);
    const selectedReadyCount = readyDecisions.filter(decision => selected.has(decision.name)).length;
    const selectedPendingCount = pendingDecisions.filter(decision => selected.has(decision.name)).length;
    const activeCommunityFiles = useStateFromStores([PluginManager], () => Object.fromEntries(SOULCORD_RUNTIME_ADDONS.flatMap(candidate => {
        const addon = resolveCommunityAddon(PluginManager, candidate.name, candidate.fileName);
        return addon && PluginManager.isEnabled(addon.filename) ? [[candidate.name, addon.filename]] : [];
    })) as Record<string, string>);
    return <div className="soulcord-wizard-body">
        <div className="soulcord-wizard-inline-heading"><div><h3>Ready local tools</h3><p>{selectedReadyCount} of {readyDecisions.length} selected. Each tool starts only after its Discord adapter validates.</p></div><div className="soulcord-actions"><button type="button" className="soulcord-action" onClick={selectRecommended}>Use recommended</button><button type="button" className="soulcord-action" onClick={() => readyDecisions.forEach(decision => toggle(decision.name, false))}>Clear ready choices</button></div></div>
        <div className="soulcord-addon-groups">
            {readyGroups.map(group => <fieldset key={group.id} className="soulcord-addon-group">
                <legend>{group.title} <small>{group.summary}</small></legend>
                {group.addons.map(addon => {
                    const decision = decisions.get(addon.name)!;
                    const communityFile = activeCommunityFiles[addon.name];
                    const showProviderChoice = selected.has(addon.name) && Boolean(communityFile) && isSoulCordBuiltInAddon(addon.name, draft.addonModes[addon.name]);
                    return <React.Fragment key={addon.name}>
                        <label className="soulcord-addon-choice">
                            <input type="checkbox" checked={selected.has(addon.name)} onChange={event => toggle(addon.name, event.currentTarget.checked)} />
                            <span><strong>{addon.label}</strong><small>{addon.summary}</small><small>{decision.reason}</small></span>
                            <span className="soulcord-review-chip">{decision.statusLabel}</span>
                        </label>
                        {showProviderChoice && <fieldset className="soulcord-provider-choice">
                            <legend>Choose one provider for <code>{communityFile}</code></legend>
                            <label><input type="radio" name={`provider-${addon.name}`} checked={draft.addonProviders[addon.name] === "prefer-community"} onChange={() => setProvider(addon.name, "prefer-community")} /><span><strong>Keep community addon (recommended)</strong><small>The owner file stays enabled and SoulCord’s matching built-in stands down.</small></span></label>
                            <label><input type="radio" name={`provider-${addon.name}`} checked={draft.addonProviders[addon.name] === "prefer-soulcord"} onChange={() => setProvider(addon.name, "prefer-soulcord")} /><span><strong>Use SoulCord built-in</strong><small>Finish disables this exact community file. Rollback restores its exact prior state.</small></span></label>
                        </fieldset>}
                    </React.Fragment>;
                })}
            </fieldset>)}
        </div>
        <div className="soulcord-catalog-handoff">
            <div><strong>Review pending tools separately</strong><p>{pendingDecisions.length} setup candidates still need a runtime, dependency, action, or security gate. {selectedPendingCount > 0 ? `${selectedPendingCount} previously saved request(s) remain pending and are not downloaded here. ` : ""}The complete {SOULCORD_CATALOG_SNAPSHOT.pluginCount}-plugin snapshot is available in the catalog after setup.</p><p><strong>Guarded Split Large Messages is preview-only.</strong> Its modal/clipboard adapter remains implemented, but Finish will not enable it until a disposable Discord acceptance receipt exists.</p></div>
            <button type="button" className="soulcord-action" onClick={revealCatalog}>Review pending</button>
        </div>
    </div>;
}

function ReviewStep({draft, providerMigrationPlan}: {draft: SoulCordSetupDraft; providerMigrationPlan: SoulCordProviderMigrationPlan | undefined;}) {
    const plan = useMemo(() => resolveSoulCordSetupPlan(draft.selectedAddons, draft.addonModes), [draft.addonModes, draft.selectedAddons]);
    const readyCount = plan.decisions.filter(isReadyDecision).length;
    const executable = new Set(plan.executableAddons);
    const communityCandidates = SOULCORD_RUNTIME_ADDONS.filter(candidate => executable.has(candidate.name) && plan.decisions.find(decision => decision.name === candidate.name)?.availability === "accepted");
    const dependencies = SOULCORD_RUNTIME_DEPENDENCIES.filter(candidate => plan.dependencyNames.includes(candidate.name));
    const selectedTheme = SOULCORD_THEMES.find(theme => theme.id === draft.selectedTheme)!;
    const themeBytes = SOULCORD_RUNTIME_THEMES.reduce((sum, theme) => sum + new TextEncoder().encode(theme.content).byteLength, 0);
    const diskBytes = communityCandidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0) + dependencies.reduce((sum, dependency) => sum + dependency.sizeBytes, 0) + themeBytes;
    const conflicts = [...new Set(plan.decisions.filter(decision => decision.willApply).flatMap(decision => [...decision.conflicts]))];
    const changes = SoulCordRuntime.previewSetup(draft);
    const activeSkipped = useStateFromStores([PluginManager], () => plan.skipped.filter(decision => communityAddonIsEnabled(PluginManager, decision.name, decision.fileName)));
    const activeUnrequested = useStateFromStores([PluginManager], () => {
        const requested = new Set(plan.requestedAddons);
        return SOULCORD_RUNTIME_ADDONS.filter(candidate => !requested.has(candidate.name) && communityAddonIsEnabled(PluginManager, candidate.name, candidate.fileName)).map(candidate => candidate.name);
    });
    const activeBuiltInCounterparts = useStateFromStores([PluginManager], () => plan.executableAddons.flatMap(name => {
        const candidate = SOULCORD_RUNTIME_ADDONS.find(entry => entry.name === name);
        if (!candidate || !isSoulCordBuiltInAddon(name, draft.addonModes[name])) return [];
        const addon = resolveCommunityAddon(PluginManager, candidate.name, candidate.fileName);
        return addon && PluginManager.isEnabled(addon.filename) ? [{name, fileName: addon.filename}] : [];
    }));
    const communitySwitches = providerMigrationPlan?.entries ?? [];
    const communityKeeps = activeBuiltInCounterparts.filter(counterpart => draft.addonProviders[counterpart.name] !== "prefer-soulcord");
    const liveThemeState = useStateFromStores([ThemeManager], () => ({
        selectedEnabled: ThemeManager.isEnabled(selectedTheme.fileName),
        activeOtherNames: SOULCORD_THEMES.filter(theme => theme.id !== selectedTheme.id && ThemeManager.isEnabled(theme.fileName)).map(theme => theme.name),
        activeThirdPartyNames: ThemeManager.addonList
            .filter(theme => !SOULCORD_THEMES.some(candidate => candidate.fileName === theme.filename) && ThemeManager.isEnabled(theme.filename))
            .map(theme => theme.name || theme.filename)
    }));
    return <div className="soulcord-wizard-body">
        <h3>Complete transaction preview</h3>
        <dl className="soulcord-facts">
            <div><dt>Ready tools selected</dt><dd>{plan.executableAddons.length} of {readyCount}</dd></div>
            <div><dt>Pending catalog requests</dt><dd>{plan.skipped.length} · no download</dd></div>
            <div><dt>Dependencies</dt><dd>{dependencies.map(item => item.name).join(", ") || "none"}</dd></div>
            <div><dt>Theme enabled after Finish</dt><dd>{selectedTheme.name}</dd></div>
            <div><dt>Bundled theme files in transaction</dt><dd>{SOULCORD_RUNTIME_THEMES.length}</dd></div>
            <div><dt>Maximum staged disk use</dt><dd>{bytesLabel(diskBytes)}</dd></div>
        </dl>
        <div className="soulcord-review-columns">
            <div><strong>Settings diff</strong>{changes.length ? <ul>{changes.map(change => <li key={change}>{change}</li>)}</ul> : <p>No stored-selection difference; Finish still verifies and tests selected files.</p>}</div>
            <div><strong>Known conflict checks</strong>{conflicts.length ? <ul>{conflicts.map(conflict => <li key={conflict}>{conflict}</li>)}</ul> : <p>No catalog-declared conflicts in this selection.</p>}</div>
        </div>
        {plan.skipped.length > 0 && <p className="soulcord-callout"><strong>Pending stays pending:</strong> {plan.skipped.length} saved catalog request(s) remain uninstalled. Review their individual evidence and status in the catalog after setup.</p>}
        {activeSkipped.length > 0 && <p className="soulcord-callout"><strong>Selected community files already active:</strong> {activeSkipped.map((decision: SoulCordSetupCandidateDecision) => decision.name).join(", ")} remain enabled and owner-managed. SoulCord skips their unaccepted catalog candidates without replacing, stopping, or certifying the existing files.</p>}
        {activeUnrequested.length > 0 && <p className="soulcord-callout"><strong>Preserved owner addons:</strong> {activeUnrequested.join(", ")} are active but were not requested here. Finish leaves them unchanged and outside this transaction.</p>}
        {communityKeeps.length > 0 && <p className="soulcord-callout"><strong>Keep community provider:</strong> {communityKeeps.map(counterpart => `${counterpart.name} (${counterpart.fileName})`).join(", ")} remain enabled and owner-managed. Matching SoulCord built-ins stand down.</p>}
        {communitySwitches.length > 0 && <p className="soulcord-callout soulcord-callout-danger"><strong>Explicit provider migration:</strong> Finish disables only {communitySwitches.map(counterpart => counterpart.fileName).join(", ")} and starts the matching SoulCord built-in(s). The rollback journal stores every exact prior plugin state.</p>}
        {liveThemeState.activeThirdPartyNames.length > 0 && <p className="soulcord-callout"><strong>Possible theme overlap:</strong> {liveThemeState.activeThirdPartyNames.join(", ")} remain enabled and owner-managed. Finish does not modify third-party themes.</p>}
        <div className="soulcord-callout"><strong>Exact theme transaction</strong><p>All five bundled files are included and hash-verified; missing files are staged: {SOULCORD_RUNTIME_THEMES.map(theme => theme.fileName).join(", ")}. Finish {liveThemeState.selectedEnabled ? "keeps" : "enables"} {selectedTheme.name}{liveThemeState.activeOtherNames.length ? ` and disables ${liveThemeState.activeOtherNames.join(", ")}` : ""}; rollback restores the prior enabled states and removes only unchanged files added by this transaction.</p></div>
        <p className="soulcord-callout">Finish applies only the accepted ready set, leaves pending catalog choices uninstalled, verifies accepted hashes and dependencies, activates one SoulCord theme, and keeps a one-click rollback record.</p>
    </div>;
}

export default function SetupWizard() {
    const document = useStateFromStores(SoulCordSettings, () => SoulCordSettings.snapshot());
    const [step, setStep] = useState(0);
    const [draft, setDraft] = useState<SoulCordSetupDraft>(() => draftFrom(document));
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");
    const plan = useMemo(() => resolveSoulCordSetupPlan(draft.selectedAddons, draft.addonModes), [draft.addonModes, draft.selectedAddons]);
    const providerMigrationPlan = useStateFromStores([PluginManager], () => SoulCordRuntime.prepareProviderMigrationPlan(draft), [draft]);
    const toggle = (name: string, enabled: boolean) => setDraft(current => ({...current, selectedAddons: enabled ? [...new Set([...current.selectedAddons, name])] : current.selectedAddons.filter(item => item !== name)}));
    const setProvider = (name: string, provider: SoulCordAddonProvider) => setDraft(current => ({...current, addonProviders: {...current.addonProviders, [name]: provider}}));
    const selectRecommended = () => setDraft(current => {
        const recommended = recommendedSoulCordSetupAddons();
        const readyNames = new Set(resolveSoulCordSetupPlan(SOULCORD_PRESET_ADDONS, current.addonModes).decisions.filter(isReadyDecision).map(decision => decision.name));
        return {
            ...current,
            selectedAddons: [...new Set([...current.selectedAddons.filter(name => !readyNames.has(name)), ...recommended])]
        };
    });
    const finish = async () => {
        if (!providerMigrationPlan) {
            setStatus("Setup stopped before changing anything because the current provider identity could not be sealed. Review the active community addon files and try again.");
            return;
        }
        const providerMigrations = providerMigrationPlan.entries.map(entry => entry.fileName);
        const migrationNotice = providerMigrations.length ? ` This explicitly disables ${providerMigrations.join(", ")} in favor of the selected SoulCord built-in; rollback restores the exact prior state.` : "";
        if (!window.confirm(`Apply ${plan.executableAddons.length} ready feature(s), verify or provision the five bundled theme files, and activate ${SOULCORD_THEMES.find(theme => theme.id === draft.selectedTheme)?.name}? ${plan.skipped.length} selected optional choice(s) will be skipped without download. Existing differing files will abort without being overwritten.${migrationNotice}`)) return;
        setBusy(true);
        setStatus(plan.skipped.length ? `Applying the ready set; ${plan.skipped.length} unavailable choice(s) will be skipped…` : "Applying the ready set and verifying hashes…");
        try {
            const result = await SoulCordRuntime.finishSetup(draft, providerMigrationPlan);
            setStatus(`Finished transaction ${result.transactionId}. ${result.enabled.length} enabled; ${plan.skipped.length} skipped; ${result.quarantined.length} quarantined; ${result.providerConflicts.length} provider conflict(s).`);
        }
        catch (error) {
            setStatus(error instanceof Error && error.message === "SetupProviderMigrationConfirmationChanged"
                ? "Setup stopped because the active community provider changed after review. The transaction was not kept and no provider addon was disabled; review the exact file list again."
                : "Setup stopped safely. No differing local file was overwritten. Review the setup checks before trying again.");
        }
        finally {
            setBusy(false);
        }
    };
    const skip = () => {
        if (!window.confirm("Skip setup? No plugin file, theme file, enabled state, or Timeline policy will change. You can reopen this wizard later.")) return;
        SoulCordSettings.skipOnboarding();
    };

    return <section className="soulcord-wizard" aria-labelledby="soulcord-setup-title" aria-busy={busy}>
        <div className="soulcord-wizard-title"><div><p className="soulcord-eyebrow">First-run setup · every change previewed</p><h2 id="soulcord-setup-title">SoulCord first-run setup</h2><p>Four bounded steps: inspect current state, select a theme and ready tools, then review the exact transaction. The catalog stays separate.</p></div><span>{step + 1} / {WIZARD_STEPS.length}</span></div>
        <StepNavigation step={step} setStep={setStep} disabled={busy} />
        {step === 0 && <CurrentStateStep />}
        {step === 1 && <ThemeStep value={draft.selectedTheme} onChange={selectedTheme => setDraft(current => ({...current, selectedTheme}))} />}
        {step === 2 && <AddonStep draft={draft} toggle={toggle} selectRecommended={selectRecommended} setProvider={setProvider} />}
        {step === 3 && <ReviewStep draft={draft} providerMigrationPlan={providerMigrationPlan} />}
        <div className="soulcord-wizard-footer">
            <div className="soulcord-actions"><button type="button" className="soulcord-action" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || busy}>Back</button>{step < WIZARD_STEPS.length - 1 ? <button type="button" className="soulcord-action soulcord-action-accent" disabled={busy} onClick={() => setStep(Math.min(WIZARD_STEPS.length - 1, step + 1))}>Next</button> : <button type="button" className="soulcord-action soulcord-action-accent" disabled={busy} onClick={() => void finish()}>{busy ? "Checking files…" : "Install accepted now"}</button>}<button type="button" className="soulcord-action" disabled={busy} onClick={skip}>Skip without changes</button></div>
            {status && <p role="status" aria-live="polite" className="soulcord-setup-status">{status}</p>}
        </div>
    </section>;
}
