# BetterDiscord Plugin Baseline Review

Reviewed: **2026-08-26**

## Decision rule

Solcord does not preinstall community plugin files merely because they are popular. A baseline capability must avoid duplicating an existing built-in, have a clear local-only boundary, remain default-off and lazy until enabled, and pass licensing, static, disposable-runtime, teardown, and Discord-adapter review.

Store metadata is a discovery snapshot, not permission to copy code. Source licensing, dependencies, network behavior, account actions, lifecycle cleanup, and current Discord compatibility must be reviewed independently before an implementation advances beyond `scaffold`.

## Existing coverage

The current suite already covers the useful core concepts behind BetterVolume, CallTimeCounter, PermissionsViewer-style permission inspection through Permission Lens, PinDMs, ServerHider, ServerDetails, CompleteTimestamps, SplitLargeMessages, MessagePeek, VoiceActivity, ShowSpectators, translation, notification review, privacy controls, and several composer tools.

Duplicating these as bundled community files would add extra Webpack scans, patches, settings stores, and update paths without adding a coherent user capability.

## Current store snapshot

| Priority | Capability | Reviewed inspiration | Store snapshot | Why it remains a scaffold |
| ---: | --- | --- | --- | --- |
| 1 | Layout Collapse | [CollapsibleUI](https://betterdiscord.app/plugins/CollapsibleUI) | v12.3.5, updated 2026-05-21 | Valuable but broad; requires region-specific adapters, accessibility controls, and measured disabled overhead |
| 2 | Embed Controls | [CollapseEmbeds](https://betterdiscord.app/plugins/CollapseEmbeds) | v2.2.0, updated 2026-05-05 | Small local feature, but the message/embed render target is volatile |
| 3 | Cross-platform Autoscroll | [AutoScroll](https://betterdiscord.app/plugins/AutoScroll) | v0.3.0, updated 2025-03-04 | Must own one gesture lifecycle without document polling or orphaned animation frames |
| 4 | Media Shelf | [ImageFolder](https://betterdiscord.app/plugins/ImageFolder) | v1.7.0, updated 2026-06-28 | Needs bounded local indexing, explicit file ownership, and no background download behavior |
| 5 | Message Link Preview | [PeekMessageLinks](https://betterdiscord.app/plugins/PeekMessageLinks) | v1.2.9, updated 2026-05-15 | Must use only already-loaded messages and never fetch unseen content or bypass access checks |

The typed source of truth is `src/common/solcord/baseline-capabilities.ts`. These entries ship as architecture and acceptance scaffolds, not as working-feature claims.

## Performance boundaries

Every new baseline capability is required to be:

- default disabled;
- loaded only after enablement;
- free of Webpack searches, patches, listeners, observers, timers, storage reads, and network work while disabled;
- independently disposable and restartable;
- isolated so adapter drift disables only the affected capability;
- measured before promotion to `ready`.

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
