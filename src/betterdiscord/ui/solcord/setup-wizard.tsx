import React from "react";

import {useStateFromStores} from "@ui/hooks";
import PluginManager from "@modules/pluginmanager";
import ThemeManager from "@modules/thememanager";
import SolcordRuntime from "@modules/solcord/runtime";
import SolcordSettings, {SOLCORD_PRESET_ADDONS, SOLCORD_THEMES} from "@modules/solcord/store";
import type {SolcordAddonProvider, SolcordSettingsDocument, SolcordSetupDraft, SolcordThemeId} from "@modules/solcord/contracts";
import {SOLCORD_CATALOG_SNAPSHOT, SOLCORD_RUNTIME_ADDONS, SOLCORD_RUNTIME_DEPENDENCIES, SOLCORD_RUNTIME_THEMES} from "@common/solcord/addon-catalog.generated";
import {communityAddonIsEnabled, isSolcordBuiltInAddon, resolveCommunityAddon, type SolcordProviderMigrationPlan} from "@common/solcord/builtin-addons";
import {recommendedSolcordSetupAddons, resolveSolcordSetupPlan, type SolcordSetupCandidateDecision} from "@common/solcord/setup-catalog";
import {resolveSolcordPerformancePolicy, SOLCORD_PERFORMANCE_POLICIES, SOLCORD_SETUP_STEPS, type SolcordAppearancePreferences, type SolcordPerformanceProfile, type SolcordSafetyPreferences, type SolcordSetupPreset} from "@common/solcord/product";

import {SOLCORD_ADDON_GROUPS} from "./catalog";

const {useEffect, useMemo, useState} = React;

const WIZARD_STEPS = SOLCORD_SETUP_STEPS;

const THEME_NOTES: Record<SolcordThemeId, string> = {
    "solcord-default": "Recommended · Graphite, warm text, oxidized teal, and ember reserved for warnings.",
    "obsidian-thread": "Graphite, warm bone, oxidized teal, and restrained ember.",
    "carbon-ember": "Charcoal and ash with copper and burgundy accents.",
    "midnight-glass": "Navy-black, silver, ice cyan, and restrained translucency.",
    "paper-signal": "Warm paper, ink, coral, and teal for a light workspace.",
    "threadline": "Compact indexed navigation, ruled regions, and quick-scanning density.",
    "signal-block": "Square controls, thick containment, and unmistakable press and focus states.",
    "relay-classic": "A restrained return to classic Discord density and familiar proportions.",
    "workshop": "Tactile borders, an inset composer, and clear working-state controls.",
    "quiet-read": "Long-form readability, generous measure, visible focus, and reduced motion.",
    "night-transit": "A dark route-rail system distinguishing selected, unread, mention, and voice states."
};

function draftFrom(document: SolcordSettingsDocument): SolcordSetupDraft {
    if (document.onboarding.draft) return structuredClone(document.onboarding.draft);
    return {
        preset: "recommended",
        selectedTheme: document.selectedTheme,
        selectedAddons: SOLCORD_PRESET_ADDONS.filter(name => document.curatedAddons[name]?.selected),
        addonModes: Object.fromEntries(SOLCORD_PRESET_ADDONS.map(name => [name, document.curatedAddons[name]?.mode ?? (name === "SplitLargeMessages" ? "guarded" : "default")])),
        addonProviders: Object.fromEntries(SOLCORD_PRESET_ADDONS.map(name => {
            const mode = document.curatedAddons[name]?.mode ?? (name === "SplitLargeMessages" ? "guarded" : "default");
            const community = resolveCommunityAddon(PluginManager, name, SOLCORD_RUNTIME_ADDONS.find(addon => addon.name === name)?.fileName ?? "");
            const provider = isSolcordBuiltInAddon(name, mode) && !community
                ? "prefer-solcord"
                : document.curatedAddons[name]?.provider ?? "prefer-community";
            return [name, provider];
        })),
        timelinePolicy: document.timelinePolicy,
        productPreferences: document.productPreferences
    };
}

function setupFailureMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : "UnknownSetupFailure";
    if (message === "SetupProviderMigrationConfirmationChanged" || message === "SetupCommunityCounterpartChanged") return "Setup stopped because an active community provider changed after review. Review the exact provider choice again; no provider was silently disabled.";
    if (message.includes("already exists with a different hash")) return `Setup found a local file with different contents and left it untouched. ${message.slice(0, 180)}`;
    if (message.includes("Download failed") || message.includes("response did not contain a body")) return "Setup could not download a reviewed community file. Built-in features and owner files were left unchanged; check the connection and retry.";
    if (message.includes("Hash verification") || message.includes("Integrity") || message.includes("ownership receipt") || message.includes("Staged verification")) return "Setup rejected a file because its reviewed hash or ownership receipt did not match. Nothing unverified was enabled.";
    if (message === "SelectedThemeLoadTimeout" || message === "SelectedThemeStartFailed") return "The theme file was verified, but Discord did not load or enable it in time. The transaction was rolled back.";
    if (message === "SetupFailedRollbackIncomplete") return "Setup stopped and automatic rollback needs attention. Open Recovery before trying setup again; owner files were not overwritten.";
    return "Setup stopped safely before keeping the transaction. Open Plugin Doctor for the sanitized failure code and retry after the flagged item is resolved.";
}

