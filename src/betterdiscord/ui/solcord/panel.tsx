import React from "react";
import solcordMark from "@assets/branding/solcord-mark.svg";

import {useStateFromStores} from "@ui/hooks";
import PluginManager from "@modules/pluginmanager";
import SolcordRuntime from "@modules/solcord/runtime";
import SolcordSettings, {SOLCORD_PRESET_ADDONS} from "@modules/solcord/store";
import PluginDoctor from "@modules/solcord/doctor";
import {CoreUpdater, PluginUpdater, ThemeUpdater} from "@modules/updater";
import type {SolcordModuleId, SolcordSetupDraft} from "@modules/solcord/contracts";
import type {LinkInspection} from "@modules/solcord/link-lens";

import SetupWizard from "./setup-wizard";
import MessageTimelinePanel from "./timeline";
import {CatalogBrowser, CuratedAddonSet} from "./addon-catalog";
import {SOLCORD_POWER_LAB} from "./catalog";
import {normalizeSolcordMediaShelfUrl, prioritizeSolcordPulse, resolveSolcordPerformancePolicy, SOLCORD_PERFORMANCE_POLICIES, SOLCORD_WORKSPACES, type SolcordAppearancePreferences, type SolcordMediaKind, type SolcordPerformanceProfile, type SolcordProductPreferences, type SolcordWorkspaceId} from "@common/solcord/product";
import {isSolcordBuiltInAddon, type SolcordProviderMigrationPlan} from "@common/solcord/builtin-addons";
import {SOLCORD_V2_REPLACEMENT_MANIFEST} from "@common/solcord/v2-replacement-manifest";

const {useEffect, useRef, useState} = React;

const WORKSPACE_GROUPS: ReadonlyArray<{label: string; ids: SolcordWorkspaceId[];}> = [
    {label: "Start", ids: ["overview"]},
    {label: "Personalize", ids: ["appearance", "performance"]},
    {label: "Features", ids: ["privacy", "chat", "voice", "friends"]},
    {label: "System", ids: ["extensions", "recovery"]}
];

function timestamp(value?: number | string): string {
    if (!value) return "never";
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? "unknown" : date.toLocaleString();
}

function Section({title, summary, children}: {title: string; summary?: string; children: React.ReactNode;}) {
    return <section className="solcord-section">
        <div className="solcord-section-heading">
            <h2>{title}</h2>
            {summary && <p>{summary}</p>}
        </div>
        {children}
    </section>;
}

