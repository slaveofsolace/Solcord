import React from "react";

import {useStateFromStores} from "@ui/hooks";
import PluginManager from "@modules/pluginmanager";
import SoulCordRuntime from "@modules/soulcord/runtime";
import SoulCordSettings from "@modules/soulcord/store";
import PluginDoctor from "@modules/soulcord/doctor";
import {SOULCORD_CATALOG_INDEX, SOULCORD_CATALOG_SNAPSHOT, SOULCORD_RUNTIME_ADDONS} from "@common/soulcord/addon-catalog.generated";
import {isSoulCordBuiltInAddon, resolveCommunityAddon} from "@common/soulcord/builtin-addons";
import {inferSoulCordPermissionCard, type SoulCordPermissionCard} from "@common/soulcord/product";

import {SOULCORD_ADDON_GROUPS, SOULCORD_ADDON_PRESENTATION} from "./catalog";

const {useMemo, useState} = React;

function formatBytes(bytes: number): string {
    return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function PermissionCard({permissions}: {permissions: SoulCordPermissionCard;}) {
    const labels = [
        permissions.network && "Network",
        permissions.filesystem && "Files",
        permissions.patching && "Discord patches",
        permissions.messageAccess !== "none" && `Messages: ${permissions.messageAccess}`,
        permissions.accountContext && "Account context",
        permissions.localStorage && "Local storage"
    ].filter(Boolean);
    return <small className="soulcord-permission-card" aria-label="Conservative static capability signals">Capability signals: {labels.length ? labels.join(" · ") : "none found in the reviewed snapshot"}. A signal is not permission to run.</small>;
}

export function CuratedAddonSet() {
    const [busy, setBusy] = useState<string>();
    const [message, setMessage] = useState("");
    const state = useStateFromStores([PluginManager, SoulCordSettings, PluginDoctor, SoulCordRuntime], () => {
        const settings = SoulCordSettings.snapshot();
        const quarantines = new Map(PluginDoctor.snapshot().filter(record => record.quarantinedAt).map(record => [record.addonId, record]));
        const integrity = SoulCordRuntime.integrityStatus();
        const adapterStatus = SoulCordRuntime.curatedAdapterStatus();
        return {
            onboarding: settings.onboarding,
            integrity,
            addons: SOULCORD_RUNTIME_ADDONS.map(candidate => {
                const configured = settings.curatedAddons[candidate.name];
                const builtIn = isSoulCordBuiltInAddon(candidate.name, configured?.mode);
                const addon = resolveCommunityAddon(PluginManager, candidate.name, candidate.fileName);
                const catalog = SOULCORD_CATALOG_INDEX.find(record => record.type === "plugin" && record.name === candidate.name);
                return {
                    ...candidate,
                    configured,
                    builtIn,
                    installed: builtIn || Boolean(addon),
                    enabled: builtIn ? configured?.enabled === true : Boolean(addon && PluginManager.isEnabled(addon.filename)),
                    communityEnabled: Boolean(addon && PluginManager.isEnabled(addon.filename)),
                    adapter: adapterStatus[candidate.name],
                    permissions: catalog ? inferSoulCordPermissionCard(catalog) : undefined,
                    quarantine: configured?.quarantineReason || quarantines.get(candidate.name)?.quarantineReason || quarantines.get(candidate.fileName)?.quarantineReason,
                    integrity: integrity.records.find(record => record.kind === "addon" && record.name === candidate.name)
                };
            })
        };
    });
    const toggle = async (name: string, enabled: boolean) => {
        setBusy(name);
        setMessage("");
        const succeeded = await SoulCordRuntime.setCuratedAddonEnabled(name, enabled);
        setMessage(succeeded ? `${SOULCORD_ADDON_PRESENTATION.get(name)?.label ?? name} ${enabled ? "enabled" : "disabled"}.` : `${name} stayed off because a security, dependency, integrity, action, or runtime gate is not accepted.`);
        setBusy(undefined);
    };
    const canManage = state.onboarding.status === "complete";
    return <section className="soulcord-section">
        <div className="soulcord-section-heading"><h2>Daily add-on set</h2><p>Thirty-six catalog-pinned candidates, grouped by purpose. Static security, dependency, action, runtime, and hash gates remain separate; a pinned file is not automatically approved.</p></div>
        <p className="soulcord-callout">Integrity check: {state.integrity.summary.match} verified · {state.integrity.summary.missing} optional catalog file(s) absent · {state.integrity.summary.attention + state.integrity.summary.unavailable} held for review. An absent optional file is not an error and does not affect SoulCord built-ins.</p>
        {!canManage && <p className="soulcord-callout">Finish the setup transaction before managing this set. Existing local addon states remain unchanged while setup is pending or skipped.</p>}
        <div className="soulcord-curated-groups">
            {SOULCORD_ADDON_GROUPS.map(group => <details key={group.id} open={group.id === "privacy-interaction"}>
                <summary><span><strong>{group.title}</strong><small>{group.summary}</small></span><span>{group.addons.filter(addon => state.addons.find(item => item.name === addon.name)?.enabled).length} / {group.addons.length} on</span></summary>
                <div className="soulcord-curated-list">
                    {group.addons.map(presentation => {
                        const addon = state.addons.find(item => item.name === presentation.name)!;
                        const usingCommunity = addon.builtIn && addon.communityEnabled;
                        const integrityLabel = usingCommunity
                            ? "owner-managed file"
                            : addon.builtIn && addon.integrity?.status === "missing"
                            ? "clean-room built-in"
                            : addon.integrity?.status === "match"
                                ? "hash verified"
                                : addon.integrity?.status === "missing"
                                    ? "optional file absent"
                                    : `${addon.integrity?.status ?? "unavailable"} · held`;
                        return <div className="soulcord-curated-row" key={addon.name}>
                            <div><div className="soulcord-module-name"><strong>{presentation.label}</strong><span className="soulcord-maturity">{addon.installed ? addon.builtIn ? usingCommunity ? "community provider" : "SoulCord built-in" : `local ${addon.version}` : "catalog preview"}</span><span className="soulcord-review-chip">{usingCommunity ? "owner-managed community" : addon.builtIn ? "clean-room built-in" : addon.installable ? "runtime accepted" : addon.securityDisposition.toLocaleLowerCase()}</span><span className={`soulcord-status ${usingCommunity || addon.integrity?.status === "match" || (addon.builtIn && addon.integrity?.status === "missing") ? "soulcord-status-active" : addon.integrity?.status === "missing" ? "soulcord-status-stopped" : "soulcord-status-quarantined"}`}>{integrityLabel}</span>{addon.adapter?.conflict && <span className="soulcord-status soulcord-status-quarantined">provider conflict</span>}{addon.quarantine && <span className="soulcord-status soulcord-status-quarantined">quarantined</span>}</div><p>{presentation.summary}</p>{addon.permissions && <PermissionCard permissions={addon.permissions} />}{addon.integrity?.installedSha256 && <small>Reviewed <code>{addon.integrity.reviewedSha256.slice(0, 12)}…</code> · installed <code>{addon.integrity.installedSha256.slice(0, 12)}…</code></small>}{usingCommunity && <small>The enabled community file remains owner-managed; SoulCord does not certify or claim it.</small>}{addon.adapter?.conflict && <small className="soulcord-error">{addon.adapter.reason}</small>}{addon.enabled && !addon.builtIn && !addon.installable && <small className="soulcord-error">Owner-enabled local state is preserved, but SoulCord has not accepted this candidate and will not re-enable it.</small>}{addon.quarantine && <small className="soulcord-error">{addon.quarantine}</small>}</div>
                            <label className="soulcord-toggle"><input type="checkbox" checked={addon.enabled} disabled={!canManage || !addon.installed || busy === addon.name || (!addon.enabled && !addon.builtIn && !addon.installable)} onChange={event => void toggle(addon.name, event.currentTarget.checked)} /><span>{addon.enabled ? "On" : "Off"}</span></label>
                        </div>;
                    })}
                </div>
            </details>)}
        </div>
        {message && <p className="soulcord-import-status" role="status">{message}</p>}
    </section>;
}

export function CatalogBrowser() {
    const [query, setQuery] = useState("");
    const [type, setType] = useState<"all" | "plugin" | "theme">("all");
    const [disposition, setDisposition] = useState("all");
    const integrity = useStateFromStores(SoulCordRuntime, () => SoulCordRuntime.integrityStatus());
    const matches = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase();
        return SOULCORD_CATALOG_INDEX.filter(candidate => {
            if (type !== "all" && candidate.type !== type) return false;
            if (disposition !== "all" && candidate.targetDisposition !== disposition) return false;
            return !needle || `${candidate.name} ${candidate.description} ${candidate.author} ${candidate.tags.join(" ")}`.toLocaleLowerCase().includes(needle);
        });
    }, [query, type, disposition]);
    const visible = matches.slice(0, 80);
    return <section className="soulcord-section">
        <div className="soulcord-section-heading"><h2>Catalog snapshot</h2><p>Browse 323 metadata-indexed BetterDiscord store records. Forty-seven plugin payloads were statically screened, 36 received manual dispositions, and catalog-theme source/license review is still pending. Browsing does not download or enable anything.</p></div>
        <dl className="soulcord-facts soulcord-catalog-facts"><div><dt>Plugins</dt><dd>{SOULCORD_CATALOG_SNAPSHOT.pluginCount} · <code>{SOULCORD_CATALOG_SNAPSHOT.pluginSha256.slice(0, 12)}…</code></dd></div><div><dt>Themes</dt><dd>{SOULCORD_CATALOG_SNAPSHOT.themeCount} · <code>{SOULCORD_CATALOG_SNAPSHOT.themeSha256.slice(0, 12)}…</code></dd></div><div><dt>Review date</dt><dd>{SOULCORD_CATALOG_SNAPSHOT.reviewedAt}</dd></div><div><dt>Installed integrity</dt><dd>{integrity.summary.match} verified · {integrity.summary.missing} missing · {integrity.summary.attention + integrity.summary.unavailable} held</dd></div></dl>
        <div className="soulcord-catalog-controls">
            <label>Search<input type="search" value={query} onChange={event => setQuery(event.currentTarget.value)} placeholder="name, author, tag, behavior" /></label>
            <label>Type<select value={type} onChange={event => setType(event.currentTarget.value as typeof type)}><option value="all">Plugins and themes</option><option value="plugin">Plugins</option><option value="theme">Themes</option></select></label>
            <label>Disposition<select value={disposition} onChange={event => setDisposition(event.currentTarget.value)}><option value="all">All dispositions</option><option value="CURATED">Curated target</option><option value="OPTIONAL">Optional</option><option value="POWER_LAB">Power Lab</option><option value="HOLD">Hold</option><option value="REJECT">Reject</option></select></label>
        </div>
        <p className="soulcord-catalog-count">{matches.length} matches{matches.length > visible.length ? ` · showing first ${visible.length}` : ""}</p>
        <div className="soulcord-catalog-table" role="table" aria-label="Metadata-indexed BetterDiscord catalog snapshot">
            {visible.map(candidate => <div className="soulcord-catalog-row" role="row" key={`${candidate.type}-${candidate.catalogId}`}>
                <div role="cell"><strong>{candidate.name}</strong><small>{candidate.type} · {candidate.author} · {candidate.tags.slice(0, 4).join(", ") || "untagged"}</small></div>
                <p role="cell">{candidate.description}</p>
                <div role="cell"><span className="soulcord-review-chip">{candidate.targetDisposition}</span><span className="soulcord-review-chip">{candidate.securityDisposition}</span><small>{candidate.requestedByPreset ? "preset candidate · separate security/dependency/action/runtime gates apply" : `${candidate.licenseStatus.toLocaleLowerCase()} license · ${candidate.runtimeStatus.toLocaleLowerCase()} runtime`}</small></div>
            </div>)}
        </div>
        {!visible.length && <p className="soulcord-empty">No catalog record matches these filters.</p>}
        <p className="soulcord-callout">Catalog payloads are not bundled here. The aggressive pack totals {formatBytes(SOULCORD_RUNTIME_ADDONS.reduce((sum, addon) => sum + addon.sizeBytes, 0))} before BDFDB and themes. Every community candidate is currently non-installable, so setup cannot fetch or stage one.</p>
    </section>;
}
