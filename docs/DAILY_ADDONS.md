# V2 built-in suite and community compatibility

Solcord V2 has three distinct layers. Core reliability/privacy modules ship with the fork. Native Suite behavior is grouped into Solcord-owned adapters. Ordinary BetterDiscord-compatible plugins remain separate local programs until the owner deliberately migrates a matching provider.

## Native Suite

| Built-in | Catalog-facing behaviors consolidated | Boundary |
| --- | --- | --- |
| Privacy Controls | DoNotTrack, InvisibleTyping | Suppresses only structurally validated outgoing analytics/typing actions; no network-wide blocking claim |
| Composer Toolkit | DoubleClickToReply, CharCounter, CompleteTimestamps, guarded SplitLargeMessages | Opens reply state and previews/copies content; never sends automatically |
| Call Context | CallTimeCounter, VoiceActivity, ShowSpectators | Uses already-loaded call/speaker/viewer state only |
| Audio Console | BetterVolume | Local 0–200% playback change after preview and explicit apply |
| Voice Note Studio | VoiceMessages | User-gesture record, stop, preview, cancel, then separately reviewed native upload preparation |
| Translation Desk | Translator | DeepL or configured LibreTranslate only after provider/text disclosure; no provider active by default |
| People and Spaces | BetterFriendList, PinDMs, ServerHider, ServerDetails, local Server Aliases replacing EditServers | Account-isolated session state only; no Discord server profile mutation or plaintext ID persistence |
| Channel Glance | MessagePeek | Shows at most five already-loaded messages; never fetches history or marks read |
| Notification Review | ReadAllNotificationsButton | Previews scope and count before one explicit mark-read action |
| Motion Studio | BetterAnimations, DiscordEffects | Bounded local transitions; suppressed when reduced motion is active |

Permission Lens and Voice Health are additional Solcord V2 tools. Local Identity Notes remains unavailable until its private storage adapter validates. Message Timeline is an independent opt-in private module and never imports MessageLoggerV2 data. Fake Deafen remains default-off Power Lab work rather than a daily default.

The setup draft maps 21 community-facing choices to these built-ins without staging the community files. A built-in can still report `unavailable` when its Discord lookup or required browser API does not validate. A settings card is not evidence that the adapter is live.

## Provider migration

An enabled community provider keeps control until the owner selects Solcord and the replacement reports ready. The migration then:

1. previews the exact filename, hash, enabled state, dependency state, replacement, and archive destination;
2. rechecks the source bytes and built-in health immediately before apply;
3. moves only the unchanged `.plugin.js` into `solcord-provider-archive-v2`, outside the scanned plugin directory;
4. records a bounded transaction receipt for rollback;
5. retires BDFDB only after every known and owner-declared consumer has left the active plugin directory.

No provider file is deleted. Settings and private databases remain untouched. MessageLoggerV2 data is never inspected, imported, moved, or erased. Rollback restores a hash-matching archived source only when the active plugin destination is absent; a later owner change blocks automatic restoration.

See [V2 built-in migration](V2_PLUGIN_MIGRATION.md) for the complete source-file map.

## Catalog boundary

The 2026-08-26 snapshot contains 209 plugin and 114 theme metadata records. The raw response hashes are:

- plugins: `914d1255580e9d834593cbfe6ca9ec07af8c56151ec388d44ad5cae24832e1ad`
- themes: `d0205afb84af6f32949e6cbde6e32fc54433a0fe49879fc7b4b3c2c66b7cc433`

Metadata describes demand; it does not grant copying rights or prove security, teardown, performance, or compatibility. The 36 requested community candidates remain non-installable until their individual runtime and action gates pass. VoiceMessages is GPL-3.0, not AGPL; Solcord Voice Note Studio remains independently written Apache-2.0 code.
