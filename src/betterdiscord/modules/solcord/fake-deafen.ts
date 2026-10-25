// SPDX-License-Identifier: Apache-2.0
// Behavior reference: zentir0g/FakeDeafen@2f529efc9028bdc318bd87ec22157a7e9a8cc4a8 (MIT).
// Solcord's independently written implementation uses scoped patch ownership,
// explicit consent, connection binding, restoration, and fail-closed validation.

export const DISCORD_VOICE_STATE_UPDATE_OPCODE = 4;

export interface SolcordGatewaySocket {
    send(opcode: number, payload: unknown, ...rest: unknown[]): unknown;
}

export interface SolcordVoiceStatePayload {
    channel_id: string | null;
    guild_id?: string | null;
    self_deaf: boolean;
    self_mute: boolean;
    self_video?: boolean;
    [key: string]: unknown;
}

export interface SolcordFakeDeafenStatus {
    phase: "off" | "ready" | "armed" | "attention";
    detail: string;
    connected: boolean;
    accountBound: boolean;
    capturedVoiceState: boolean;
    armed: boolean;
}

export interface SolcordFakeDeafenDependencies {
    getAccountId(): string | undefined;
    getSocket(): SolcordGatewaySocket | undefined;
    getVoiceChannelId(): string | undefined;
    isLocallyDeafened(): boolean;
    toggleLocalDeafen(): void;
    patchSend(socket: SolcordGatewaySocket, observe: (args: unknown[]) => void): (() => void) | null;
    onStatus?(status: SolcordFakeDeafenStatus): void;
}

export interface SolcordFakeDeafenConsentTransition {
    persist(): void;
    synchronize(): Promise<void>;
    failClosed(): void;
}

export interface SolcordFakeDeafenButtonDependencies {
    document: Document;
    getStatus(): SolcordFakeDeafenStatus;
    toggle(): boolean | Promise<boolean>;
    onError?(detail: string): void;
}

/**
 * Keeps one owned control immediately beside Discord's native Deafen button.
 * The native control is cloned only for Discord's current dimensions and icon;
 * no React handlers or private state survive cloneNode. Solcord owns the new
 * event listener, accessible state, badge, observer, and teardown.
 */
export class SolcordFakeDeafenButton {
    #button?: HTMLButtonElement;
    #observer?: MutationObserver;
    #scheduled = false;
    #busy = false;
    #status: SolcordFakeDeafenStatus;

    constructor(private readonly dependencies: SolcordFakeDeafenButtonDependencies) {
        this.#status = dependencies.getStatus();
    }

    start(): boolean {
        if (this.#observer) {
            this.reconcile();
            return true;
        }
        const body = this.dependencies.document.body;
        const Observer = this.dependencies.document.defaultView?.MutationObserver ?? globalThis.MutationObserver;
        if (!body || typeof Observer !== "function") return false;
        this.#observer = new Observer(() => {
            // Discord mutates chat constantly. Once the owned control is in
            // place, those unrelated mutations must cost no query or queued
            // reconciliation work.
            if (this.#button?.isConnected) return;
            this.#schedule();
        });
        this.#observer.observe(body, {childList: true, subtree: true});
        this.reconcile();
        return true;
    }

    update(status: SolcordFakeDeafenStatus): void {
        this.#status = structuredClone(status);
        this.#render();
    }

    reconcile(): boolean {
        this.#scheduled = false;
        if (this.#button?.isConnected) {
            this.#render();
            return true;
        }
        this.#button = undefined;
        const root = this.dependencies.document.querySelector("#app-mount") ?? this.dependencies.document.body;
        const owned = [...root.querySelectorAll<HTMLButtonElement>("button[data-solcord-fake-deafen]")];
        if (owned.length) {
            this.#button = owned.shift();
            for (const duplicate of owned) duplicate.remove();
            this.#button?.addEventListener("click", this.#onClick);
            this.#render();
            return true;
        }
        const native = root.querySelector<HTMLButtonElement>([
            "button[aria-label=\"Deafen\"]",
            "button[aria-label^=\"Deafen \" i]",
            "button[data-list-item-id*=\"deafen\" i]"
        ].join(","));
        if (!native || native.dataset.solcordFakeDeafen !== undefined) return false;
        const button = native.cloneNode(true) as HTMLButtonElement;
        button.removeAttribute("id");
        button.removeAttribute("aria-describedby");
        button.removeAttribute("data-list-item-id");
        for (const child of button.querySelectorAll("[id]")) child.removeAttribute("id");
        button.type = "button";
        button.dataset.solcordFakeDeafen = "true";
        button.classList.add("solcord-fake-deafen-button");
        button.addEventListener("click", this.#onClick);
        native.insertAdjacentElement("afterend", button);
        this.#button = button;
        this.#render();
        return true;
    }

    stop(): void {
        this.#observer?.disconnect();
        this.#observer = undefined;
        this.#scheduled = false;
        this.#button?.removeEventListener("click", this.#onClick);
        this.#button?.remove();
        this.#button = undefined;
        for (const duplicate of this.dependencies.document.querySelectorAll("button[data-solcord-fake-deafen]")) duplicate.remove();
    }

    #schedule(): void {
        if (this.#scheduled) return;
        this.#scheduled = true;
        queueMicrotask(() => this.reconcile());
    }

    #render(): void {
        const button = this.#button;
        if (!button) return;
        const active = this.#status.armed;
        button.dataset.solcordFakeDeafenState = active ? "active" : this.#status.phase;
        button.setAttribute("aria-pressed", String(active));
        button.setAttribute("aria-label", active ? "Fake Deafen on. Click to restore normal deafen state." : "Fake Deafen. Click to toggle.");
        button.title = active ? "Fake Deafen is on — click to restore" : "Toggle Fake Deafen";
        button.disabled = this.#busy;
    }

    #onClick = (event: Event): void => {
        event.preventDefault();
        event.stopPropagation();
        if (this.#busy) return;
        this.#busy = true;
        this.#render();
        void Promise.resolve(this.dependencies.toggle()).catch(() => {
            this.dependencies.onError?.("Fake Deafen could not toggle on this Discord build.");
        }).finally(() => {
            this.#busy = false;
            this.update(this.dependencies.getStatus());
        });
    };
}

