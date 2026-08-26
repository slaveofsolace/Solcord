# BetterDiscord Plugin Baseline Review

## Decision rule

Solcord does not preinstall community plugin files merely because they are popular. A baseline capability must avoid duplicating an existing built-in, have a clear local-only boundary, remain default-off and lazy until enabled, and pass licensing, static, disposable-runtime, teardown, and Discord-adapter review.

## Existing coverage

The current suite already covers the useful core concepts behind BetterVolume, CallTimeCounter, PermissionsViewer-style permission inspection through Permission Lens, PinDMs, ServerHider, ServerDetails, CompleteTimestamps, SplitLargeMessages, MessagePeek, VoiceActivity, ShowSpectators, translation, notification review, privacy controls, and several composer tools.

Duplicating these as bundled community files would add extra Webpack scans, patches, settings stores, and update paths without adding a coherent user capability.

## New baseline scaffolds

| Priority | Capability | Inspiration | Baseline state | Performance boundary |
| ---: | --- | --- | --- | --- |
| 1 | Layout Collapse | [CollapsibleUI](https://betterdiscord.app/plugin/CollapsibleUI) | Scaffold only | Default-off, lazy, no document polling |
| 2 | Embed Controls | [CollapseEmbeds](https://betterdiscord.app/plugin/CollapseEmbeds) | Scaffold only | Local presentation; no message mutation |
| 3 | Cross-platform Autoscroll | [AutoScroll](https://betterdiscord.app/plugin/AutoScroll) | Scaffold only | User-gesture lifecycle; one active scroller |
| 4 | Media Shelf | [ImageFolder](https://betterdiscord.app/plugin/ImageFolder) | Scaffold only | Local metadata index; no background downloads |
| 5 | Message Link Preview | [MessageLinkEmbed](https://betterdiscord.app/plugin/MessageLinkEmbed) | Scaffold only | Loaded-store-only; never fetch or bypass permissions |

The typed source of truth is `src/common/solcord/baseline-capabilities.ts`. These entries ship as architecture and acceptance scaffolds, not as falsely advertised working modules.

## Items not added

- Heavy all-in-one layout replacements: held until startup and React-update cost is measured.
- Features already covered by Solcord: rejected as duplicate runtime work.
- Token, hidden-channel, premium-state, account automation, or permission-bypass tools: outside the baseline.
- Message-history features that fetch unseen content or retain content without explicit local consent: outside the default baseline.
- Community files with unresolved dependency, license, action-gated, or teardown review: remain in the reviewed catalog but are not auto-installed.

## Acceptance path

Each scaffold must complete these stages independently:

1. structural adapter discovery with cached, multi-signal filters;
2. pure model and lifecycle tests;
3. disabled-overhead measurement;
4. disposable runtime acceptance;
5. live Discord validation on the supported desktop matrix;
6. accessible settings and recovery behavior;
7. explicit promotion from `scaffold` to `ready`.
