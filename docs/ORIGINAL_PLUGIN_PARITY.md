# Original plugin parity

Solcord is replacing the owner-supplied community plugin set with first-party modules that share one lifecycle, one settings surface, and no community library runtime. A plugin is considered replaced only when its own behavior validates; another working tool in the same group cannot make it pass. A green source row means the listed behavior exists in source, not that every option from the original plugin has passed the current Discord client.

Provider retirement has two independent gates: the exact adapter must be healthy, and the provider name must be in the reviewed source-parity allowlist. An adapter that merely starts can no longer cause an unfinished community provider to be archived. The owner-supplied 21-card replacement set now has a complete source behavior contract; each card still remains independently held if its exact Discord adapter, persistence, cleanup, or visible placement does not validate.

The source status below is current for the RC5 branch. Exact-client validation is deliberately separate because Discord is in use and was not restarted for this pass.

| Original card | Solcord replacement | Source status | Dependency result | Exact-client gate |
| --- | --- | --- | --- | --- |
| BDFDB | Dependency retirement | Not used by first-party replacements | No BDFDB runtime | Confirm no retained community consumer before final retirement |
| BetterAnimations | Motion Studio | Reduced-motion-aware transitions independently selectable for messages, channels, servers, members, modals, popouts, settings, tooltips, and threads; fully removed on disable | None | Theme, reduced-motion, selector, and teardown review |
| BetterFriendList | People and Spaces | Loaded friend search, status/name sort, relationship categories, count, relationship dates when exposed, mutual-server counts when exposed, and encrypted account-local Favorites/Hidden groups without a relationship fetch | None | Friends-page placement and long-list review |
| BetterVolume | Audio Console | Reviewed local playback volume change, bounded to 0–200% | None | Current volume action and popout placement |
| CallTimeCounter | Call Context | Live elapsed timer and current-call summary | None | Join, reconnect, move, and teardown |
| CharCounter | Composer Toolkit | Live chat-composer count plus loaded bounded-note textarea counts with one configurable warning threshold and complete teardown | None | Composer and note variants plus selector drift |
| CompleteTimestamps | Composer Toolkit | Full, compact, or ISO visible timestamps and tooltips, independently selectable for chat, embeds, markup, audit logs, and edited timestamps, with original text/title restoration | None | Exact selectors, compact layout, and accessibility views |
| DiscordEffects | Motion Studio | Reduced-motion-aware click signal, snow, rain, or shooting-star effects with a 24-particle ceiling plus bounded color, opacity, speed, and star-angle controls and full teardown | None | Eleven-theme visual acceptance |
| DoNotTrack | Strict Privacy | Structurally validated optional telemetry protection | None | Frozen-network audit on exact client |
| DoubleClickToReply | Composer Toolkit | Opens Discord's reply composer without sending; optional Ctrl, Shift, or Alt requirement is supported and Alt conflict suppression is owned and reversible | None | DM, guild, text selection, action-button, and modifier matrix |
| EditServers | People and Spaces | Deliberately safer local alias applied to loaded server navigation and tooltip text with encrypted account-bound restart persistence or visible session fallback | None | Virtual-list and recovery acceptance |
| FakeDeafen | Power Lab | Scoped, per-call, default-off adapter with explicit arming | None | Owner-controlled call test; never automated |
| InvisibleTyping | Privacy Controls | Suppresses validated typing-start action | None | DM, guild, thread, and drift checks |
| MessageLoggerV2 | Message Timeline | Independent create/edit/delete/bulk-delete pipeline, bounded journal, and encrypted-store bridge | No XenoLib or ZeresPluginLibrary | Exact-client deleted/edited rendering and restart persistence |
| MessagePeek | Channel Glance | Keyboard/hover preview of up to five already-loaded messages | None | Virtualized channel lists and all themes |
| PinDMs | People and Spaces | Reversible loaded-DM ordering, category headers for friends/groups/bots/blocked/other, pinned label, unread badge, total marker, and optional recent-first order, stored in encrypted account-bound private state when `safeStorage` is available | No BDFDB | Virtual-list, category placement, and recovery acceptance |
| ReadAllNotificationsButton | Notification Review | DM/server/muted-channel filters plus scope/count preview followed by one explicit mark-read action | No BDFDB | Guild, mentions, all, and stale-preview checks |
| ServerDetails | People and Spaces | Loaded name, owner, member/channel/role/boost counts, language, creation date, and join date in navigation tooltip text | No BDFDB | Guild folder and accessibility tooltip review |
| ServerHider | People and Spaces | Reversible loaded server hiding, including Streamer-Mode-only behavior with a bounded store subscription, plus encrypted account-bound restart persistence or visible session fallback | No BDFDB | Folder, selected-server, quick-switcher, and recovery acceptance |
| ShowSpectators | Call Context | Loaded viewer names/count in the current-call badge | None | Start/stop/rejoin and viewer-store drift |
| SplitLargeMessages | Composer Toolkit | Guarded preview and ordered clipboard handoff with newline preference, blank-line preservation, part cap, adjustable split point, and explicit local `.txt` fallback; never auto-sends or uploads | No BDFDB | Settings placement, Markdown/code-block, clipboard, local-file, and maximum-part acceptance |
| Translator | Translation Desk | DeepL/LibreTranslate review, source/target language selection, exact destination disclosure, bounded response, encrypted credential bridge, and Strict Privacy gate | No BDFDB | Provider credentials, errors, and message-context placement |
| VoiceActivity | Call Context | Loaded in-call/speaking indicators with separate member-list, DM-list, Friends-list, current-user, current-call-highlight, and speaking-detail choices plus encrypted per-call/per-server ignore lists | None | Popout/member-list/DM-list/Friends-list selector matrix and mute/deafen/video icon variants |
| VoiceMessages | Voice Note Studio | Record, locally analyzed duration/waveform, preview, cancel, ordinary composer handoff, local-file fallback, optional generic filenames, and an optional user-click download link for already-loaded Discord CDN voice messages | No community library | Permission, download placement, composer drift, and no-send acceptance; native voice-message rendering remains a nonclaim until Discord exposes a validated action |

