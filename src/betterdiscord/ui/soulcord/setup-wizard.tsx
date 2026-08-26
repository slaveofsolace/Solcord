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
import {SOULCORD_SETUP_STEPS, type SoulCordAppearancePreferences, type SoulCordSafetyPreferences, type SoulCordSetupPreset} from "@common/soulcord/product";

import {SOULCORD_ADDON_GROUPS} from "./catalog";

const {useEffect, useMemo, useState} = React;

const WIZARD_STEPS = SOULCORD_SETUP_STEPS;

const THEME_NOTES: Record<SoulCordThemeId, string> = {
    "soulcord-default": "Recommended · Graphite, warm text, oxidized teal, and ember reserved for warnings.",
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

function draftFrom(document: SoulCordSettingsDocument): SoulCordSetupDraft {
    if (document.onboarding.draft) return structuredClone(document.onboarding.draft);
    return {
        preset: "recommended",
        selectedTheme: document.selectedTheme,
        selectedAddons: SOULCORD_PRESET_ADDONS.filter(name => document.curatedAddons[name]?.selected),
        addonModes: Object.fromEntries(SOULCORD_PRESET_ADDONS.map(name => [name, document.curatedAddons[name]?.mode ?? (name === "SplitLargeMessages" ? "guarded" : "default")])),
        addonProviders: Object.fromEntries(SOULCORD_PRESET_ADDONS.map(name => {
            const mode = document.curatedAddons[name]?.mode ?? (name === "SplitLargeMessages" ? "guarded" : "default");
            const community = resolveCommunityAddon(PluginManager, name, SOULCORD_RUNTIME_ADDONS.find(addon => addon.name === name)?.fileName ?? "");
            const provider = isSoulCordBuiltInAddon(name, mode) && !community
                ? "prefer-soulcord"
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

function isReadyDecision(decision: SoulCordSetupCandidateDecision | undefined): boolean {
    return decision?.availability === "built-in" || decision?.availability === "accepted";
}

function StepNavigation({step, setStep, disabled}: {step: number; setStep(step: number): void; disabled: boolean;}) {
    return <ol className="soulcord-wizard-steps" aria-label="SoulCord setup steps">
        {WIZARD_STEPS.map((label, index) => <li key={label}>
            <button type="button" aria-current={index === step ? "step" : undefined} disabled={disabled} onClick={() => setStep(index)}>
                <span aria-hidden="true">{index + 1}</span><span>{label}</span>
            </button>
        </li>)}
    </ol>;
}

function WelcomeStep() {
    return <div className="soulcord-wizard-body soulcord-welcome-step">
        <p className="soulcord-eyebrow">Private desktop client mod</p>
        <h3>Make Discord yours without hiding the tradeoffs.</h3>
        <p>SoulCord is an independent BetterDiscord-based client modification. Discord does not officially support client mods, so updates can break adapters and optional capabilities may carry platform risk.</p>
        <p className="soulcord-callout"><strong>Your account stays yours.</strong> SoulCord does not extract tokens, automate your account, send messages, join calls, open Activities, or enable private history without a separate choice.</p>
    </div>;
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
        <p>Your complete draft is saved while you move through setup. Apply records a rollback transaction, validates ready adapters, and stops without overwriting a different local file.</p>
        <dl className="soulcord-facts">
            <div><dt>Catalog files already present</dt><dd>{state.installed}</dd></div>
            <div><dt>Catalog features currently enabled</dt><dd>{state.enabled}</dd></div>
            <div><dt>SoulCord themes present</dt><dd>{state.soulCordThemes} of {SOULCORD_THEMES.length}</dd></div>
            <div><dt>SoulCord themes active</dt><dd>{state.activeSoulCordThemes}</dd></div>
        </dl>
        <p className="soulcord-callout">Existing MessageLogger data, unrelated plugins, themes, custom CSS, settings, and the vanilla Activities launcher are outside this transaction and remain untouched.</p>
        <p className="soulcord-callout">On a new setup, Message Timeline starts off. You may opt in during the Private history step; skipping setup leaves its policy unchanged.</p>
    </div>;
}

function PresetStep({value, onChange}: {value: SoulCordSetupPreset; onChange(value: SoulCordSetupPreset): void;}) {
    const options: Array<{id: SoulCordSetupPreset; title: string; detail: string;}> = [
        {id: "recommended", title: "Recommended", detail: "Activity safety, recovery, and the three accepted local interaction tools."},
        {id: "minimal", title: "Minimal", detail: "Core compatibility and recovery only; no daily interaction tools."},
        {id: "power-user", title: "Power User", detail: "Requests the complete catalog set for review. Held tools stay uninstalled."}
    ];
    return <div className="soulcord-wizard-body">
        <h3>Choose a starting point</h3>
        <p>This changes only the draft. You will see every resulting change before Apply.</p>
        <div className="soulcord-choice-stack">{options.map(option => <label key={option.id} className="soulcord-choice-row"><input type="radio" name="soulcord-preset" checked={value === option.id} onChange={() => onChange(option.id)} /><span><strong>{option.title}</strong><small>{option.detail}</small></span></label>)}</div>
    </div>;
}

function ThemeStep({value, appearance, onChange, onAppearance}: {value: SoulCordThemeId; appearance: SoulCordAppearancePreferences; onChange(value: SoulCordThemeId): void; onAppearance(value: SoulCordAppearancePreferences): void;}) {
    return <div className="soulcord-wizard-body">
        <h3>Appearance</h3>
        <p>Choose the product mode first. The compatibility theme files remain available during migration, but one semantic token layer owns SoulCord controls.</p>
        <div className="soulcord-appearance-controls">
            <label>Mode<select value={appearance.mode} onChange={event => onAppearance({...appearance, mode: event.currentTarget.value as SoulCordAppearancePreferences["mode"]})}><option value="follow-discord">Follow Discord</option><option value="soul-dark">Soul Dark</option><option value="soul-light">Soul Light</option><option value="oled">OLED</option></select></label>
            <label>Accent<select value={appearance.accent} onChange={event => onAppearance({...appearance, accent: event.currentTarget.value as SoulCordAppearancePreferences["accent"]})}><option value="system">Discord / system</option><option value="glacier">Glacier cyan</option><option value="signal">Signal amber</option><option value="coral">Coral</option><option value="forest">Forest</option></select></label>
            <label>Density<select value={appearance.density} onChange={event => onAppearance({...appearance, density: event.currentTarget.value as SoulCordAppearancePreferences["density"]})}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
            <label>Motion<select value={appearance.motion} onChange={event => onAppearance({...appearance, motion: event.currentTarget.value as SoulCordAppearancePreferences["motion"]})}><option value="follow-system">Follow Discord / Windows</option><option value="full">Full</option><option value="reduced">Reduced</option></select></label>
            <label>Message shape<select value={appearance.messageShape} onChange={event => onAppearance({...appearance, messageShape: event.currentTarget.value as SoulCordAppearancePreferences["messageShape"]})}><option value="discord">Discord default</option><option value="seamed">Quiet 1px seams</option></select></label>
        </div>
        <div className={`soulcord-live-preview soulcord-mode-${appearance.mode} soulcord-accent-${appearance.accent} soulcord-preview-density-${appearance.density} soulcord-preview-shape-${appearance.messageShape}`} aria-label="SoulCord appearance preview"><span>Private thread</span><strong>Clear hierarchy, quiet seams, visible focus.</strong><small>This preview updates immediately. Apply saves the mode and installs the selected compatibility theme.</small></div>
        <details className="soulcord-legacy-themes"><summary>Compatibility theme package</summary>
        <div className="soulcord-theme-options">
            {SOULCORD_THEMES.map(theme => <label key={theme.id} className={`soulcord-theme-option soulcord-theme-${theme.id}`}>
                <input type="radio" name="soulcord-theme" value={theme.id} checked={value === theme.id} onChange={() => onChange(theme.id)} />
                <span className="soulcord-theme-swatch" aria-hidden="true"><i /><i /><i /><i /></span>
                <span><strong>{theme.name}</strong><small>{THEME_NOTES[theme.id]}</small></span>
            </label>)}
        </div>
        </details>
        <p className="soulcord-callout">Only the selected SoulCord package is enabled. Existing third-party themes are not modified; possible visual overlap is shown in the final review.</p>
    </div>;
}

function SafetyStep({value, onChange}: {value: SoulCordSafetyPreferences; onChange(value: SoulCordSafetyPreferences): void;}) {
    return <div className="soulcord-wizard-body">
        <h3>Safety defaults</h3>
        <p>These are local review tools. None silently opens, downloads, uploads, or navigates.</p>
        <div className="soulcord-choice-stack">
            <label className="soulcord-choice-row"><input type="checkbox" checked={value.linkLens} onChange={event => onChange({...value, linkLens: event.currentTarget.checked})} /><span><strong>Link Lens</strong><small>Review verified external-link activations in a native modal. Internal Discord routes remain untouched.</small></span></label>
            <label className="soulcord-choice-row"><input type="checkbox" checked={value.attachmentGuard} onChange={event => onChange({...value, attachmentGuard: event.currentTarget.checked})} /><span><strong>Show the manual Attachment Guard inspector</strong><small>Keep the local filename, MIME, and extension review tool in Safety. It does not intercept clicks, open files, or claim automatic protection.</small></span></label>
            <label className="soulcord-choice-row"><input type="checkbox" checked={value.privacyModeReady} onChange={event => onChange({...value, privacyModeReady: event.currentTarget.checked})} /><span><strong>Privacy Mode ready</strong><small>Keep the reversible redaction action available, but off.</small></span></label>
        </div>
    </div>;
}

function PrivateHistoryStep({draft, onChange}: {draft: SoulCordSetupDraft; onChange(value: SoulCordSetupDraft): void;}) {
    const friendWatch = draft.productPreferences.friendWatch;
    return <div className="soulcord-wizard-body">
        <h3>Private local history</h3>
        <p>Both capabilities are off until you choose them. They observe only data already loaded by this running client and never make extra Discord requests.</p>
        <div className="soulcord-choice-stack">
            <label className="soulcord-choice-row"><input type="checkbox" checked={friendWatch.enabled} onChange={event => onChange({...draft, productPreferences: {...draft.productPreferences, friendWatch: {...friendWatch, enabled: event.currentTarget.checked}}})} /><span><strong>Friend Watch</strong><small>Relationship transitions only; 30-day encrypted local retention by default. It never guesses who blocked you.</small></span></label>
            <label className="soulcord-choice-row"><input type="checkbox" disabled={!friendWatch.enabled} checked={friendWatch.includeDisplaySnapshot} onChange={event => onChange({...draft, productPreferences: {...draft.productPreferences, friendWatch: {...friendWatch, includeDisplaySnapshot: event.currentTarget.checked}}})} /><span><strong>Keep display snapshots</strong><small>Store the already-loaded display name inside the encrypted account history. Turn this off to keep only an account-scoped subject key.</small></span></label>
            <label className="soulcord-choice-row"><span><strong>Local notifications</strong><small>Daily shows one bounded in-app summary after a new transition; per-event is capped to prevent notification storms.</small></span><select aria-label="Friend Watch notification mode" disabled={!friendWatch.enabled} value={friendWatch.digest} onChange={event => onChange({...draft, productPreferences: {...draft.productPreferences, friendWatch: {...friendWatch, digest: event.currentTarget.value as typeof friendWatch.digest}}})}><option value="off">Off</option><option value="daily">Daily in-app</option><option value="per-event">Per event, local</option></select></label>
            <label className="soulcord-choice-row"><input type="checkbox" checked={draft.timelinePolicy.enabled} onChange={event => onChange({...draft, timelinePolicy: {...draft.timelinePolicy, enabled: event.currentTarget.checked}})} /><span><strong>Message Timeline</strong><small>DM-only, text-only, seven days by default. This stores observed message edits/deletes locally.</small></span></label>
        </div>
        <p className="soulcord-callout">On Windows, safeStorage uses the signed-in Windows account boundary. It does not promise protection from every process already running as you. Without secure storage, persistence falls back to session-only.</p>
    </div>;
}

function ApplyStep({draft}: {draft: SoulCordSetupDraft;}) {
    return <div className="soulcord-wizard-body">
        <h3>Ready to apply</h3>
        <p>Apply revalidates the reviewed bytes and provider identities, captures a rollback point, performs the transaction, and verifies the result. A failure aborts or rolls back without overwriting a different local file.</p>
        <dl className="soulcord-facts"><div><dt>Preset</dt><dd>{draft.preset}</dd></div><div><dt>Friend Watch</dt><dd>{draft.productPreferences.friendWatch.enabled ? "consented" : "off"}</dd></div><div><dt>Message Timeline</dt><dd>{draft.timelinePolicy.enabled ? "consented" : "off"}</dd></div><div><dt>Power Lab</dt><dd>off</dd></div></dl>
    </div>;
}

function AddonStep({draft, toggle, selectRecommended, setProvider, onReviewPending}: {draft: SoulCordSetupDraft; toggle(name: string, enabled: boolean): void; selectRecommended(): void; setProvider(name: string, provider: SoulCordAddonProvider): void; onReviewPending(): void;}) {
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
                        <legend>Provider for <code>{communityFile}</code></legend>
                            <label><input type="radio" name={`provider-${addon.name}`} checked={draft.addonProviders[addon.name] === "prefer-community"} onChange={() => setProvider(addon.name, "prefer-community")} /><span><strong>Keep community addon (recommended)</strong><small>The owner file stays enabled and SoulCord’s matching built-in stands down.</small></span></label>
                            <label><input type="radio" name={`provider-${addon.name}`} checked={draft.addonProviders[addon.name] === "prefer-soulcord"} onChange={() => setProvider(addon.name, "prefer-soulcord")} /><span><strong>Use SoulCord built-in</strong><small>Apply and verify disables this exact community file. Rollback restores its exact prior state.</small></span></label>
                        </fieldset>}
                    </React.Fragment>;
                })}
            </fieldset>)}
        </div>
        <div className="soulcord-catalog-handoff">
            <div><strong>Review pending tools separately</strong><p>{pendingDecisions.length} setup candidates still need a runtime, dependency, action, or security gate. {selectedPendingCount > 0 ? `${selectedPendingCount} previously saved request(s) remain pending and are not downloaded here. ` : ""}The complete {SOULCORD_CATALOG_SNAPSHOT.pluginCount}-plugin snapshot is available in the catalog after setup.</p><p><strong>Guarded Split Large Messages is built in.</strong> Apply and verify can enable its review-and-manual-copy flow; the community plugin&apos;s native multi-send mode remains held.</p></div>
            <button type="button" className="soulcord-action" onClick={onReviewPending}>Review pending</button>
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
            <div><dt>Theme enabled after Apply and verify</dt><dd>{selectedTheme.name}</dd></div>
            <div><dt>Bundled theme files in transaction</dt><dd>{SOULCORD_RUNTIME_THEMES.length}</dd></div>
            <div><dt>Maximum staged disk use</dt><dd>{bytesLabel(diskBytes)}</dd></div>
        </dl>
        <div className="soulcord-review-columns">
            <div><strong>Settings diff</strong>{changes.length ? <ul>{changes.map(change => <li key={change}>{change}</li>)}</ul> : <p>No stored-selection difference; Apply and verify still checks selected files.</p>}</div>
            <div><strong>Known conflict checks</strong>{conflicts.length ? <ul>{conflicts.map(conflict => <li key={conflict}>{conflict}</li>)}</ul> : <p>No catalog-declared conflicts in this selection.</p>}</div>
        </div>
        {plan.skipped.length > 0 && <p className="soulcord-callout"><strong>Pending stays pending:</strong> {plan.skipped.length} saved catalog request(s) remain uninstalled. Review their individual evidence and status in the catalog after setup.</p>}
        {activeSkipped.length > 0 && <p className="soulcord-callout"><strong>Selected community files already active:</strong> {activeSkipped.map((decision: SoulCordSetupCandidateDecision) => decision.name).join(", ")} remain enabled and owner-managed. SoulCord skips their unaccepted catalog candidates without replacing, stopping, or certifying the existing files.</p>}
        {activeUnrequested.length > 0 && <p className="soulcord-callout"><strong>Preserved owner addons:</strong> {activeUnrequested.join(", ")} are active but were not requested here. Apply and verify leaves them unchanged and outside this transaction.</p>}
        {communityKeeps.length > 0 && <p className="soulcord-callout"><strong>Keep community provider:</strong> {communityKeeps.map(counterpart => `${counterpart.name} (${counterpart.fileName})`).join(", ")} remain enabled and owner-managed. Matching SoulCord built-ins stand down.</p>}
        {communitySwitches.length > 0 && <p className="soulcord-callout soulcord-callout-danger"><strong>Explicit provider migration:</strong> Apply and verify disables only {communitySwitches.map(counterpart => counterpart.fileName).join(", ")}, starts the matching SoulCord built-in(s), then moves exact unchanged provider source files into a timestamped rollback archive outside the scanned Plugins folder. Configuration and private databases stay untouched.</p>}
        {liveThemeState.activeThirdPartyNames.length > 0 && <p className="soulcord-callout"><strong>Possible theme overlap:</strong> {liveThemeState.activeThirdPartyNames.join(", ")} remain enabled and owner-managed. Apply and verify does not modify third-party themes.</p>}
        <div className="soulcord-callout"><strong>Exact theme transaction</strong><p>All {SOULCORD_RUNTIME_THEMES.length} bundled files are included and hash-verified; missing files are staged: {SOULCORD_RUNTIME_THEMES.map(theme => theme.fileName).join(", ")}. Apply and verify {liveThemeState.selectedEnabled ? "keeps" : "enables"} {selectedTheme.name}{liveThemeState.activeOtherNames.length ? ` and disables ${liveThemeState.activeOtherNames.join(", ")}` : ""}; rollback restores the prior enabled states and removes only unchanged files added by this transaction.</p></div>
        <p className="soulcord-callout">Apply and verify changes only the accepted ready set, leaves pending catalog choices uninstalled, verifies accepted hashes and dependencies, activates one SoulCord theme, and keeps a one-click rollback record.</p>
    </div>;
}

