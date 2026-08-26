import React from "react";
import soulCordMark from "@assets/branding/soulcord-mark.svg";

import {useStateFromStores} from "@ui/hooks";
import SoulCordRuntime from "@modules/soulcord/runtime";
import SoulCordSettings from "@modules/soulcord/store";
import PluginDoctor from "@modules/soulcord/doctor";
import type {SoulCordModuleId} from "@modules/soulcord/contracts";
import type {LinkInspection} from "@modules/soulcord/link-lens";

import SetupWizard from "./setup-wizard";
import MessageTimelinePanel from "./timeline";
import {CatalogBrowser, CuratedAddonSet} from "./addon-catalog";
import {SOULCORD_POWER_LAB} from "./catalog";
import {prioritizeSoulCordPulse, SOULCORD_WORKSPACES, type SoulCordAppearancePreferences, type SoulCordProductPreferences, type SoulCordWorkspaceId} from "@common/soulcord/product";
import {isSoulCordBuiltInAddon} from "@common/soulcord/builtin-addons";

const {useEffect, useRef, useState} = React;

function timestamp(value?: number | string): string {
    if (!value) return "never";
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? "unknown" : date.toLocaleString();
}

function Section({title, summary, children}: {title: string; summary: string; children: React.ReactNode;}) {
    return <section className="soulcord-section">
        <div className="soulcord-section-heading">
            <h2>{title}</h2>
            <p>{summary}</p>
        </div>
        {children}
    </section>;
}

