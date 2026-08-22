import React from "react";

import {useStateFromStores} from "@ui/hooks";
import PluginManager from "@modules/pluginmanager";
import SoulCordRuntime from "@modules/soulcord/runtime";
import SoulCordSettings from "@modules/soulcord/store";
import PluginDoctor from "@modules/soulcord/doctor";
import type {SoulCordModuleId} from "@modules/soulcord/contracts";
import type {LinkInspection} from "@modules/soulcord/link-lens";

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
        {state.health.map(health => {
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
        })}
    </div>;
}

function ActivityBridge() {
    const activity = useStateFromStores(SoulCordRuntime, () => SoulCordRuntime.activityHealth());
    const events = activity?.events.slice(-8).reverse() ?? [];
    return <Section title="Activity Bridge" summary="The unrestricted preload override defaults to off. SoulCord permits one later absolute preload only when canonical paths prove it belongs to the same Discord package root.">
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
    const records = useStateFromStores(PluginDoctor, () => PluginDoctor.snapshot());
    const quarantined = records.filter(record => record.quarantinedAt);
    const retry = (id: string) => {
        const addon = PluginManager.resolveAddon(id);
        if (!addon) return;
        if (!PluginDoctor.clearQuarantine(id)) return;
        PluginManager.state[addon.id] = true;
        PluginManager.saveState();
        PluginManager.startAddon(addon);
    };
    return <Section title="Plugin Doctor" summary="Failures are recorded as time, phase, and error class only. Three failures in ten minutes quarantine the addon until you explicitly retry it.">
        {quarantined.length ? <div className="soulcord-recovery-list">
            {quarantined.map(record => <div className="soulcord-recovery-row" key={record.addonId}>
                <div><strong>{record.addonId}</strong><p>{record.quarantineReason}</p><small>Quarantined {timestamp(record.quarantinedAt)}</small></div>
                <ActionButton tone="danger" onClick={() => retry(record.addonId)}>Retry once</ActionButton>
            </div>)}
        </div> : <p className="soulcord-empty">No addon is quarantined.</p>}
    </Section>;
}

function ProfilesAndHistory() {
    const document = useStateFromStores(SoulCordSettings, () => SoulCordSettings.snapshot());
    const [profileId, setProfileId] = useState(document.profiles[0]?.id ?? "");
    const [newName, setNewName] = useState("");
    const [importStatus, setImportStatus] = useState("");
    const diff = profileId ? SoulCordSettings.previewProfile(profileId) : [];
    const selected = document.profiles.find(profile => profile.id === profileId);
    const apply = () => {
        if (!selected) return;
        const thirdPartyWarning = selected.includesThirdPartyAddons ? " This profile names third-party addons; SoulCord will not execute them automatically." : "";
        if (!window.confirm(`Apply ${selected.name}? SoulCord will snapshot the current state first.${thirdPartyWarning}`)) return;
        void SoulCordRuntime.applyProfile(selected.id);
    };
    const save = () => {
        try {
            const profile = SoulCordSettings.saveProfile(newName);
            setNewName("");
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
            const changes = SoulCordRuntime.previewSettingsImport(text);
            if (!changes) {
                setImportStatus("Choose an unmodified SoulCord settings export.");
                return;
            }
            const preview = changes.length ? changes.map(change => `• ${change}`).join("\n") : "No module or profile differences.";
            if (!window.confirm(`Import this validated SoulCord settings file? The current state will be snapshotted first.\n\nComplete preview:\n${preview}`)) {
                setImportStatus("Import cancelled; no settings changed.");
                return;
            }
            const imported = await SoulCordRuntime.importSettings(text);
            setImportStatus(imported ? "Settings imported. A rollback snapshot was kept." : "Import failed validation; no settings changed.");
        }
        catch {
            setImportStatus("The settings file could not be read locally.");
        }
    };
    return <Section title="Profiles and Time Machine" summary="Every apply or setting change captures a bounded local snapshot. Profile exports exclude secrets and do not execute third-party plugins.">
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
                    <ActionButton tone="accent" onClick={apply} disabled={!selected}>Apply with snapshot</ActionButton>
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
                    <ActionButton onClick={save} disabled={!newName.trim()}>Save current state</ActionButton>
                </div>
                {importStatus && <p className="soulcord-import-status" role="status">{importStatus}</p>}
            </div>
            <div>
                <strong>Recent snapshots</strong>
                <div className="soulcord-snapshot-list">
                    {document.snapshots.slice(-6).reverse().map(snapshot => <div key={snapshot.id} className="soulcord-snapshot-row">
                        <div><span>{snapshot.reason}</span><small>{timestamp(snapshot.createdAt)}</small></div>
                        <ActionButton onClick={() => {
                            if (window.confirm(`Roll back to “${snapshot.reason}”? A snapshot of the current state will be kept.`)) void SoulCordRuntime.rollback(snapshot.id);
                        }}>Roll back</ActionButton>
                    </div>)}
                    {!document.snapshots.length && <p className="soulcord-empty">No snapshot has been captured yet.</p>}
                </div>
            </div>
        </div>
    </Section>;
}