function ActionButton({children, onClick, tone = "neutral", disabled = false}: {children: React.ReactNode; onClick(): void; tone?: "neutral" | "accent" | "danger"; disabled?: boolean;}) {
    return <button type="button" className={`solcord-action solcord-action-${tone}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

function ModuleTable() {
    const state = useStateFromStores([SolcordSettings, SolcordRuntime], () => ({settings: SolcordSettings.snapshot(), health: SolcordRuntime.health()}));
    return <div className="solcord-module-table" role="table" aria-label="Solcord module status">
        {state.health.length ? state.health.map(health => {
            const module = state.settings.modules[health.id];
            return <div className="solcord-module-row" role="row" key={health.id}>
                <div className="solcord-module-primary" role="cell">
                    <div className="solcord-module-name">
                        <strong>{health.name}</strong>
                        <span className={`solcord-status solcord-status-${health.status}`}>{health.status}</span>
                        <span className="solcord-maturity">{health.maturity}</span>
                    </div>
                    <p>{health.detail}</p>
                    <small>{health.startupDurationMs === undefined ? "Not timed" : `${health.startupDurationMs} ms startup`} · {Object.values(health.resources).reduce((sum, value) => sum + value, 0)} owned resources</small>
                </div>
                <label className="solcord-toggle" role="cell">
                    <input
                        type="checkbox"
                        aria-label={`Enable ${health.name}`}
                        checked={module.enabled}
                        disabled={health.id === "plugin-doctor"}
                        onChange={event => void SolcordRuntime.setEnabled(health.id, event.currentTarget.checked)}
                    />
                    <span>{module.enabled ? "On" : "Off"}</span>
                </label>
            </div>;
        }) : <p className="solcord-empty" role="status">Module health will appear after Solcord finishes starting.</p>}
    </div>;
}

function ActivityBridge() {
    const activity = useStateFromStores(SolcordRuntime, () => SolcordRuntime.activityHealth());
    const events = activity?.events.slice(-8).reverse() ?? [];
    const ready = (activity?.status === "healthy" || activity?.status === "idle") && !activity.unrestrictedOverride;
    const readinessCopy = activity?.status === "idle"
        ? "Same-package preload protection is active; no Activity window has opened in this session."
        : "Same-package preload protection is active; the unrestricted override is off.";
    return <Section title="Activities" summary="A bounded compatibility fix for Discord's embedded games.">
        <div className={ready ? "solcord-all-clear" : "solcord-callout solcord-callout-danger"} role="status"><strong>{ready ? "Ready" : "Needs review"}</strong>{" "}<span>{ready ? readinessCopy : "The compatibility policy is not fully healthy on this Discord build."}</span></div>
        <details className="solcord-secondary-tools"><summary>Technical details</summary>
            <dl className="solcord-facts"><div><dt>Policy</dt><dd>{activity?.status ?? "waiting"}</dd></div><div><dt>Accepted assignments</dt><dd>{activity?.counters?.discordPreloadsAccepted ?? 0}</dd></div><div><dt>Rejected assignments</dt><dd>{activity?.counters?.assignmentsRejected ?? 0}</dd></div><div><dt>Unrestricted override</dt><dd>{activity?.unrestrictedOverride ? "On" : "Off"}</dd></div></dl>
            <div className="solcord-ledger" aria-label="Recent Activity compatibility events">
                {events.length ? events.map(event => <div key={event.sequence} className="solcord-ledger-row">
                    <time>{timestamp(event.timestamp)}</time>
                    <strong>{event.action}</strong>
                    <span>{event.context}{event.reason ? ` · ${event.reason}` : ""}</span>
                </div>) : <p className="solcord-empty">No Activity window decision has been observed in this session.</p>}
            </div>
            <div className="solcord-actions"><ActionButton onClick={() => SolcordRuntime.exportDiagnostics()}>Export sanitized diagnostics</ActionButton></div>
        </details>
    </Section>;
}

function PluginRecovery() {
    const state = useStateFromStores([PluginDoctor, SolcordRuntime, SolcordSettings], () => ({records: PluginDoctor.snapshot(), integrity: SolcordRuntime.integrityStatus(), curated: SolcordSettings.snapshot().curatedAddons}));
    const [retrying, setRetrying] = useState<string>();
    const [retryStatus, setRetryStatus] = useState("");
    const quarantined = state.records.filter(record => record.quarantinedAt);
    const visibleIntegrity = state.integrity.records.filter(record => record.status !== "match" && record.status !== "missing").slice(0, 12);
    const requestedUnavailable = state.integrity.records.filter(record => record.kind === "addon" && record.status === "missing" && state.curated[record.name]?.selected && !isSolcordBuiltInAddon(record.name, state.curated[record.name]?.mode));
    const retry = async (id: string) => {
        setRetrying(id);
        const succeeded = await SolcordRuntime.retryQuarantinedAddon(id);
        setRetryStatus(succeeded ? `${id} passed a fresh integrity audit and started.` : `${id} stayed quarantined because integrity or startup validation did not pass.`);
        setRetrying(undefined);
    };
    const needsReview = state.integrity.summary.attention + state.integrity.summary.unavailable;
    if (!needsReview && !quarantined.length && !requestedUnavailable.length) {
        return <Section title="Plugin Doctor">
            <div className="solcord-all-clear" role="status"><strong>All clear</strong><span>Reviewed files match and no addon is quarantined.</span></div>
            <details className="solcord-secondary-tools"><summary>Technical details</summary><dl className="solcord-facts"><div><dt>Verified files</dt><dd>{state.integrity.summary.match}</dd></div><div><dt>Optional files absent</dt><dd>{state.integrity.summary.missing}</dd></div></dl></details>
        </Section>;
    }
    return <Section title="Plugin Doctor" summary="Installed files, failures, and recovery.">
        <div className="solcord-health-strip" aria-label="Plugin Doctor summary"><span><strong>{state.integrity.summary.match}</strong> verified</span><span><strong>{needsReview}</strong> need review</span><span><strong>{quarantined.length}</strong> quarantined</span></div>
        {requestedUnavailable.length > 0 && <p className="solcord-callout"><strong>{requestedUnavailable.length} saved catalog request(s) are not installed.</strong> They remain optional and off because their review or dependency gate is incomplete. Solcord built-ins do not require community plugin files.</p>}
        {quarantined.length ? <div className="solcord-recovery-list">
            {quarantined.map(record => <div className="solcord-recovery-row" key={record.addonId}>
                <div><strong>{record.addonId}</strong><p>{record.quarantineReason}</p><small>Quarantined {timestamp(record.quarantinedAt)}</small></div>
                <ActionButton tone="danger" disabled={retrying === record.addonId} onClick={() => void retry(record.addonId)}>{retrying === record.addonId ? "Checking…" : "Retry once"}</ActionButton>
            </div>)}
        </div> : <p className="solcord-empty">No addon is quarantined.</p>}
        {retryStatus && <p role="status" className="solcord-import-status">{retryStatus}</p>}
        {visibleIntegrity.length ? <div className="solcord-ledger" aria-label="Add-on integrity requiring review">
            {visibleIntegrity.map(record => <div className="solcord-ledger-row" key={`${record.kind}-${record.name}`}><strong>{record.name}</strong><span>{record.kind} · {record.status}</span><code>{record.reviewedSha256.slice(0, 12)}…{record.installedSha256 ? ` / ${record.installedSha256.slice(0, 12)}…` : ""}</code></div>)}
            {state.integrity.records.filter(record => record.status !== "match" && record.status !== "missing").length > visibleIntegrity.length && <p className="solcord-empty">Showing the first {visibleIntegrity.length} path-free attention records. Sanitized diagnostics contain the complete bounded status list.</p>}
        </div> : <p className="solcord-empty">Every installed reviewed file matches.</p>}
        <details className="solcord-secondary-tools"><summary>Integrity details</summary><dl className="solcord-facts"><div><dt>Optional files not installed</dt><dd>{state.integrity.summary.missing}</dd></div><div><dt>Audit unavailable</dt><dd>{state.integrity.summary.unavailable}</dd></div></dl></details>
    </Section>;
}

function ProfilesAndHistory() {
    const document = useStateFromStores(SolcordSettings, () => SolcordSettings.snapshot());
    const [profileId, setProfileId] = useState(document.profiles[0]?.id ?? "");
    const [newName, setNewName] = useState("");
    const [includeThirdParty, setIncludeThirdParty] = useState(false);
    const [importStatus, setImportStatus] = useState("");
    const diff = profileId ? SolcordRuntime.previewProfile(profileId) : [];
    const selected = document.profiles.find(profile => profile.id === profileId);
    const apply = async () => {
        if (!selected) return;
        if (!window.confirm(`Apply ${selected.name}? Solcord will snapshot the current state first and then apply the complete preview shown here.`)) return;
        const executionPlan = SolcordRuntime.profileAddonExecutionPlan(selected.id);
        if (selected.includesThirdPartyAddons) {
            if (!executionPlan) {
                setImportStatus("The third-party addon plan changed before confirmation; nothing was applied.");
                return;
            }
            const starts = [...executionPlan.enablePlugins, ...executionPlan.enableThemes];
            const stops = [...executionPlan.disablePlugins, ...executionPlan.disableThemes];
            const startList = starts.length ? starts.map(fileName => `• ${fileName}`).join("\n") : "• none";
            const stopList = stops.length ? stops.map(fileName => `• ${fileName}`).join("\n") : "• none";
            if (!window.confirm(`Third-party execution confirmation\n\nApplying this profile will start ${executionPlan.enablePlugins.length} plugin file(s) now. Enabled plugins execute third-party code in Discord. It will also enable ${executionPlan.enableThemes.length} theme file(s) and stop or disable ${stops.length} file(s).\n\nFiles to start or enable (${starts.length}):\n${startList}\n\nFiles to stop or disable (${stops.length}):\n${stopList}\n\nContinue with these exact files?`)) return;
        }
        const applied = await SolcordRuntime.applyProfile(selected.id, executionPlan);
        setImportStatus(applied ? `${selected.name} applied with a rollback snapshot.` : `${selected.name} was not fully applied. Solcord attempted recovery; review the current addon and module states before retrying.`);
    };
    const save = () => {
        try {
            if (includeThirdParty && !window.confirm("Save the complete currently enabled BetterDiscord plugin and theme set in this profile? Applying it later can execute or stop third-party code. The file names will appear in settings exports.")) return;
            const profile = SolcordRuntime.saveProfile(newName, includeThirdParty);
            setNewName("");
            setIncludeThirdParty(false);
            setProfileId(profile.id);
            setImportStatus(`Saved ${profile.name}.`);
        }
        catch (error) {
            setImportStatus(error instanceof Error ? error.message : "The profile could not be saved.");
        }
    };
    const importFile = async (file?: File) => {
        setImportStatus("");
        if (!file) return;
        if (file.size > 1024 * 1024) {
            setImportStatus("The settings file exceeds the 1 MB safety limit.");
            return;
        }
        try {
            const text = await file.text();
            const importPreview = SolcordRuntime.previewSettingsImport(text);
            if (!importPreview) {
                setImportStatus("Choose an unmodified Solcord settings export.");
                return;
            }
            const {changes, fingerprint} = importPreview;
            const preview = changes.length ? changes.map(change => `• ${change}`).join("\n") : "No settings differences.";
            if (!window.confirm(`Import this validated Solcord settings file? The current state will be snapshotted first.\n\nComplete preview:\n${preview}`)) {
                setImportStatus("Import cancelled; no settings changed.");
                return;
            }
            const imported = await SolcordRuntime.importSettings(text, fingerprint);
            setImportStatus(imported ? "Settings imported. A rollback snapshot was kept." : "Import changed after preview or failed validation; no settings changed.");
        }
        catch {
            setImportStatus("The settings file could not be read locally.");
        }
    };
    return <Section title="Profiles and snapshots" summary="Preview a profile, apply it safely, or return to an earlier state.">
        <div className="solcord-split">
            <div>
                <label className="solcord-field">Profile
                    <select value={profileId} onChange={event => setProfileId(event.currentTarget.value)}>
                        {document.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                    </select>
                </label>
                <div className="solcord-diff" aria-label="Profile change preview">
                    <strong>Complete preview</strong>
                    {diff.length ? <ul>{diff.map(item => <li key={item}>{item}</li>)}</ul> : <p>No module-setting differences.</p>}
                </div>
                <div className="solcord-actions">
                    <ActionButton tone="accent" onClick={() => void apply()} disabled={!selected}>Apply with snapshot</ActionButton>
                    <ActionButton onClick={() => SolcordRuntime.exportSettings()}>Export settings</ActionButton>
                </div>
                <details className="solcord-secondary-tools">
                    <summary>Import, export, or create a profile</summary>
                    <p>Profiles save Solcord module settings only. They do not capture Timeline policy or curated-addon choices.</p>
                    <label className="solcord-file-import">Import settings JSON
                        <input type="file" accept="application/json,.json" onChange={event => {
                            const file = event.currentTarget.files?.[0];
                            event.currentTarget.value = "";
                            void importFile(file);
                        }} />
                    </label>
                    <div className="solcord-inline-field">
                        <input value={newName} maxLength={80} placeholder="Profile name" aria-label="Custom profile name" onChange={event => setNewName(event.currentTarget.value)} />
                        <ActionButton onClick={save} disabled={!newName.trim()}>Save module state</ActionButton>
                    </div>
                    <label className="solcord-profile-addon-optin"><input type="checkbox" checked={includeThirdParty} onChange={event => setIncludeThirdParty(event.currentTarget.checked)} /> Include enabled third-party plugins and themes</label>
                    <p className="solcord-key-hint">Applying a profile that includes plugins can execute third-party code. Solcord always shows the exact files before it starts them.</p>
                </details>
                {importStatus && <p className="solcord-import-status" role="status">{importStatus}</p>}
            </div>
            <div>
                <strong>Recent snapshots</strong>
                <div className="solcord-snapshot-list">
                    {document.snapshots.slice(-6).reverse().map(snapshot => <div key={snapshot.id} className="solcord-snapshot-row">
                        <div><span>{snapshot.reason}</span><small>{timestamp(snapshot.createdAt)}</small></div>
                        <ActionButton onClick={() => {
                            if (!window.confirm(`Roll back to “${snapshot.reason}”? A snapshot of the current state will be kept.`)) return;
                            void SolcordRuntime.rollback(snapshot.id).then(restored => setImportStatus(restored
                                ? `Rolled back to “${snapshot.reason}”.`
                                : "The settings snapshot was restored, but one or more addon states remained held or failed to change. Review Plugin Doctor before retrying."));
                        }}>Roll back</ActionButton>
                    </div>)}
                    {!document.snapshots.length && <p className="solcord-empty">No snapshot has been captured yet.</p>}
                </div>
            </div>
        </div>
    </Section>;
}

function PrivacyProtectionPanel() {
    const state = useStateFromStores([SolcordSettings, SolcordRuntime], () => ({
        preferences: SolcordSettings.snapshot().productPreferences.privacy,
        capabilities: SolcordRuntime.privacyCapabilities(),
        receipts: SolcordRuntime.privacyDecisionReceipts()
    }));
    const [status, setStatus] = useState("");
    const applyProfile = async (profile: "strict" | "standard") => {
        if (profile === "strict" && !window.confirm("Apply Strict Privacy? Solcord will capture a rollback snapshot, block verified optional reporting and activity discovery, make update checks manual, and disable enabled community addons whose exact reviewed bytes do not declare local-only behavior. Core chat, calls, media, moderation, safety, sign-in, and Discord security updates remain available.")) return;
        try {
            await SolcordRuntime.setPrivacyProfile(profile);
            setStatus(profile === "strict" ? "Strict Privacy applied with a rollback snapshot." : "Standard privacy applied with a rollback snapshot.");
        }
        catch (error) {setStatus(error instanceof Error ? error.message : "The privacy change failed closed. Open Recovery to verify the rollback snapshot.");}
    };
    const checkUpdates = async () => {
        setStatus("Checking reviewed addon and theme sources…");
        try {
            await Promise.all([CoreUpdater.checkForUpdate(false), PluginUpdater.checkAll(false), ThemeUpdater.checkAll(false)]);
            setStatus("Manual update check finished. Solcord core remains pinned until an owner-controlled integrity feed is available.");
        }
        catch {setStatus("The manual update check did not complete. Existing files were not changed.");}
    };
    return <Section title="Privacy protection" summary="Optional data collection is controlled without intercepting Discord's essential traffic.">
        <div className="solcord-privacy-command">
            <div><p className="solcord-eyebrow">Current profile</p><strong>{state.preferences.profile === "strict" ? "Strict Privacy" : state.preferences.profile === "standard" ? "Standard" : "Custom"}</strong><p>{state.preferences.profile === "strict" ? "Verified optional reporting is blocked; unsupported categories stay visible; updates are manual." : "Some optional Discord reporting may remain available."}</p></div>
            <span className={`solcord-status ${state.preferences.migrationPending ? "solcord-status-starting" : "solcord-status-active"}`}>{state.preferences.migrationPending ? "Needs review" : state.preferences.profile}</span>
        </div>
        <div className="solcord-actions"><ActionButton tone="accent" onClick={() => void applyProfile("strict")}>Use Strict Privacy</ActionButton><ActionButton onClick={() => void applyProfile("standard")}>Use Standard</ActionButton><ActionButton onClick={() => void checkUpdates()}>Check for updates</ActionButton></div>
        <div className="solcord-privacy-capabilities" role="list" aria-label="Privacy capability status">{state.capabilities.map(capability => <div key={capability.dataClass} role="listitem"><span><strong>{capability.dataClass.replaceAll("-", " ")}</strong><small>{capability.summary}</small></span><span className={`solcord-privacy-state solcord-privacy-state-${capability.state.toLowerCase()}`}>{capability.state}</span></div>)}</div>
        <p className="solcord-key-hint">Discord account privacy settings are separate. Solcord reports unsupported or drifting protection honestly and never claims zero tracking without an exact-build network audit.</p>
        {status && <p role="status" className="solcord-import-status">{status}</p>}
        <details className="solcord-secondary-tools"><summary>Technical details</summary><p>{state.receipts.length} content-free local decision receipt(s). Receipts contain only category, decision, coarse time, and result—never URLs, payloads, account IDs, messages, attachments, or file paths.</p></details>
    </Section>;
}

function StreamShieldControls() {
    const document = useStateFromStores(SolcordSettings, () => SolcordSettings.snapshot());
    const shield = document.modules["stream-shield"].values;
    const setting = (id: SolcordModuleId, key: string, value: unknown) => void SolcordRuntime.setValue(id, key, value);
    return <Section title="Privacy Mode" summary="Preview local redaction before sharing your screen.">
        <div className="solcord-control-grid">
            <label><input type="checkbox" checked={shield.previewActive === true} onChange={event => setting("stream-shield", "previewActive", event.currentTarget.checked)} /> Stream Shield preview</label>
            <label><input type="checkbox" checked={shield.manualActive === true} onChange={event => setting("stream-shield", "manualActive", event.currentTarget.checked)} /> Stream Shield manual state</label>
            <label><input type="checkbox" checked={shield.redactGuilds === true} onChange={event => setting("stream-shield", "redactGuilds", event.currentTarget.checked)} /> Redact guild identity</label>
            <label><input type="checkbox" checked={shield.redactChannels === true} onChange={event => setting("stream-shield", "redactChannels", event.currentTarget.checked)} /> Redact channel names</label>
            <label><input type="checkbox" checked={shield.redactDMs === true} onChange={event => setting("stream-shield", "redactDMs", event.currentTarget.checked)} /> Redact DM identity</label>
            <label><input type="checkbox" checked={shield.redactNotifications === true} onChange={event => setting("stream-shield", "redactNotifications", event.currentTarget.checked)} /> Redact notifications</label>
            <label><input type="checkbox" checked={shield.redactNotes === true} onChange={event => setting("stream-shield", "redactNotes", event.currentTarget.checked)} /> Redact local notes</label>
            <label><input type="checkbox" checked={shield.redactAccount === true} onChange={event => setting("stream-shield", "redactAccount", event.currentTarget.checked)} /> Redact account area</label>
        </div>
        <p className="solcord-key-hint"><kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> toggles Privacy Mode when Stream Shield is enabled.</p>
    </Section>;
}

function StreamAudienceGuardControls() {
    const state = useStateFromStores([SolcordSettings, SolcordRuntime], () => ({
        settings: SolcordSettings.snapshot().modules["stream-audience-guard"],
        runtime: SolcordRuntime.audienceGuardStatus(),
        privateState: SolcordRuntime.audienceGuardPrivatePolicy()
    }));
    const [userId, setUserId] = useState("");
    const [label, setLabel] = useState("");
    const [actionStatus, setActionStatus] = useState("");
    const setMode = (key: "preventStart" | "stopOnJoin" | "stopOnWatch", value: boolean) => {
        if (key === "stopOnWatch" && value && !window.confirm("Enable Stop on Watch? A denied viewer may receive brief frames before Discord reports them. This is detection and rapid stopping, not per-viewer stream access control.")) return;
        void SolcordRuntime.setValue("stream-audience-guard", key, value);
    };
    const add = async () => {
        const normalizedId = userId.trim();
        if (!/^\d{1,32}$/.test(normalizedId)) {
            setActionStatus("Enter a Discord user ID containing digits only.");
            return;
        }
        const complete = await SolcordRuntime.setAudienceGuardEntries([...state.privateState.policy.entries, {userId: normalizedId, label: label.trim()}]);
        setActionStatus(complete ? "Denied user saved to this account's private policy." : "The private policy is available for this session, but encrypted persistence could not be confirmed.");
        setUserId("");
        setLabel("");
    };
    const arm = () => {
        if (!window.confirm("Arm Stream Audience Guard for the current voice call? Solcord will prevent or stop your own Go Live when a denied user is detected. This cannot make a normal Discord stream invisible to one person or guarantee zero-frame exposure.")) return;
        setActionStatus(SolcordRuntime.armAudienceGuard() ? "Audience Guard is armed for this call." : "Audience Guard could not arm. Join a voice channel, add a denied user, enable at least one mode, and confirm the adapter is available.");
    };
    const entries = state.privateState.policy.entries;
    const storageMessage = state.privateState.persistent
        ? "Encrypted persistence is active through Electron safeStorage."
        : state.privateState.storage.persistent
            ? state.privateState.loaded
                ? "Encrypted storage is available for this account; this list will persist once saved."
                : "Encrypted storage is available. Enable the adapter while signed in to load this account's private list."
            : `Denylist persistence is unavailable; entries remain session-only.${state.privateState.storage.reason ? ` ${state.privateState.storage.reason}` : ""}`;
    return <Section title="Stream Audience Guard" summary="Stop your own Go Live when a denied user is detected.">
        <div className="solcord-audience-command">
            <div>
                <p className="solcord-eyebrow">Call-bound protection</p>
                <strong>Your stream will not start or continue while a denied user is detected in the current call or viewer list.</strong>
                <p>Only native private-channel permissions are server-enforced. Stop on Watch cannot rule out brief frame exposure.</p>
            </div>
            <span className={`solcord-status solcord-status-${state.runtime.phase === "armed" ? "active" : state.runtime.phase === "attention" || state.runtime.phase === "unavailable" ? "failed" : "starting"}`}>{state.runtime.phase}</span>
        </div>
        <div className="solcord-control-grid">
            <label><input type="checkbox" checked={state.settings.enabled} onChange={event => void SolcordRuntime.setEnabled("stream-audience-guard", event.currentTarget.checked)} /> Enable validated adapter</label>
            <label><input type="checkbox" checked={state.settings.values.preventStart === true} disabled={!state.settings.enabled || state.runtime.armed} onChange={event => setMode("preventStart", event.currentTarget.checked)} /> Prevent Start</label>
            <label><input type="checkbox" checked={state.settings.values.stopOnJoin === true} disabled={!state.settings.enabled || state.runtime.armed} onChange={event => setMode("stopOnJoin", event.currentTarget.checked)} /> Stop on Join</label>
            <label><input type="checkbox" checked={state.settings.values.stopOnWatch === true} disabled={!state.settings.enabled || state.runtime.armed} onChange={event => setMode("stopOnWatch", event.currentTarget.checked)} /> Stop on Watch</label>
        </div>
        <div className="solcord-inline-field solcord-audience-add">
            <input value={userId} inputMode="numeric" maxLength={32} placeholder="Discord user ID" aria-label="Denied Discord user ID" onChange={event => setUserId(event.currentTarget.value.replace(/\D/g, ""))} />
            <input value={label} maxLength={80} placeholder="Private label (optional)" aria-label="Private label for denied user" onChange={event => setLabel(event.currentTarget.value)} />
            <ActionButton onClick={() => void add()} disabled={!state.settings.enabled || entries.length >= 100 || !userId.trim()}>Add locally</ActionButton>
        </div>
        <div className="solcord-audience-list" aria-label="Denied stream audience">
            {entries.map(entry => <div key={entry.userId} className="solcord-audience-row"><div><strong>{entry.label || `Discord user •${entry.userId.slice(-4)}`}</strong><small>Account-private entry · ID ending {entry.userId.slice(-4)}</small></div><ActionButton disabled={state.runtime.armed} onClick={() => void SolcordRuntime.setAudienceGuardEntries(entries.filter(item => item.userId !== entry.userId))}>Remove</ActionButton></div>)}
            {!entries.length && <p className="solcord-empty">No denied users are stored for this Discord account.</p>}
        </div>
        <div className="solcord-actions">
            {state.runtime.armed ? <ActionButton tone="danger" onClick={() => {SolcordRuntime.disarmAudienceGuard(); setActionStatus("Audience Guard disarmed.");}}>Disarm</ActionButton> : <ActionButton tone="accent" disabled={!state.runtime.available || !entries.length} onClick={arm}>Arm for this call</ActionButton>}
            <ActionButton tone="danger" disabled={!entries.length || state.runtime.armed} onClick={() => {if (window.confirm("Clear this account's private Stream Audience Guard denylist?")) void SolcordRuntime.clearAudienceGuardEntries();}}>Clear private list</ActionButton>
        </div>
        <p className="solcord-key-hint">{storageMessage} {state.runtime.detail}</p>
        {actionStatus && <p role="status" className="solcord-import-status">{actionStatus}</p>}
    </Section>;
}

type NativeSuiteScope = "status" | "chat" | "voice" | "friends";

function NativeSuitePanel({scope}: {scope: NativeSuiteScope;}) {
    const state = useStateFromStores([SolcordRuntime, SolcordSettings], () => ({statuses: SolcordRuntime.nativeSuiteStatus(), preferences: SolcordSettings.snapshot().productPreferences, accountGeneration: SolcordRuntime.privateAccountGeneration()}));
    const controller = SolcordRuntime.nativeSuiteController();
    const [actionStatus, setActionStatus] = useState("");
    const [audioUserId, setAudioUserId] = useState("");
    const [audioPercent, setAudioPercent] = useState(100);
    const [channelId, setChannelId] = useState(() => controller?.currentChannelId() ?? "");
    const [serverAlias, setServerAlias] = useState("");
    const [glance, setGlance] = useState<Array<{id: string; authorLabel: string; text: string; timestamp: number;}>>([]);
    const [translationText, setTranslationText] = useState("");
    const [translationResult, setTranslationResult] = useState("");
    const [translationCredential, setTranslationCredential] = useState("");
    const [voiceStarting, setVoiceStarting] = useState(false);
    const [voiceRecording, setVoiceRecording] = useState(false);
    const [voicePreview, setVoicePreview] = useState<{recordingId: string; durationMs: number; sizeBytes: number; url: string;} | undefined>();
    const [composerDraft, setComposerDraft] = useState("");
    const [composerProof, setComposerProof] = useState<{characterCount: number; partCount: number; warnings: string[];} | undefined>();
    const [timeValue, setTimeValue] = useState("");
    const [timeStyle, setTimeStyle] = useState<"t" | "T" | "d" | "D" | "f" | "F" | "R">("F");
    const [timeMarkup, setTimeMarkup] = useState("");
    const [permissionInput, setPermissionInput] = useState("VIEW_CHANNEL, CONNECT, STREAM");
    const [permissionResults, setPermissionResults] = useState<Array<{permission: string; explanation: string;}>>([]);
    const [focusInput, setFocusInput] = useState(state.preferences.nativeSuite.focusChannelIds.join(", "));
    const [identitySubject, setIdentitySubject] = useState("");
    const [identityText, setIdentityText] = useState("");
    const [identityTags, setIdentityTags] = useState("");
    const [identityNotes, setIdentityNotes] = useState<Array<{subjectId: string; text: string; tags: string[]; updatedAt: number;}>>([]);
    const [identityPersistent, setIdentityPersistent] = useState(false);
    const accountGeneration = useRef(state.accountGeneration);
    useEffect(() => {
        if (accountGeneration.current === state.accountGeneration) return;
        accountGeneration.current = state.accountGeneration;
        setActionStatus("Discord account changed. Account-private drafts, credentials, previews, notes, and session-only space rules were cleared.");
        setAudioUserId("");
        setChannelId("");
        setServerAlias("");
        setGlance([]);
        setTranslationText("");
        setTranslationResult("");
        setTranslationCredential("");
        setVoiceStarting(false);
        setVoiceRecording(false);
        setVoicePreview(undefined);
        setComposerDraft("");
        setComposerProof(undefined);
        setFocusInput("");
        setIdentitySubject("");
        setIdentityText("");
        setIdentityTags("");
        setIdentityNotes([]);
        setIdentityPersistent(false);
    }, [state.accountGeneration]);
    const nativePreferences = state.preferences.nativeSuite;
    const stateLabel = {"off": "Off", "needs-setup": "Needs setup", "ready": "Ready", "degraded": "Degraded", "unsupported": "Unavailable"} as const;
    const statusById = new Map(state.statuses.map(item => [item.id, item]));
    const visibleStatuses = state.statuses.filter(item => item.maturity !== "off");
    const unavailableStatuses = state.statuses.filter(item => item.maturity === "unsupported");
    const statusFor = (...ids: Array<(typeof state.statuses)[number]["id"]>) => state.statuses.filter(item => ids.includes(item.id));
    const available = (id: (typeof state.statuses)[number]["id"]) => ["ready", "needs-setup", "degraded"].includes(statusById.get(id)?.maturity ?? "off");
    const translationEndpoint = nativePreferences.translation.provider === "deepl" ? "https://api-free.deepl.com/v2/translate" : nativePreferences.translation.endpoint;
    const updateNativePreferences = (next: typeof nativePreferences) => void SolcordRuntime.setProductPreferences({...state.preferences, nativeSuite: next});
    const requireController = () => {
        if (!controller) throw new Error("Solcord's built-in controls are unavailable on this Discord build.");
        return controller;
    };
    const volume = () => {
        try {
            const activeController = requireController();
            const preview = activeController.previewLocalVolume(audioUserId.trim(), 100, audioPercent);
            if (!window.confirm(`Set local playback for user •${preview.userId.slice(-4)} from ${preview.currentPercent}% to ${preview.targetPercent}%? This changes only what you hear.`)) return;
            activeController.applyReviewedLocalVolume();
            setActionStatus("Reviewed local playback volume applied.");
        }
        catch (error) {setActionStatus(error instanceof Error ? error.message : "Audio Console stayed unavailable.");}
    };
    const reviewChannel = () => {
        try {
            setGlance([...requireController().previewLoadedChannel(channelId.trim())]);
            setActionStatus("Channel Glance read the already-loaded local store without fetching or marking anything read.");
        }
        catch (error) {setGlance([]); setActionStatus(error instanceof Error ? error.message : "Channel Glance stayed unavailable.");}
    };
    const translate = async () => {
        try {
            const provider = nativePreferences.translation.provider;
            if (provider === "off") throw new Error("Choose a translation provider first.");
            const activeController = requireController();
            const preview = activeController.previewTranslation(provider, nativePreferences.translation.endpoint || undefined, "auto", "EN", translationText);
            if (!window.confirm(`${preview.disclosure}\n\nContinue with this reviewed text?`)) return;
            setTranslationResult(await activeController.executeReviewedTranslation(preview.id, translationCredential));
            setActionStatus("Translation returned to this local panel. It was not inserted or sent to Discord.");
        }
        catch (error) {setActionStatus(error instanceof Error ? error.message : "Translation Desk failed closed.");}
    };
    const startVoice = async () => {
        try {
            if (!controller) throw new Error("Voice Note Studio is unavailable on this Discord build.");
            setVoiceStarting(true);
            await controller.beginVoiceNoteFromUserGesture();
            setVoiceRecording(true);
            setVoicePreview(undefined);
            setActionStatus("Recording locally. Nothing is uploading.");
        }
        catch (error) {setVoiceRecording(false); setActionStatus(error instanceof Error ? error.message : "Voice Note Studio stayed unavailable.");}
        finally {setVoiceStarting(false);}
    };
    const stopVoice = async () => {
        try {
            if (!controller || !voiceRecording) throw new Error("No local recording is active.");
            const preview = await controller.stopVoiceNoteForPreview();
            setVoiceRecording(false);
            setVoicePreview(preview);
            setActionStatus("Recording stopped. Review it before opening Discord's ordinary upload composer.");
        }
        catch (error) {setVoiceRecording(false); setActionStatus(error instanceof Error ? error.message : "No local recording could be previewed.");}
    };
    const prepareVoiceUpload = () => {
        if (!voicePreview || !window.confirm("Open Discord's normal upload composer with this reviewed voice note? This prepares the file but does not press Send.")) return;
        try {requireController().prepareReviewedVoiceNoteUpload(channelId.trim()); setVoiceRecording(false); setVoicePreview(undefined); setActionStatus("The reviewed file was handed to Discord's normal upload composer. You still control Send.");}
        catch (error) {setActionStatus(error instanceof Error ? error.message : "The native upload composer stayed unavailable.");}
    };
    const previewNotifications = (notificationScope: "guild" | "mentions" | "all") => {
        try {
            const activeController = requireController();
            const preview = activeController.previewNotifications(notificationScope);
            if (!window.confirm(`Mark ${preview.count} reviewed ${notificationScope} notification item(s) as read? This changes account read state and cannot be undone by Solcord.`)) return;
            activeController.applyReviewedNotifications(preview.id);
            setActionStatus(`${preview.count} reviewed notification item(s) were marked read.`);
        }
        catch (error) {setActionStatus(error instanceof Error ? error.message : "Notification Review stayed unavailable.");}
    };
    const addLocalSpaceRule = (kind: "pin" | "hide" | "alias") => {
        try {
            const activeController = requireController();
            if (kind === "pin") activeController.pinDm(channelId.trim());
            else if (kind === "hide") activeController.hideGuild(channelId.trim());
            else activeController.aliasGuild(channelId.trim(), serverAlias.trim());
            setActionStatus("The People and Spaces rule is active for this account session. No Discord server, profile, or settings file was edited.");
        }
        catch (error) {setActionStatus(error instanceof Error ? error.message : "The local preference was not changed.");}
    };
    const reviewComposer = () => {
        try {setComposerProof(requireController().composerProof(composerDraft)); setActionStatus("Composer Proof reviewed this local draft. Nothing was inserted or sent.");}
        catch (error) {setComposerProof(undefined); setActionStatus(error instanceof Error ? error.message : "Composer Proof stayed unavailable.");}
    };
    const composeTime = () => {
        try {
            const parsed = new Date(timeValue).valueOf();
            const markup = requireController().timeMarkup(parsed, timeStyle);
            setTimeMarkup(markup);
            setActionStatus("Time Composer generated local Discord timestamp markup. It was not inserted or sent.");
        }
        catch (error) {setTimeMarkup(""); setActionStatus(error instanceof Error ? error.message : "Time Composer could not parse that time.");}
    };
    const reviewPermissions = () => {
        try {
            const names = permissionInput.split(/[\s,]+/).map(value => value.trim()).filter(Boolean);
            setPermissionResults([...requireController().explainCachedPermissions(names)]);
            setActionStatus("Permission Lens explained the supplied cached permission names. It did not fetch or edit channel permissions.");
        }
        catch (error) {setPermissionResults([]); setActionStatus(error instanceof Error ? error.message : "Permission Lens stayed unavailable.");}
    };
    const applyFocus = () => {
        try {
            requireController().setFocusChannels(focusInput.split(/[\s,]+/).map(value => value.trim()).filter(Boolean));
            setActionStatus("Focus Channels dimmed non-selected loaded channel rows locally. Hovered and selected rows remain readable.");
        }
        catch (error) {setActionStatus(error instanceof Error ? error.message : "Focus Channels stayed unavailable.");}
    };
    const loadIdentityNotes = async () => {
        const [status, result] = await Promise.all([SolcordRuntime.localIdentityNotesStatus(), SolcordRuntime.readLocalIdentityNotes()]);
        setIdentityNotes(result.notes);
        setIdentityPersistent(status.persistent && result.persistent && result.complete);
        setActionStatus(result.complete ? `${result.notes.length} account-private note(s) loaded locally.` : "Local Identity Notes stayed unavailable; no private content was exposed.");
    };
    const saveIdentityNote = async () => {
        try {
            const tags = identityTags.split(",").map(tag => tag.trim()).filter(Boolean);
            const activeController = requireController();
            const reviewed = activeController.reviewIdentityNote(identitySubject.trim(), identityText, tags);
            if (!window.confirm(`Store the reviewed local note for user •${reviewed.subjectId.slice(-4)}? The note never changes that Discord profile and never enters normal settings or exports.`)) return;
            const intent = activeController.confirmIdentityNote(reviewed.subjectId);
            const result = await SolcordRuntime.writeLocalIdentityNote(intent.payload);
            if (!result.complete) throw new Error("The private note write did not complete.");
            setIdentityText("");
            setIdentityTags("");
            await loadIdentityNotes();
            setActionStatus(result.persistent ? "Reviewed note encrypted through Electron safeStorage." : "Encryption is unavailable; the reviewed note remains session-only.");
        }
        catch (error) {setActionStatus(error instanceof Error ? error.message : "Local Identity Notes stayed unavailable.");}
    };
    const removeIdentityNote = async (subjectId: string) => {
        if (!window.confirm(`Remove the local note for user •${subjectId.slice(-4)}? This does not change the Discord account.`)) return;
        const result = await SolcordRuntime.removeLocalIdentityNote(subjectId);
        if (result.complete) await loadIdentityNotes();
        else setActionStatus("The private note was preserved because removal did not complete cleanly.");
    };
    const scopeStatus = scope === "chat"
        ? statusFor("composer-toolkit", "translation-desk", "channel-glance", "notification-review")
        : scope === "voice"
            ? statusFor("call-context", "audio-console", "voice-note-studio", "voice-health")
            : scope === "friends"
                ? statusFor("people-and-spaces", "permission-lens", "local-identity-notes")
                : visibleStatuses;
    const usableScopeStatus = scopeStatus.filter(item => item.maturity !== "unsupported" && item.maturity !== "off");
    const unsupportedScopeStatus = scopeStatus.filter(item => item.maturity === "unsupported");
    const sectionTitle = scope === "status" ? "Built-in features" : scope === "chat" ? "Message tools" : scope === "voice" ? "Voice tools" : "People and spaces";
    const sectionSummary = scope === "status" ? "Built-ins replacing the old plugin cards." : "Only validated controls appear below.";
    return <Section title={sectionTitle} summary={sectionSummary}>
        {scope === "status" && <>
            <div className="solcord-native-summary" aria-label="Built-in feature summary"><strong>{visibleStatuses.filter(item => item.maturity === "ready").length} ready</strong><span>{visibleStatuses.filter(item => item.maturity === "needs-setup").length} need setup</span><span>{unavailableStatuses.length} unsupported on this build</span></div>
            <details className="solcord-state-help"><summary>What these states mean</summary><p>Ready means an implemented adapter passed its current startup validation. Off means it does no Discord lookup or patch work. Unsupported means the current Discord build did not expose a verified adapter.</p></details>
            <div className="solcord-native-ledger" role="list" aria-label="Solcord built-in features">
                {scopeStatus.filter(item => item.maturity !== "unsupported").map(item => <div key={item.id} role="listitem" className="solcord-native-row"><div><strong>{item.title}</strong>{item.enabledProviders.length > 0 && <small>Replaces {item.enabledProviders.join(", ")}</small>}</div><span className={`solcord-capability solcord-capability-${item.maturity}`}>{stateLabel[item.maturity]}</span></div>)}
                {!scopeStatus.length && <p className="solcord-empty">No built-in feature has been selected yet. Finish setup to choose the replacements you want.</p>}
            </div>
            {unavailableStatuses.length > 0 && <details className="solcord-native-unavailable-list"><summary>{unavailableStatuses.length} unavailable on this Discord build</summary>{unavailableStatuses.map(item => <div key={item.id}><strong>{item.title}</strong><span>{item.detail}</span></div>)}</details>}
        </>}
        {scope !== "status" && <>
            {scope === "voice" && <div className="solcord-setting-list"><label className="solcord-setting-row"><span><strong>Voice Health</strong><small>Samples cached connection quality every five seconds while enabled. Never records audio.</small></span><span className="solcord-switch"><input type="checkbox" checked={nativePreferences.voiceHealthEnabled} onChange={event => updateNativePreferences({...nativePreferences, voiceHealthEnabled: event.currentTarget.checked})} /><i aria-hidden="true" /></span></label></div>}
            {usableScopeStatus.length > 0 && <div className="solcord-native-context-status" role="list" aria-label={`${sectionTitle} availability`}>{usableScopeStatus.map(item => <div role="listitem" key={item.id}><span>{item.title}</span><strong className={`solcord-capability solcord-capability-${item.maturity}`}>{stateLabel[item.maturity]}</strong></div>)}</div>}
            {scopeStatus.every(item => item.maturity === "off") && <p className="solcord-empty">Finish setup to turn on these built-in tools and archive the matching community files.</p>}
            {!usableScopeStatus.length && unsupportedScopeStatus.length > 0 && <p className="solcord-empty">These tools are unavailable on this Discord build, so no inactive controls are shown.</p>}
            <div className={`solcord-native-tools solcord-native-tools-${scope}`}>
            {scope === "chat" && available("composer-toolkit") && <details><summary>Composer Proof and Time Composer</summary><div className="solcord-composer-lab"><textarea value={composerDraft} maxLength={64000} placeholder="Review a draft locally before sending" onChange={event => setComposerDraft(event.currentTarget.value)} /><div className="solcord-actions"><ActionButton onClick={reviewComposer}>Review draft</ActionButton></div>{composerProof && <div className="solcord-native-preview"><p><strong>{composerProof.characterCount.toLocaleString()} characters</strong><span>{composerProof.partCount} guarded part(s)</span></p>{composerProof.warnings.length ? composerProof.warnings.map(warning => <p key={warning}>{warning}</p>) : <p>No broad-mention, length, or unclosed-code-block warnings found.</p>}</div>}<div className="solcord-catalog-tools"><label>Local date and time<input type="datetime-local" value={timeValue} onChange={event => setTimeValue(event.currentTarget.value)} /></label><label>Discord display style<select value={timeStyle} onChange={event => setTimeStyle(event.currentTarget.value as typeof timeStyle)}><option value="F">Full date and time</option><option value="f">Short date and time</option><option value="R">Relative</option><option value="D">Long date</option><option value="d">Short date</option><option value="T">Time with seconds</option><option value="t">Short time</option></select></label></div><div className="solcord-inline-field"><ActionButton disabled={!timeValue} onClick={composeTime}>Generate timestamp</ActionButton>{timeMarkup && <><output>{timeMarkup}</output><ActionButton onClick={() => void navigator.clipboard?.writeText(timeMarkup).then(() => setActionStatus("Reviewed timestamp copied. Solcord did not insert or send it."))}>Copy</ActionButton></>}</div></div></details>}
            {scope === "voice" && available("audio-console") && <details><summary>Audio Console</summary><div className="solcord-inline-field"><input value={audioUserId} inputMode="numeric" placeholder="Discord user ID" aria-label="Audio Console user ID" onChange={event => setAudioUserId(event.currentTarget.value.replace(/\D/g, ""))} /><input type="number" min="0" max="200" value={audioPercent} aria-label="Local volume percent" onChange={event => setAudioPercent(Math.max(0, Math.min(200, Number(event.currentTarget.value))))} /><ActionButton disabled={!audioUserId} onClick={volume}>Review and apply</ActionButton></div></details>}
            {scope === "chat" && available("channel-glance") && <details><summary>Channel Glance</summary><div className="solcord-inline-field"><input value={channelId} inputMode="numeric" placeholder="Loaded channel ID" aria-label="Loaded channel ID" onChange={event => setChannelId(event.currentTarget.value.replace(/\D/g, ""))} /><ActionButton disabled={!channelId} onClick={reviewChannel}>Glance</ActionButton></div><p className="solcord-key-hint">Reads only the already-loaded message store. It never fetches history, marks messages read, or persists content.</p>{glance.length > 0 && <div className="solcord-native-preview">{glance.map(message => <p key={message.id}><strong>{message.authorLabel}</strong> <span>{message.text || "No text content"}</span><small>{timestamp(message.timestamp)}</small></p>)}</div>}</details>}
            {scope === "friends" && available("people-and-spaces") && <details><summary>People and Spaces</summary><div className="solcord-inline-field"><input value={channelId} inputMode="numeric" placeholder="Loaded DM, server, or user ID" aria-label="Local Discord object ID" onChange={event => setChannelId(event.currentTarget.value.replace(/\D/g, ""))} /><ActionButton disabled={!channelId} onClick={() => addLocalSpaceRule("pin")}>Pin DM locally</ActionButton><ActionButton disabled={!channelId} onClick={() => addLocalSpaceRule("hide")}>Hide server locally</ActionButton></div><div className="solcord-inline-field solcord-alias-field"><input value={serverAlias} maxLength={48} placeholder="Local server alias" aria-label="Local server alias" onChange={event => setServerAlias(event.currentTarget.value)} /><ActionButton disabled={!channelId || !serverAlias.trim()} onClick={() => addLocalSpaceRule("alias")}>Save local alias</ActionButton></div><p className="solcord-key-hint">Pins, hidden servers, and aliases stay only in memory for this account session.</p></details>}
            {scope === "chat" && available("translation-desk") && <details><summary>Translation Desk</summary><div className="solcord-translation-grid"><label>Provider<select value={nativePreferences.translation.provider} onChange={event => {setTranslationCredential(""); updateNativePreferences({...nativePreferences, translation: {...nativePreferences.translation, provider: event.currentTarget.value as typeof nativePreferences.translation.provider}});}}><option value="off">Off</option><option value="deepl">DeepL Free</option><option value="libretranslate">LibreTranslate</option></select></label><label>HTTPS endpoint<input value={nativePreferences.translation.endpoint} disabled={nativePreferences.translation.provider !== "libretranslate"} placeholder="https://translate.example/translate" onChange={event => {setTranslationCredential(""); updateNativePreferences({...nativePreferences, translation: {...nativePreferences.translation, endpoint: event.currentTarget.value}});}} /></label><label>Credential<input type="password" autoComplete="off" value={translationCredential} placeholder="Stored only through encrypted private storage" onChange={event => setTranslationCredential(event.currentTarget.value)} /></label><div className="solcord-actions solcord-translation-credentials"><ActionButton disabled={nativePreferences.translation.provider === "off" || !translationEndpoint} onClick={() => void SolcordRuntime.readTranslationCredential(nativePreferences.translation.provider as "deepl" | "libretranslate", translationEndpoint).then(result => {setTranslationCredential(result.credential); setActionStatus(result.complete ? (result.credential ? "Credential loaded from account-bound private storage." : "No credential is stored for this provider and endpoint.") : "Credential storage could not be read completely.");})}>Load credential</ActionButton><ActionButton disabled={nativePreferences.translation.provider === "off" || !translationEndpoint || !translationCredential} onClick={() => void SolcordRuntime.writeTranslationCredential(nativePreferences.translation.provider as "deepl" | "libretranslate", translationEndpoint, translationCredential).then(result => setActionStatus(result.complete ? (result.persistent ? "Credential encrypted through Electron safeStorage." : "Encryption is unavailable; the credential remains memory-only for this session.") : "Credential could not be persisted and was not added to normal settings."))}>Save securely</ActionButton><ActionButton disabled={nativePreferences.translation.provider === "off" || !translationEndpoint} tone="danger" onClick={() => void SolcordRuntime.clearTranslationCredential(nativePreferences.translation.provider as "deepl" | "libretranslate", translationEndpoint).then(result => {setTranslationCredential(""); setActionStatus(result.complete ? "Stored credential cleared for this provider and endpoint." : "Credential cleanup needs attention.");})}>Clear credential</ActionButton></div><textarea value={translationText} maxLength={16000} placeholder="Text to review before translation" onChange={event => setTranslationText(event.currentTarget.value)} /><ActionButton disabled={!translationText || nativePreferences.translation.provider === "off"} onClick={() => void translate()}>Review destination and translate</ActionButton>{translationResult && <output>{translationResult}</output>}</div></details>}
            {scope === "voice" && available("voice-note-studio") && <details><summary>Voice Note Studio</summary><div className="solcord-actions"><ActionButton disabled={voiceStarting || voiceRecording || Boolean(voicePreview)} onClick={() => void startVoice()}>{voiceStarting ? "Waiting for microphone" : "Record"}</ActionButton><ActionButton disabled={voiceStarting || !voiceRecording} onClick={() => void stopVoice()}>Stop and preview</ActionButton><ActionButton disabled={voiceStarting || voiceRecording || !voicePreview || !channelId} onClick={prepareVoiceUpload}>Open normal upload composer</ActionButton><ActionButton disabled={!voiceStarting && !voiceRecording && !voicePreview} tone="danger" onClick={() => {controller?.cancelVoiceNote(); setVoiceStarting(false); setVoiceRecording(false); setVoicePreview(undefined); setActionStatus("Local voice-note recording and preview cleared.");}}>Cancel</ActionButton></div>{voicePreview && <div className="solcord-native-preview"><audio controls src={voicePreview.url} /><small>{Math.ceil(voicePreview.durationMs / 1000)} seconds · {(voicePreview.sizeBytes / 1024).toFixed(1)} KiB · not uploaded</small></div>}</details>}
            {scope === "chat" && available("notification-review") && <details><summary>Notification Review</summary><div className="solcord-actions"><ActionButton onClick={() => previewNotifications("mentions")}>Review mentions</ActionButton><ActionButton onClick={() => previewNotifications("guild")}>Review current server</ActionButton><ActionButton onClick={() => previewNotifications("all")}>Review all</ActionButton></div><p className="solcord-key-hint">Every action previews a bounded count and asks again before changing read state.</p></details>}
            {scope === "friends" && available("permission-lens") && <details><summary>Permission Lens and Focus Channels</summary><div className="solcord-catalog-tools"><label>Cached permission names<input value={permissionInput} onChange={event => setPermissionInput(event.currentTarget.value)} /></label><div className="solcord-actions"><ActionButton disabled={!permissionInput.trim()} onClick={reviewPermissions}>Explain locally</ActionButton></div><label>Focus channel IDs<input value={focusInput} placeholder="Comma-separated loaded channel IDs" onChange={event => setFocusInput(event.currentTarget.value.replace(/[^\d,\s]/g, ""))} /></label><div className="solcord-actions"><ActionButton onClick={applyFocus}>{focusInput.trim() ? "Apply focus" : "Clear focus"}</ActionButton></div></div>{permissionResults.length > 0 && <div className="solcord-native-preview">{permissionResults.map(result => <p key={result.permission}><strong>{result.permission}</strong><span>{result.explanation}</span></p>)}</div>}<p className="solcord-key-hint">Permission Lens uses only supplied cached names. Focus Channels changes only the loaded local channel rail, stays session-only, and clears on account switch.</p></details>}
            {scope === "friends" && available("local-identity-notes") && <details><summary>Encrypted Local Identity Notes</summary><div className="solcord-composer-lab"><p className="solcord-key-hint">Default-off and account-isolated. Notes never edit profiles, sync to cloud, enter diagnostics, or appear in portable settings exports.</p><div className="solcord-catalog-tools"><label>Discord user ID<input value={identitySubject} inputMode="numeric" maxLength={32} placeholder="User ID" onChange={event => setIdentitySubject(event.currentTarget.value.replace(/\D/g, ""))} /></label><label>Private tags<input value={identityTags} maxLength={199} placeholder="friend, project" onChange={event => setIdentityTags(event.currentTarget.value)} /></label></div><textarea value={identityText} maxLength={280} placeholder="Private local note" onChange={event => setIdentityText(event.currentTarget.value)} /><div className="solcord-actions"><ActionButton disabled={!identitySubject || !identityText} onClick={() => void saveIdentityNote()}>Review and store</ActionButton><ActionButton onClick={() => void loadIdentityNotes()}>Load account notes</ActionButton><ActionButton tone="danger" disabled={!identityNotes.length} onClick={() => {if (window.confirm("Clear every Local Identity Note for the current Discord account?")) void SolcordRuntime.clearLocalIdentityNotes().then(() => loadIdentityNotes());}}>Clear all</ActionButton></div>{identityNotes.length > 0 && <div className="solcord-native-preview">{identityNotes.map(note => <p key={note.subjectId}><strong>User •{note.subjectId.slice(-4)}</strong><span>{note.text}{note.tags.length ? ` · ${note.tags.join(", ")}` : ""}</span><small>{timestamp(note.updatedAt)} <button type="button" className="solcord-text-button" onClick={() => void removeIdentityNote(note.subjectId)}>Remove</button></small></p>)}</div>}<p className="solcord-key-hint">{identityPersistent ? "Encrypted persistence is active." : "No persistence claim: until loaded, or when safeStorage is unavailable, notes are session-only."}</p></div></details>}
            </div>
        </>}
        {actionStatus && <p role="status" className="solcord-import-status">{actionStatus}</p>}
    </Section>;
}

function AccessibilityControls() {
    const accessibility = useStateFromStores(SolcordSettings, () => SolcordSettings.snapshot().modules["accessibility-toolkit"].values);
    const setting = (key: string, value: unknown) => void SolcordRuntime.setValue("accessibility-toolkit", key, value);
    return <Section title="Accessibility" summary="Reading, contrast, focus, and motion controls.">
        <div className="solcord-control-grid">
            <label><input type="checkbox" checked={accessibility.reducedMotion === true} onChange={event => setting("reducedMotion", event.currentTarget.checked)} /> Reduced motion</label>
            <label><input type="checkbox" checked={accessibility.roleContrast === true} onChange={event => setting("roleContrast", event.currentTarget.checked)} /> Role contrast aid</label>
            <label><input type="checkbox" checked={accessibility.readingRuler === true} onChange={event => setting("readingRuler", event.currentTarget.checked)} /> Reading ruler</label>
            <label className="solcord-range-control">Reading width
                <input type="range" min="0" max="1200" step="40" value={Number(accessibility.readingWidth) || 0} aria-label="Reading width in pixels; zero uses Discord default" onChange={event => setting("readingWidth", Number(event.currentTarget.value))} />
                <output>{Number(accessibility.readingWidth) ? `${accessibility.readingWidth} px` : "Discord default"}</output>
            </label>
        </div>
    </Section>;
}

function PerformanceProfileControls() {
    const preferences = useStateFromStores(SolcordSettings, () => SolcordSettings.snapshot().productPreferences);
    const profile = preferences.performanceProfile;
    const reducedByOs = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    const policy = resolveSolcordPerformancePolicy(profile, preferences.appearance.motion, reducedByOs);
    const setProfile = (performanceProfile: SolcordPerformanceProfile) => void SolcordRuntime.setProductPreferences({...preferences, performanceProfile});
    return <Section title="Performance profile" summary="Choose how much background work and motion Solcord may use.">
        <div className="solcord-segmented" role="radiogroup" aria-label="Solcord performance profile">
            {(Object.keys(SOLCORD_PERFORMANCE_POLICIES) as SolcordPerformanceProfile[]).map(id => <button key={id} type="button" role="radio" aria-checked={profile === id} onClick={() => setProfile(id)}><strong>{id[0].toUpperCase() + id.slice(1)}</strong><small>{SOLCORD_PERFORMANCE_POLICIES[id].description}</small></button>)}
        </div>
        <dl className="solcord-facts solcord-policy-facts"><div><dt>Effective motion</dt><dd>{policy.effectiveMotion}</dd></div><div><dt>Performance sampling</dt><dd>no faster than every {policy.sampleSeconds} seconds</dd></div><div><dt>Ambient accents</dt><dd>{policy.ambientEffects ? "available" : "off"}</dd></div><div><dt>Windows reduced motion</dt><dd>{reducedByOs ? "honored" : "not requested"}</dd></div></dl>
    </Section>;
}

function BaselineToolsPanel() {
    const state = useStateFromStores([SolcordSettings, SolcordRuntime], () => ({preferences: SolcordSettings.snapshot().productPreferences, runtime: SolcordRuntime.baselineSuiteStatus()}));
    const baseline = state.preferences.baseline;
    const [mediaLabel, setMediaLabel] = useState("");
    const [mediaUrl, setMediaUrl] = useState("");
    const [mediaKind, setMediaKind] = useState<SolcordMediaKind>("gif");
    const [status, setStatus] = useState("");
    const update = (patch: Partial<typeof baseline>) => {
        const current = SolcordSettings.snapshot().productPreferences;
        void SolcordRuntime.setProductPreferences({...current, baseline: {...current.baseline, ...patch}});
    };
    const toggleRegion = (region: "guilds" | "channels" | "members", hidden: boolean) => {
        const collapsedRegions = SolcordSettings.snapshot().productPreferences.baseline.collapsedRegions;
        update({collapsedRegions: hidden ? [...new Set([...collapsedRegions, region])] : collapsedRegions.filter(item => item !== region)});
    };
    const addMedia = () => {
        const url = normalizeSolcordMediaShelfUrl(mediaUrl.trim());
        try {
            if (!url) throw new Error();
            const mediaShelf = SolcordSettings.snapshot().productPreferences.baseline.mediaShelf;
            update({mediaShelf: [...mediaShelf, {id: globalThis.crypto?.randomUUID?.() ?? `media-${Date.now().toString(36)}`, label: mediaLabel.trim() || "Saved media", url, kind: mediaKind}].slice(-200)});
            setMediaLabel("");
            setMediaUrl("");
            setStatus("Saved the Discord CDN reference locally. Solcord did not download it.");
        }
        catch {setStatus("Use a credential-free HTTPS Discord CDN URL with no query or fragment. Signed links are not stored. Nothing was saved.");}
    };
    return <Section title="Layout and message tools" summary="Local controls for layout, embeds, scrolling, message previews, and saved media references. When every switch is off, these tools stay out of Discord.">
        <div className="solcord-setting-rows">
            <label><span><strong>Layout Collapse</strong><small>Hide selected Discord regions locally. Every region remains restorable here.</small></span><input type="checkbox" checked={baseline.layoutCollapse} onChange={event => update({layoutCollapse: event.currentTarget.checked})} /></label>
            {baseline.layoutCollapse && <div className="solcord-inline-options" aria-label="Layout regions"><label><input type="checkbox" checked={baseline.collapsedRegions.includes("guilds")} onChange={event => toggleRegion("guilds", event.currentTarget.checked)} /> Servers</label><label><input type="checkbox" checked={baseline.collapsedRegions.includes("channels")} onChange={event => toggleRegion("channels", event.currentTarget.checked)} /> Channels</label><label><input type="checkbox" checked={baseline.collapsedRegions.includes("members")} onChange={event => toggleRegion("members", event.currentTarget.checked)} /> Members</label></div>}
            <label><span><strong>Embed Controls</strong><small>Add local collapse and expand buttons without changing message data.</small></span><input type="checkbox" checked={baseline.embedControls} onChange={event => update({embedControls: event.currentTarget.checked})} /></label>
            <label><span><strong>Cross-platform Autoscroll</strong><small>Middle-click a scrollable Discord region; release the middle button or press Escape to stop.</small></span><input type="checkbox" checked={baseline.crossPlatformAutoscroll} onChange={event => update({crossPlatformAutoscroll: event.currentTarget.checked})} /></label>
            <label><span><strong>Message Link Preview</strong><small>Preview Discord message links only when the exact message is already loaded. No history fetch.</small></span><input type="checkbox" checked={baseline.messageLinkPreview} onChange={event => update({messageLinkPreview: event.currentTarget.checked})} /></label>
        </div>
        <details className="solcord-media-shelf"><summary>Media Shelf <small>{baseline.mediaShelf.length} saved reference(s)</small></summary><p>Keep bounded labels for Discord CDN GIF, sticker, or emoji links. Files are never downloaded in the background.</p><div className="solcord-catalog-tools"><label>Label<input value={mediaLabel} maxLength={64} onChange={event => setMediaLabel(event.currentTarget.value)} /></label><label>Kind<select value={mediaKind} onChange={event => setMediaKind(event.currentTarget.value as SolcordMediaKind)}><option value="gif">GIF</option><option value="sticker">Sticker</option><option value="emoji">Emoji</option></select></label><label>Discord CDN URL<input type="url" value={mediaUrl} onChange={event => setMediaUrl(event.currentTarget.value)} /></label></div><div className="solcord-actions"><ActionButton disabled={!mediaUrl.trim()} onClick={addMedia}>Save local reference</ActionButton></div>{baseline.mediaShelf.length > 0 && <div className="solcord-media-list">{baseline.mediaShelf.map(item => <div key={item.id}><span><strong>{item.label}</strong><small>{item.kind} · {new URL(item.url).hostname}</small></span><ActionButton onClick={() => void navigator.clipboard?.writeText(item.url)}>Copy URL</ActionButton><ActionButton tone="danger" onClick={() => {
                const mediaShelf = SolcordSettings.snapshot().productPreferences.baseline.mediaShelf;
                update({mediaShelf: mediaShelf.filter(candidate => candidate.id !== item.id)});
            }}>Remove</ActionButton></div>)}</div>}</details>
        <p className="solcord-key-hint">Runtime: {state.runtime.active ? `${state.runtime.enabled.join(", ")} active · ${Object.values(state.runtime.resources).reduce((sum, value) => sum + value, 0)} owned resources.` : "all adapters idle."} Media Shelf keeps {baseline.mediaShelf.length} local reference(s) and runs no Discord adapter. {state.runtime.unavailable.join(" ")}</p>
        {status && <p role="status" className="solcord-import-status">{status}</p>}
    </Section>;
}

function PerformanceControls() {
    const values = useStateFromStores(SolcordSettings, () => SolcordSettings.snapshot().modules["performance-hud"].values);
    return <Section title="Performance HUD" summary="Bounded local samples report observed Solcord startup, memory, event-loop, and owned-resource measurements without claiming to optimize Discord.">
        <label><input type="checkbox" checked={values.showOverlay === true} onChange={event => void SolcordRuntime.setValue("performance-hud", "showOverlay", event.currentTarget.checked)} /> Show the local performance overlay</label>
        <p className="solcord-key-hint"><kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>K</kbd> opens Command Deck.</p>
    </Section>;
}

function LinkWorkbench() {
    const [input, setInput] = useState("");
    const [inspection, setInspection] = useState<LinkInspection>();
    const [memoryRevision, setMemoryRevision] = useState(0);
    const remembered = inspection?.valid ? SolcordRuntime.domainMemoryDecision(input) : undefined;
    const domainRisk = inspection?.valid ? SolcordRuntime.inspectDomain(input) : undefined;
    const remember = (decision: "allow" | "warn" | "block") => {
        if (SolcordRuntime.rememberDomain(input, decision)) setMemoryRevision(memoryRevision + 1);
    };
    return <Section title="Link Lens" summary="Paste a link for a local inspection of the visible host, declared redirect target, tracking parameters, confusable-domain signals, and Discord invite code.">
        <div className="solcord-inline-field">
            <input type="url" value={input} placeholder="https://example.com/path" aria-label="Link to inspect" onChange={event => setInput(event.currentTarget.value)} />
            <ActionButton tone="accent" onClick={() => setInspection(SolcordRuntime.inspectLink(input))} disabled={!input.trim()}>Inspect locally</ActionButton>
        </div>
        {inspection && <div className={`solcord-link-result ${inspection.valid ? "" : "solcord-link-invalid"}`}>
            <dl className="solcord-facts">
                <div><dt>Visible host</dt><dd>{inspection.host ?? "invalid"}</dd></div>
                <div><dt>Declared final host</dt><dd>{inspection.finalHost ?? "unknown"}</dd></div>
                <div><dt>Invite</dt><dd>{inspection.inviteCode ?? "not detected"}</dd></div>
                <div><dt>Removed trackers</dt><dd>{inspection.removedParameters.join(", ") || "none"}</dd></div>
            </dl>
            {inspection.warnings.length ? <ul>{inspection.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : <p>No local warning signal was found. That is not a safety guarantee.</p>}
            <div className="solcord-domain-memory">
                <strong>Domain Memory</strong>
                <p>{remembered ? `${remembered.decision} until ${timestamp(remembered.expiresAt)}` : "No expiring decision is stored for this exact host."}</p>
                {domainRisk?.reasons.length ? <small>Allow is unavailable: {domainRisk.reasons.join(", ")}.</small> : <small>Scheme-and-host decisions expire after seven days and never apply to subdomains. In warn-only mode, allow never bypasses a Link Lens warning.</small>}
                <div className="solcord-actions">
                    <ActionButton disabled={domainRisk?.restricted !== false} onClick={() => remember("allow")}>Remember allow</ActionButton>
                    <ActionButton onClick={() => remember("warn")}>Remember warning</ActionButton>
                    <ActionButton tone="danger" onClick={() => remember("block")}>Remember block</ActionButton>
                    <ActionButton disabled={!remembered || !inspection.host} onClick={() => {if (inspection.host && SolcordRuntime.forgetDomain(inspection.host)) setMemoryRevision(memoryRevision + 1);}}>Forget</ActionButton>
                </div>
            </div>
        </div>}
    </Section>;
}

function AttachmentGuardWorkbench() {
    const [input, setInput] = useState("");
    const [mime, setMime] = useState("");
    const [inspection, setInspection] = useState<ReturnType<typeof SolcordRuntime.inspectAttachment>>();
    return <Section title="Attachment Guard" summary="Review a visible attachment URL, filename, extension, declared MIME, and risk reason locally. This tool never downloads, opens, scans, or uploads the file.">
        <div className="solcord-inline-field">
            <input type="url" value={input} placeholder="https://cdn.example/file.zip" aria-label="Attachment URL to inspect" onChange={event => setInput(event.currentTarget.value)} />
            <input value={mime} placeholder="Optional MIME type" aria-label="Declared attachment MIME type" onChange={event => setMime(event.currentTarget.value)} />
            <ActionButton tone="accent" onClick={() => setInspection(SolcordRuntime.inspectAttachment(input, mime || undefined))} disabled={!input.trim()}>Inspect locally</ActionButton>
        </div>
        {inspection && <div className={`solcord-link-result ${inspection.risk === "block" ? "solcord-link-invalid" : ""}`} role="status">
            <dl className="solcord-facts"><div><dt>Source host</dt><dd>{inspection.host ?? "invalid"}</dd></div><div><dt>Filename</dt><dd>{inspection.filename ?? "unavailable"}</dd></div><div><dt>Extension</dt><dd>{inspection.extension ?? "none"}</dd></div><div><dt>Local result</dt><dd>{inspection.risk}</dd></div></dl>
            {inspection.reasons.length ? <ul>{inspection.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul> : <p>No high-risk filename signal was found. This is not a malware verdict.</p>}
        </div>}
    </Section>;
}

function ScreenshotScrubber() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sourceRef = useRef<HTMLImageElement | undefined>(undefined);
    const dragRef = useRef<{x: number; y: number;} | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState<"cover" | "blur">("cover");
    const [error, setError] = useState("");
    const [region, setRegion] = useState({x: 10, y: 10, width: 30, height: 20});

    const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = event.currentTarget;
        const rect = canvas.getBoundingClientRect();
        return {x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height};
    };
    const drawSource = () => {
        const canvas = canvasRef.current;
        const image = sourceRef.current;
        if (!canvas || !image) return;
        canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    const clearSource = () => {
        sourceRef.current = undefined;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = 1;
        canvas.height = 1;
        canvas.getContext("2d")?.clearRect(0, 0, 1, 1);
    };
    const load = (file?: File) => {
        setError("");
        const supportedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
        if (!file || !supportedTypes.has(file.type)) {
            clearSource();
            setLoading(false);
            setLoaded(false);
            setError("Choose a PNG, JPEG, or WebP image.");
            return;
        }
        if (file.size > 25 * 1024 * 1024) {
            clearSource();
            setLoading(false);
            setLoaded(false);
            setError("The local image exceeds the 25 MB safety limit.");
            return;
        }
        clearSource();
        setLoading(true);
        setLoaded(false);
        const reader = new FileReader();
        reader.onload = () => {
            const image = new Image();
            image.onload = () => {
                if (image.naturalWidth * image.naturalHeight > 40_000_000) {
                    clearSource();
                    setLoading(false);
                    setLoaded(false);
                    setError("The decoded image exceeds the 40-megapixel safety limit.");
                    return;
                }
                const canvas = canvasRef.current!;
                const scale = Math.min(1, 1_400 / image.naturalWidth, 900 / image.naturalHeight);
                canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
                canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
                sourceRef.current = image;
                drawSource();
                setLoaded(true);
                setLoading(false);
            };
            image.onerror = () => {
                clearSource();
                setLoading(false);
                setLoaded(false);
                setError("The image could not be decoded locally.");
            };
            image.src = String(reader.result);
        };
        reader.onerror = () => {
            clearSource();
            setLoading(false);
            setLoaded(false);
            setError("The image could not be read locally.");
        };
        reader.readAsDataURL(file);
    };
    const redact = (canvas: HTMLCanvasElement, x: number, y: number, width: number, height: number) => {
        if (width < 3 || height < 3) return;
        const context = canvas.getContext("2d")!;
        if (mode === "cover") {
            context.fillStyle = "#171a1c";
            context.fillRect(x, y, width, height);
            return;
        }
        const sample = document.createElement("canvas");
        sample.width = Math.ceil(width);
        sample.height = Math.ceil(height);
        sample.getContext("2d")?.drawImage(canvas, x, y, width, height, 0, 0, sample.width, sample.height);
        context.save();
        context.filter = "blur(12px)";
        context.drawImage(sample, 0, 0, sample.width, sample.height, x, y, width, height);
        context.restore();
    };
    const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const start = dragRef.current;
        if (!start) return;
        dragRef.current = null;
        const end = point(event);
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const width = Math.abs(end.x - start.x);
        const height = Math.abs(end.y - start.y);
        redact(event.currentTarget, x, y, width, height);
    };
    const setRegionValue = (key: keyof typeof region, value: string) => {
        const number = Number(value);
        const maximum = key === "x" || key === "y" ? 99 : 100;
        const minimum = key === "width" || key === "height" ? 1 : 0;
        setRegion(current => ({...current, [key]: Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : minimum}));
    };
    const applyTypedRegion = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const x = canvas.width * region.x / 100;
        const y = canvas.height * region.y / 100;
        const width = canvas.width * Math.min(region.width, 100 - region.x) / 100;
        const height = canvas.height * Math.min(region.height, 100 - region.y) / 100;
        redact(canvas, x, y, width, height);
    };
    const download = () => {
        canvasRef.current?.toBlob(blob => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "solcord-scrubbed.png";
            anchor.click();
            queueMicrotask(() => URL.revokeObjectURL(url));
        }, "image/png");
    };
    return <Section title="Screenshot Scrubber" summary="Choose an image from this PC, redact by pointer or percentage fields, and download a new PNG. The image stays in this renderer and is never uploaded by Solcord.">
        <div className="solcord-scrubber-controls">
            <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose screenshot" disabled={loading} onChange={event => load(event.currentTarget.files?.[0])} />
            <label>Tool <select value={mode} onChange={event => setMode(event.currentTarget.value as "cover" | "blur")}><option value="cover">Solid cover</option><option value="blur">Blur</option></select></label>
            <ActionButton onClick={drawSource} disabled={!loaded || loading}>Reset</ActionButton>
            <ActionButton tone="accent" onClick={download} disabled={!loaded || loading}>Download PNG</ActionButton>
        </div>
        <fieldset className="solcord-region-grid" disabled={!loaded || loading}>
            <legend>Keyboard redaction region (percent)</legend>
            {(["x", "y", "width", "height"] as const).map(key => <label key={key}>{key === "x" || key === "y" ? key.toUpperCase() : key}
                <input type="number" min={key === "width" || key === "height" ? 1 : 0} max={key === "x" || key === "y" ? 99 : 100} value={region[key]} onChange={event => setRegionValue(key, event.currentTarget.value)} />
            </label>)}
            <ActionButton onClick={applyTypedRegion} disabled={!loaded}>Apply {mode}</ActionButton>
        </fieldset>
        <canvas
            ref={canvasRef}
            className={`solcord-scrubber-canvas ${loaded ? "" : "solcord-canvas-empty"}`}
            role="img"
            aria-label="Local screenshot redaction canvas"
            aria-busy={loading}
            aria-disabled={!loaded || loading}
            onPointerDown={event => {
                if (!loaded || loading) return;
                dragRef.current = point(event);
                event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerUp={event => {
                if (!loaded || loading) return;
                finish(event);
            }}
            onPointerCancel={() => {dragRef.current = null;}}
        />
        {loading && <p className="solcord-import-status" role="status">Reading and decoding the image on this PC…</p>}
        {error && <p className="solcord-error" role="alert">{error}</p>}
        {!loaded && !loading && !error && <p className="solcord-empty" role="status">No local image selected.</p>}
    </Section>;
}

function AboutSolcord() {
    return <Section title="About Solcord" summary="A private, local-first BetterDiscord fork.">
        <div className="solcord-about-grid">
            <p><strong>Why it exists.</strong> Solcord keeps the BetterDiscord plugin and theme ecosystem while tightening recovery behavior and restoring Discord Activities through a bounded same-package preload policy.</p>
            <p><strong>What it does not do.</strong> It does not grant Nitro, forge entitlements, extract tokens, backfill messages, access hidden channels, send on your behalf, send Solcord telemetry, or enable the global unrestricted preload override.</p>
            <p><strong>Privacy.</strong> Module state, snapshots, and diagnostics stay local. The private Message Timeline runs only after opt-in, is DM-only by default, and uses encrypted persistence when safeStorage is available. Sanitized diagnostics omit message content, server names, account identifiers, and absolute paths.</p>
            <p><strong>Maturity.</strong> Automated and synthetic checks can prove policy behavior; only the owner’s post-launch Codenames and second-Activity checks can complete live human acceptance.</p>
        </div>
        <p className="solcord-attribution">Based on BetterDiscord. Upstream contributors, Apache-2.0 licensing, ecosystem-compatible identifiers, and fork lineage are preserved.</p>
    </Section>;
}

function SessionPulse({openWorkspace, openSetup}: {openWorkspace(workspace: SolcordWorkspaceId): void; openSetup(): void;}) {
    const state = useStateFromStores([SolcordSettings, SolcordRuntime, PluginDoctor, PluginManager], () => ({
        document: SolcordSettings.snapshot(),
        health: SolcordRuntime.health(),
        recovery: SolcordRuntime.recoveryMode,
        quarantined: PluginDoctor.snapshot().filter(record => record.quarantinedAt).length,
        activity: SolcordRuntime.activityHealth(),
        relationshipChanges: SolcordRuntime.friendWatchEvents().length,
        dueReminders: SolcordRuntime.returnLaterItems().filter(item => item.dueAt <= Date.now()).length
    }));
    const failed = state.health.filter(item => item.status === "failed" || item.status === "quarantined").length;
    const drift = state.health.find(item => item.id === "drift-radar");
    const signals = prioritizeSolcordPulse([
        ...(state.recovery ? [{id: "recovery", priority: 100, tone: "danger" as const, label: "Safe Start is active", detail: "Optional Solcord capabilities are held off until you retry normal startup.", action: "Open recovery"}] : []),
        ...(failed || state.quarantined ? [{id: "addons", priority: 90, tone: "danger" as const, label: "Add-ons need attention", detail: `${failed} module failure(s), ${state.quarantined} quarantined add-on(s).`, action: "Review add-ons"}] : []),
        ...(state.activity?.status === "attention" ? [{id: "activity", priority: 85, tone: "attention" as const, label: "Activity Bridge needs review", detail: "The bounded compatibility ledger reported attention.", action: "Inspect Activity Bridge"}] : []),
        ...(drift?.status === "failed" || drift?.status === "quarantined" ? [{id: "drift", priority: 80, tone: "attention" as const, label: "Discord adapter drift", detail: drift.detail, action: "Open diagnostics"}] : []),
        ...(state.document.onboarding.status === "pending" ? [{id: "setup", priority: 75, tone: "attention" as const, label: "Finish setup", detail: "Your saved setup is ready to continue. Nothing has changed yet.", action: "Continue"}] : []),
        ...(state.dueReminders ? [{id: "return-later", priority: 65, tone: "attention" as const, label: "Return Later is due", detail: `${state.dueReminders} local reminder(s) are ready.`, action: "Open People"}] : []),
        ...(state.relationshipChanges ? [{id: "friend-watch", priority: 60, tone: "ok" as const, label: "Relationship history updated", detail: `${state.relationshipChanges} relationship transition(s) are available in this session.`, action: "Open People"}] : []),
        {id: "healthy", priority: 1, tone: "ok", label: "Session checks complete", detail: "Activity policy, recovery state, and local module health were read without collecting account content."}
    ]);
    return <Section title="Session Pulse" summary="What needs attention now.">
        <div className="solcord-pulse-list">{signals.map(signal => <article key={signal.id} className={`solcord-pulse solcord-pulse-${signal.tone}`}><div><strong>{signal.label}</strong><p>{signal.detail}</p></div>{signal.action && <ActionButton onClick={() => signal.id === "setup" ? openSetup() : openWorkspace(signal.id === "activity" ? "voice" : signal.id === "return-later" || signal.id === "friend-watch" ? "friends" : "recovery")}>{signal.action}</ActionButton>}</article>)}</div>
    </Section>;
}

function ProviderMigrationStatus() {
    const state = useStateFromStores([PluginManager, SolcordSettings], () => {
        const document = SolcordSettings.snapshot();
        const installed = SOLCORD_V2_REPLACEMENT_MANIFEST.entries.flatMap(entry => {
            const addon = PluginManager.resolveAddon(entry.fileName);
            return addon ? [{...entry, enabled: PluginManager.isEnabled(addon.filename) === true}] : [];
        });
        const selectedAddons = [...new Set([
            ...SOLCORD_PRESET_ADDONS.filter(name => document.curatedAddons[name]?.selected),
            ...installed.map(entry => entry.cardName).filter((name): name is typeof SOLCORD_PRESET_ADDONS[number] => SOLCORD_PRESET_ADDONS.includes(name as typeof SOLCORD_PRESET_ADDONS[number]))
        ])];
        const migrationNames = new Set(installed.map(entry => entry.cardName));
        const draft: SolcordSetupDraft = {
            preset: document.onboarding.draft?.preset ?? "recommended",
            selectedTheme: document.selectedTheme,
            selectedAddons,
            addonModes: Object.fromEntries(SOLCORD_PRESET_ADDONS.map(name => [name, document.curatedAddons[name]?.mode ?? (name === "SplitLargeMessages" ? "guarded" : "default")])),
            addonProviders: Object.fromEntries(SOLCORD_PRESET_ADDONS.map(name => [name, migrationNames.has(name) ? "prefer-solcord" : document.curatedAddons[name]?.provider ?? "prefer-community"])),
            timelinePolicy: document.timelinePolicy,
            productPreferences: document.productPreferences
        };
        return {installed, draft, latest: SolcordSettings.latestSetupTransaction()};
    });
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");
    if (!state.installed.length) return null;
    const enabled = state.installed.filter(item => item.enabled);
    const plan = SolcordRuntime.prepareProviderMigrationPlan(state.draft);
    const eligible = plan?.entries ?? [];
    const eligibleNames = new Set(eligible.map(entry => entry.name));
    const held = state.installed.filter(item => !eligibleNames.has(item.cardName));
    const apply = async (confirmedPlan: SolcordProviderMigrationPlan) => {
        const files = confirmedPlan.entries.map(entry => entry.fileName).join(", ");
        if (!window.confirm(`Replace ${confirmedPlan.entries.length} duplicate plugin provider(s)? Solcord will verify the replacements, move only these exact files to a timestamped rollback archive, and preserve their private data: ${files}`)) return;
        setBusy(true);
        setStatus("Verifying replacements and preparing the rollback archive…");
        try {
            const result = await SolcordRuntime.finishSetup(state.draft, confirmedPlan);
            setStatus(`Migration ${result.transactionId} completed. ${confirmedPlan.entries.length} exact duplicate file(s) moved to the rollback archive.`);
        }
        catch {setStatus("Migration stopped safely. A file, adapter, or sealed preview changed; existing plugin files and enabled states were restored.");}
        finally {setBusy(false);}
    };
    const rollback = async () => {
        if (!window.confirm("Restore the most recent Solcord setup and duplicate-plugin migration? Current exact addon and theme states will be replaced by the recorded rollback point.")) return;
        setBusy(true);
        setStatus("Restoring the latest rollback point…");
        try {
            const result = await SolcordRuntime.rollbackLatestSetup();
            setStatus(result.status === "complete" ? "Rollback completed and exact prior addon states were restored." : "Rollback needs attention. Open Recovery before changing plugins again.");
        }
        catch {setStatus("Rollback needs attention. Existing files were left in place; open Recovery for the bounded receipt.");}
        finally {setBusy(false);}
    };
    return <Section title="Replace duplicate plugins" summary="Optional migration with an exact backup and rollback preview.">
        <div className="solcord-provider-summary">
            <div><strong>{state.installed.length}</strong><span>duplicate files</span></div>
            <div><strong>{enabled.length}</strong><span>currently active</span></div>
            <div><strong>{eligible.length}</strong><span>ready to replace</span></div>
        </div>
        <details className="solcord-secondary-tools solcord-provider-files"><summary>Review backup and rollback plan</summary><p>{eligible.length ? eligible.map(item => item.fileName).join(", ") : "No duplicate currently has a verified replacement."}</p><small>Solcord rechecks this sealed list immediately before it acts, starts every replacement first, and moves only matching source files into a timestamped archive outside the plugin scan directory. Private databases and settings stay untouched.</small>{held.length > 0 && <p>{held.length} duplicate file(s) remain owner-managed because their replacement is off, unsupported, or still needs consent.</p>}</details>
        <div className="solcord-actions"><ActionButton tone="accent" disabled={busy || !plan || eligible.length === 0} onClick={() => plan && void apply(plan)}>{busy ? "Working…" : "Replace ready duplicates"}</ActionButton><ActionButton disabled={busy || !state.latest?.providerArchiveTransactionId} onClick={() => void rollback()}>Rollback latest migration</ActionButton></div>
        {status && <p className="solcord-setup-status" role="status" aria-live="polite">{status}</p>}
    </Section>;
}

function AppearanceWorkspace() {
    const preferences = useStateFromStores(SolcordSettings, () => SolcordSettings.snapshot().productPreferences);
    const appearance = preferences.appearance;
    const update = (next: SolcordAppearancePreferences) => void SolcordRuntime.setProductPreferences({...preferences, appearance: next});
    return <>
        <Section title="Theme and layout" summary="Theme the whole Discord shell, not only this panel.">
            <div className="solcord-appearance-controls">
                <label>Mode<select value={appearance.mode} onChange={event => update({...appearance, mode: event.currentTarget.value as SolcordAppearancePreferences["mode"]})}><option value="follow-discord">Follow Discord</option><option value="solcord-dark">Solcord Dark</option><option value="solcord-light">Solcord Light</option><option value="oled">OLED</option></select></label>
                <label>Accent<select value={appearance.accent} onChange={event => update({...appearance, accent: event.currentTarget.value as SolcordAppearancePreferences["accent"]})}><option value="system">Discord / system</option><option value="glacier">Glacier cyan</option><option value="signal">Signal amber</option><option value="coral">Coral</option><option value="forest">Forest</option></select></label>
                <label>Density<select value={appearance.density} onChange={event => update({...appearance, density: event.currentTarget.value as SolcordAppearancePreferences["density"]})}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
                <label>Motion<select value={appearance.motion} onChange={event => update({...appearance, motion: event.currentTarget.value as SolcordAppearancePreferences["motion"]})}><option value="follow-system">Use performance profile</option><option value="full">Full</option><option value="subtle">Subtle</option><option value="reduced">Reduced</option></select></label>
                <label>Message shape<select value={appearance.messageShape} onChange={event => update({...appearance, messageShape: event.currentTarget.value as SolcordAppearancePreferences["messageShape"]})}><option value="discord">Discord default</option><option value="seamed">Quiet 1px seams</option></select></label>
            </div>
            <div className={`solcord-live-preview solcord-mode-${appearance.mode} solcord-accent-${appearance.accent}`}><span>Appearance preview</span><strong>Reply context stays readable at every density.</strong><small>Focus, warning, success, and danger keep distinct semantic colors.</small><button type="button">Keyboard focus sample</button></div>
        </Section>
        <AccessibilityControls />
    </>;
}

function FriendWatchPanel() {
    const state = useStateFromStores([SolcordSettings, SolcordRuntime], () => ({preferences: SolcordSettings.snapshot().productPreferences, events: SolcordRuntime.friendWatchEvents(), persistent: SolcordRuntime.friendWatchPersistent()}));
    const policy = state.preferences.friendWatch;
    const storageDescription = !policy.enabled
        ? "unopened while Friend Watch is off. Enabling negotiates encrypted account-isolated storage and otherwise fails closed to session-only memory."
        : state.persistent
            ? "AES-256-GCM account-isolated persistence; its random key is wrapped by Electron safeStorage."
            : "session-only fallback; no plaintext persistence.";
    const update = (next: Partial<typeof policy>) => {
        const productPreferences: SolcordProductPreferences = {...state.preferences, friendWatch: {...policy, ...next}};
        void SolcordRuntime.setProductPreferences(productPreferences).then(() => SolcordRuntime.setEnabled("friend-watch", productPreferences.friendWatch.enabled));
    };
    return <Section title="Friend Watch" summary="Optional local history for relationship changes already seen by Discord.">
        <div className="solcord-setting-list">
            <label className="solcord-setting-row"><span><strong>Keep relationship history</strong><small>Off by default. Records only relationship changes already loaded in this client.</small></span><span className="solcord-switch"><input type="checkbox" checked={policy.enabled} onChange={event => update({enabled: event.currentTarget.checked})} /><i aria-hidden="true" /></span></label>
            <p className="solcord-privacy-summary">Storage is {storageDescription} Disabling it or changing accounts clears renderer memory.</p>
            {policy.enabled && <>
                <label className="solcord-setting-row"><span><strong>Display snapshots</strong><small>Keep the already-loaded display name in encrypted history.</small></span><span className="solcord-switch"><input type="checkbox" checked={policy.includeDisplaySnapshot} onChange={event => update({includeDisplaySnapshot: event.currentTarget.checked})} /><i aria-hidden="true" /></span></label>
                <label className="solcord-setting-row"><span><strong>Retention</strong><small>Older entries are removed automatically.</small></span><select value={policy.retentionDays} onChange={event => update({retentionDays: Number(event.currentTarget.value) as 7 | 30 | 90})}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label>
                <label className="solcord-setting-row"><span><strong>Notifications</strong><small>Local summaries only.</small></span><select value={policy.digest} onChange={event => update({digest: event.currentTarget.value as typeof policy.digest})}><option value="off">Off</option><option value="daily">Daily</option><option value="per-event">Per event</option></select></label>
            </>}
        </div>
        <div className="solcord-actions"><ActionButton disabled={!state.events.length} onClick={() => void SolcordRuntime.exportFriendWatch("json")}>Export JSON</ActionButton><ActionButton disabled={!state.events.length} onClick={() => void SolcordRuntime.exportFriendWatch("csv")}>Export CSV</ActionButton><ActionButton tone="danger" disabled={!state.events.length} onClick={() => {if (window.confirm("Clear this account's local Friend Watch history?")) void SolcordRuntime.clearFriendWatch();}}>Clear history</ActionButton></div>
        <div className="solcord-people-history" aria-label="Friend Watch relationship history">{state.events.slice(-100).reverse().map(event => <article key={event.eventId}><div><strong>{event.transition === "reconciled" ? "Account scope" : event.displayLabel ?? `Local relationship •${(event.subjectKey ?? event.subjectId).slice(-4)}`}</strong><span>{event.label}</span></div><small>{timestamp(event.observedAt)} · {event.source} · {event.confidence}</small></article>)}{!state.events.length && <p className="solcord-empty">No relationship transition has been observed in this session.</p>}</div>
    </Section>;
}

function ReturnLaterPanel() {
    const items = useStateFromStores(SolcordRuntime, () => SolcordRuntime.returnLaterItems());
    const [label, setLabel] = useState("");
    const [delay, setDelay] = useState(24 * 60 * 60 * 1_000);
    const [status, setStatus] = useState("");
    const add = () => {
        const added = SolcordRuntime.addCurrentViewToReturnLater(label, Date.now() + delay);
        setStatus(added ? "Saved for this account session. It clears on account switch or Discord restart." : "Open a DM or channel, then use Return Later from that view. No reminder was saved from Settings.");
        if (added) setLabel("");
    };
    return <Section title="Return Later" summary="Keep a session-only reminder for the channel or DM you are viewing.">
        <div className="solcord-inline-field">
            <input value={label} maxLength={80} placeholder="Optional private label" aria-label="Return Later label" onChange={event => setLabel(event.currentTarget.value)} />
            <select aria-label="Return Later due time" value={delay} onChange={event => setDelay(Number(event.currentTarget.value))}><option value={60 * 60 * 1_000}>In one hour</option><option value={24 * 60 * 60 * 1_000}>Tomorrow</option><option value={7 * 24 * 60 * 60 * 1_000}>In seven days</option></select>
            <ActionButton tone="accent" onClick={add}>Save current view</ActionButton>
        </div>
        {status && <p role="status" className="solcord-import-status">{status}</p>}
        <p className="solcord-key-hint">Routes and labels stay only in memory for the current Discord account and clear on account switch or restart.</p>
        <div className="solcord-people-history" aria-label="Return Later reminders">{items.map(item => <article key={item.id}><div><strong>{item.label}</strong><span>Due {timestamp(item.dueAt)}</span></div><div className="solcord-actions"><ActionButton onClick={() => SolcordRuntime.openReturnLater(item.id)}>Open</ActionButton><ActionButton onClick={() => SolcordRuntime.snoozeReturnLater(item.id, 24 * 60 * 60 * 1_000)}>Snooze one day</ActionButton><ActionButton onClick={() => SolcordRuntime.completeReturnLater(item.id)}>Complete</ActionButton></div></article>)}{!items.length && <p className="solcord-empty">No session reminder is due. Open a DM or channel and save that view when you want to return.</p>}</div>
    </Section>;
}

function SetupManagement({openSetup}: {openSetup: () => void}) {
    const document = useStateFromStores(SolcordSettings, () => SolcordSettings.snapshot());
    const [status, setStatus] = useState("");
    if (document.onboarding.status === "pending") return null;
    return <section className="solcord-setup-management" aria-label="Solcord setup management">
        <div><strong>Setup {document.onboarding.status}</strong><span>{document.onboarding.completedAt ? ` · ${timestamp(document.onboarding.completedAt)}` : ""}</span><p>Reopen the complete preview or roll back the latest staged setup transaction.</p></div>
        <div className="solcord-actions"><ActionButton onClick={openSetup}>Reopen setup</ActionButton><ActionButton tone="danger" disabled={!document.setupTransactions.length} onClick={() => {
            if (!window.confirm("Roll back the latest Solcord setup transaction? Files added by that transaction are removed only when their hashes are unchanged, and previous enabled states are restored.")) return;
            void SolcordRuntime.rollbackLatestSetup().then(result => setStatus({
                complete: `Latest setup transaction rolled back; ${result.removed} unchanged staged file(s) were removed and none were preserved.`,
                partial: `Rollback is incomplete: ${result.removed} unchanged file(s) removed and ${result.preserved} locally changed file(s) preserved, or an addon state remained held.`,
                unavailable: "No complete setup transaction was available to roll back.",
                failed: "Rollback could not be confirmed. No locally changed file was overwritten; review Plugin Doctor and the setup journal."
            }[result.status])).catch(() => setStatus("Rollback failed closed before completion. Review Plugin Doctor and the setup journal."));
        }}>Roll back latest setup</ActionButton></div>
        {status && <p role="status">{status}</p>}
    </section>;
}

function PowerLabStatus() {
    const state = useStateFromStores([SolcordSettings, SolcordRuntime], () => ({
        consent: SolcordSettings.snapshot().powerLab["fake-deafen"],
        status: SolcordRuntime.fakeDeafenStatus(),
        provider: SolcordRuntime.fakeDeafenProvider()
    }));
    const [actionStatus, setActionStatus] = useState("");
    const toggleFakeDeafen = (enabled: boolean) => {
        if (enabled && !window.confirm("Enable the Fake Deafen experiment? It intentionally makes your server-visible voice state differ from your local audio state. Discord can change this behavior at any time. The adapter stays unarmed until you separately arm it in a voice channel.")) return;
        void SolcordRuntime.setPowerExperiment("fake-deafen", enabled, enabled).then(succeeded => {
            const status = SolcordRuntime.fakeDeafenStatus();
            setActionStatus(status.phase === "attention"
                ? status.detail
                : succeeded
                    ? (enabled ? "Adapter enabled but not armed." : "Adapter disabled and its scoped patch removed.")
                    : "The adapter failed closed.");
        });
    };
    const arm = () => {
        if (!window.confirm("Arm Fake Deafen for the current voice connection? First use Discord's normal Deafen control once. Arming restores local audio while keeping server-visible self-deafen on until you disarm, change channels, disconnect, or the adapter detects drift.")) return;
        setActionStatus(SolcordRuntime.armFakeDeafen() ? "Fake Deafen is armed for this voice connection." : SolcordRuntime.fakeDeafenStatus().detail);
    };
    const disarm = () => setActionStatus(SolcordRuntime.disarmFakeDeafen() ? "Fake Deafen disarmed and server-visible state was resynchronized." : SolcordRuntime.fakeDeafenStatus().detail);
    const experiment = SOLCORD_POWER_LAB.find(candidate => candidate.id === "fake-deafen")!;
    const communityProvider = state.provider === "community";
    return <Section title="Fake Deafen" summary="Manual, call-bound, and off by default.">
        <div className="solcord-power-control"><div><div className="solcord-module-name"><strong>{experiment.name}</strong><span className="solcord-maturity">account risk · manual</span><span className={`solcord-status solcord-status-${communityProvider || state.status.phase === "armed" ? "active" : state.status.phase === "attention" ? "failed" : "starting"}`}>{communityProvider ? "community plugin active" : state.status.phase}</span></div><p>{communityProvider ? "Solcord leaves it untouched and keeps the built-in off so the two providers never stack." : state.status.detail}</p></div><label className="solcord-toggle"><input type="checkbox" aria-label="Enable Solcord Fake Deafen" checked={state.consent.enabled} disabled={communityProvider} onChange={event => toggleFakeDeafen(event.currentTarget.checked)} /><span>{communityProvider ? "Plugin on" : state.consent.enabled ? "Built-in on" : "Off"}</span></label></div>
        {state.consent.enabled && !communityProvider && <div className="solcord-actions">{state.status.armed ? <ActionButton tone="danger" onClick={disarm}>Disarm and resync</ActionButton> : <ActionButton onClick={arm}>Arm for this call</ActionButton>}</div>}
        <details className="solcord-secondary-tools"><summary>Risk and automatic disarm rules</summary><p>{experiment.summary} Solcord disarms on disconnect, channel change, account change, adapter drift, recovery mode, or module disable.</p></details>
        {actionStatus && <p role="status" className="solcord-import-status">{actionStatus}</p>}
    </Section>;
}

function scrollSolcordTarget(target: HTMLElement | null): void {
    if (!target) return;
    let scrollOwner: HTMLElement | null = target.parentElement;
    while (scrollOwner) {
        const overflowY = getComputedStyle(scrollOwner).overflowY;
        if (/auto|scroll|overlay/.test(overflowY) && scrollOwner.scrollHeight > scrollOwner.clientHeight) break;
        scrollOwner = scrollOwner.parentElement;
    }
    if (!scrollOwner) {
        target.scrollIntoView({block: "start"});
        return;
    }
    const navigation = target.closest(".solcord-control-center")?.querySelector<HTMLElement>(".solcord-workspace-nav");
    const stickyOffset = navigation && getComputedStyle(navigation).position === "sticky"
        ? navigation.getBoundingClientRect().height + 8
        : 0;
    const targetOffset = target.getBoundingClientRect().top - scrollOwner.getBoundingClientRect().top;
    scrollOwner.scrollTo({top: Math.max(0, scrollOwner.scrollTop + targetOffset - stickyOffset), behavior: "auto"});
}

export default function SolcordPanel() {
    const recoveryMode = useStateFromStores(SolcordRuntime, () => SolcordRuntime.recoveryMode);
    const onboarding = useStateFromStores(SolcordSettings, () => SolcordSettings.snapshot().onboarding);
    const productPreferences = useStateFromStores(SolcordSettings, () => SolcordSettings.snapshot().productPreferences);
    const appearance = productPreferences.appearance;
    const [workspace, setWorkspace] = useState<SolcordWorkspaceId>("overview");
    const [workspaceQuery, setWorkspaceQuery] = useState("");
    const [workspaceFocus, setWorkspaceFocus] = useState<"catalog" | "setup">();
    const workspaceRef = useRef<HTMLDivElement | null>(null);
    const selectedWorkspace = SOLCORD_WORKSPACES.find(item => item.id === workspace)!;
    const visibleWorkspaces = SOLCORD_WORKSPACES.filter(item => `${item.label} ${item.summary}`.toLowerCase().includes(workspaceQuery.trim().toLowerCase()));
    useEffect(() => {
        const focusCatalog = workspace === "extensions" && workspaceFocus === "catalog";
        const focusSetup = workspace === "overview" && workspaceFocus === "setup";
        if (!focusCatalog && !focusSetup) return;
        const frame = requestAnimationFrame(() => {
            const target = focusCatalog
                ? document.querySelector<HTMLElement>(".solcord-catalog-table")?.closest<HTMLElement>(".solcord-section")
                : document.querySelector<HTMLElement>(".solcord-wizard");
            scrollSolcordTarget(target ?? null);
            target?.querySelector<HTMLElement>("input, select, button, [href]")?.focus({preventScroll: true});
            setWorkspaceFocus(undefined);
        });
        return () => cancelAnimationFrame(frame);
    }, [workspace, workspaceFocus]);
    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            scrollSolcordTarget(workspaceRef.current);
            workspaceRef.current?.querySelector<HTMLElement>(".solcord-workspace-heading h2")?.focus({preventScroll: true});
        });
        return () => cancelAnimationFrame(frame);
    }, [onboarding.status, workspace]);
    const openSetup = () => {
        if (SolcordSettings.snapshot().onboarding.status !== "pending") SolcordSettings.reopenOnboarding();
        setWorkspaceFocus("setup");
        setWorkspace("overview");
    };
    return <main className={`solcord-panel solcord-density-${appearance.density} solcord-motion-${appearance.motion}`}>
        <header className="solcord-header">
            <div className="solcord-mark" aria-hidden="true"><img src={solcordMark} alt="" /></div>
            <div><h1>Solcord</h1><p>Control Center</p></div>
        </header>
        {recoveryMode && <div className="solcord-recovery-banner" role="alert">
            <div><strong>Startup recovery mode is active.</strong><p>Only Plugin Doctor loaded after three interrupted starts within ten minutes. Nothing will be re-enabled silently.</p></div>
            <ActionButton tone="danger" onClick={() => void SolcordRuntime.leaveRecoveryMode()}>Try normal startup</ActionButton>
        </div>}
        <div className="solcord-control-center">
            <nav className="solcord-workspace-nav" aria-label="Solcord settings">
                <label className="solcord-workspace-search"><span className="sr-only">Filter Solcord settings</span><input type="search" value={workspaceQuery} placeholder="Find a setting" onChange={event => setWorkspaceQuery(event.currentTarget.value)} /></label>
                <div className="solcord-workspace-nav-list">{WORKSPACE_GROUPS.map(group => {
                    const items = visibleWorkspaces.filter(item => group.ids.includes(item.id));
                    return items.length ? <section key={group.label} aria-label={group.label}><p>{group.label}</p>{items.map(item => <button key={item.id} type="button" aria-current={workspace === item.id ? "page" : undefined} onClick={() => setWorkspace(item.id)}><strong>{item.label}</strong></button>)}</section> : null;
                })}{!visibleWorkspaces.length && <p className="solcord-nav-empty">No matching setting</p>}</div>
                <label className="solcord-workspace-switcher"><span>Section</span><select value={workspace} onChange={event => setWorkspace(event.currentTarget.value as SolcordWorkspaceId)}>{visibleWorkspaces.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            </nav>
            <div ref={workspaceRef} className="solcord-workspace" data-workspace={workspace}>
                {workspace === "overview" && onboarding.status === "pending" ? <SetupWizard /> : <>
                <header className="solcord-workspace-heading"><h2 tabIndex={-1}>{selectedWorkspace.label}</h2><p>{selectedWorkspace.summary}</p></header>
                {workspace === "overview" && <>
                    {onboarding.status === "skipped" && <div className="solcord-setup-reminder"><span><strong>Setup is saved for later.</strong><small>Nothing changed. Resume whenever you are ready.</small></span><ActionButton onClick={openSetup}>Resume</ActionButton></div>}
                    <SessionPulse openWorkspace={setWorkspace} openSetup={openSetup} />
                    <ActivityBridge />
                </>}
                {workspace === "appearance" && <AppearanceWorkspace />}
                {workspace === "performance" && <><PerformanceProfileControls /><PerformanceControls /></>}
                {workspace === "privacy" && <><PrivacyProtectionPanel /><StreamShieldControls /><LinkWorkbench />{productPreferences.safety.attachmentGuard && <AttachmentGuardWorkbench />}<ScreenshotScrubber /><MessageTimelinePanel /></>}
                {workspace === "chat" && <><BaselineToolsPanel /><NativeSuitePanel scope="chat" /><ReturnLaterPanel /></>}
                {workspace === "voice" && <><ActivityBridge /><NativeSuitePanel scope="voice" /><StreamAudienceGuardControls /><details className="solcord-experimental"><summary>Experimental</summary><PowerLabStatus /></details></>}
                {workspace === "friends" && <><FriendWatchPanel /><NativeSuitePanel scope="friends" /><ReturnLaterPanel /></>}
                {workspace === "extensions" && <>
                    <ProviderMigrationStatus />
                    <div className="solcord-all-clear"><strong>Built-ins live with their features</strong><span>Message, voice, privacy, and people tools are managed in the matching workspace.</span></div>
                    <details className="solcord-extension-disclosure"><summary>Community software and technical state</summary><p>Open this only when troubleshooting a module or reviewing optional community software.</p><NativeSuitePanel scope="status" /><Section title="Core runtime" summary="Lifecycle and owned-resource details."><ModuleTable /></Section><CuratedAddonSet /><CatalogBrowser /></details>
                </>}
                {workspace === "recovery" && <><SetupManagement openSetup={openSetup} /><PluginRecovery /><ProfilesAndHistory /><details className="solcord-secondary-tools"><summary>About and technical information</summary><AboutSolcord /></details></>}
                </>}
            </div>
        </div>
    </main>;
}