function ActionButton({children, onClick, tone = "neutral", disabled = false}: {children: React.ReactNode; onClick(): void; tone?: "neutral" | "accent" | "danger"; disabled?: boolean;}) {
    return <button type="button" className={`soulcord-action soulcord-action-${tone}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

function ModuleTable() {
    const state = useStateFromStores([SoulCordSettings, SoulCordRuntime], () => ({settings: SoulCordSettings.snapshot(), health: SoulCordRuntime.health()}));
    return <div className="soulcord-module-table" role="table" aria-label="SoulCord module status">
        {state.health.length ? state.health.map(health => {
            const module = state.settings.modules[health.id];
            return <div className="soulcord-module-row" role="row" key={health.id}>
                <div className="soulcord-module-primary" role="cell">
                    <div className="soulcord-module-name">
                        <strong>{health.name}</strong>
                        <span className={`soulcord-status soulcord-status-${health.status}`}>{health.status}</span>
                        <span className="soulcord-maturity">{health.maturity}</span>
                    </div>
                    <p>{health.detail}</p>
                    <small>{health.startupDurationMs === undefined ? "Not timed" : `${health.startupDurationMs} ms startup`} · {Object.values(health.resources).reduce((sum, value) => sum + value, 0)} owned resources</small>
                </div>
                <label className="soulcord-toggle" role="cell">
                    <input
                        type="checkbox"
                        checked={module.enabled}
                        disabled={health.id === "plugin-doctor"}
                        onChange={event => void SoulCordRuntime.setEnabled(health.id, event.currentTarget.checked)}
                    />
                    <span>{module.enabled ? "On" : "Off"}</span>
                </label>
            </div>;
        }) : <p className="soulcord-empty" role="status">Module health will appear after SoulCord finishes starting.</p>}
    </div>;
}

function ActivityBridge() {
    const activity = useStateFromStores(SoulCordRuntime, () => SoulCordRuntime.activityHealth());
    const events = activity?.events.slice(-8).reverse() ?? [];
    return <Section title="Activity Bridge" summary="SoulCord keeps the unrestricted override off. It accepts one later Discord-owned preload only after the file resolves inside the same installed Discord package.">
        <div className="soulcord-split">
            <div>
                <dl className="soulcord-facts">
                    <div><dt>Policy</dt><dd>{activity?.status ?? "waiting"}</dd></div>
                    <div><dt>Accepted late assignments</dt><dd>{activity?.counters?.discordPreloadsAccepted ?? 0}</dd></div>
                    <div><dt>Rejected assignments</dt><dd>{activity?.counters?.assignmentsRejected ?? 0}</dd></div>
                    <div><dt>Unrestricted override</dt><dd>{activity?.unrestrictedOverride ? "On — disable before testing" : "Off"}</dd></div>
                </dl>
                <div className="soulcord-actions">
                    <ActionButton tone="accent" onClick={() => SoulCordRuntime.exportDiagnostics()}>Export sanitized diagnostics</ActionButton>
                </div>
            </div>
            <div className="soulcord-ledger" aria-label="Recent Activity Bridge events">
                {events.length ? events.map(event => <div key={event.sequence} className="soulcord-ledger-row">
                    <time>{timestamp(event.timestamp)}</time>
                    <strong>{event.action}</strong>
                    <span>{event.context}{event.reason ? ` · ${event.reason}` : ""}</span>
                </div>) : <p className="soulcord-empty">No Activity window decision has been observed in this session.</p>}
            </div>
        </div>
    </Section>;
}

function PluginRecovery() {
    const state = useStateFromStores([PluginDoctor, SoulCordRuntime, SoulCordSettings], () => ({records: PluginDoctor.snapshot(), integrity: SoulCordRuntime.integrityStatus(), curated: SoulCordSettings.snapshot().curatedAddons}));
    const [retrying, setRetrying] = useState<string>();
    const [retryStatus, setRetryStatus] = useState("");
    const quarantined = state.records.filter(record => record.quarantinedAt);
    const visibleIntegrity = state.integrity.records.filter(record => record.status !== "match" && record.status !== "missing").slice(0, 12);
    const requestedUnavailable = state.integrity.records.filter(record => record.kind === "addon" && record.status === "missing" && state.curated[record.name]?.selected && !isSoulCordBuiltInAddon(record.name, state.curated[record.name]?.mode));
    const retry = async (id: string) => {
        setRetrying(id);
        const succeeded = await SoulCordRuntime.retryQuarantinedAddon(id);
        setRetryStatus(succeeded ? `${id} passed a fresh integrity audit and started.` : `${id} stayed quarantined because integrity or startup validation did not pass.`);
        setRetrying(undefined);
    };
    return <Section title="Plugin Doctor" summary="Failures are recorded as time, phase, and error class only. Three failures in ten minutes quarantine the addon until you explicitly retry it.">
        <dl className="soulcord-facts"><div><dt>Hash verified</dt><dd>{state.integrity.summary.match}</dd></div><div><dt>Optional catalog files absent</dt><dd>{state.integrity.summary.missing}</dd></div><div><dt>Integrity attention</dt><dd>{state.integrity.summary.attention}</dd></div><div><dt>Audit unavailable</dt><dd>{state.integrity.summary.unavailable}</dd></div></dl>
        {requestedUnavailable.length > 0 && <p className="soulcord-callout"><strong>{requestedUnavailable.length} saved catalog request(s) are not installed.</strong> They remain optional and off because their review or dependency gate is incomplete. SoulCord built-ins do not require community plugin files.</p>}
        {quarantined.length ? <div className="soulcord-recovery-list">
            {quarantined.map(record => <div className="soulcord-recovery-row" key={record.addonId}>
                <div><strong>{record.addonId}</strong><p>{record.quarantineReason}</p><small>Quarantined {timestamp(record.quarantinedAt)}</small></div>
                <ActionButton tone="danger" disabled={retrying === record.addonId} onClick={() => void retry(record.addonId)}>{retrying === record.addonId ? "Checking…" : "Retry once"}</ActionButton>
            </div>)}
        </div> : <p className="soulcord-empty">No addon is quarantined.</p>}
        {retryStatus && <p role="status" className="soulcord-import-status">{retryStatus}</p>}
        {visibleIntegrity.length ? <div className="soulcord-ledger" aria-label="Curated addon integrity status">
            {visibleIntegrity.map(record => <div className="soulcord-ledger-row" key={`${record.kind}-${record.name}`}><strong>{record.name}</strong><span>{record.kind} · {record.status}</span><code>{record.reviewedSha256.slice(0, 12)}…{record.installedSha256 ? ` / ${record.installedSha256.slice(0, 12)}…` : ""}</code></div>)}
            {state.integrity.records.filter(record => record.status !== "match" && record.status !== "missing").length > visibleIntegrity.length && <p className="soulcord-empty">Showing the first {visibleIntegrity.length} path-free attention records. Sanitized diagnostics contain the complete bounded status list.</p>}
        </div> : <p className="soulcord-empty">Every reviewed installed file matches its pinned hash.</p>}
    </Section>;
}

function ProfilesAndHistory() {
    const document = useStateFromStores(SoulCordSettings, () => SoulCordSettings.snapshot());
    const [profileId, setProfileId] = useState(document.profiles[0]?.id ?? "");
    const [newName, setNewName] = useState("");
    const [includeThirdParty, setIncludeThirdParty] = useState(false);
    const [importStatus, setImportStatus] = useState("");
    const diff = profileId ? SoulCordRuntime.previewProfile(profileId) : [];
    const selected = document.profiles.find(profile => profile.id === profileId);
    const apply = async () => {
        if (!selected) return;
        if (!window.confirm(`Apply ${selected.name}? SoulCord will snapshot the current state first and then apply the complete preview shown here.`)) return;
        const executionPlan = SoulCordRuntime.profileAddonExecutionPlan(selected.id);
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
        const applied = await SoulCordRuntime.applyProfile(selected.id, executionPlan);
        setImportStatus(applied ? `${selected.name} applied with a rollback snapshot.` : `${selected.name} was not fully applied. SoulCord attempted recovery; review the current addon and module states before retrying.`);
    };
    const save = () => {
        try {
            if (includeThirdParty && !window.confirm("Save the complete currently enabled BetterDiscord plugin and theme set in this profile? Applying it later can execute or stop third-party code. The file names will appear in settings exports.")) return;
            const profile = SoulCordRuntime.saveProfile(newName, includeThirdParty);
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
            const importPreview = SoulCordRuntime.previewSettingsImport(text);
            if (!importPreview) {
                setImportStatus("Choose an unmodified SoulCord settings export.");
                return;
            }
            const {changes, fingerprint} = importPreview;
            const preview = changes.length ? changes.map(change => `• ${change}`).join("\n") : "No settings differences.";
            if (!window.confirm(`Import this validated SoulCord settings file? The current state will be snapshotted first.\n\nComplete preview:\n${preview}`)) {
                setImportStatus("Import cancelled; no settings changed.");
                return;
            }
            const imported = await SoulCordRuntime.importSettings(text, fingerprint);
            setImportStatus(imported ? "Settings imported. A rollback snapshot was kept." : "Import changed after preview or failed validation; no settings changed.");
        }
        catch {
            setImportStatus("The settings file could not be read locally.");
        }
    };
    return <Section title="Profiles and Time Machine" summary="Profiles save SoulCord module settings and, only when selected, exact plugin/theme states. They do not capture Timeline policy or curated-addon choices. Every apply keeps a bounded rollback snapshot.">
        <div className="soulcord-split">
            <div>
                <label className="soulcord-field">Profile
                    <select value={profileId} onChange={event => setProfileId(event.currentTarget.value)}>
                        {document.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                    </select>
                </label>
                <div className="soulcord-diff" aria-label="Profile change preview">
                    <strong>Complete preview</strong>
                    {diff.length ? <ul>{diff.map(item => <li key={item}>{item}</li>)}</ul> : <p>No module-setting differences.</p>}
                </div>
                <div className="soulcord-actions">
                    <ActionButton tone="accent" onClick={() => void apply()} disabled={!selected}>Apply with snapshot</ActionButton>
                    <ActionButton onClick={() => SoulCordRuntime.exportSettings()}>Export settings</ActionButton>
                </div>
                <label className="soulcord-file-import">Import settings JSON
                    <input type="file" accept="application/json,.json" onChange={event => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        void importFile(file);
                    }} />
                </label>
                <div className="soulcord-inline-field">
                    <input value={newName} maxLength={80} placeholder="Custom profile name" aria-label="Custom profile name" onChange={event => setNewName(event.currentTarget.value)} />
                    <ActionButton onClick={save} disabled={!newName.trim()}>Save module state</ActionButton>
                </div>
                <label className="soulcord-profile-addon-optin"><input type="checkbox" checked={includeThirdParty} onChange={event => setIncludeThirdParty(event.currentTarget.checked)} /> Include the complete currently enabled BetterDiscord plugin/theme set (executes third-party code when applied)</label>
                {importStatus && <p className="soulcord-import-status" role="status">{importStatus}</p>}
            </div>
            <div>
                <strong>Recent snapshots</strong>
                <div className="soulcord-snapshot-list">
                    {document.snapshots.slice(-6).reverse().map(snapshot => <div key={snapshot.id} className="soulcord-snapshot-row">
                        <div><span>{snapshot.reason}</span><small>{timestamp(snapshot.createdAt)}</small></div>
                        <ActionButton onClick={() => {
                            if (!window.confirm(`Roll back to “${snapshot.reason}”? A snapshot of the current state will be kept.`)) return;
                            void SoulCordRuntime.rollback(snapshot.id).then(restored => setImportStatus(restored
                                ? `Rolled back to “${snapshot.reason}”.`
                                : "The settings snapshot was restored, but one or more addon states remained held or failed to change. Review Plugin Doctor before retrying."));
                        }}>Roll back</ActionButton>
                    </div>)}
                    {!document.snapshots.length && <p className="soulcord-empty">No snapshot has been captured yet.</p>}
                </div>
            </div>
        </div>
    </Section>;
}

function StreamShieldControls() {
    const document = useStateFromStores(SoulCordSettings, () => SoulCordSettings.snapshot());
    const shield = document.modules["stream-shield"].values;
    const setting = (id: SoulCordModuleId, key: string, value: unknown) => void SoulCordRuntime.setValue(id, key, value);
    return <Section title="Privacy Mode" summary="Preview or apply reversible local redaction before you share a screen. This does not start a stream, upload a file, or change account state.">
        <div className="soulcord-control-grid">
            <label><input type="checkbox" checked={shield.previewActive === true} onChange={event => setting("stream-shield", "previewActive", event.currentTarget.checked)} /> Stream Shield preview</label>
            <label><input type="checkbox" checked={shield.manualActive === true} onChange={event => setting("stream-shield", "manualActive", event.currentTarget.checked)} /> Stream Shield manual state</label>
            <label><input type="checkbox" checked={shield.redactGuilds === true} onChange={event => setting("stream-shield", "redactGuilds", event.currentTarget.checked)} /> Redact guild identity</label>
            <label><input type="checkbox" checked={shield.redactChannels === true} onChange={event => setting("stream-shield", "redactChannels", event.currentTarget.checked)} /> Redact channel names</label>
            <label><input type="checkbox" checked={shield.redactDMs === true} onChange={event => setting("stream-shield", "redactDMs", event.currentTarget.checked)} /> Redact DM identity</label>
            <label><input type="checkbox" checked={shield.redactNotifications === true} onChange={event => setting("stream-shield", "redactNotifications", event.currentTarget.checked)} /> Redact notifications</label>
            <label><input type="checkbox" checked={shield.redactNotes === true} onChange={event => setting("stream-shield", "redactNotes", event.currentTarget.checked)} /> Redact local notes</label>
            <label><input type="checkbox" checked={shield.redactAccount === true} onChange={event => setting("stream-shield", "redactAccount", event.currentTarget.checked)} /> Redact account area</label>
        </div>
        <p className="soulcord-key-hint"><kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> toggles Privacy Mode when Stream Shield is enabled.</p>
    </Section>;
}

function StreamAudienceGuardControls() {
    const state = useStateFromStores([SoulCordSettings, SoulCordRuntime], () => ({
        settings: SoulCordSettings.snapshot().modules["stream-audience-guard"],
        runtime: SoulCordRuntime.audienceGuardStatus(),
        privateState: SoulCordRuntime.audienceGuardPrivatePolicy()
    }));
    const [userId, setUserId] = useState("");
    const [label, setLabel] = useState("");
    const [actionStatus, setActionStatus] = useState("");
    const setMode = (key: "preventStart" | "stopOnJoin" | "stopOnWatch", value: boolean) => {
        if (key === "stopOnWatch" && value && !window.confirm("Enable Stop on Watch? A denied viewer may receive brief frames before Discord reports them. This is detection and rapid stopping, not per-viewer stream access control.")) return;
        void SoulCordRuntime.setValue("stream-audience-guard", key, value);
    };
    const add = async () => {
        const normalizedId = userId.trim();
        if (!/^\d{1,32}$/.test(normalizedId)) {
            setActionStatus("Enter a Discord user ID containing digits only.");
            return;
        }
        const complete = await SoulCordRuntime.setAudienceGuardEntries([...state.privateState.policy.entries, {userId: normalizedId, label: label.trim()}]);
        setActionStatus(complete ? "Denied user saved to this account's private policy." : "The private policy is available for this session, but encrypted persistence could not be confirmed.");
        setUserId("");
        setLabel("");
    };
    const arm = () => {
        if (!window.confirm("Arm Stream Audience Guard for the current voice call? SoulCord will prevent or stop your own Go Live when a denied user is detected. This cannot make a normal Discord stream invisible to one person or guarantee zero-frame exposure.")) return;
        setActionStatus(SoulCordRuntime.armAudienceGuard() ? "Audience Guard is armed for this call." : "Audience Guard could not arm. Join a voice channel, add a denied user, enable at least one mode, and confirm the adapter is available.");
    };
    const entries = state.privateState.policy.entries;
    return <Section title="Stream Audience Guard" summary="Prevent or stop your own Go Live when a denied user is detected. This is a truthful client-side guard, not a per-person stream permission.">
        <div className="soulcord-audience-command">
            <div>
                <p className="soulcord-eyebrow">Call-bound protection</p>
                <strong>Your stream will not start or continue while a denied user is detected in the current call or viewer list.</strong>
                <p>Only native private-channel permissions are server-enforced. Stop on Watch cannot rule out brief frame exposure.</p>
            </div>
            <span className={`soulcord-status soulcord-status-${state.runtime.phase === "armed" ? "active" : state.runtime.phase === "attention" || state.runtime.phase === "unavailable" ? "failed" : "starting"}`}>{state.runtime.phase}</span>
        </div>
        <div className="soulcord-control-grid">
            <label><input type="checkbox" checked={state.settings.enabled} onChange={event => void SoulCordRuntime.setEnabled("stream-audience-guard", event.currentTarget.checked)} /> Enable validated adapter</label>
            <label><input type="checkbox" checked={state.settings.values.preventStart === true} disabled={!state.settings.enabled || state.runtime.armed} onChange={event => setMode("preventStart", event.currentTarget.checked)} /> Prevent Start</label>
            <label><input type="checkbox" checked={state.settings.values.stopOnJoin === true} disabled={!state.settings.enabled || state.runtime.armed} onChange={event => setMode("stopOnJoin", event.currentTarget.checked)} /> Stop on Join</label>
            <label><input type="checkbox" checked={state.settings.values.stopOnWatch === true} disabled={!state.settings.enabled || state.runtime.armed} onChange={event => setMode("stopOnWatch", event.currentTarget.checked)} /> Stop on Watch</label>
        </div>
        <div className="soulcord-inline-field soulcord-audience-add">
            <input value={userId} inputMode="numeric" maxLength={32} placeholder="Discord user ID" aria-label="Denied Discord user ID" onChange={event => setUserId(event.currentTarget.value.replace(/\D/g, ""))} />
            <input value={label} maxLength={80} placeholder="Private label (optional)" aria-label="Private label for denied user" onChange={event => setLabel(event.currentTarget.value)} />
            <ActionButton onClick={() => void add()} disabled={!state.settings.enabled || entries.length >= 100 || !userId.trim()}>Add locally</ActionButton>
        </div>
        <div className="soulcord-audience-list" aria-label="Denied stream audience">
            {entries.map(entry => <div key={entry.userId} className="soulcord-audience-row"><div><strong>{entry.label || `Discord user •${entry.userId.slice(-4)}`}</strong><small>Account-private entry · ID ending {entry.userId.slice(-4)}</small></div><ActionButton disabled={state.runtime.armed} onClick={() => void SoulCordRuntime.setAudienceGuardEntries(entries.filter(item => item.userId !== entry.userId))}>Remove</ActionButton></div>)}
            {!entries.length && <p className="soulcord-empty">No denied users are stored for this Discord account.</p>}
        </div>
        <div className="soulcord-actions">
            {state.runtime.armed ? <ActionButton tone="danger" onClick={() => {SoulCordRuntime.disarmAudienceGuard(); setActionStatus("Audience Guard disarmed.");}}>Disarm</ActionButton> : <ActionButton tone="accent" disabled={!state.runtime.available || !entries.length} onClick={arm}>Arm for this call</ActionButton>}
            <ActionButton tone="danger" disabled={!entries.length || state.runtime.armed} onClick={() => {if (window.confirm("Clear this account's private Stream Audience Guard denylist?")) void SoulCordRuntime.clearAudienceGuardEntries();}}>Clear private list</ActionButton>
        </div>
        <p className="soulcord-key-hint">{state.privateState.persistent ? "Encrypted persistence is active through Electron safeStorage." : "Denylist persistence is unavailable; entries remain session-only."} {state.runtime.detail}</p>
        {actionStatus && <p role="status" className="soulcord-import-status">{actionStatus}</p>}
    </Section>;
}

function NativeSuitePanel() {
    const state = useStateFromStores([SoulCordRuntime, SoulCordSettings], () => ({statuses: SoulCordRuntime.nativeSuiteStatus(), preferences: SoulCordSettings.snapshot().productPreferences}));
    const controller = SoulCordRuntime.nativeSuiteController();
    const [actionStatus, setActionStatus] = useState("");
    const [audioUserId, setAudioUserId] = useState("");
    const [audioPercent, setAudioPercent] = useState(100);
    const [channelId, setChannelId] = useState("");
    const [serverAlias, setServerAlias] = useState("");
    const [glance, setGlance] = useState<Array<{id: string; authorLabel: string; text: string; timestamp: number;}>>([]);
    const [translationText, setTranslationText] = useState("");
    const [translationResult, setTranslationResult] = useState("");
    const [translationCredential, setTranslationCredential] = useState("");
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
    const nativePreferences = state.preferences.nativeSuite;
    const translationEndpoint = nativePreferences.translation.provider === "deepl" ? "https://api-free.deepl.com/v2/translate" : nativePreferences.translation.endpoint;
    const updateNativePreferences = (next: typeof nativePreferences) => void SoulCordRuntime.setProductPreferences({...state.preferences, nativeSuite: next});
    const volume = () => {
        try {
            const preview = controller?.previewLocalVolume(audioUserId.trim(), 100, audioPercent);
            if (!preview || !window.confirm(`Set local playback for user •${preview.userId.slice(-4)} from ${preview.currentPercent}% to ${preview.targetPercent}%? This changes only what you hear.`)) return;
            controller?.applyReviewedLocalVolume();
            setActionStatus("Reviewed local playback volume applied.");
        }
        catch (error) {setActionStatus(error instanceof Error ? error.message : "Audio Console stayed unavailable.");}
    };
    const reviewChannel = () => {
        try {
            setGlance([...(controller?.previewLoadedChannel(channelId.trim()) ?? [])]);
            setActionStatus("Channel Glance read the already-loaded local store without fetching or marking anything read.");
        }
        catch (error) {setGlance([]); setActionStatus(error instanceof Error ? error.message : "Channel Glance stayed unavailable.");}
    };
    const translate = async () => {
        try {
            const provider = nativePreferences.translation.provider;
            if (provider === "off") throw new Error("Choose a translation provider first.");
            const preview = controller?.previewTranslation(provider, nativePreferences.translation.endpoint || undefined, "auto", "EN", translationText);
            if (!preview || !window.confirm(`${preview.disclosure}\n\nContinue with this reviewed text?`)) return;
            setTranslationResult(await controller!.executeReviewedTranslation(preview.id, translationCredential));
            setActionStatus("Translation returned to this local panel. It was not inserted or sent to Discord.");
        }
        catch (error) {setActionStatus(error instanceof Error ? error.message : "Translation Desk failed closed.");}
    };
    const startVoice = async () => {
        try {await controller?.beginVoiceNoteFromUserGesture(); setVoicePreview(undefined); setActionStatus("Recording locally. Nothing is uploading.");}
        catch (error) {setActionStatus(error instanceof Error ? error.message : "Voice Note Studio stayed unavailable.");}
    };
    const stopVoice = async () => {
        try {const preview = await controller?.stopVoiceNoteForPreview(); setVoicePreview(preview); setActionStatus("Recording stopped. Review it before opening Discord's ordinary upload composer.");}
        catch (error) {setActionStatus(error instanceof Error ? error.message : "No local recording could be previewed.");}
    };
    const prepareVoiceUpload = () => {
        if (!voicePreview || !window.confirm("Open Discord's normal upload composer with this reviewed voice note? This prepares the file but does not press Send.")) return;
        try {controller?.prepareReviewedVoiceNoteUpload(channelId.trim()); setVoicePreview(undefined); setActionStatus("The reviewed file was handed to Discord's normal upload composer. You still control Send.");}
        catch (error) {setActionStatus(error instanceof Error ? error.message : "The native upload composer stayed unavailable.");}
    };
    const previewNotifications = (scope: "guild" | "mentions" | "all") => {
        try {
            const preview = controller?.previewNotifications(scope);
            if (!preview || !window.confirm(`Mark ${preview.count} reviewed ${scope} notification item(s) as read? This changes account read state and cannot be undone by SoulCord.`)) return;
            controller?.applyReviewedNotifications(preview.id);
            setActionStatus(`${preview.count} reviewed notification item(s) were marked read.`);
        }
        catch (error) {setActionStatus(error instanceof Error ? error.message : "Notification Review stayed unavailable.");}
    };
    const addLocalSpaceRule = (kind: "pin" | "hide" | "alias") => {
        try {
            if (kind === "pin") controller?.pinDm(channelId.trim());
            else if (kind === "hide") controller?.hideGuild(channelId.trim());
            else controller?.aliasGuild(channelId.trim(), serverAlias.trim());
            setActionStatus("The local People and Spaces preference was saved. No Discord server or profile was edited.");
        }
        catch (error) {setActionStatus(error instanceof Error ? error.message : "The local preference was not changed.");}
    };
    const reviewComposer = () => {
        try {setComposerProof(controller?.composerProof(composerDraft)); setActionStatus("Composer Proof reviewed this local draft. Nothing was inserted or sent.");}
        catch (error) {setComposerProof(undefined); setActionStatus(error instanceof Error ? error.message : "Composer Proof stayed unavailable.");}
    };
    const composeTime = () => {
        try {
            const parsed = new Date(timeValue).valueOf();
            const markup = controller?.timeMarkup(parsed, timeStyle) ?? "";
            setTimeMarkup(markup);
            setActionStatus("Time Composer generated local Discord timestamp markup. It was not inserted or sent.");
        }
        catch (error) {setTimeMarkup(""); setActionStatus(error instanceof Error ? error.message : "Time Composer could not parse that time.");}
    };
    const reviewPermissions = () => {
        try {
            const names = permissionInput.split(/[\s,]+/).map(value => value.trim()).filter(Boolean);
            setPermissionResults([...(controller?.explainCachedPermissions(names) ?? [])]);
            setActionStatus("Permission Lens explained the supplied cached permission names. It did not fetch or edit channel permissions.");
        }
        catch (error) {setPermissionResults([]); setActionStatus(error instanceof Error ? error.message : "Permission Lens stayed unavailable.");}
    };
    const applyFocus = () => {
        try {
            controller?.setFocusChannels(focusInput.split(/[\s,]+/).map(value => value.trim()).filter(Boolean));
            setActionStatus("Focus Channels dimmed non-selected loaded channel rows locally. Hovered and selected rows remain readable.");
        }
        catch (error) {setActionStatus(error instanceof Error ? error.message : "Focus Channels stayed unavailable.");}
    };
    const loadIdentityNotes = async () => {
        const [status, result] = await Promise.all([SoulCordRuntime.localIdentityNotesStatus(), SoulCordRuntime.readLocalIdentityNotes()]);
        setIdentityNotes(result.notes);
        setIdentityPersistent(status.persistent && result.persistent && result.complete);
        setActionStatus(result.complete ? `${result.notes.length} account-private note(s) loaded locally.` : "Local Identity Notes stayed unavailable; no private content was exposed.");
    };
    const saveIdentityNote = async () => {
        try {
            const tags = identityTags.split(",").map(tag => tag.trim()).filter(Boolean);
            const reviewed = controller?.reviewIdentityNote(identitySubject.trim(), identityText, tags);
            if (!reviewed || !window.confirm(`Store the reviewed local note for user •${reviewed.subjectId.slice(-4)}? The note never changes that Discord profile and never enters normal settings or exports.`)) return;
            const intent = controller!.confirmIdentityNote(reviewed.subjectId);
            const result = await SoulCordRuntime.writeLocalIdentityNote(intent.payload);
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
        const result = await SoulCordRuntime.removeLocalIdentityNote(subjectId);
        if (result.complete) await loadIdentityNotes();
        else setActionStatus("The private note was preserved because removal did not complete cleanly.");
    };
    return <Section title="SoulCord native suite" summary="Community-shaped features are grouped into owned, reversible SoulCord tools. A green row means its current adapter validated; unavailable rows stay inert instead of falling back to a hidden community file.">
        <div className="soulcord-native-ledger" role="list" aria-label="SoulCord native feature adapters">
            {state.statuses.map(item => <div key={item.id} role="listitem" className="soulcord-native-row"><div><strong>{item.title}</strong><p>{item.detail}</p>{item.enabledProviders.length > 0 && <small>Replaces: {item.enabledProviders.join(", ")}</small>}</div><span className={`soulcord-maturity soulcord-native-${item.maturity}`}>{item.maturity}</span></div>)}
            {!state.statuses.length && <p className="soulcord-empty">Complete setup or enable a native tool to load the V2 adapter ledger.</p>}
        </div>
        <div className="soulcord-native-tools">
            <details><summary>Composer Proof and Time Composer</summary><div className="soulcord-composer-lab"><textarea value={composerDraft} maxLength={64000} placeholder="Review a draft locally before sending" onChange={event => setComposerDraft(event.currentTarget.value)} /><div className="soulcord-actions"><ActionButton onClick={reviewComposer}>Review draft</ActionButton></div>{composerProof && <div className="soulcord-native-preview"><p><strong>{composerProof.characterCount.toLocaleString()} characters</strong><span>{composerProof.partCount} guarded part(s)</span></p>{composerProof.warnings.length ? composerProof.warnings.map(warning => <p key={warning}>{warning}</p>) : <p>No broad-mention, length, or unclosed-code-block warnings found.</p>}</div>}<div className="soulcord-catalog-tools"><label>Local date and time<input type="datetime-local" value={timeValue} onChange={event => setTimeValue(event.currentTarget.value)} /></label><label>Discord display style<select value={timeStyle} onChange={event => setTimeStyle(event.currentTarget.value as typeof timeStyle)}><option value="F">Full date and time</option><option value="f">Short date and time</option><option value="R">Relative</option><option value="D">Long date</option><option value="d">Short date</option><option value="T">Time with seconds</option><option value="t">Short time</option></select></label></div><div className="soulcord-inline-field"><ActionButton disabled={!timeValue} onClick={composeTime}>Generate timestamp</ActionButton>{timeMarkup && <><output>{timeMarkup}</output><ActionButton onClick={() => void navigator.clipboard?.writeText(timeMarkup).then(() => setActionStatus("Reviewed timestamp copied. SoulCord did not insert or send it."))}>Copy</ActionButton></>}</div></div></details>
            <details><summary>Audio Console</summary><div className="soulcord-inline-field"><input value={audioUserId} inputMode="numeric" placeholder="Discord user ID" aria-label="Audio Console user ID" onChange={event => setAudioUserId(event.currentTarget.value.replace(/\D/g, ""))} /><input type="number" min="0" max="200" value={audioPercent} aria-label="Local volume percent" onChange={event => setAudioPercent(Math.max(0, Math.min(200, Number(event.currentTarget.value))))} /><ActionButton disabled={!audioUserId} onClick={volume}>Review and apply</ActionButton></div></details>
            <details><summary>Channel Glance and People and Spaces</summary><div className="soulcord-inline-field"><input value={channelId} inputMode="numeric" placeholder="Loaded channel, DM, server, or user ID" aria-label="Local Discord object ID" onChange={event => setChannelId(event.currentTarget.value.replace(/\D/g, ""))} /><ActionButton disabled={!channelId} onClick={reviewChannel}>Glance</ActionButton><ActionButton disabled={!channelId} onClick={() => addLocalSpaceRule("pin")}>Pin DM locally</ActionButton><ActionButton disabled={!channelId} onClick={() => addLocalSpaceRule("hide")}>Hide server locally</ActionButton></div><div className="soulcord-inline-field soulcord-alias-field"><input value={serverAlias} maxLength={48} placeholder="Local server alias" aria-label="Local server alias" onChange={event => setServerAlias(event.currentTarget.value)} /><ActionButton disabled={!channelId || !serverAlias.trim()} onClick={() => addLocalSpaceRule("alias")}>Save local alias</ActionButton></div>{glance.length > 0 && <div className="soulcord-native-preview">{glance.map(message => <p key={message.id}><strong>{message.authorLabel}</strong> <span>{message.text || "No text content"}</span><small>{timestamp(message.timestamp)}</small></p>)}</div>}</details>
            <details><summary>Translation Desk</summary><div className="soulcord-translation-grid"><label>Provider<select value={nativePreferences.translation.provider} onChange={event => {setTranslationCredential(""); updateNativePreferences({...nativePreferences, translation: {...nativePreferences.translation, provider: event.currentTarget.value as typeof nativePreferences.translation.provider}});}}><option value="off">Off</option><option value="deepl">DeepL Free</option><option value="libretranslate">LibreTranslate</option></select></label><label>HTTPS endpoint<input value={nativePreferences.translation.endpoint} disabled={nativePreferences.translation.provider !== "libretranslate"} placeholder="https://translate.example/translate" onChange={event => {setTranslationCredential(""); updateNativePreferences({...nativePreferences, translation: {...nativePreferences.translation, endpoint: event.currentTarget.value}});}} /></label><label>Credential<input type="password" autoComplete="off" value={translationCredential} placeholder="Stored only through encrypted private storage" onChange={event => setTranslationCredential(event.currentTarget.value)} /></label><div className="soulcord-actions soulcord-translation-credentials"><ActionButton disabled={nativePreferences.translation.provider === "off" || !translationEndpoint} onClick={() => void SoulCordRuntime.readTranslationCredential(nativePreferences.translation.provider as "deepl" | "libretranslate", translationEndpoint).then(result => {setTranslationCredential(result.credential); setActionStatus(result.complete ? (result.credential ? "Credential loaded from account-bound private storage." : "No credential is stored for this provider and endpoint.") : "Credential storage could not be read completely.");})}>Load credential</ActionButton><ActionButton disabled={nativePreferences.translation.provider === "off" || !translationEndpoint || !translationCredential} onClick={() => void SoulCordRuntime.writeTranslationCredential(nativePreferences.translation.provider as "deepl" | "libretranslate", translationEndpoint, translationCredential).then(result => setActionStatus(result.complete ? (result.persistent ? "Credential encrypted through Electron safeStorage." : "Encryption is unavailable; the credential remains memory-only for this session.") : "Credential could not be persisted and was not added to normal settings."))}>Save securely</ActionButton><ActionButton disabled={nativePreferences.translation.provider === "off" || !translationEndpoint} tone="danger" onClick={() => void SoulCordRuntime.clearTranslationCredential(nativePreferences.translation.provider as "deepl" | "libretranslate", translationEndpoint).then(result => {setTranslationCredential(""); setActionStatus(result.complete ? "Stored credential cleared for this provider and endpoint." : "Credential cleanup needs attention.");})}>Clear credential</ActionButton></div><textarea value={translationText} maxLength={16000} placeholder="Text to review before translation" onChange={event => setTranslationText(event.currentTarget.value)} /><ActionButton disabled={!translationText || nativePreferences.translation.provider === "off"} onClick={() => void translate()}>Review destination and translate</ActionButton>{translationResult && <output>{translationResult}</output>}</div></details>
            <details><summary>Voice Note Studio</summary><div className="soulcord-actions"><ActionButton onClick={() => void startVoice()}>Record</ActionButton><ActionButton onClick={() => void stopVoice()}>Stop and preview</ActionButton><ActionButton disabled={!voicePreview || !channelId} onClick={prepareVoiceUpload}>Open normal upload composer</ActionButton><ActionButton disabled={!voicePreview} tone="danger" onClick={() => {controller?.cancelVoiceNote(); setVoicePreview(undefined); setActionStatus("Local voice-note preview cleared.");}}>Cancel</ActionButton></div>{voicePreview && <div className="soulcord-native-preview"><audio controls src={voicePreview.url} /><small>{Math.ceil(voicePreview.durationMs / 1000)} seconds · {(voicePreview.sizeBytes / 1024).toFixed(1)} KiB · not uploaded</small></div>}</details>
            <details><summary>Notification Review</summary><div className="soulcord-actions"><ActionButton onClick={() => previewNotifications("mentions")}>Review mentions</ActionButton><ActionButton onClick={() => previewNotifications("guild")}>Review current server</ActionButton><ActionButton onClick={() => previewNotifications("all")}>Review all</ActionButton></div><p className="soulcord-key-hint">Every action previews a bounded count and asks again before changing read state.</p></details>
            <details><summary>Permission Lens and Focus Channels</summary><div className="soulcord-catalog-tools"><label>Cached permission names<input value={permissionInput} onChange={event => setPermissionInput(event.currentTarget.value)} /></label><div className="soulcord-actions"><ActionButton disabled={!permissionInput.trim()} onClick={reviewPermissions}>Explain locally</ActionButton></div><label>Focus channel IDs<input value={focusInput} placeholder="Comma-separated loaded channel IDs" onChange={event => setFocusInput(event.currentTarget.value.replace(/[^\d,\s]/g, ""))} /></label><div className="soulcord-actions"><ActionButton onClick={applyFocus}>{focusInput.trim() ? "Apply focus" : "Clear focus"}</ActionButton></div></div>{permissionResults.length > 0 && <div className="soulcord-native-preview">{permissionResults.map(result => <p key={result.permission}><strong>{result.permission}</strong><span>{result.explanation}</span></p>)}</div>}<p className="soulcord-key-hint">Permission Lens uses only supplied cached names. Focus Channels changes only the loaded local channel rail and never mutes or leaves a channel.</p></details>
            <details><summary>Encrypted Local Identity Notes</summary><div className="soulcord-composer-lab"><p className="soulcord-key-hint">Default-off and account-isolated. Notes never edit profiles, sync to cloud, enter diagnostics, or appear in portable settings exports.</p><div className="soulcord-catalog-tools"><label>Discord user ID<input value={identitySubject} inputMode="numeric" maxLength={32} placeholder="User ID" onChange={event => setIdentitySubject(event.currentTarget.value.replace(/\D/g, ""))} /></label><label>Private tags<input value={identityTags} maxLength={199} placeholder="friend, project" onChange={event => setIdentityTags(event.currentTarget.value)} /></label></div><textarea value={identityText} maxLength={280} placeholder="Private local note" onChange={event => setIdentityText(event.currentTarget.value)} /><div className="soulcord-actions"><ActionButton disabled={!identitySubject || !identityText} onClick={() => void saveIdentityNote()}>Review and store</ActionButton><ActionButton onClick={() => void loadIdentityNotes()}>Load account notes</ActionButton><ActionButton tone="danger" disabled={!identityNotes.length} onClick={() => {if (window.confirm("Clear every Local Identity Note for the current Discord account?")) void SoulCordRuntime.clearLocalIdentityNotes().then(() => loadIdentityNotes());}}>Clear all</ActionButton></div>{identityNotes.length > 0 && <div className="soulcord-native-preview">{identityNotes.map(note => <p key={note.subjectId}><strong>User •{note.subjectId.slice(-4)}</strong><span>{note.text}{note.tags.length ? ` · ${note.tags.join(", ")}` : ""}</span><small>{timestamp(note.updatedAt)} <button type="button" className="soulcord-text-button" onClick={() => void removeIdentityNote(note.subjectId)}>Remove</button></small></p>)}</div>}<p className="soulcord-key-hint">{identityPersistent ? "Encrypted persistence is active." : "No persistence claim: until loaded, or when safeStorage is unavailable, notes are session-only."}</p></div></details>
        </div>
        {actionStatus && <p role="status" className="soulcord-import-status">{actionStatus}</p>}
    </Section>;
}

function AccessibilityControls() {
    const accessibility = useStateFromStores(SoulCordSettings, () => SoulCordSettings.snapshot().modules["accessibility-toolkit"].values);
    const setting = (key: string, value: unknown) => void SoulCordRuntime.setValue("accessibility-toolkit", key, value);
    return <Section title="Accessibility" summary="Local focus, motion, contrast, and reading-width controls use SoulCord's reversible accessibility adapter.">
        <div className="soulcord-control-grid">
            <label><input type="checkbox" checked={accessibility.reducedMotion === true} onChange={event => setting("reducedMotion", event.currentTarget.checked)} /> Reduced motion</label>
            <label><input type="checkbox" checked={accessibility.roleContrast === true} onChange={event => setting("roleContrast", event.currentTarget.checked)} /> Role contrast aid</label>
            <label><input type="checkbox" checked={accessibility.readingRuler === true} onChange={event => setting("readingRuler", event.currentTarget.checked)} /> Reading ruler</label>
            <label className="soulcord-range-control">Reading width
                <input type="range" min="0" max="1200" step="40" value={Number(accessibility.readingWidth) || 0} aria-label="Reading width in pixels; zero uses Discord default" onChange={event => setting("readingWidth", Number(event.currentTarget.value))} />
                <output>{Number(accessibility.readingWidth) ? `${accessibility.readingWidth} px` : "Discord default"}</output>
            </label>
        </div>
    </Section>;
}

function PerformanceControls() {
    const values = useStateFromStores(SoulCordSettings, () => SoulCordSettings.snapshot().modules["performance-hud"].values);
    return <Section title="Performance HUD" summary="Bounded local samples report observed SoulCord startup, memory, event-loop, and owned-resource measurements without claiming to optimize Discord.">
        <label><input type="checkbox" checked={values.showOverlay === true} onChange={event => void SoulCordRuntime.setValue("performance-hud", "showOverlay", event.currentTarget.checked)} /> Show the local performance overlay</label>
        <p className="soulcord-key-hint"><kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>K</kbd> opens Command Deck.</p>
    </Section>;
}

function LinkWorkbench() {
    const [input, setInput] = useState("");
    const [inspection, setInspection] = useState<LinkInspection>();
    const [memoryRevision, setMemoryRevision] = useState(0);
    const remembered = inspection?.valid ? SoulCordRuntime.domainMemoryDecision(input) : undefined;
    const domainRisk = inspection?.valid ? SoulCordRuntime.inspectDomain(input) : undefined;
    const remember = (decision: "allow" | "warn" | "block") => {
        if (SoulCordRuntime.rememberDomain(input, decision)) setMemoryRevision(memoryRevision + 1);
    };
    return <Section title="Link Lens" summary="Paste a link for a local inspection of the visible host, declared redirect target, tracking parameters, confusable-domain signals, and Discord invite code.">
        <div className="soulcord-inline-field">
            <input type="url" value={input} placeholder="https://example.com/path" aria-label="Link to inspect" onChange={event => setInput(event.currentTarget.value)} />
            <ActionButton tone="accent" onClick={() => setInspection(SoulCordRuntime.inspectLink(input))} disabled={!input.trim()}>Inspect locally</ActionButton>
        </div>
        {inspection && <div className={`soulcord-link-result ${inspection.valid ? "" : "soulcord-link-invalid"}`}>
            <dl className="soulcord-facts">
                <div><dt>Visible host</dt><dd>{inspection.host ?? "invalid"}</dd></div>
                <div><dt>Declared final host</dt><dd>{inspection.finalHost ?? "unknown"}</dd></div>
                <div><dt>Invite</dt><dd>{inspection.inviteCode ?? "not detected"}</dd></div>
                <div><dt>Removed trackers</dt><dd>{inspection.removedParameters.join(", ") || "none"}</dd></div>
            </dl>
            {inspection.warnings.length ? <ul>{inspection.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : <p>No local warning signal was found. That is not a safety guarantee.</p>}
            <div className="soulcord-domain-memory">
                <strong>Domain Memory</strong>
                <p>{remembered ? `${remembered.decision} until ${timestamp(remembered.expiresAt)}` : "No expiring decision is stored for this exact host."}</p>
                {domainRisk?.reasons.length ? <small>Allow is unavailable: {domainRisk.reasons.join(", ")}.</small> : <small>Scheme-and-host decisions expire after seven days and never apply to subdomains. In warn-only mode, allow never bypasses a Link Lens warning.</small>}
                <div className="soulcord-actions">
                    <ActionButton disabled={domainRisk?.restricted !== false} onClick={() => remember("allow")}>Remember allow</ActionButton>
                    <ActionButton onClick={() => remember("warn")}>Remember warning</ActionButton>
                    <ActionButton tone="danger" onClick={() => remember("block")}>Remember block</ActionButton>
                    <ActionButton disabled={!remembered || !inspection.host} onClick={() => {if (inspection.host && SoulCordRuntime.forgetDomain(inspection.host)) setMemoryRevision(memoryRevision + 1);}}>Forget</ActionButton>
                </div>
            </div>
        </div>}
    </Section>;
}

function AttachmentGuardWorkbench() {
    const [input, setInput] = useState("");
    const [mime, setMime] = useState("");
    const [inspection, setInspection] = useState<ReturnType<typeof SoulCordRuntime.inspectAttachment>>();
    return <Section title="Attachment Guard" summary="Review a visible attachment URL, filename, extension, declared MIME, and risk reason locally. This tool never downloads, opens, scans, or uploads the file.">
        <div className="soulcord-inline-field">
            <input type="url" value={input} placeholder="https://cdn.example/file.zip" aria-label="Attachment URL to inspect" onChange={event => setInput(event.currentTarget.value)} />
            <input value={mime} placeholder="Optional MIME type" aria-label="Declared attachment MIME type" onChange={event => setMime(event.currentTarget.value)} />
            <ActionButton tone="accent" onClick={() => setInspection(SoulCordRuntime.inspectAttachment(input, mime || undefined))} disabled={!input.trim()}>Inspect locally</ActionButton>
        </div>
        {inspection && <div className={`soulcord-link-result ${inspection.risk === "block" ? "soulcord-link-invalid" : ""}`} role="status">
            <dl className="soulcord-facts"><div><dt>Source host</dt><dd>{inspection.host ?? "invalid"}</dd></div><div><dt>Filename</dt><dd>{inspection.filename ?? "unavailable"}</dd></div><div><dt>Extension</dt><dd>{inspection.extension ?? "none"}</dd></div><div><dt>Local result</dt><dd>{inspection.risk}</dd></div></dl>
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
            anchor.download = "soulcord-scrubbed.png";
            anchor.click();
            queueMicrotask(() => URL.revokeObjectURL(url));
        }, "image/png");
    };
    return <Section title="Screenshot Scrubber" summary="Choose an image from this PC, redact by pointer or percentage fields, and download a new PNG. The image stays in this renderer and is never uploaded by SoulCord.">
        <div className="soulcord-scrubber-controls">
            <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose screenshot" disabled={loading} onChange={event => load(event.currentTarget.files?.[0])} />
            <label>Tool <select value={mode} onChange={event => setMode(event.currentTarget.value as "cover" | "blur")}><option value="cover">Solid cover</option><option value="blur">Blur</option></select></label>
            <ActionButton onClick={drawSource} disabled={!loaded || loading}>Reset</ActionButton>
            <ActionButton tone="accent" onClick={download} disabled={!loaded || loading}>Download PNG</ActionButton>
        </div>
        <fieldset className="soulcord-region-grid" disabled={!loaded || loading}>
            <legend>Keyboard redaction region (percent)</legend>
            {(["x", "y", "width", "height"] as const).map(key => <label key={key}>{key === "x" || key === "y" ? key.toUpperCase() : key}
                <input type="number" min={key === "width" || key === "height" ? 1 : 0} max={key === "x" || key === "y" ? 99 : 100} value={region[key]} onChange={event => setRegionValue(key, event.currentTarget.value)} />
            </label>)}
            <ActionButton onClick={applyTypedRegion} disabled={!loaded}>Apply {mode}</ActionButton>
        </fieldset>
        <canvas
            ref={canvasRef}
            className={`soulcord-scrubber-canvas ${loaded ? "" : "soulcord-canvas-empty"}`}
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
        {loading && <p className="soulcord-import-status" role="status">Reading and decoding the image on this PC…</p>}
        {error && <p className="soulcord-error" role="alert">{error}</p>}
        {!loaded && !loading && !error && <p className="soulcord-empty" role="status">No local image selected.</p>}
    </Section>;
}

function AboutSoulCord() {
    return <Section title="About SoulCord" summary="A reliability, privacy, and productivity fork built on BetterDiscord’s open-source foundation.">
        <div className="soulcord-about-grid">
            <p><strong>Why it exists.</strong> SoulCord keeps the BetterDiscord plugin and theme ecosystem while tightening recovery behavior and restoring Discord Activities through a bounded same-package preload policy.</p>
            <p><strong>What it does not do.</strong> It does not grant Nitro, forge entitlements, extract tokens, backfill messages, access hidden channels, send on your behalf, send SoulCord telemetry, or enable the global unrestricted preload override.</p>
            <p><strong>Privacy.</strong> Module state, snapshots, and diagnostics stay local. The private Message Timeline runs only after opt-in, is DM-only by default, and uses encrypted persistence when safeStorage is available. Sanitized diagnostics omit message content, server names, account identifiers, and absolute paths.</p>
            <p><strong>Maturity.</strong> Automated and synthetic checks can prove policy behavior; only the owner’s post-launch Codenames and second-Activity checks can complete live human acceptance.</p>
        </div>
        <p className="soulcord-attribution">Based on BetterDiscord. Upstream contributors, Apache-2.0 licensing, ecosystem-compatible identifiers, and fork lineage are preserved.</p>
    </Section>;
}

function SessionPulse({openWorkspace}: {openWorkspace(workspace: SoulCordWorkspaceId): void;}) {
    const state = useStateFromStores([SoulCordSettings, SoulCordRuntime, PluginDoctor], () => ({
        document: SoulCordSettings.snapshot(),
        health: SoulCordRuntime.health(),
        recovery: SoulCordRuntime.recoveryMode,
        quarantined: PluginDoctor.snapshot().filter(record => record.quarantinedAt).length,
        activity: SoulCordRuntime.activityHealth(),
        relationshipChanges: SoulCordRuntime.friendWatchEvents().length,
        dueReminders: SoulCordRuntime.returnLaterItems().filter(item => item.dueAt <= Date.now()).length
    }));
    const failed = state.health.filter(item => item.status === "failed" || item.status === "quarantined").length;
    const drift = state.health.find(item => item.id === "drift-radar");
    const signals = prioritizeSoulCordPulse([
        ...(state.recovery ? [{id: "recovery", priority: 100, tone: "danger" as const, label: "Safe Start is active", detail: "Optional SoulCord capabilities are held off until you retry normal startup.", action: "Open recovery"}] : []),
        ...(failed || state.quarantined ? [{id: "addons", priority: 90, tone: "danger" as const, label: "Add-ons need attention", detail: `${failed} module failure(s), ${state.quarantined} quarantined add-on(s).`, action: "Review add-ons"}] : []),
        ...(state.activity?.status === "attention" ? [{id: "activity", priority: 85, tone: "attention" as const, label: "Activity Bridge needs review", detail: "The bounded compatibility ledger reported attention.", action: "Inspect Activity Bridge"}] : []),
        ...(drift?.status === "failed" || drift?.status === "quarantined" ? [{id: "drift", priority: 80, tone: "attention" as const, label: "Discord adapter drift", detail: drift.detail, action: "Open diagnostics"}] : []),
        ...(state.document.onboarding.status === "pending" ? [{id: "setup", priority: 75, tone: "attention" as const, label: "Setup is unfinished", detail: `Resume at step ${state.document.onboarding.lastStep + 1} without reapplying earlier choices.`, action: "Continue setup"}] : []),
        ...(state.dueReminders ? [{id: "return-later", priority: 65, tone: "attention" as const, label: "Return Later is due", detail: `${state.dueReminders} local reminder(s) are ready.`, action: "Open People"}] : []),
        ...(state.relationshipChanges ? [{id: "friend-watch", priority: 60, tone: "ok" as const, label: "Relationship history updated", detail: `${state.relationshipChanges} relationship transition(s) are available in this session.`, action: "Open People"}] : []),
        {id: "healthy", priority: 1, tone: "ok", label: "Session checks complete", detail: "Activity policy, recovery state, and local module health were read without collecting account content."}
    ]);
    return <Section title="Session Pulse" summary="One local startup digest. The three highest-priority items win; lower-priority noise stays out of the way.">
        <div className="soulcord-pulse-list">{signals.map(signal => <article key={signal.id} className={`soulcord-pulse soulcord-pulse-${signal.tone}`}><div><strong>{signal.label}</strong><p>{signal.detail}</p></div>{signal.action && <ActionButton onClick={() => openWorkspace(signal.id === "setup" || signal.id === "activity" ? "home" : signal.id === "return-later" || signal.id === "friend-watch" ? "people" : "tools")}>{signal.action}</ActionButton>}</article>)}</div>
    </Section>;
}

function AppearanceWorkspace() {
    const preferences = useStateFromStores(SoulCordSettings, () => SoulCordSettings.snapshot().productPreferences);
    const appearance = preferences.appearance;
    const update = (next: SoulCordAppearancePreferences) => void SoulCordRuntime.setProductPreferences({...preferences, appearance: next});
    return <>
        <Section title="Appearance" summary="One semantic token system follows Discord or applies a SoulCord mode without remote CSS, fonts, or imagery.">
            <div className="soulcord-appearance-controls">
                <label>Mode<select value={appearance.mode} onChange={event => update({...appearance, mode: event.currentTarget.value as SoulCordAppearancePreferences["mode"]})}><option value="follow-discord">Follow Discord</option><option value="soul-dark">Soul Dark</option><option value="soul-light">Soul Light</option><option value="oled">OLED</option></select></label>
                <label>Accent<select value={appearance.accent} onChange={event => update({...appearance, accent: event.currentTarget.value as SoulCordAppearancePreferences["accent"]})}><option value="system">Discord / system</option><option value="glacier">Glacier cyan</option><option value="signal">Signal amber</option><option value="coral">Coral</option><option value="forest">Forest</option></select></label>
                <label>Density<select value={appearance.density} onChange={event => update({...appearance, density: event.currentTarget.value as SoulCordAppearancePreferences["density"]})}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
                <label>Motion<select value={appearance.motion} onChange={event => update({...appearance, motion: event.currentTarget.value as SoulCordAppearancePreferences["motion"]})}><option value="follow-system">Follow Discord / Windows</option><option value="full">Full</option><option value="reduced">Reduced</option></select></label>
                <label>Message shape<select value={appearance.messageShape} onChange={event => update({...appearance, messageShape: event.currentTarget.value as SoulCordAppearancePreferences["messageShape"]})}><option value="discord">Discord default</option><option value="seamed">Quiet 1px seams</option></select></label>
            </div>
            <div className={`soulcord-live-preview soulcord-mode-${appearance.mode} soulcord-accent-${appearance.accent}`}><span>Appearance preview</span><strong>Reply context stays readable at every density.</strong><small>Focus, warning, success, and danger keep distinct semantic colors.</small><button type="button">Keyboard focus sample</button></div>
        </Section>
        <AccessibilityControls />
    </>;
}

function FriendWatchPanel() {
    const state = useStateFromStores([SoulCordSettings, SoulCordRuntime], () => ({preferences: SoulCordSettings.snapshot().productPreferences, events: SoulCordRuntime.friendWatchEvents(), persistent: SoulCordRuntime.friendWatchPersistent()}));
    const policy = state.preferences.friendWatch;
    const update = (next: Partial<typeof policy>) => {
        const productPreferences: SoulCordProductPreferences = {...state.preferences, friendWatch: {...policy, ...next}};
        void SoulCordRuntime.setProductPreferences(productPreferences).then(() => SoulCordRuntime.setEnabled("friend-watch", productPreferences.friendWatch.enabled));
    };
    return <Section title="Friend Watch" summary="Local relationship transitions from Discord’s already-loaded store. No REST polling, presence history, messages, mutual-server graph, or block guessing.">
        <div className="soulcord-control-strip">
            <label><input type="checkbox" checked={policy.enabled} onChange={event => update({enabled: event.currentTarget.checked})} /> Enabled with separate consent</label>
            <label><input type="checkbox" checked={policy.includeDisplaySnapshot} onChange={event => update({includeDisplaySnapshot: event.currentTarget.checked})} /> Encrypted display snapshots</label>
            <label>Retention<select value={policy.retentionDays} onChange={event => update({retentionDays: Number(event.currentTarget.value) as 7 | 30 | 90})}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label>
            <label>Digest<select value={policy.digest} onChange={event => update({digest: event.currentTarget.value as typeof policy.digest})}><option value="off">Off</option><option value="daily">Daily in-app</option><option value="per-event">Per event, local</option></select></label>
        </div>
        <p className="soulcord-callout">Storage: {state.persistent ? "AES-256-GCM account-isolated persistence; its random key is wrapped by Electron safeStorage." : "session-only fallback; no plaintext persistence."} Disabling or changing accounts clears renderer memory.</p>
        <div className="soulcord-actions"><ActionButton disabled={!state.events.length} onClick={() => void SoulCordRuntime.exportFriendWatch("json")}>Export JSON</ActionButton><ActionButton disabled={!state.events.length} onClick={() => void SoulCordRuntime.exportFriendWatch("csv")}>Export CSV</ActionButton><ActionButton tone="danger" disabled={!state.events.length} onClick={() => {if (window.confirm("Clear this account's local Friend Watch history?")) void SoulCordRuntime.clearFriendWatch();}}>Clear history</ActionButton></div>
        <div className="soulcord-people-history" aria-label="Friend Watch relationship history">{state.events.slice(-100).reverse().map(event => <article key={event.eventId}><div><strong>{event.transition === "reconciled" ? "Account scope" : event.displayLabel ?? `Local relationship •${(event.subjectKey ?? event.subjectId).slice(-4)}`}</strong><span>{event.label}</span></div><small>{timestamp(event.observedAt)} · {event.source} · {event.confidence}</small></article>)}{!state.events.length && <p className="soulcord-empty">No relationship transition has been observed in this session.</p>}</div>
    </Section>;
}

function ReturnLaterPanel() {
    const items = useStateFromStores(SoulCordRuntime, () => SoulCordRuntime.returnLaterItems());
    const [label, setLabel] = useState("");
    const [delay, setDelay] = useState(24 * 60 * 60 * 1_000);
    const [status, setStatus] = useState("");
    const add = () => {
        const added = SoulCordRuntime.addCurrentViewToReturnLater(label, Date.now() + delay);
        setStatus(added ? "Saved this Discord channel or DM route locally." : "Open a DM or channel, then use Return Later from that view. No reminder was saved from Settings.");
        if (added) setLabel("");
    };
    return <Section title="Return Later" summary="Save an internal Discord channel or message route with a local due time. It never sends, reacts, fetches history, backfills, or syncs remotely.">
        <div className="soulcord-inline-field">
            <input value={label} maxLength={80} placeholder="Optional private label" aria-label="Return Later label" onChange={event => setLabel(event.currentTarget.value)} />
            <select aria-label="Return Later due time" value={delay} onChange={event => setDelay(Number(event.currentTarget.value))}><option value={60 * 60 * 1_000}>In one hour</option><option value={24 * 60 * 60 * 1_000}>Tomorrow</option><option value={7 * 24 * 60 * 60 * 1_000}>In seven days</option></select>
            <ActionButton tone="accent" onClick={add}>Save current view</ActionButton>
        </div>
        {status && <p role="status" className="soulcord-import-status">{status}</p>}
        <div className="soulcord-people-history" aria-label="Return Later reminders">{items.map(item => <article key={item.id}><div><strong>{item.label}</strong><span>Due {timestamp(item.dueAt)}</span></div><div className="soulcord-actions"><ActionButton onClick={() => SoulCordRuntime.openReturnLater(item.id)}>Open</ActionButton><ActionButton onClick={() => SoulCordRuntime.snoozeReturnLater(item.id, 24 * 60 * 60 * 1_000)}>Snooze one day</ActionButton><ActionButton onClick={() => SoulCordRuntime.completeReturnLater(item.id)}>Complete</ActionButton></div></article>)}{!items.length && <p className="soulcord-empty">No local reminder is due. Open a DM or channel and save that view when you want to return.</p>}</div>
    </Section>;
}

function SetupManagement() {
    const document = useStateFromStores(SoulCordSettings, () => SoulCordSettings.snapshot());
    const [status, setStatus] = useState("");
    if (document.onboarding.status === "pending") return null;
    return <section className="soulcord-setup-management" aria-label="SoulCord setup management">
        <div><strong>Setup {document.onboarding.status}</strong><span>{document.onboarding.completedAt ? ` · ${timestamp(document.onboarding.completedAt)}` : ""}</span><p>Reopen the complete preview or roll back the latest staged setup transaction.</p></div>
        <div className="soulcord-actions"><ActionButton onClick={() => SoulCordSettings.reopenOnboarding()}>Reopen setup</ActionButton><ActionButton tone="danger" disabled={!document.setupTransactions.length} onClick={() => {
            if (!window.confirm("Roll back the latest SoulCord setup transaction? Files added by that transaction are removed only when their hashes are unchanged, and previous enabled states are restored.")) return;
            void SoulCordRuntime.rollbackLatestSetup().then(result => setStatus({
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
    const state = useStateFromStores([SoulCordSettings, SoulCordRuntime], () => ({consent: SoulCordSettings.snapshot().powerLab["fake-deafen"], status: SoulCordRuntime.fakeDeafenStatus()}));
    const [actionStatus, setActionStatus] = useState("");
    const toggleFakeDeafen = (enabled: boolean) => {
        if (enabled && !window.confirm("Enable the Fake Deafen experiment? It intentionally makes your server-visible voice state differ from your local audio state. Discord can change this behavior at any time. The adapter stays unarmed until you separately arm it in a voice channel.")) return;
        void SoulCordRuntime.setPowerExperiment("fake-deafen", enabled, enabled).then(succeeded => {
            const status = SoulCordRuntime.fakeDeafenStatus();
            setActionStatus(status.phase === "attention"
                ? status.detail
                : succeeded
                    ? (enabled ? "Adapter enabled but not armed." : "Adapter disabled and its scoped patch removed.")
                    : "The adapter failed closed.");
        });
    };
    const arm = () => {
        if (!window.confirm("Arm Fake Deafen for the current voice connection? First use Discord's normal Deafen control once. Arming restores local audio while keeping server-visible self-deafen on until you disarm, change channels, disconnect, or the adapter detects drift.")) return;
        setActionStatus(SoulCordRuntime.armFakeDeafen() ? "Fake Deafen is armed for this voice connection." : SoulCordRuntime.fakeDeafenStatus().detail);
    };
    const disarm = () => setActionStatus(SoulCordRuntime.disarmFakeDeafen() ? "Fake Deafen disarmed and server-visible state was resynchronized." : SoulCordRuntime.fakeDeafenStatus().detail);
    return <Section title="Power Lab" summary="Private experiments stay outside the daily set. Every available experiment is off by default, separately consented, visible while active, and designed to fail closed when Discord changes.">
        <div className="soulcord-power-list">{SOULCORD_POWER_LAB.map(experiment => experiment.id === "fake-deafen" ? <div key={experiment.id} className="soulcord-curated-row soulcord-power-available"><div><div className="soulcord-module-name"><strong>{experiment.name}</strong><span className="soulcord-maturity">account risk · preview</span><span className={`soulcord-status soulcord-status-${state.status.phase === "armed" ? "active" : state.status.phase === "attention" ? "failed" : "starting"}`}>{state.status.phase}</span></div><p>{experiment.summary}</p><small>{state.status.detail}</small>{state.consent.enabled && <div className="soulcord-actions">{state.status.armed ? <ActionButton tone="danger" onClick={disarm}>Disarm and resync</ActionButton> : <ActionButton onClick={arm}>Arm in current voice channel</ActionButton>}</div>}</div><label className="soulcord-toggle"><input type="checkbox" checked={state.consent.enabled} onChange={event => toggleFakeDeafen(event.currentTarget.checked)} /><span>{state.consent.enabled ? "On" : "Off"}</span></label></div> : <div key={experiment.id} className="soulcord-curated-row soulcord-unavailable"><div><div className="soulcord-module-name"><strong>{experiment.name}</strong><span className="soulcord-maturity">unavailable</span></div><p>{experiment.summary}</p></div><label className="soulcord-toggle"><input type="checkbox" checked={false} disabled /><span>Off</span></label></div>)}</div>
        {actionStatus && <p role="status" className="soulcord-import-status">{actionStatus}</p>}
    </Section>;
}

export default function SoulCordPanel() {
    const recoveryMode = useStateFromStores(SoulCordRuntime, () => SoulCordRuntime.recoveryMode);
    const onboarding = useStateFromStores(SoulCordSettings, () => SoulCordSettings.snapshot().onboarding);
    const productPreferences = useStateFromStores(SoulCordSettings, () => SoulCordSettings.snapshot().productPreferences);
    const appearance = productPreferences.appearance;
    const [workspace, setWorkspace] = useState<SoulCordWorkspaceId>("home");
    const [workspaceFocus, setWorkspaceFocus] = useState<"catalog">();
    const selectedWorkspace = SOULCORD_WORKSPACES.find(item => item.id === workspace)!;
    useEffect(() => {
        if (workspace !== "tools" || workspaceFocus !== "catalog") return;
        const frame = requestAnimationFrame(() => {
            const table = document.querySelector<HTMLElement>(".soulcord-catalog-table");
            const section = table?.closest<HTMLElement>(".soulcord-section");
            section?.scrollIntoView({block: "start"});
            section?.querySelector<HTMLElement>("input, select, button, [href]")?.focus({preventScroll: true});
            setWorkspaceFocus(undefined);
        });
        return () => cancelAnimationFrame(frame);
    }, [workspace, workspaceFocus]);
    const openCatalog = () => {
        setWorkspaceFocus("catalog");
        setWorkspace("tools");
    };
    return <main className={`soulcord-panel soulcord-density-${appearance.density} soulcord-motion-${appearance.motion}`}>
        <header className="soulcord-header">
            <div className="soulcord-mark" aria-hidden="true"><img src={soulCordMark} alt="" /></div>
            <div><p className="soulcord-eyebrow">SoulCord V2 · Private desktop control</p><h1>SoulCord Control Center</h1><p>Compatibility, safety, people, appearance, and recovery—organized around what you need now.</p></div>
        </header>
        {recoveryMode && <div className="soulcord-recovery-banner" role="alert">
            <div><strong>Startup recovery mode is active.</strong><p>Only Plugin Doctor loaded after three interrupted starts within ten minutes. Nothing will be re-enabled silently.</p></div>
            <ActionButton tone="danger" onClick={() => void SoulCordRuntime.leaveRecoveryMode()}>Try normal startup</ActionButton>
        </div>}
        <div className="soulcord-control-center">
            <nav className="soulcord-workspace-nav" aria-label="SoulCord workspaces">{SOULCORD_WORKSPACES.map(item => <button key={item.id} type="button" aria-current={workspace === item.id ? "page" : undefined} onClick={() => setWorkspace(item.id)}><strong>{item.label}</strong><small>{item.summary}</small></button>)}</nav>
            <div className="soulcord-workspace" data-workspace={workspace}>
                <header className="soulcord-workspace-heading"><p className="soulcord-eyebrow">Workspace</p><h2>{selectedWorkspace.label}</h2><p>{selectedWorkspace.summary}</p></header>
                {workspace === "home" && <>
                    {onboarding.status === "pending" && <SetupWizard onReviewPending={openCatalog} />}
                    <SessionPulse openWorkspace={setWorkspace} />
                    <ActivityBridge />
                </>}
                {workspace === "appearance" && <AppearanceWorkspace />}
                {workspace === "safety" && <><StreamShieldControls /><StreamAudienceGuardControls /><LinkWorkbench />{productPreferences.safety.attachmentGuard && <AttachmentGuardWorkbench />}<ScreenshotScrubber /></>}
                {workspace === "people" && <><FriendWatchPanel /><MessageTimelinePanel /><ReturnLaterPanel /></>}
                {workspace === "tools" && <>
                    <SetupManagement />
                    <Section title="Module status" summary="Ready means an implemented adapter passed its current startup validation. Preview still needs a version-specific or hands-on gate."><ModuleTable /></Section>
                    <PluginRecovery />
                    <PerformanceControls />
                    <ProfilesAndHistory />
                    <NativeSuitePanel />
                    <CuratedAddonSet />
                    <CatalogBrowser />
                    <PowerLabStatus />
                    <AboutSoulCord />
                </>}
            </div>
        </div>
    </main>;
}
