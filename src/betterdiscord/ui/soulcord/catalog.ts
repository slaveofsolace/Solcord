export interface SoulCordAddonPresentation {
    name: string;
    label: string;
    summary: string;
}

export interface SoulCordAddonGroup {
    id: string;
    title: string;
    summary: string;
    addons: readonly SoulCordAddonPresentation[];
}

export const SOULCORD_ADDON_GROUPS: readonly SoulCordAddonGroup[] = [
    {
        id: "privacy-interaction",
        title: "Privacy and interaction",
        summary: "One bounded analytics control, typing privacy, and faster reply handling.",
        addons: [
            {name: "DoNotTrack", label: "Do Not Track", summary: "Stops one validated Discord analytics track path. It does not block crash reports, process checks, or network requests."},
            {name: "InvisibleTyping", label: "Invisible Typing", summary: "Suppresses one validated outgoing typing-start path while the built-in is enabled."},
            {name: "DoubleClickToReply", label: "Double Click to Reply", summary: "Opens Discord’s normal reply composer; it never sends."},
            {name: "PinDMs", label: "Pin DMs", summary: "Keeps selected conversations in a local pinned section."},
            {name: "MessagePeek", label: "Message Peek", summary: "Previews recent conversation context without marking it read."},
            {name: "FileNameRandomization", label: "Filename Randomization", summary: "Offers less identifying names for outgoing files."},
            {name: "BlurNSFW", label: "Blur NSFW", summary: "Locally blurs media in channels Discord marks as age-restricted."}
        ]
    },
    {
        id: "voice-calls",
        title: "Voice and calls",
        summary: "Desktop voice messages, call context, and practical audio controls.",
        addons: [
            {name: "VoiceMessages", label: "Voice Messages", summary: "Adds record, preview, cancel, and explicit upload controls on desktop."},
            {name: "VoiceActivity", label: "Voice Activity", summary: "Shows local voice activity context in the client."},
            {name: "ShowSpectators", label: "Show Spectators", summary: "Displays users watching a stream when Discord exposes them."},
            {name: "CallTimeCounter", label: "Call Time Counter", summary: "Shows elapsed call time locally."},
            {name: "BetterVolume", label: "Better Volume", summary: "Provides finer per-user volume control."},
            {name: "AudioOptions", label: "Audio Options", summary: "Adds practical audio-device and playback controls."},
            {name: "NotifyWhenMuted", label: "Notify When Muted", summary: "Warns locally when you speak while muted."}
        ]
    },
    {
        id: "writing-language",
        title: "Writing and language",
        summary: "Composer aids that stay visible and user-initiated.",
        addons: [
            {name: "Translator", label: "Translator", summary: "Translates selected text through a disclosed external provider."},
            {name: "SplitLargeMessages", label: "Split Large Messages", summary: "Guarded preview prepares bounded chunks for manual copy, but setup keeps it off pending Discord modal/clipboard acceptance. Native multi-send remains held."},
            {name: "CharCounter", label: "Character Counter", summary: "Shows composer length before sending."},
            {name: "SpellCheck", label: "Spell Check", summary: "Adds language-aware spelling tools."},
            {name: "InsertTimestamps", label: "Insert Timestamps", summary: "Builds Discord timestamp markup from a local picker."}
        ]
    },
    {
        id: "servers-navigation",
        title: "Servers and navigation",
        summary: "Denser navigation and clearer server context without automated account actions.",
        addons: [
            {name: "ServerHider", label: "Server Hider", summary: "Locally hides selected servers from the rail."},
            {name: "ServerDetails", label: "Server Details", summary: "Shows available server metadata in context."},
            {name: "ReadAllNotificationsButton", label: "Read All Notifications Button", summary: "Adds a visible manual control; SoulCord never presses it."},
            {name: "BetterFolders", label: "Better Folders", summary: "Improves folder layout and behavior."},
            {name: "PersonalPins", label: "Personal Pins", summary: "Stores private navigation pins locally."},
            {name: "PermissionsViewer", label: "Permissions Viewer", summary: "Explains visible role and channel permissions."},
            {name: "ActivityFilter", label: "Activity Filter", summary: "Locally filters unwanted activity cards."}
        ]
    },
    {
        id: "media-display",
        title: "Media and display",
        summary: "Media inspection, timestamps, motion, and profile presentation.",
        addons: [
            {name: "DiscordEffects", label: "Discord Effects", summary: "Adds optional visual effects; held when reduced motion is active."},
            {name: "CompleteTimestamps", label: "Complete Timestamps", summary: "Shows precise message times."},
            {name: "BetterFriendList", label: "Better Friend List", summary: "Adds local sorting and context to the friends list."},
            {name: "BetterAnimations", label: "Better Animations", summary: "Adds optional transitions; held when reduced motion is active."},
            {name: "EditServers", label: "Edit Servers", summary: "Applies local server names and icon presentation."},
            {name: "ImageUtilities", label: "Image Utilities", summary: "Adds image inspection and local utility actions."},
            {name: "HideDisabledEmojis", label: "Hide Disabled Emojis", summary: "Hides emoji entries you cannot use."},
            {name: "BetterSearchPage", label: "Better Search Page", summary: "Improves the search-results layout."},
            {name: "RevealAllSpoilers", label: "Reveal All Spoilers", summary: "Adds a deliberate reveal control for spoiler groups."},
            {name: "ViewProfilePicture", label: "View Profile Picture", summary: "Opens available avatar images at useful sizes."}
        ]
    }
] as const;

export const SOULCORD_ADDON_PRESENTATION = new Map(SOULCORD_ADDON_GROUPS.flatMap(group => group.addons).map(addon => [addon.name, addon]));

export const SOULCORD_POWER_LAB = [
    {id: "voice-anchor", name: "Voice Anchor / Anti-AFK", summary: "Calibration and pulse research. Unavailable in V1 acceptance."},
    {id: "expression-relay", name: "Expression Relay", summary: "URL fallback research. Unavailable in V1 acceptance."},
    {id: "decor", name: "Decor service", summary: "External OAuth and decoration service. Unavailable in V1 acceptance."},
    {id: "fake-deafen", name: "Fake Deafen", summary: "Account-risk local experiment. Unavailable in V1 acceptance."},
    {id: "fake-mute", name: "Fake Mute", summary: "Account-risk local experiment. Unavailable in V1 acceptance."},
    {id: "stream-rtc", name: "Stream / RTC overrides", summary: "Volatile RTC experiment. Unavailable in V1 acceptance."}
] as const;

export const SOULCORD_OPTIONAL_ADDONS = [
    {label: "Channel Tabs", catalogName: "ChannelTabs"},
    {label: "User Notes", catalogName: "UserNotes"},
    {label: "Timezones", catalogName: "Timezones"},
    {label: "Role Explorer", catalogName: "RoleExplorer"},
    {label: "Favorite Media", catalogName: "FavoriteMedia"},
    {label: "Uncompressed Images", catalogName: "Uncompressed Images"},
    {label: "Game Activity Toggle", catalogName: "GameActivityToggle"},
    {label: "In My Voice", catalogName: "InMyVoice"},
    {label: "Show Ping", catalogName: "ShowPing"},
    {label: "Voice Hub", catalogName: "VoiceHub"},
    {label: "Better Media Player", catalogName: "BetterMediaPlayer"},
    {label: "Channels Preview", catalogName: "ChannelsPreview"}
] as const;
