# Daily add-ons

SoulCord V1 has two layers: built-in reliability/privacy tools maintained in this fork, and ordinary BetterDiscord-compatible plugins that remain separate local files. The Suite labels the difference explicitly.

## Owner-selected local set

These three existing files were checked against the BetterDiscord catalog’s pinned raw source and enabled in the current Windows profile on 2026-08-22:

| Add-on | Current behavior | Source status | SoulCord handling |
| --- | --- | --- | --- |
| Do Not Track 0.1.0 | Suppresses Discord analytics, Sentry reporting, and process/game monitoring. | Exact catalog revision; permissive repository license. | Enabled locally. Plugin Doctor records bounded failures. |
| Invisible Typing 1.5.1 | Suppresses typing indicators globally with per-channel opt-back-in controls. | Exact catalog revision; no controlling repository license found. | Enabled locally, never vendored or redistributed. |
| Double Click to Reply 1.0.0 | Double-clicking another person’s message opens Discord’s normal reply composer. It does not send. | Exact catalog revision; no controlling repository license found. | Enabled locally, never vendored or redistributed. |

The pre-change `plugins.json` is preserved in the task repair backup. Enabling these three does not enable every plugin in the folder.

## Built-in SoulCord V1 set

- Activity Bridge
- Plugin Doctor + Addon Quarantine
- Module Drift Radar / Patch Canary
- Performance HUD
- Workspace Profiles
- Command Deck
- Link Lens + Invite Inspector (held off in the current profile until the repaired build passes installed regression)
- Stream Shield + Screenshot Scrubber
- Settings Time Machine + Update Ledger
- Accessibility Toolkit

## Installed candidates reviewed, not auto-enabled

- BetterVolume, CallTimeCounter, CompleteTimestamps, PinDMs, VoiceActivity, BetterFriendList, and ServerDetails are sensible next daily-tool candidates. Dependency, license, and installed-runtime checks still apply before enabling them as a pack.
- SplitLargeMessages is not auto-enabled because it can submit multiple messages and therefore crosses SoulCord’s no-automatic-send default.
- MessageLoggerV2 and MessagePeek remain off because message retention/deleted-message behavior conflicts with SoulCord’s privacy boundary.
- FakeDeafen and FakeMute & Deafen remain off because they intentionally misrepresent voice state and are account-risk behavior.

Catalog review also considered current tools such as MoreDoubleClicks, BetterDoubleClickToEdit, Incognito, FileNameRandomization, and ActivityFilter. Names and behavior can inform clean-room product work; no catalog entry grants blanket permission to copy source or assets.