/**
 * Persistence is part of the safety boundary: a failed settings write must not
 * prevent an already-live account-risk patch from being torn down. Returning
 * false lets the UI report that the requested durable state was not accepted.
 */
export async function applySolcordFakeDeafenConsentTransition(
    transition: SolcordFakeDeafenConsentTransition
): Promise<boolean> {
    try {
        transition.persist();
        await transition.synchronize();
    }
    catch {
        transition.failClosed();
        return false;
    }
    return true;
}

function discordId(value: unknown): string | undefined {
    return typeof value === "string" && /^[1-9]\d{16,19}$/.test(value) ? value : undefined;
}

export function normalizeVoiceStatePayload(value: unknown): SolcordVoiceStatePayload | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const payload = value as Record<string, unknown>;
    const channel = payload.channel_id === null ? null : discordId(payload.channel_id);
    if (channel === undefined || typeof payload.self_deaf !== "boolean" || typeof payload.self_mute !== "boolean") return;
    if (payload.guild_id !== undefined && payload.guild_id !== null && !discordId(payload.guild_id)) return;
    if (payload.self_video !== undefined && typeof payload.self_video !== "boolean") return;
    return {...payload, channel_id: channel, self_deaf: payload.self_deaf, self_mute: payload.self_mute} as SolcordVoiceStatePayload;
}

