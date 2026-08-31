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

/**
 * Persistence is part of the safety boundary: a failed settings write must not
 * prevent an already-live account-risk patch from being torn down. Returning
 * false lets the UI report that the requested durable state was not accepted.
 */
export async function applySolcordFakeDeafenConsentTransition(
    transition: SolcordFakeDeafenConsentTransition
): Promise<boolean> {
    try {transition.persist();}
    catch {
        transition.failClosed();
        return false;
    }
    await transition.synchronize();
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
            ? "Ready. Deafen normally once so Solcord can validate the current voice-state shape, then arm explicitly."
            : "Ready. Join a voice channel, deafen normally once, then arm explicitly.");
        return true;
    }

    validateOwnership(): boolean {
        if (!this.#unpatch) return false;
        if (discordId(this.dependencies.getAccountId()) !== this.#boundAccountId) {
            this.#stop(false, "The Discord account changed; Fake Deafen disarmed and removed its scoped patch.");
            return false;
        }
        if (this.dependencies.getSocket() === this.#socket) return true;
        this.#stop(false, "Discord replaced the gateway connection; Fake Deafen disarmed and requires a manual restart.");
        return false;
    }

    arm(): boolean {
        if (!this.validateOwnership()) return false;
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

    disarm(): boolean {
        if (!this.#armedChannelId) return true;
        if (!this.validateOwnership()) return false;
        const accountId = discordId(this.dependencies.getAccountId());
        const channelId = discordId(this.dependencies.getVoiceChannelId());
        const socket = this.#socket;
        const payload = this.#lastPayload;
        this.#armedChannelId = undefined;
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
        this.#unpatch = undefined;
        this.#socket = undefined;
        this.#lastPayload = undefined;
        this.#boundAccountId = undefined;
        this.#armedChannelId = undefined;
        try {unpatch?.();}
        finally {
            if (restore && !restored) this.#setStatus("attention", restorationDetail);
            else this.#setStatus(restore ? "off" : "attention", detail);
        }
        return restored;
    }

    #observeSend(args: unknown[]): void {
        if (args[0] !== DISCORD_VOICE_STATE_UPDATE_OPCODE) return;
        const payload = normalizeVoiceStatePayload(args[1]);
        if (!payload) {
            if (this.#armedChannelId) {
                this.#armedChannelId = undefined;
                this.#setStatus("attention", "Discord's voice-state shape changed; Fake Deafen failed closed and stopped rewriting state.");
            }
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
            this.#setStatus("ready", "Voice disconnected; Fake Deafen disarmed automatically.");
            return;
        }
        if (!this.#armedChannelId) {
            this.#setStatus("ready", payload.self_deaf
                ? "Deafened voice state validated. Fake Deafen is ready for an explicit arm action."
                : "Voice state validated. Deafen normally before arming Fake Deafen.");
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