export default function SetupWizard({onReviewPending}: {onReviewPending(): void;}) {
    const document = useStateFromStores(SoulCordSettings, () => SoulCordSettings.snapshot());
    const [step, setStepState] = useState(document.onboarding.lastStep);
    const [draft, setDraftState] = useState<SoulCordSetupDraft>(() => draftFrom(document));
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");
    const plan = useMemo(() => resolveSoulCordSetupPlan(draft.selectedAddons, draft.addonModes), [draft.addonModes, draft.selectedAddons]);
    const providerMigrationPlan = useStateFromStores([PluginManager], () => SoulCordRuntime.prepareProviderMigrationPlan(draft), [draft]);
    useEffect(() => {
        try {SoulCordSettings.setSetupDraft(draft);}
        catch {setStatus("Your setup choices could not be saved. The durable draft was left unchanged; check disk access and retry before applying.");}
    }, [draft]);
    const setDraft = (update: SoulCordSetupDraft | ((current: SoulCordSetupDraft) => SoulCordSetupDraft)) => setDraftState(current => typeof update === "function" ? update(current) : update);
    const toggle = (name: string, enabled: boolean) => setDraft(current => ({...current, selectedAddons: enabled ? [...new Set([...current.selectedAddons, name])] : current.selectedAddons.filter(item => item !== name)}));
    const setProvider = (name: string, provider: SoulCordAddonProvider) => setDraft(current => ({...current, addonProviders: {...current.addonProviders, [name]: provider}}));
    const setStep = (next: number) => {
        const bounded = Math.min(WIZARD_STEPS.length - 1, Math.max(0, next));
        try {
            SoulCordSettings.setOnboardingStep(bounded);
            setStepState(bounded);
        }
        catch {setStatus("SoulCord could not save this setup step. Your durable setup state was left unchanged; check disk access and retry.");}
    };
    const setPreset = (preset: SoulCordSetupPreset) => setDraft(current => ({
        ...current,
        preset,
        selectedAddons: preset === "minimal" ? [] : preset === "power-user" ? [...SOULCORD_PRESET_ADDONS] : recommendedSoulCordSetupAddons()
    }));
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
        const migrationNotice = providerMigrations.length ? ` This explicitly disables ${providerMigrations.join(", ")} in favor of the selected SoulCord built-in and archives only exact unchanged source files outside the scanned Plugins folder; rollback restores them.` : "";
        if (!window.confirm(`Apply ${plan.executableAddons.length} ready feature(s), verify or provision the ${SOULCORD_RUNTIME_THEMES.length} bundled theme files, and activate ${SOULCORD_THEMES.find(theme => theme.id === draft.selectedTheme)?.name}? ${plan.skipped.length} selected optional choice(s) will be skipped without download. Existing differing files will abort without being overwritten.${migrationNotice}`)) return;
        setBusy(true);
        setStatus(plan.skipped.length ? `Applying the ready set; ${plan.skipped.length} unavailable choice(s) will be skipped…` : "Applying the ready set and verifying hashes…");
        try {
            const result = await SoulCordRuntime.finishSetup(draft, providerMigrationPlan);
            setStatus(`Finished transaction ${result.transactionId}. ${result.enabled.length} enabled; ${plan.skipped.length} skipped; ${result.quarantined.length} quarantined; ${result.providerConflicts.length} provider conflict(s).`);
        }
        catch (error) {setStatus(setupFailureMessage(error));}
        finally {
            setBusy(false);
        }
    };
    const skip = () => {
        if (!window.confirm("Skip setup? No plugin file, theme file, enabled state, or Timeline policy will change. You can reopen this wizard later.")) return;
        SoulCordSettings.skipOnboarding();
    };

    return <section className="soulcord-wizard" aria-labelledby="soulcord-setup-title" aria-busy={busy}>
        <div className="soulcord-wizard-title"><div><h2 id="soulcord-setup-title">Set up SoulCord</h2><p>Your choices save as you go. Files and active features change only after the final review.</p></div><span>Step {step + 1} of {WIZARD_STEPS.length}</span></div>
        <div className="soulcord-wizard-progress" role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={WIZARD_STEPS.length} aria-valuenow={step + 1}><span style={{width: `${((step + 1) / WIZARD_STEPS.length) * 100}%`}} /></div>
        <StepNavigation step={step} setStep={setStep} disabled={busy} />
        {step === 0 && <WelcomeStep />}
        {step === 1 && <CurrentStateStep />}
        {step === 2 && <PresetStep value={draft.preset} onChange={setPreset} />}
        {step === 3 && <ThemeStep value={draft.selectedTheme} appearance={draft.productPreferences.appearance} onChange={selectedTheme => setDraft(current => ({...current, selectedTheme}))} onAppearance={appearance => setDraft(current => ({...current, productPreferences: {...current.productPreferences, appearance}}))} />}
        {step === 4 && <SafetyStep value={draft.productPreferences.safety} onChange={safety => setDraft(current => ({...current, productPreferences: {...current.productPreferences, safety}}))} />}
        {step === 5 && <PrivateHistoryStep draft={draft} onChange={setDraft} />}
        {step === 6 && <><AddonStep draft={draft} toggle={toggle} selectRecommended={selectRecommended} setProvider={setProvider} onReviewPending={onReviewPending} /><ReviewStep draft={draft} providerMigrationPlan={providerMigrationPlan} /></>}
        {step === 7 && <ApplyStep draft={draft} />}
        <div className="soulcord-wizard-footer">
            <div className="soulcord-actions"><button type="button" className="soulcord-action" onClick={() => setStep(step - 1)} disabled={step === 0 || busy}>Back</button>{step < WIZARD_STEPS.length - 1 ? <button type="button" className="soulcord-action soulcord-action-accent" disabled={busy} onClick={() => setStep(step + 1)}>Next</button> : <button type="button" className="soulcord-action soulcord-action-accent" disabled={busy} onClick={() => void finish()}>{busy ? "Verifying and applying…" : "Apply and verify"}</button>}<button type="button" className="soulcord-action" disabled={busy} onClick={skip}>Skip without changes</button></div>
            {status && <p role="status" aria-live="polite" className="soulcord-setup-status">{status}</p>}
        </div>
    </section>;
}
