import React from "react";

import {useStateFromStores} from "@ui/hooks";
import SoulCordRuntime from "@modules/soulcord/runtime";
import SoulCordSettings from "@modules/soulcord/store";
import type {SoulCordTimelinePolicy} from "@modules/soulcord/contracts";

const {useState} = React;

function bytesLabel(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function time(value: number): string {
    return new Date(value).toLocaleString();
}

export default function MessageTimelinePanel() {
    const [statusMessage, setStatusMessage] = useState("");
    const state = useStateFromStores([SoulCordRuntime, SoulCordSettings], () => ({
        policy: SoulCordSettings.snapshot().timelinePolicy,
        status: SoulCordRuntime.timelineStatus(),
        entries: SoulCordRuntime.timelineEntries(),
        currentChannel: SoulCordRuntime.timelineCurrentChannel()
    }));
    const update = (value: Partial<SoulCordTimelinePolicy>) => void SoulCordRuntime.setTimelinePolicy(value);
    const clear = async () => {
        if (!window.confirm("Clear the active account’s SoulCord Message Timeline? This removes the encrypted local segments and the current renderer journal. It cannot be undone.")) return;
        let outcome = await SoulCordRuntime.clearTimeline(false);
        if (outcome.status === "complete") {
            setStatusMessage(`Message Timeline cleared. ${outcome.cleared} local record or segment item(s) were removed; none remain.`);
            return;
        }
        if (outcome.requiresOpaqueRecovery) {
            setStatusMessage(`Timeline clear is incomplete: ${outcome.remaining} item(s) remain across ${outcome.opaqueStores} encrypted store(s). Renderer history remains visible until cleanup is confirmed complete.`);
            if (!window.confirm(`SoulCord could not map ${outcome.opaqueStores} encrypted Timeline store(s) to the active account because the previous safeStorage identity is unavailable. Clear every opaque SoulCord Timeline store now? This can remove Timeline history from other local Discord accounts and cannot be undone.`)) return;
            outcome = await SoulCordRuntime.clearTimeline(true);
            if (outcome.status === "complete") {
                setStatusMessage(`All opaque Timeline stores were cleared. ${outcome.cleared} local record or segment item(s) were removed; none remain.`);
                return;
            }
        }
        setStatusMessage(outcome.status === "unavailable"
            ? "Timeline was not cleared because no validated account scope or private storage capability was available."
            : `Timeline clear was not confirmed complete; ${outcome.remaining} item(s) remain. Renderer history was kept visible so the result is not misrepresented.`);
    };
    const exportTimeline = async () => {
        if (!window.confirm("Export the current account’s private Message Timeline as readable JSON? The export can contain message text, edits, channel/message identifiers, and attachment metadata. Keep it private.")) return;
        setStatusMessage(await SoulCordRuntime.exportTimeline() ? "Timeline export downloaded locally." : "Timeline export was unavailable for the current account scope.");
    };
    const toggleCurrentChannel = async () => {
        const included = !state.currentChannel.included;
        setStatusMessage(await SoulCordRuntime.setCurrentChannelInTimeline(included) ? `Current server channel ${included ? "added to" : "removed from"} Timeline scope.` : "Open a server text channel before changing its Timeline scope.");
    };
    return <section className="soulcord-section">
        <div className="soulcord-section-heading"><h2>Message Timeline</h2><p>A private, encrypted journal for messages this running client actually observes. DMs are the default; servers require explicit channel-by-channel opt-in.</p></div>
        <div className="soulcord-timeline-toolbar">
            <label><input type="checkbox" checked={state.policy.enabled} onChange={event => update({enabled: event.currentTarget.checked})} /> Timeline {state.policy.enabled ? "on" : "off"}</label>
            <label>Retention<select value={state.policy.retention} onChange={event => update({retention: event.currentTarget.value as SoulCordTimelinePolicy["retention"]})}><option value="session">Session</option><option value="24-hours">24 hours</option><option value="7-days">7 days</option><option value="30-days">30 days</option><option value="90-days">90 days</option><option value="manual">Manual clear</option></select></label>
            <label>Content<select value={state.policy.content} onChange={event => update({content: event.currentTarget.value as SoulCordTimelinePolicy["content"]})}><option value="text-only">Text only</option><option value="text-and-metadata">Text + attachment metadata</option><option value="encrypted-media" disabled>Encrypted media — not accepted</option></select></label>
            <button type="button" className="soulcord-action" disabled={!state.currentChannel.eligible} onClick={() => void toggleCurrentChannel()}>{state.currentChannel.included ? "Remove current server channel" : "Add current server channel"}</button>
            <button type="button" className="soulcord-action" onClick={() => void exportTimeline()}>Export JSON</button>
            <button type="button" className="soulcord-action soulcord-action-danger" onClick={() => void clear()}>Clear Timeline</button>
        </div>
        <dl className="soulcord-facts soulcord-timeline-facts">
            <div><dt>Storage</dt><dd>{state.status.persistent ? "AES-256-GCM · safeStorage-wrapped key" : "session only · secure storage unavailable or disabled"}</dd></div>
            <div><dt>Observed records</dt><dd>{state.status.records}</dd></div>
            <div><dt>Deleted / edited</dt><dd>{state.status.deleted} / {state.status.edited}</dd></div>
            <div><dt>Text used</dt><dd>{bytesLabel(state.status.textBytes)} of 250 MiB</dd></div>
            <div><dt>Server opt-ins</dt><dd>{state.policy.serverChannelIds.length}</dd></div>
        </dl>
        {statusMessage && <p className="soulcord-import-status" role="status">{statusMessage}</p>}
        <div className="soulcord-timeline-list" aria-label="Observed Message Timeline records">
            {state.entries.slice(0, 100).map(entry => <article key={entry.messageId} className={`soulcord-timeline-entry ${entry.deletedAt ? "soulcord-timeline-deleted" : ""}`}>
                <header><strong>{entry.authorLabel || "Observed user"}</strong><time>{time(entry.updatedAt)}</time>{entry.deletedAt && <span className="soulcord-deleted-label">Deleted</span>}{entry.edits.length > 0 && <span className="soulcord-edited-label">Edited · {entry.edits.length}</span>}</header>
                <p>{entry.content || <em>No text content</em>}</p>
                {entry.edits.length > 0 && <details><summary>Edit history</summary><ol>{entry.edits.slice().reverse().map((edit, index) => <li key={`${edit.at}-${index}`}><time>{time(edit.at)}</time><p>{edit.content || <em>Empty text</em>}</p></li>)}</ol></details>}
                {entry.attachments.length > 0 && <ul className="soulcord-attachment-metadata">{entry.attachments.map((attachment, index) => <li key={`${attachment.name}-${index}`}>{attachment.name}{attachment.contentType ? ` · ${attachment.contentType}` : ""}{typeof attachment.size === "number" ? ` · ${bytesLabel(attachment.size)}` : ""}</li>)}</ul>}
            </article>)}
            {!state.entries.length && <p className="soulcord-empty">No in-scope message event has been observed in this session. SoulCord does not backfill history.</p>}
            {state.entries.length > 100 && <p className="soulcord-empty">Showing the 100 most recent records in settings. Export includes the active encrypted segment set.</p>}
        </div>
        <p className="soulcord-callout">Message meaning never depends on color: deleted entries carry a “Deleted” label and edit history carries an “Edited” label. Message bodies and identifiers are excluded from SoulCord diagnostics and ordinary settings exports.</p>
    </section>;
}