function PrivacyControls() {
    const document = useStateFromStores(SoulCordSettings, () => SoulCordSettings.snapshot());
    const performance = document.modules["performance-hud"].values;
    const shield = document.modules["stream-shield"].values;
    const accessibility = document.modules["accessibility-toolkit"].values;
    const setting = (id: SoulCordModuleId, key: string, value: unknown) => void SoulCordRuntime.setValue(id, key, value);
    return <Section title="Live controls" summary="Every control is local and reversible. No control sends a message, joins a call, starts a stream, uploads a file, or changes account state.">
        <div className="soulcord-control-grid">
            <label><input type="checkbox" checked={performance.showOverlay === true} onChange={event => setting("performance-hud", "showOverlay", event.currentTarget.checked)} /> Performance overlay</label>
            <label><input type="checkbox" checked={shield.previewActive === true} onChange={event => setting("stream-shield", "previewActive", event.currentTarget.checked)} /> Stream Shield preview</label>
            <label><input type="checkbox" checked={shield.manualActive === true} onChange={event => setting("stream-shield", "manualActive", event.currentTarget.checked)} /> Stream Shield manual state</label>
            <label><input type="checkbox" checked={shield.redactGuilds === true} onChange={event => setting("stream-shield", "redactGuilds", event.currentTarget.checked)} /> Redact guild identity</label>
            <label><input type="checkbox" checked={shield.redactChannels === true} onChange={event => setting("stream-shield", "redactChannels", event.currentTarget.checked)} /> Redact channel names</label>
            <label><input type="checkbox" checked={shield.redactDMs === true} onChange={event => setting("stream-shield", "redactDMs", event.currentTarget.checked)} /> Redact DM identity</label>
            <label><input type="checkbox" checked={shield.redactNotifications === true} onChange={event => setting("stream-shield", "redactNotifications", event.currentTarget.checked)} /> Redact notifications</label>
            <label><input type="checkbox" checked={shield.redactNotes === true} onChange={event => setting("stream-shield", "redactNotes", event.currentTarget.checked)} /> Redact local notes</label>
            <label><input type="checkbox" checked={shield.redactAccount === true} onChange={event => setting("stream-shield", "redactAccount", event.currentTarget.checked)} /> Redact account area</label>
            <label><input type="checkbox" checked={accessibility.reducedMotion === true} onChange={event => setting("accessibility-toolkit", "reducedMotion", event.currentTarget.checked)} /> Reduced motion</label>
            <label><input type="checkbox" checked={accessibility.roleContrast === true} onChange={event => setting("accessibility-toolkit", "roleContrast", event.currentTarget.checked)} /> Role contrast aid</label>
            <label><input type="checkbox" checked={accessibility.readingRuler === true} onChange={event => setting("accessibility-toolkit", "readingRuler", event.currentTarget.checked)} /> Reading ruler</label>
            <label className="soulcord-range-control">Reading width
                <input type="range" min="0" max="1200" step="40" value={Number(accessibility.readingWidth) || 0} aria-label="Reading width in pixels; zero uses Discord default" onChange={event => setting("accessibility-toolkit", "readingWidth", Number(event.currentTarget.value))} />
                <output>{Number(accessibility.readingWidth) ? `${accessibility.readingWidth} px` : "Discord default"}</output>
            </label>
        </div>
        <p className="soulcord-key-hint"><kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>K</kbd> opens Command Deck. <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> toggles Stream Shield when enabled.</p>
    </Section>;
}

function LinkWorkbench() {
    const [input, setInput] = useState("");
    const [inspection, setInspection] = useState<LinkInspection>();
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
        </div>}
    </Section>;
}

