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
- Module Drift Radar (preview; captured-fixture Patch Canary is not implemented)
- Performance HUD
- Workspace Profiles
- Command Deck
- Link Lens + Invite Inspector (held off in the current profile until the repaired build passes installed regression)
- Stream Shield + Screenshot Scrubber
- Settings Time Machine + Update Ledger
- Accessibility Toolkit
- Do Not Track clean-room adapter (suppresses only Discord's structurally anchored analytics `track` method; it does not claim Sentry, process-monitoring, or network-wide blocking)
- Double Click to Reply clean-room adapter (opens reply state only; never sends)
- Invisible Typing clean-room adapter (suppresses only outgoing typing-start calls)
- Guarded Split Large Messages (PREVIEW: prepares ordered parts for manual copy and never multi-sends; setup keeps it off until a disposable Discord modal/clipboard acceptance receipt exists)

The accepted default interaction set is Do Not Track, Double Click to Reply, and Invisible Typing. Guarded Split Large Messages remains source-present at PREVIEW maturity and is neither recommended nor transaction-executable. These clean-room adapters do not copy the owner-installed plugin files. If a matching owner plugin is already enabled, SoulCord leaves it alone and does not install a duplicate patch.

## Community candidates considered, not SoulCord-accepted

- BetterVolume, CallTimeCounter, CompleteTimestamps, PinDMs, VoiceActivity, BetterFriendList, and ServerDetails are sensible next daily-tool candidates. Dependency, license, and installed-runtime checks still apply before enabling them as a pack.
- Native SplitLargeMessages remains held because it can submit multiple messages. SoulCord's guarded built-in remains PREVIEW: its source prepares and copies ordered parts after confirmation, but setup does not enable it before the disposable Discord modal/clipboard receipt exists.
- MessageLoggerV2 remains off because it is a private message-retention tool outside the ordinary curated pack. MessagePeek is separately held because its reviewed file preloads DM data through an API path and does not yet prove complete asynchronous teardown.
- Fake Mute & Deafen remains unavailable. Fake Deafen is now a separate Power Lab preview: it is default-off, requires the current versioned warning plus a second explicit arm action, patches only the validated active gateway socket, and automatically stands down if the owner-installed community FakeDeafen is enabled. Its synthetic adapter tests are not live voice acceptance.

The pinned catalog contains 209 plugin and 114 theme metadata records. Forty-seven plugin payloads were statically screened and the requested 36 received manual dispositions; catalog-theme source/license review and every community runtime acceptance remain pending. Catalog names and behavior can inform clean-room product work, but no catalog entry grants blanket permission to copy source or assets.