## Library boundary

The archived community files declared BDFDB, XenoLib, or ZeresPluginLibrary dependencies. Solcord does not load, download, or silently recreate those libraries. First-party adapters use Solcord's own module discovery, disposal scopes, privacy policy, and private Electron bridge. The provider archive remains reversible and private plugin data remains untouched.

The supplied MessageLoggerV2 and XenoLib sources are behavior references only. The supplied MIT text names a different copyright holder and does not license those files. Solcord's Message Timeline is independently structured and does not import their code or private data.

## Deliberate safety divergences

Parity means the useful user outcome, not every legacy implementation choice. Solcord deliberately does not reintroduce:

- automatic multi-message sending, automatic uploads, automatic voice recording, or automatic translation sends;
- MessageLoggerV2's aggressive message/media caching, hidden-data restoration claims, self-update path, private database import, or third-party library chain;
- EditServers network changes; aliases remain local and account-bound;
- BDFDB auto-download prompts or any runtime dependency on BDFDB, XenoLib, or ZeresPluginLibrary;
- remote animation-pack catalogs, arbitrary CSS payloads, or effects that ignore reduced-motion preferences;
- ServerHider patches that suppress read-state counts or silently intercept navigation. Solcord hides loaded rail surfaces and never claims this changes Discord access.
- direct user-token REST message construction for voice notes. Solcord prepares the reviewed audio through Discord's ordinary composer or saves it locally until a native voice-message action validates; it does not disguise an ordinary audio attachment as a proven native voice message.

The audited GPL-2.0 BetterDiscordAddons files permit copying only under their reciprocal terms. They were not pasted into the Apache-licensed core. VoiceActivity's MIT license permits direct reuse with notice, but the existing Solcord adapter remains independently structured around the shared lifecycle. This keeps license boundaries explicit while preserving the observed behavior contract.

## Remaining acceptance boundary

Source tests can prove models, cleanup, bounds, and deterministic adapter behavior. They cannot prove the current Discord client's internal module shapes or visible placement. Final provider retirement and release evidence therefore require the exact-client gates in the last column. Until those pass, Solcord reports the individual provider as unavailable or degraded and does not use a neighboring tool's success as a substitute. Any original secondary option still named in an exact-client gate remains unfinished; it is not silently counted as parity.