export class SolcordFakeDeafenController {
    #socket?: SolcordGatewaySocket;
    #unpatch?: () => void;
    #lastPayload?: SolcordVoiceStatePayload;
    #boundAccountId?: string;
    #armedChannelId?: string;
    #directArmPending = false;
    #status: SolcordFakeDeafenStatus = {
        phase: "off",
        detail: "Adapter is off.",
        connected: false,
        accountBound: false,
        capturedVoiceState: false,
        armed: false
    };

    constructor(private readonly dependencies: SolcordFakeDeafenDependencies) {}

    snapshot(): SolcordFakeDeafenStatus {
        return structuredClone(this.#status);
    }

    start(): boolean {
        if (this.#unpatch) return this.validateOwnership();
        const accountId = discordId(this.dependencies.getAccountId());
        const socket = this.dependencies.getSocket();
        const channelId = discordId(this.dependencies.getVoiceChannelId());
        if (!accountId) {
            this.#setStatus("attention", "A validated signed-in account was not available; Fake Deafen stayed off and patched nothing.");
            return false;
        }
        if (!socket || typeof socket.send !== "function") {
            this.#setStatus("attention", "Discord's scoped gateway sender was not available; nothing was patched.");
            return false;
        }
        const unpatch = this.dependencies.patchSend(socket, args => this.#observeSend(args));
        if (!unpatch) {
            this.#setStatus("attention", "Discord's scoped gateway sender failed structural validation; nothing was patched.");
            return false;
        }
        this.#boundAccountId = accountId;
        this.#socket = socket;
        this.#unpatch = unpatch;
        this.#setStatus("ready", channelId
            ? "Ready. Use the Fake Deafen button beside Discord's normal Deafen control."
            : "Ready. Join a voice channel, then use the Fake Deafen button beside Discord's normal Deafen control.");
        return true;
    }

    validateOwnership(): boolean {
        if (!this.#unpatch) return false;
        if (discordId(this.dependencies.getAccountId()) !== this.#boundAccountId) {
            this.#stop(false, "The Discord account changed; Fake Deafen disarmed and removed its scoped patch.");
            return false;
        }
        if (this.dependencies.getSocket() !== this.#socket) {
            this.#stop(false, "Discord replaced the gateway connection; Fake Deafen disarmed and requires a manual restart.");
            return false;
        }
        if (this.#armedChannelId && discordId(this.dependencies.getVoiceChannelId()) !== this.#armedChannelId) {
            this.#lastPayload = undefined;
            this.#armedChannelId = undefined;
            this.#directArmPending = false;
            this.#setStatus("attention", "The voice connection changed; Fake Deafen disarmed without sending a replacement state.");
            return false;
        }
        return true;
    }

    arm(): boolean {
        if (!this.validateOwnership()) return false;
        if (this.#armedChannelId) return true;
        const accountId = discordId(this.dependencies.getAccountId());
        const channelId = discordId(this.dependencies.getVoiceChannelId());
        if (!accountId || accountId !== this.#boundAccountId) {
            this.#setStatus("attention", "The Discord account changed before arming; Fake Deafen stayed disarmed.");
            return false;
        }
        if (!channelId) {
            this.#setStatus("attention", "Join a voice channel before arming Fake Deafen.");
            return false;
        }
        if (!this.dependencies.isLocallyDeafened()) {
            this.#setStatus("attention", "Deafen normally before arming. Solcord will not invent an unverified voice-state payload.");
            return false;
        }
        if (!this.#lastPayload || this.#lastPayload.channel_id !== channelId || this.#lastPayload.self_deaf !== true) {
            this.#setStatus("attention", "No matching deafened voice-state update has been observed. Toggle normal deafen once, then try again.");
            return false;
        }

        this.#armedChannelId = channelId;
        this.#setStatus("armed", "Armed for this voice connection. Discord receives self-deafened state while local audio is restored.");
        try {this.dependencies.toggleLocalDeafen();}
        catch {
            this.#armedChannelId = undefined;
            this.#setStatus("attention", "Discord's local deafen action failed; Fake Deafen disarmed without sending a replacement state.");
            return false;
        }
        return true;
    }

    /** One-click path used by the adjacent voice control. */
    toggleDirect(): boolean {
        if (!this.validateOwnership()) return false;
        if (this.#armedChannelId) return this.disarm();
        const channelId = discordId(this.dependencies.getVoiceChannelId());
        if (!channelId) {
            this.#setStatus("attention", "Join a voice channel before using Fake Deafen.");
            return false;
        }
        if (this.dependencies.isLocallyDeafened() && this.#lastPayload?.channel_id === channelId && this.#lastPayload.self_deaf) return this.arm();

        this.#directArmPending = true;
        this.#setStatus("ready", "Activating Fake Deafen from the adjacent voice control.");
        try {
            // If normal Deafen was already active before Solcord observed the
            // connection, cycle it once to obtain a current Discord-owned
            // payload instead of fabricating a gateway shape.
            if (this.dependencies.isLocallyDeafened()) this.dependencies.toggleLocalDeafen();
            this.dependencies.toggleLocalDeafen();
        }
        catch {
            this.#directArmPending = false;
            this.#setStatus("attention", "Discord's native Deafen action failed; Fake Deafen stayed off.");
            return false;
        }
        if (!this.#directArmPending) return this.#status.armed;
        if (this.#lastPayload?.channel_id === channelId && this.#lastPayload.self_deaf && this.dependencies.isLocallyDeafened()) {
            this.#directArmPending = false;
            return this.arm();
        }
        return true;
    }

    disarm(): boolean {
        if (!this.#armedChannelId) return true;
        if (!this.validateOwnership()) return false;
        const accountId = discordId(this.dependencies.getAccountId());
        const channelId = discordId(this.dependencies.getVoiceChannelId());
        const socket = this.#socket;
        const payload = this.#lastPayload;
        this.#armedChannelId = undefined;
        this.#directArmPending = false;
        if (!accountId || accountId !== this.#boundAccountId) {
            this.#setStatus("attention", "Disarmed after an account change. No voice-state payload was sent to the new account.");
            return false;
        }
        if (!channelId || !socket || !payload || payload.channel_id !== channelId) {
            this.#setStatus("ready", "Disarmed. The voice connection changed, so Solcord sent no synthetic state.");
            return false;
        }
        try {
            socket.send(DISCORD_VOICE_STATE_UPDATE_OPCODE, {...payload, channel_id: channelId, self_deaf: this.dependencies.isLocallyDeafened()});
            this.#setStatus("ready", "Disarmed and restored the server-visible deafen state to match the local client.");
            return true;
        }
        catch {
            this.#setStatus("attention", "Disarmed locally, but Discord's state-restoration send failed. Toggle normal deafen once to resynchronize.");
            return false;
        }
    }

    stop(): boolean {
        return this.#stop(true, "Adapter is off; its scoped patch was removed.");
    }

    #stop(restore: boolean, detail: string): boolean {
        const restored = !restore || this.disarm();
        const restorationDetail = this.#status.detail;
        const unpatch = this.#unpatch;
        this.#socket = undefined;
        this.#lastPayload = undefined;
        this.#boundAccountId = undefined;
        this.#armedChannelId = undefined;
        this.#directArmPending = false;
        try {unpatch?.();}
        catch (error) {
            // Keep the exact cleanup callback. A later stop may retry it, but
            // start must not stack another patch over the one still owned here.
            this.#setStatus("attention", "Cleanup is incomplete. Fake Deafen is disarmed and will not load another patch until cleanup succeeds.");
            throw error;
        }
        this.#unpatch = undefined;
        if (restore && !restored) this.#setStatus("attention", restorationDetail);
        else this.#setStatus(restore ? "off" : "attention", detail);
        return restored;
    }

    #observeSend(args: unknown[]): void {
        if (args[0] !== DISCORD_VOICE_STATE_UPDATE_OPCODE) return;
        const payload = normalizeVoiceStatePayload(args[1]);
        if (!payload) {
            this.#lastPayload = undefined;
            this.#armedChannelId = undefined;
            this.#setStatus("attention", "Discord's voice-state shape changed; Fake Deafen failed closed and needs a fresh validated update before arming.");
            return;
        }
        this.#lastPayload = structuredClone(payload);
        const currentAccountId = discordId(this.dependencies.getAccountId());
        if (!currentAccountId || currentAccountId !== this.#boundAccountId) {
            this.#lastPayload = undefined;
            this.#armedChannelId = undefined;
            this.#setStatus("attention", "The Discord account changed; Fake Deafen failed closed and stopped rewriting voice state.");
            return;
        }
        const currentChannelId = discordId(this.dependencies.getVoiceChannelId());
        if (payload.channel_id === null || !currentChannelId) {
            this.#armedChannelId = undefined;
            this.#directArmPending = false;
            this.#setStatus("ready", "Voice disconnected; Fake Deafen disarmed automatically.");
            return;
        }
        if (this.#directArmPending && payload.self_deaf) {
            queueMicrotask(() => {
                if (!this.#directArmPending || this.#armedChannelId) return;
                this.#directArmPending = false;
                this.arm();
            });
        }
        if (!this.#armedChannelId) {
            this.#setStatus("ready", payload.self_deaf
                ? "Deafened voice state validated. Use the adjacent Fake Deafen button to toggle it."
                : "Voice state validated. Use the adjacent Fake Deafen button to toggle it.");
            return;
        }
        if (payload.channel_id !== this.#armedChannelId || currentChannelId !== this.#armedChannelId) {
            this.#armedChannelId = undefined;
            this.#setStatus("attention", "Voice channel changed; Fake Deafen disarmed and passed the new state through unchanged.");
            return;
        }
        args[1] = {...payload, self_deaf: true};
        this.#setStatus("armed", "Armed for this voice connection. Server-visible self-deafen is held while local audio remains under your control.");
    }

    #setStatus(phase: SolcordFakeDeafenStatus["phase"], detail: string): void {
        this.#status = {
            phase,
            detail,
            connected: Boolean(discordId(this.dependencies.getVoiceChannelId())),
            accountBound: Boolean(this.#boundAccountId && discordId(this.dependencies.getAccountId()) === this.#boundAccountId),
            capturedVoiceState: Boolean(this.#lastPayload),
            armed: Boolean(this.#armedChannelId)
        };
        this.dependencies.onStatus?.(this.snapshot());
    }
}
