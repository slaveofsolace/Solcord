export type SolcordPeopleObjectKind = "dm" | "server" | "user" | "server-channel" | "unsupported-channel" | "not-loaded" | "invalid";

export interface SolcordPeopleObjectResolution {
    id: string;
    kind: SolcordPeopleObjectKind;
    label: string;
    serverId?: string;
    canPinDm: boolean;
    canManageServer: boolean;
}

export interface SolcordPeopleObjectSources {
    channel(id: string): {id?: unknown; type?: unknown; guildId?: unknown;} | undefined;
    server(id: string): {id?: unknown; name?: unknown;} | undefined;
    user(id: string): {id?: unknown; label?: unknown;} | undefined;
}

const EMPTY_RESOLUTION: Readonly<Omit<SolcordPeopleObjectResolution, "id" | "kind" | "label">> = Object.freeze({
    canPinDm: false,
    canManageServer: false
});

function safeLookup<T>(lookup: () => T | undefined): T | undefined {
    try {return lookup();}
    catch {return undefined;}
}

function boundedLabel(value: unknown, fallback: string): string {
    if (typeof value !== "string") return fallback;
    const label = [...value].map(character => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127 ? " " : character;
    }).join("").replace(/\s+/g, " ").trim();
    return label ? [...label].slice(0, 80).join("") : fallback;
}

export function resolveSolcordPeopleObject(rawId: unknown, sources: SolcordPeopleObjectSources): SolcordPeopleObjectResolution {
    const id = typeof rawId === "string" ? rawId.trim() : "";
    if (!/^\d{1,32}$/.test(id)) return {id, kind: "invalid", label: "Enter a valid Discord ID.", ...EMPTY_RESOLUTION};

    const channel = safeLookup(() => sources.channel(id));
    if (channel?.id === id) {
        if (channel.type === 1 || channel.type === 3) {
            return {id, kind: "dm", label: channel.type === 3 ? "Loaded group DM" : "Loaded direct message", canPinDm: true, canManageServer: false};
        }
        const serverId = typeof channel.guildId === "string" && /^\d{1,32}$/.test(channel.guildId) ? channel.guildId : undefined;
        if (serverId) return {id, kind: "server-channel", label: "Loaded server channel. Use the server ID for server actions.", serverId, ...EMPTY_RESOLUTION};
        return {id, kind: "unsupported-channel", label: "Loaded channel is not a direct message or server.", ...EMPTY_RESOLUTION};
    }

    const server = safeLookup(() => sources.server(id));
    if (server?.id === id) {
        return {id, kind: "server", label: `Loaded server: ${boundedLabel(server.name, "Unnamed server")}`, canPinDm: false, canManageServer: true};
    }

    const user = safeLookup(() => sources.user(id));
    if (user?.id === id) {
        return {id, kind: "user", label: `Loaded user: ${boundedLabel(user.label, "Unknown user")}. Open their DM to pin the conversation.`, ...EMPTY_RESOLUTION};
    }

    return {id, kind: "not-loaded", label: "Object not loaded. Open the DM, server, or profile in Discord, then try again.", ...EMPTY_RESOLUTION};
}

export function currentSolcordPeopleObjectId(
    selectedChannelId: unknown,
    selectedServerId: unknown,
    sources: Pick<SolcordPeopleObjectSources, "channel" | "server">
): string | undefined {
    const channelId = typeof selectedChannelId === "string" && /^\d{1,32}$/.test(selectedChannelId) ? selectedChannelId : undefined;
    if (channelId) {
        const channel = safeLookup(() => sources.channel(channelId));
        if (channel?.id === channelId && (channel.type === 1 || channel.type === 3)) return channelId;
        const serverId = channel?.id === channelId && typeof channel.guildId === "string" && /^\d{1,32}$/.test(channel.guildId) ? channel.guildId : undefined;
        if (serverId && safeLookup(() => sources.server(serverId))?.id === serverId) return serverId;
    }
    const serverId = typeof selectedServerId === "string" && /^\d{1,32}$/.test(selectedServerId) ? selectedServerId : undefined;
    return serverId && safeLookup(() => sources.server(serverId))?.id === serverId ? serverId : undefined;
}