function ScreenshotScrubber() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sourceRef = useRef<HTMLImageElement | undefined>(undefined);
    const dragRef = useRef<{x: number; y: number;} | null>(null);
    const [loaded, setLoaded] = useState(false);
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
    const load = (file?: File) => {
        setError("");
        const supportedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
        if (!file || !supportedTypes.has(file.type)) {
            setLoaded(false);
            setError("Choose a PNG, JPEG, or WebP image.");
            return;
        }
        if (file.size > 25 * 1024 * 1024) {
            setLoaded(false);
            setError("The local image exceeds the 25 MB safety limit.");
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const image = new Image();
            image.onload = () => {
                if (image.naturalWidth * image.naturalHeight > 40_000_000) {
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
            };
            image.onerror = () => {
                setLoaded(false);
                setError("The image could not be decoded locally.");
            };
            image.src = String(reader.result);
        };
        reader.onerror = () => {
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
            <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose screenshot" onChange={event => load(event.currentTarget.files?.[0])} />
            <label>Tool <select value={mode} onChange={event => setMode(event.currentTarget.value as "cover" | "blur")}><option value="cover">Solid cover</option><option value="blur">Blur</option></select></label>
            <ActionButton onClick={drawSource} disabled={!loaded}>Reset</ActionButton>
            <ActionButton tone="accent" onClick={download} disabled={!loaded}>Download PNG</ActionButton>
        </div>
        <fieldset className="soulcord-region-grid" disabled={!loaded}>
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
            onPointerDown={event => {dragRef.current = point(event); event.currentTarget.setPointerCapture(event.pointerId);}}
            onPointerUp={finish}
            onPointerCancel={() => {dragRef.current = null;}}
        />
        {error && <p className="soulcord-error" role="alert">{error}</p>}
        {!loaded && <p className="soulcord-empty">No local image selected.</p>}
    </Section>;
}

function AboutSoulCord() {
    return <Section title="About SoulCord" summary="A reliability, privacy, and productivity fork built on BetterDiscord’s open-source foundation.">
        <div className="soulcord-about-grid">
            <p><strong>Why it exists.</strong> SoulCord keeps the BetterDiscord plugin and theme ecosystem while tightening recovery behavior and restoring Discord Activities through a bounded same-package preload policy.</p>
            <p><strong>What it does not do.</strong> It does not grant Nitro, forge entitlements, extract tokens, log messages, send on your behalf, send SoulCord telemetry, or enable the global unrestricted preload override.</p>
            <p><strong>Privacy.</strong> Module state, snapshots, and diagnostics stay local. Sanitized exports omit tokens, message content, server names, account identifiers, and absolute paths.</p>
            <p><strong>Maturity.</strong> Automated and synthetic checks can prove policy behavior; only the owner’s post-launch Codenames and second-Activity checks can complete live human acceptance.</p>
        </div>
        <p className="soulcord-attribution">Based on BetterDiscord. Upstream contributors, Apache-2.0 licensing, ecosystem-compatible identifiers, and fork lineage are preserved.</p>
    </Section>;
}

export default function SoulCordPanel() {
    const recoveryMode = useStateFromStores(SoulCordRuntime, () => SoulCordRuntime.recoveryMode);
    return <main className="soulcord-panel">
        <header className="soulcord-header">
            <div className="soulcord-mark" aria-hidden="true"><span>S</span><i /></div>
            <div><p className="soulcord-eyebrow">Local power fork · V1</p><h1>SoulCord Suite</h1><p>Compatibility you can inspect. Recovery you control.</p></div>
        </header>
        {recoveryMode && <div className="soulcord-recovery-banner" role="alert">
            <div><strong>Startup recovery mode is active.</strong><p>Only Plugin Doctor loaded after three interrupted starts within ten minutes. Nothing will be re-enabled silently.</p></div>
            <ActionButton tone="danger" onClick={() => void SoulCordRuntime.leaveRecoveryMode()}>Try normal startup</ActionButton>
        </div>}
        <ActivityBridge />
        <Section title="Module status" summary="Ready means a live adapter is attached. Preview means useful behavior exists but a volatile Discord lookup or a human visual gate is still pending."><ModuleTable /></Section>
        <PluginRecovery />
        <ProfilesAndHistory />
        <PrivacyControls />
        <LinkWorkbench />
        <ScreenshotScrubber />
        <AboutSoulCord />
    </main>;
}