function bytesLabel(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function isReadyDecision(decision: SolcordSetupCandidateDecision | undefined): boolean {
    return decision?.availability === "built-in" || decision?.availability === "accepted";
}

function StepNavigation({step, setStep, disabled}: {step: number; setStep(step: number): void; disabled: boolean;}) {
    return <ol className="solcord-wizard-steps" aria-label="Solcord setup steps">
        {WIZARD_STEPS.map((label, index) => <li key={label}>
            <button type="button" aria-current={index === step ? "step" : undefined} disabled={disabled} onClick={() => setStep(index)}>
                <span aria-hidden="true">{index + 1}</span><span>{label}</span>
            </button>
        </li>)}
    </ol>;
}

function WelcomeStep() {
    return <div className="solcord-wizard-body solcord-welcome-step">
        <p className="solcord-eyebrow">Private desktop client mod</p>
        <h3>Make Discord yours without hiding the tradeoffs.</h3>
        <p>Solcord is an independent BetterDiscord-based client modification. Discord does not officially support client mods, so updates can break adapters and optional capabilities may carry platform risk.</p>
        <p className="solcord-callout"><strong>Your account stays yours.</strong> Solcord does not extract tokens, automate your account, send messages, join calls, open Activities, or enable private history without a separate choice.</p>
    </div>;
}

function CurrentStateStep() {
    const state = useStateFromStores([PluginManager, ThemeManager], () => ({
        installed: SOLCORD_RUNTIME_ADDONS.filter(addon => Boolean(PluginManager.resolveAddon(addon.fileName))).length,
        enabled: SOLCORD_RUNTIME_ADDONS.filter(addon => communityAddonIsEnabled(PluginManager, addon.name, addon.fileName)).length,
        solcordThemes: SOLCORD_THEMES.filter(theme => Boolean(ThemeManager.resolveAddon(theme.fileName))).length,
        activeSolcordThemes: SOLCORD_THEMES.filter(theme => ThemeManager.isEnabled(theme.fileName)).length
    }));
    return <div className="solcord-wizard-body">
        <h3>Protected starting point</h3>
        <p>Your complete draft is saved while you move through setup. Apply records a rollback transaction, validates ready adapters, and stops without overwriting a different local file.</p>
        <dl className="solcord-facts">
            <div><dt>Catalog files already present</dt><dd>{state.installed}</dd></div>
            <div><dt>Catalog features currently enabled</dt><dd>{state.enabled}</dd></div>
            <div><dt>Solcord themes present</dt><dd>{state.solcordThemes} of {SOLCORD_THEMES.length}</dd></div>
            <div><dt>Solcord themes active</dt><dd>{state.activeSolcordThemes}</dd></div>
        </dl>
        <p className="solcord-callout">Existing MessageLogger data, unrelated plugins, themes, custom CSS, settings, and the vanilla Activities launcher are outside this transaction and remain untouched.</p>
        <p className="solcord-callout">On a new setup, Message Timeline starts off. You may opt in during the Private history step; skipping setup leaves its policy unchanged.</p>
    </div>;
}

function PresetStep({value, onChange}: {value: SolcordSetupPreset; onChange(value: SolcordSetupPreset): void;}) {
    const options: Array<{id: SolcordSetupPreset; title: string; detail: string;}> = [
        {id: "recommended", title: "Recommended", detail: "Activity safety, recovery, and the three accepted local interaction tools."},
        {id: "minimal", title: "Minimal", detail: "Core compatibility and recovery only; no daily interaction tools."},
        {id: "power-user", title: "Power User", detail: "Requests the complete catalog set for review. Held tools stay uninstalled."}
    ];
    return <div className="solcord-wizard-body">
        <h3>Choose a starting point</h3>
        <p>This changes only the draft. You will see every resulting change before Apply.</p>
        <div className="solcord-choice-stack">{options.map(option => <label key={option.id} className="solcord-choice-row"><input type="radio" name="solcord-preset" checked={value === option.id} onChange={() => onChange(option.id)} /><span><strong>{option.title}</strong><small>{option.detail}</small></span></label>)}</div>
    </div>;
}

function PerformanceStep({draft, onChange}: {draft: SolcordSetupDraft; onChange(value: SolcordSetupDraft): void;}) {
    const profile = draft.productPreferences.performanceProfile;
    const reducedByOs = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    const policy = resolveSolcordPerformancePolicy(profile, draft.productPreferences.appearance.motion, reducedByOs);
    return <div className="solcord-wizard-body">
        <h3>Choose how Solcord spends resources</h3>
        <p>This policy is real: it bounds performance sampling and caps motion. Disabled tools remain fully stopped in every profile.</p>
        <div className="solcord-segmented" role="radiogroup" aria-label="Setup performance profile">{(Object.keys(SOLCORD_PERFORMANCE_POLICIES) as SolcordPerformanceProfile[]).map(id => <button key={id} type="button" role="radio" aria-checked={profile === id} onClick={() => onChange({...draft, productPreferences: {...draft.productPreferences, performanceProfile: id}})}><strong>{id[0].toUpperCase() + id.slice(1)}</strong><small>{SOLCORD_PERFORMANCE_POLICIES[id].description}</small></button>)}</div>
        <dl className="solcord-facts"><div><dt>Effective motion</dt><dd>{policy.effectiveMotion}</dd></div><div><dt>Sampling interval</dt><dd>at least {policy.sampleSeconds} seconds</dd></div><div><dt>Windows reduced motion</dt><dd>{reducedByOs ? "honored" : "not requested"}</dd></div></dl>
    </div>;
}

function ActivitiesStep() {
    const state = useStateFromStores(SolcordRuntime, () => ({activity: SolcordRuntime.activityHealth(), drift: SolcordRuntime.driftResults()}));
    const failed = state.drift.filter(item => !item.ok);
    return <div className="solcord-wizard-body">
        <h3>Activities compatibility check</h3>
        <p>Solcord keeps BetterDiscord&apos;s unrestricted preload override off. It permits one later preload only when canonical paths prove that it belongs to the same Discord package.</p>
        <dl className="solcord-facts"><div><dt>Compatibility policy</dt><dd>{state.activity?.status ?? "starting"}</dd></div><div><dt>Unrestricted override</dt><dd>{state.activity?.unrestrictedOverride ? "on — review required" : "off"}</dd></div><div><dt>Structural checks</dt><dd>{failed.length ? `${failed.length} degraded` : "available"}</dd></div></dl>
        <p className="solcord-callout">This check does not launch an Activity or act on your account. Codenames and a second Activity remain hands-on acceptance steps after setup.</p>
    </div>;
}

const SOLCORD_PRESENTATION_ATTRIBUTES = [
    "data-solcord-mode",
    "data-solcord-accent",
    "data-solcord-density",
    "data-solcord-motion",
    "data-solcord-message-shape",
    "data-solcord-performance",
    "data-solcord-effective-motion"
] as const;

function useFullShellAppearancePreview(appearance: SolcordAppearancePreferences, performanceProfile: SolcordPerformanceProfile): void {
    useEffect(() => {
        const root = document.documentElement;
        const previous = new Map(SOLCORD_PRESENTATION_ATTRIBUTES.map(attribute => [attribute, root.getAttribute(attribute)]));
        const reducedByOs = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
        root.dataset.solcordMode = appearance.mode;
        root.dataset.solcordAccent = appearance.accent;
        root.dataset.solcordDensity = appearance.density;
        root.dataset.solcordMotion = appearance.motion;
        root.dataset.solcordMessageShape = appearance.messageShape;
        root.dataset.solcordPerformance = performanceProfile;
        root.dataset.solcordEffectiveMotion = resolveSolcordPerformancePolicy(performanceProfile, appearance.motion, reducedByOs).effectiveMotion;
        return () => {
            for (const [attribute, value] of previous) {
                if (value === null) root.removeAttribute(attribute);
                else root.setAttribute(attribute, value);
            }
        };
    }, [appearance, performanceProfile]);
}

function ThemeStep({value, appearance, performanceProfile, onChange, onAppearance}: {value: SolcordThemeId; appearance: SolcordAppearancePreferences; performanceProfile: SolcordPerformanceProfile; onChange(value: SolcordThemeId): void; onAppearance(value: SolcordAppearancePreferences): void;}) {
    useFullShellAppearancePreview(appearance, performanceProfile);
    return <div className="solcord-wizard-body">
        <h3>Appearance</h3>
        <p>Choose the product mode first. The live preview covers the full Discord shell and restores your saved appearance when you leave this step.</p>
        <div className="solcord-appearance-controls">
            <label>Mode<select value={appearance.mode} onChange={event => onAppearance({...appearance, mode: event.currentTarget.value as SolcordAppearancePreferences["mode"]})}><option value="follow-discord">Follow Discord</option><option value="solcord-dark">Solcord Dark</option><option value="solcord-light">Solcord Light</option><option value="oled">OLED</option></select></label>
            <label>Accent<select value={appearance.accent} onChange={event => onAppearance({...appearance, accent: event.currentTarget.value as SolcordAppearancePreferences["accent"]})}><option value="system">Discord / system</option><option value="glacier">Glacier cyan</option><option value="signal">Signal amber</option><option value="coral">Coral</option><option value="forest">Forest</option></select></label>
            <label>Density<select value={appearance.density} onChange={event => onAppearance({...appearance, density: event.currentTarget.value as SolcordAppearancePreferences["density"]})}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
            <label>Motion<select value={appearance.motion} onChange={event => onAppearance({...appearance, motion: event.currentTarget.value as SolcordAppearancePreferences["motion"]})}><option value="follow-system">Use performance profile</option><option value="full">Full</option><option value="subtle">Subtle</option><option value="reduced">Reduced</option></select></label>
            <label>Message shape<select value={appearance.messageShape} onChange={event => onAppearance({...appearance, messageShape: event.currentTarget.value as SolcordAppearancePreferences["messageShape"]})}><option value="discord">Discord default</option><option value="seamed">Quiet 1px seams</option></select></label>
        </div>
        <div className={`solcord-live-preview solcord-mode-${appearance.mode} solcord-accent-${appearance.accent} solcord-preview-density-${appearance.density} solcord-preview-shape-${appearance.messageShape}`} aria-label="Solcord appearance preview"><span>Private thread</span><strong>Clear hierarchy, quiet seams, visible focus.</strong><small>The whole-shell preview updates immediately. Apply saves the mode and installs the selected compatibility theme.</small></div>
        <details className="solcord-legacy-themes"><summary>Compatibility theme package</summary>
        <div className="solcord-theme-options">
            {SOLCORD_THEMES.map(theme => <label key={theme.id} className={`solcord-theme-option solcord-theme-${theme.id}`}>
                <input type="radio" name="solcord-theme" value={theme.id} checked={value === theme.id} onChange={() => onChange(theme.id)} />
                <span className="solcord-theme-swatch" aria-hidden="true"><i /><i /><i /><i /></span>
                <span><strong>{theme.name}</strong><small>{THEME_NOTES[theme.id]}</small></span>
            </label>)}
        </div>
        </details>
        <p className="solcord-callout">Only the selected Solcord package is enabled. Existing third-party themes are not modified; possible visual overlap is shown in the final review.</p>
    </div>;
}

function SafetyStep({value, onChange}: {value: SolcordSafetyPreferences; onChange(value: SolcordSafetyPreferences): void;}) {
    return <div className="solcord-wizard-body">
        <h3>Safety defaults</h3>
        <p>These are local review tools. None silently opens, downloads, uploads, or navigates.</p>
        <div className="solcord-choice-stack">
            <label className="solcord-choice-row"><input type="checkbox" checked={value.linkLens} onChange={event => onChange({...value, linkLens: event.currentTarget.checked})} /><span><strong>Link Lens</strong><small>Review verified external-link activations in a native modal. Internal Discord routes remain untouched.</small></span></label>
            <label className="solcord-choice-row"><input type="checkbox" checked={value.attachmentGuard} onChange={event => onChange({...value, attachmentGuard: event.currentTarget.checked})} /><span><strong>Show the manual Attachment Guard inspector</strong><small>Keep the local filename, MIME, and extension review tool in Safety. It does not intercept clicks, open files, or claim automatic protection.</small></span></label>
            <label className="solcord-choice-row"><input type="checkbox" checked={value.privacyModeReady} onChange={event => onChange({...value, privacyModeReady: event.currentTarget.checked})} /><span><strong>Privacy Mode ready</strong><small>Keep the reversible redaction action available, but off.</small></span></label>
        </div>
    </div>;
}

function PrivateHistoryStep({draft, onChange}: {draft: SolcordSetupDraft; onChange(value: SolcordSetupDraft): void;}) {
    const friendWatch = draft.productPreferences.friendWatch;
    return <div className="solcord-wizard-body">
        <h3>Private local history</h3>
        <p>Both capabilities are off until you choose them. They observe only data already loaded by this running client and never make extra Discord requests.</p>
        <div className="solcord-choice-stack">
            <label className="solcord-choice-row"><input type="checkbox" checked={friendWatch.enabled} onChange={event => onChange({...draft, productPreferences: {...draft.productPreferences, friendWatch: {...friendWatch, enabled: event.currentTarget.checked}}})} /><span><strong>Friend Watch</strong><small>Relationship transitions only; 30-day encrypted local retention by default. It never guesses who blocked you.</small></span></label>
            <label className="solcord-choice-row"><input type="checkbox" disabled={!friendWatch.enabled} checked={friendWatch.includeDisplaySnapshot} onChange={event => onChange({...draft, productPreferences: {...draft.productPreferences, friendWatch: {...friendWatch, includeDisplaySnapshot: event.currentTarget.checked}}})} /><span><strong>Keep display snapshots</strong><small>Store the already-loaded display name inside the encrypted account history. Turn this off to keep only an account-scoped subject key.</small></span></label>
            <label className="solcord-choice-row"><span><strong>Local notifications</strong><small>Daily shows one bounded in-app summary after a new transition; per-event is capped to prevent notification storms.</small></span><select aria-label="Friend Watch notification mode" disabled={!friendWatch.enabled} value={friendWatch.digest} onChange={event => onChange({...draft, productPreferences: {...draft.productPreferences, friendWatch: {...friendWatch, digest: event.currentTarget.value as typeof friendWatch.digest}}})}><option value="off">Off</option><option value="daily">Daily in-app</option><option value="per-event">Per event, local</option></select></label>
            <label className="solcord-choice-row"><input type="checkbox" checked={draft.timelinePolicy.enabled} onChange={event => onChange({...draft, timelinePolicy: {...draft.timelinePolicy, enabled: event.currentTarget.checked}})} /><span><strong>Message Timeline</strong><small>DM-only, text-only, seven days by default. This stores observed message edits/deletes locally.</small></span></label>
        </div>
        <p className="solcord-callout">On Windows, safeStorage uses the signed-in Windows account boundary. It does not promise protection from every process already running as you. Without secure storage, persistence falls back to session-only.</p>
    </div>;
}

function ApplyStep({draft}: {draft: SolcordSetupDraft;}) {
    return <div className="solcord-wizard-body">
        <h3>Ready to apply</h3>
        <p>Apply revalidates the reviewed bytes and provider identities, captures a rollback point, performs the transaction, and verifies the result. A failure aborts or rolls back without overwriting a different local file.</p>
        <dl className="solcord-facts"><div><dt>Preset</dt><dd>{draft.preset}</dd></div><div><dt>Performance</dt><dd>{draft.productPreferences.performanceProfile}</dd></div><div><dt>Friend Watch</dt><dd>{draft.productPreferences.friendWatch.enabled ? "consented" : "off"}</dd></div><div><dt>Message Timeline</dt><dd>{draft.timelinePolicy.enabled ? "consented" : "off"}</dd></div><div><dt>Power Lab</dt><dd>off</dd></div></dl>
    </div>;
}

function AddonStep({draft, toggle, selectRecommended, setProvider, onReviewPending}: {draft: SolcordSetupDraft; toggle(name: string, enabled: boolean): void; selectRecommended(): void; setProvider(name: string, provider: SolcordAddonProvider): void; onReviewPending(): void;}) {
    const selected = useMemo(() => new Set(draft.selectedAddons), [draft.selectedAddons]);
    const plan = useMemo(() => resolveSolcordSetupPlan(draft.selectedAddons, draft.addonModes), [draft.addonModes, draft.selectedAddons]);
    const decisions = useMemo(() => new Map(plan.decisions.map(decision => [decision.name, decision])), [plan.decisions]);
    const readyGroups = useMemo(() => SOLCORD_ADDON_GROUPS.map(group => ({
        ...group,
        addons: group.addons.filter(addon => isReadyDecision(decisions.get(addon.name)))
    })).filter(group => group.addons.length > 0), [decisions]);
    const readyDecisions = useMemo(() => plan.decisions.filter(isReadyDecision), [plan.decisions]);
    const pendingDecisions = useMemo(() => plan.decisions.filter(decision => !isReadyDecision(decision)), [plan.decisions]);
    const selectedReadyCount = readyDecisions.filter(decision => selected.has(decision.name)).length;
    const selectedPendingCount = pendingDecisions.filter(decision => selected.has(decision.name)).length;
    const installedCommunityFiles = useStateFromStores([PluginManager], () => Object.fromEntries(SOLCORD_RUNTIME_ADDONS.flatMap(candidate => {
        const addon = resolveCommunityAddon(PluginManager, candidate.name, candidate.fileName);
        return addon ? [[candidate.name, {fileName: addon.filename, enabled: PluginManager.isEnabled(addon.filename)}]] : [];
    })) as Record<string, {fileName: string; enabled: boolean;}>);
    return <div className="solcord-wizard-body">
        <div className="solcord-wizard-inline-heading"><div><h3>Ready local tools</h3><p>{selectedReadyCount} of {readyDecisions.length} selected. Each tool starts only after its Discord adapter validates.</p></div><div className="solcord-actions"><button type="button" className="solcord-action" onClick={selectRecommended}>Use recommended</button><button type="button" className="solcord-action" onClick={() => readyDecisions.forEach(decision => toggle(decision.name, false))}>Clear ready choices</button></div></div>
        <div className="solcord-addon-groups">
            {readyGroups.map(group => <fieldset key={group.id} className="solcord-addon-group">
                <legend>{group.title} <small>{group.summary}</small></legend>
                {group.addons.map(addon => {
                    const decision = decisions.get(addon.name)!;
                    const communityFile = installedCommunityFiles[addon.name];
                    const showProviderChoice = selected.has(addon.name) && Boolean(communityFile) && isSolcordBuiltInAddon(addon.name, draft.addonModes[addon.name]);
                    return <React.Fragment key={addon.name}>
                        <label className="solcord-addon-choice">
                            <input type="checkbox" checked={selected.has(addon.name)} onChange={event => toggle(addon.name, event.currentTarget.checked)} />
                            <span><strong>{addon.label}</strong><small>{addon.summary}</small><small>{decision.reason}</small></span>
                            <span className="solcord-review-chip">{decision.statusLabel}</span>
                        </label>
                        {showProviderChoice && <fieldset className="solcord-provider-choice">
                        <legend>Existing file: <code>{communityFile.fileName}</code> · {communityFile.enabled ? "on" : "off"}</legend>
                            <label><input type="radio" name={`provider-${addon.name}`} checked={draft.addonProviders[addon.name] === "prefer-solcord"} onChange={() => setProvider(addon.name, "prefer-solcord")} /><span><strong>Use Solcord built-in (recommended)</strong><small>After the replacement validates, the exact source file moves to a rollback archive. Its settings and data stay untouched.</small></span></label>
                            <label><input type="radio" name={`provider-${addon.name}`} checked={draft.addonProviders[addon.name] === "prefer-community"} onChange={() => setProvider(addon.name, "prefer-community")} /><span><strong>Keep community addon</strong><small>This file stays in Plugins and Solcord’s matching built-in stands down.</small></span></label>
                        </fieldset>}
                    </React.Fragment>;
                })}
            </fieldset>)}
        </div>
        <div className="solcord-catalog-handoff">
            <div><strong>Review pending tools separately</strong><p>{pendingDecisions.length} setup candidates still need a runtime, dependency, action, or security gate. {selectedPendingCount > 0 ? `${selectedPendingCount} previously saved request(s) remain pending and are not downloaded here. ` : ""}The complete {SOLCORD_CATALOG_SNAPSHOT.pluginCount}-plugin snapshot is available in the catalog after setup.</p><p><strong>Guarded Split Large Messages is built in.</strong> Apply and verify can enable its review-and-manual-copy flow; the community plugin&apos;s native multi-send mode remains held.</p></div>
            <button type="button" className="solcord-action" onClick={onReviewPending}>Review pending</button>
        </div>
    </div>;
}

function ReviewStep({draft, providerMigrationPlan}: {draft: SolcordSetupDraft; providerMigrationPlan: SolcordProviderMigrationPlan | undefined;}) {
    const plan = useMemo(() => resolveSolcordSetupPlan(draft.selectedAddons, draft.addonModes), [draft.addonModes, draft.selectedAddons]);
    const readyCount = plan.decisions.filter(isReadyDecision).length;
    const executable = new Set(plan.executableAddons);
    const communityCandidates = SOLCORD_RUNTIME_ADDONS.filter(candidate => executable.has(candidate.name) && plan.decisions.find(decision => decision.name === candidate.name)?.availability === "accepted");
    const dependencies = SOLCORD_RUNTIME_DEPENDENCIES.filter(candidate => plan.dependencyNames.includes(candidate.name));
    const selectedTheme = SOLCORD_THEMES.find(theme => theme.id === draft.selectedTheme)!;
    const themeBytes = SOLCORD_RUNTIME_THEMES.reduce((sum, theme) => sum + new TextEncoder().encode(theme.content).byteLength, 0);
    const diskBytes = communityCandidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0) + dependencies.reduce((sum, dependency) => sum + dependency.sizeBytes, 0) + themeBytes;
    const conflicts = [...new Set(plan.decisions.filter(decision => decision.willApply).flatMap(decision => [...decision.conflicts]))];
    const changes = SolcordRuntime.previewSetup(draft);
    const activeSkipped = useStateFromStores([PluginManager], () => plan.skipped.filter(decision => communityAddonIsEnabled(PluginManager, decision.name, decision.fileName)));
    const activeUnrequested = useStateFromStores([PluginManager], () => {
        const requested = new Set(plan.requestedAddons);
        return SOLCORD_RUNTIME_ADDONS.filter(candidate => !requested.has(candidate.name) && communityAddonIsEnabled(PluginManager, candidate.name, candidate.fileName)).map(candidate => candidate.name);
    });
    const installedBuiltInCounterparts = useStateFromStores([PluginManager], () => plan.executableAddons.flatMap(name => {
        const candidate = SOLCORD_RUNTIME_ADDONS.find(entry => entry.name === name);
        if (!candidate || !isSolcordBuiltInAddon(name, draft.addonModes[name])) return [];
        const addon = resolveCommunityAddon(PluginManager, candidate.name, candidate.fileName);
        return addon ? [{name, fileName: addon.filename, enabled: PluginManager.isEnabled(addon.filename)}] : [];
    }));
    const communitySwitches = providerMigrationPlan?.entries ?? [];
    const communityKeeps = installedBuiltInCounterparts.filter(counterpart => draft.addonProviders[counterpart.name] !== "prefer-solcord");
    const liveThemeState = useStateFromStores([ThemeManager], () => ({
        selectedEnabled: ThemeManager.isEnabled(selectedTheme.fileName),
        activeOtherNames: SOLCORD_THEMES.filter(theme => theme.id !== selectedTheme.id && ThemeManager.isEnabled(theme.fileName)).map(theme => theme.name),
        activeThirdPartyNames: ThemeManager.addonList
            .filter(theme => !SOLCORD_THEMES.some(candidate => candidate.fileName === theme.filename) && ThemeManager.isEnabled(theme.filename))
            .map(theme => theme.name || theme.filename)
    }));
    return <div className="solcord-wizard-body">
        <h3>Complete transaction preview</h3>
        <dl className="solcord-facts">
            <div><dt>Ready tools selected</dt><dd>{plan.executableAddons.length} of {readyCount}</dd></div>
            <div><dt>Pending catalog requests</dt><dd>{plan.skipped.length} · no download</dd></div>
            <div><dt>Dependencies</dt><dd>{dependencies.map(item => item.name).join(", ") || "none"}</dd></div>
            <div><dt>Theme enabled after Apply and verify</dt><dd>{selectedTheme.name}</dd></div>
            <div><dt>Bundled theme files in transaction</dt><dd>{SOLCORD_RUNTIME_THEMES.length}</dd></div>
            <div><dt>Maximum staged disk use</dt><dd>{bytesLabel(diskBytes)}</dd></div>
        </dl>
        {communitySwitches.length > 0 && <p className="solcord-callout solcord-callout-danger"><strong>Replace duplicate cards:</strong> Apply and verify stops active files in this reviewed set, starts each matching Solcord built-in, then moves the exact unchanged source files into a timestamped rollback archive outside Plugins: {communitySwitches.map(counterpart => counterpart.fileName).join(", ")}. Settings and private databases stay untouched.</p>}
        <details className="solcord-review-details">
            <summary>Review every setting, conflict, and file</summary>
            <div className="solcord-review-columns">
                <div><strong>Settings diff</strong>{changes.length ? <ul>{changes.map(change => <li key={change}>{change}</li>)}</ul> : <p>No stored-selection difference; Apply and verify still checks selected files.</p>}</div>
                <div><strong>Known conflict checks</strong>{conflicts.length ? <ul>{conflicts.map(conflict => <li key={conflict}>{conflict}</li>)}</ul> : <p>No catalog-declared conflicts in this selection.</p>}</div>
            </div>
            {plan.skipped.length > 0 && <p className="solcord-callout"><strong>Pending stays pending:</strong> {plan.skipped.length} saved catalog request(s) remain uninstalled. Review their individual evidence and status in the catalog after setup.</p>}
            {activeSkipped.length > 0 && <p className="solcord-callout"><strong>Selected community files already active:</strong> {activeSkipped.map((decision: SolcordSetupCandidateDecision) => decision.name).join(", ")} remain enabled and owner-managed. Solcord skips their unaccepted catalog candidates without replacing, stopping, or certifying the existing files.</p>}
            {activeUnrequested.length > 0 && <p className="solcord-callout"><strong>Preserved owner addons:</strong> {activeUnrequested.join(", ")} are active but were not requested here. Apply and verify leaves them unchanged and outside this transaction.</p>}
            {communityKeeps.length > 0 && <p className="solcord-callout"><strong>Keep community provider:</strong> {communityKeeps.map(counterpart => `${counterpart.name} (${counterpart.fileName}, ${counterpart.enabled ? "on" : "off"})`).join(", ")} stay owner-managed. Matching Solcord built-ins stand down.</p>}
            {liveThemeState.activeThirdPartyNames.length > 0 && <p className="solcord-callout"><strong>Possible theme overlap:</strong> {liveThemeState.activeThirdPartyNames.join(", ")} remain enabled and owner-managed. Apply and verify does not modify third-party themes.</p>}
            <div className="solcord-callout"><strong>Theme files</strong><p>All {SOLCORD_RUNTIME_THEMES.length} bundled files are included and hash-verified. Apply and verify {liveThemeState.selectedEnabled ? "keeps" : "enables"} {selectedTheme.name}{liveThemeState.activeOtherNames.length ? ` and disables ${liveThemeState.activeOtherNames.join(", ")}` : ""}; rollback restores the prior state.</p></div>
        </details>
        <p className="solcord-callout">Only the ready set changes. Pending tools stay uninstalled, exact hashes are verified, and rollback is kept.</p>
    </div>;
}

