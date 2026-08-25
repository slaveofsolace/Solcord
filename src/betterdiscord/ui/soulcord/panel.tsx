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

const {useRef, useState} = React;

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
    const state = useStateFromStores([PluginDoctor, SoulCordRuntime], () => ({records: PluginDoctor.snapshot(), integrity: SoulCordRuntime.integrityStatus()}));
    const [retrying, setRetrying] = useState<string>();
    const [retryStatus, setRetryStatus] = useState("");
    const quarantined = state.records.filter(record => record.quarantinedAt);
    const visibleIntegrity = state.integrity.records.filter(record => record.status !== "match").slice(0, 12);
    const retry = async (id: string) => {
        setRetrying(id);
        const succeeded = await SoulCordRuntime.retryQuarantinedAddon(id);
        setRetryStatus(succeeded ? `${id} passed a fresh integrity audit and started.` : `${id} stayed quarantined because integrity or startup validation did not pass.`);
        setRetrying(undefined);
    };
    return <Section title="Plugin Doctor" summary="Failures are recorded as time, phase, and error class only. Three failures in ten minutes quarantine the addon until you explicitly retry it.">
        <dl className="soulcord-facts"><div><dt>Hash verified</dt><dd>{state.integrity.summary.match}</dd></div><div><dt>Not staged</dt><dd>{state.integrity.summary.missing}</dd></div><div><dt>Integrity attention</dt><dd>{state.integrity.summary.attention}</dd></div><div><dt>Audit unavailable</dt><dd>{state.integrity.summary.unavailable}</dd></div></dl>
        {quarantined.length ? <div className="soulcord-recovery-list">
            {quarantined.map(record => <div className="soulcord-recovery-row" key={record.addonId}>
                <div><strong>{record.addonId}</strong><p>{record.quarantineReason}</p><small>Quarantined {timestamp(record.quarantinedAt)}</small></div>
                <ActionButton tone="danger" disabled={retrying === record.addonId} onClick={() => void retry(record.addonId)}>{retrying === record.addonId ? "Checking…" : "Retry once"}</ActionButton>
            </div>)}
        </div> : <p className="soulcord-empty">No addon is quarantined.</p>}
        {retryStatus && <p role="status" className="soulcord-import-status">{retryStatus}</p>}
        {visibleIntegrity.length ? <div className="soulcord-ledger" aria-label="Curated addon integrity status">
            {visibleIntegrity.map(record => <div className="soulcord-ledger-row" key={`${record.kind}-${record.name}`}><strong>{record.name}</strong><span>{record.kind} · {record.status}{record.status === "missing" ? " (not staged; not quarantined as tampering)" : ""}</span><code>{record.reviewedSha256.slice(0, 12)}…{record.installedSha256 ? ` / ${record.installedSha256.slice(0, 12)}…` : ""}</code></div>)}
            {state.integrity.records.filter(record => record.status !== "match").length > visibleIntegrity.length && <p className="soulcord-empty">Showing the first {visibleIntegrity.length} path-free records. Sanitized diagnostics contain the complete bounded status list.</p>}
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
    return <Section title="Power Lab" summary="Private experiments remain isolated from the daily set. V1 exposes their status honestly; none can be enabled until provenance, teardown, drift, and consent gates pass.">
        <div className="soulcord-power-list">{SOULCORD_POWER_LAB.map(experiment => <div key={experiment.id} className="soulcord-curated-row soulcord-unavailable"><div><div className="soulcord-module-name"><strong>{experiment.name}</strong><span className="soulcord-maturity">unavailable</span></div><p>{experiment.summary}</p></div><label className="soulcord-toggle"><input type="checkbox" checked={false} disabled /><span>Off</span></label></div>)}</div>
    </Section>;
}

export default function SoulCordPanel() {
    const recoveryMode = useStateFromStores(SoulCordRuntime, () => SoulCordRuntime.recoveryMode);
    const onboarding = useStateFromStores(SoulCordSettings, () => SoulCordSettings.snapshot().onboarding);
    const appearance = useStateFromStores(SoulCordSettings, () => SoulCordSettings.snapshot().productPreferences.appearance);
    const [workspace, setWorkspace] = useState<SoulCordWorkspaceId>("home");
    const selectedWorkspace = SOULCORD_WORKSPACES.find(item => item.id === workspace)!;
    return <main className={`soulcord-panel soulcord-density-${appearance.density} soulcord-motion-${appearance.motion}`}>
        <header className="soulcord-header">
            <div className="soulcord-mark" aria-hidden="true"><img src={soulCordMark} alt="" /></div>
            <div><p className="soulcord-eyebrow">SoulCord V1 · Private desktop control</p><h1>SoulCord Control Center</h1><p>Compatibility, safety, people, appearance, and recovery—organized around what you need now.</p></div>
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
                    {onboarding.status === "pending" && <SetupWizard />}
                    <SessionPulse openWorkspace={setWorkspace} />
                    <ActivityBridge />
                </>}
                {workspace === "appearance" && <AppearanceWorkspace />}
                {workspace === "safety" && <><StreamShieldControls /><LinkWorkbench /><AttachmentGuardWorkbench /><ScreenshotScrubber /></>}
                {workspace === "people" && <><FriendWatchPanel /><MessageTimelinePanel /><ReturnLaterPanel /></>}
                {workspace === "tools" && <>
                    <SetupManagement />
                    <Section title="Module status" summary="Ready means an implemented adapter passed its current startup validation. Preview still needs a version-specific or hands-on gate."><ModuleTable /></Section>
                    <PluginRecovery />
                    <PerformanceControls />
                    <ProfilesAndHistory />
                    <CuratedAddonSet />
                    <CatalogBrowser />
                    <PowerLabStatus />
                    <AboutSoulCord />
                </>}
            </div>
        </div>
    </main>;
}