export default function SetupWizard({onReviewPending}: {onReviewPending(): void;}) {
    const document = useStateFromStores(SolcordSettings, () => SolcordSettings.snapshot());
    const [step, setStepState] = useState(document.onboarding.lastStep);
    const [draft, setDraftState] = useState<SolcordSetupDraft>(() => draftFrom(document));
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");
    const [paused, setPaused] = useState(false);
    const plan = useMemo(() => resolveSolcordSetupPlan(draft.selectedAddons, draft.addonModes), [draft.addonModes, draft.selectedAddons]);
    const providerMigrationPlan = useStateFromStores([PluginManager], () => SolcordRuntime.prepareProviderMigrationPlan(draft), [draft]);
    useEffect(() => {
        try {SolcordSettings.setSetupDraft(draft);}
        catch {setStatus("Your setup choices could not be saved. The durable draft was left unchanged; check disk access and retry before applying.");}
    }, [draft]);
    const setDraft = (update: SolcordSetupDraft | ((current: SolcordSetupDraft) => SolcordSetupDraft)) => setDraftState(current => typeof update === "function" ? update(current) : update);
    const toggle = (name: string, enabled: boolean) => setDraft(current => ({...current, selectedAddons: enabled ? [...new Set([...current.selectedAddons, name])] : current.selectedAddons.filter(item => item !== name)}));
    const setProvider = (name: string, provider: SolcordAddonProvider) => setDraft(current => ({...current, addonProviders: {...current.addonProviders, [name]: provider}}));
    const setStep = (next: number) => {
        const bounded = Math.min(WIZARD_STEPS.length - 1, Math.max(0, next));
        try {
            SolcordSettings.setOnboardingStep(bounded);
            setStepState(bounded);
        }
        catch {setStatus("Solcord could not save this setup step. Your durable setup state was left unchanged; check disk access and retry.");}
    };
    const setPreset = (preset: SolcordSetupPreset) => setDraft(current => ({
        ...current,
        preset,
        selectedAddons: preset === "minimal" ? [] : preset === "power-user" ? [...SOLCORD_PRESET_ADDONS] : recommendedSolcordSetupAddons()
    }));
    const selectRecommended = () => setDraft(current => {
        const recommended = recommendedSolcordSetupAddons();
        const readyNames = new Set(resolveSolcordSetupPlan(SOLCORD_PRESET_ADDONS, current.addonModes).decisions.filter(isReadyDecision).map(decision => decision.name));
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
        const migrationNotice = providerMigrations.length ? ` This explicitly disables ${providerMigrations.join(", ")} in favor of the selected Solcord built-in and archives only exact unchanged source files outside the scanned Plugins folder; rollback restores them.` : "";
        if (!window.confirm(`Apply ${plan.executableAddons.length} ready feature(s), verify or provision the ${SOLCORD_RUNTIME_THEMES.length} bundled theme files, and activate ${SOLCORD_THEMES.find(theme => theme.id === draft.selectedTheme)?.name}? ${plan.skipped.length} selected optional choice(s) will be skipped without download. Existing differing files will abort without being overwritten.${migrationNotice}`)) return;
        setBusy(true);
        setStatus(plan.skipped.length ? `Applying the ready set; ${plan.skipped.length} unavailable choice(s) will be skipped…` : "Applying the ready set and verifying hashes…");
        try {
            const result = await SolcordRuntime.finishSetup(draft, providerMigrationPlan);
            setStatus(`Finished transaction ${result.transactionId}. ${result.enabled.length} enabled; ${plan.skipped.length} skipped; ${result.quarantined.length} quarantined; ${result.providerConflicts.length} provider conflict(s).`);
        }
        catch (error) {setStatus(setupFailureMessage(error));}
        finally {
            setBusy(false);
        }
    };
    const skip = () => {
        if (!window.confirm("Skip setup? No plugin file, theme file, enabled state, or Timeline policy will change. You can reopen this wizard later.")) return;
        SolcordSettings.skipOnboarding();
    };

    if (paused) return <section className="solcord-wizard solcord-wizard-paused" aria-label="Solcord setup paused"><div><strong>Setup paused</strong><p>Your draft is saved at step {step + 1}. No feature, addon, theme, or account state changed.</p></div><button type="button" className="solcord-action solcord-action-accent" onClick={() => setPaused(false)}>Resume setup</button></section>;

    return <section className="solcord-wizard" aria-labelledby="solcord-setup-title" aria-busy={busy}>
        <div className="solcord-wizard-title"><div><h2 id="solcord-setup-title">Set up Solcord</h2><p>Your draft saves as you go. Nothing changes before Apply and verify.</p></div><div className="solcord-wizard-title-actions"><span>Step {step + 1} of {WIZARD_STEPS.length}</span>{step < WIZARD_STEPS.length - 1 && <button type="button" className="solcord-text-button" disabled={busy} onClick={() => setStep(WIZARD_STEPS.length - 1)}>Review changes</button>}</div></div>
        <div className="solcord-wizard-progress" role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={WIZARD_STEPS.length} aria-valuenow={step + 1}><span style={{width: `${((step + 1) / WIZARD_STEPS.length) * 100}%`}} /></div>
        <StepNavigation step={step} setStep={setStep} disabled={busy} />
        {step === 0 && <WelcomeStep />}
        {step === 1 && <><SafetyStep value={draft.productPreferences.safety} onChange={safety => setDraft(current => ({...current, productPreferences: {...current.productPreferences, safety}}))} /><PrivateHistoryStep draft={draft} onChange={setDraft} /></>}
        {step === 2 && <PerformanceStep draft={draft} onChange={setDraft} />}
        {step === 3 && <ThemeStep value={draft.selectedTheme} appearance={draft.productPreferences.appearance} performanceProfile={draft.productPreferences.performanceProfile} onChange={selectedTheme => setDraft(current => ({...current, selectedTheme}))} onAppearance={appearance => setDraft(current => ({...current, productPreferences: {...current.productPreferences, appearance}}))} />}
        {step === 4 && <><PresetStep value={draft.preset} onChange={setPreset} /><AddonStep draft={draft} toggle={toggle} selectRecommended={selectRecommended} setProvider={setProvider} onReviewPending={onReviewPending} /></>}
        {step === 5 && <ActivitiesStep />}
        {step === 6 && <CurrentStateStep />}
        {step === 7 && <><ReviewStep draft={draft} providerMigrationPlan={providerMigrationPlan} /><ApplyStep draft={draft} /></>}
        <div className="solcord-wizard-footer">
            <div className="solcord-actions"><button type="button" className="solcord-action" onClick={() => setStep(step - 1)} disabled={step === 0 || busy}>Back</button>{step < WIZARD_STEPS.length - 1 ? <button type="button" className="solcord-action solcord-action-accent" disabled={busy} onClick={() => setStep(step + 1)}>Next</button> : <button type="button" className="solcord-action solcord-action-accent" disabled={busy} onClick={() => void finish()}>{busy ? "Verifying and applying…" : "Apply and verify"}</button>}<button type="button" className="solcord-action" disabled={busy} onClick={() => setPaused(true)}>Cancel for now</button><button type="button" className="solcord-action" disabled={busy} onClick={skip}>Skip setup</button></div>
            {status && <p role="status" aria-live="polite" className="solcord-setup-status">{status}</p>}
        </div>
    </section>;
}
