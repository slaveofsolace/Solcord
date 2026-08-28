# Solcord V2 owner-ready close-out

This page is the current product-status source for the unsigned Solcord V2 release candidate. Historical handoffs and release evidence remain preserved, but they do not override this page or the machine-readable manifest shipped with a candidate.

## Release line

- Integration branch: `development`
- Preserved release: `v2.0.0-rc.2`
- Next release after source changes: `v2.0.0-rc.3`
- Target: Discord Stable on Windows, using the existing BetterDiscord injector and `BdApi` compatibility contracts
- Distribution: unsigned prerelease with SHA-256 manifests, exact rollback identity, and no SmartScreen-reputation claim

Exact source, ASAR, installer, Discord version, profile type, backup, and rollback hashes belong in the external release-evidence manifest generated from the frozen commit.

## Product status

| Capability | Default | Status | Boundary |
| --- | --- | --- | --- |
| Activity Bridge | On | Ready, final live regression pending | Same-package Discord preload only; unrestricted override remains off |
| Plugin Doctor and Addon Quarantine | On | Ready | Local diagnostics and fail-closed quarantine |
| Performance HUD | On | Ready | Overlay remains hidden until requested |
| Command Deck | On | Ready | Local commands only |
| Settings Time Machine | On | Ready | Receipt-bound local snapshots and rollback previews |
| Module Drift Radar | On | Preview | Reports drift without broadening compatibility |
| Workspace Profiles | On | Preview | Local profile switching with reversible settings |
| Layout Collapse | Off | Ready | Exact-client hide/restore and restart passed; one structural adapter and zero runtime work while disabled |
| Embed Controls | Off | Ready | Exact-client controlled embed interaction, restart, teardown, and disabled-zero-work passed; message data is unchanged |
| Cross-platform Autoscroll | Off | Ready | A current Discord scroller moved under the owned gesture loop and stopped on Escape; restart and teardown passed |
| Message Link Preview | Off | Ready | A current loaded `MessageStore` record previewed without fetch or read-state mutation; missing records remain inert |
| Media Shelf | Off | Ready | Exact-client local save/remove passed; references are bounded and the feature owns no Discord adapter or background work |
| Audience Guard | Off | Preview, fail-closed on current action drift | Storage capability reporting is correct; current Discord stream-action exports do not pass structural validation |
| Friend Watch | Off | Ready when consented | Encrypted restart, passive reconciliation, subject-free export, clear, account isolation fixtures, and teardown passed without a relationship mutation |
| Message Timeline | Off | Preview | Consent-gated local observations; no unseen-message backfill |
| Link Lens | Off | Preview | Native review modal only; internal Discord routes bypass it |
| Stream Shield | Off | Preview | No silent recording or upload |
| Accessibility Toolkit | Off | Preview | User-selected local presentation controls |
| Curated addons | Off | Held | `0/36` enabled; a catalog entry is not an installable or accepted addon |

First Setup is transactional and resumable. The exact disposable client passed forward/back navigation, pause/resume, final preview, Apply and verify, eleven-theme installation, restart persistence, and private-default behavior. Automated malformed-state, interrupted-recovery, and rollback coverage remains green. Skipping changes only the onboarding marker.

## Exact-client acceptance now complete

- The current Discord Stable client loaded the exact candidate in a filesystem-isolated acceptance root with the expected source/ASAR identity and no duplicate bootstrap.
- All four baseline runtime adapters survived restart together, then returned to zero styles, elements, classes, observers, listeners, timers, and previews after disable.
- Friend Watch used Electron `safeStorage`, created only opaque encrypted account storage, survived restart, exported JSON and CSV without raw subject IDs or display labels, and cleared explicitly.
- All eleven themes rendered at native Electron 100%, 125%, 150%, and 200% zoom. The 44-capture matrix had no horizontal overflow and every workspace remained reachable by ordinary scrolling.
- Keyboard traversal reached every workspace with visible focus. Reduced motion collapsed sampled transitions and animations to near-zero duration. Forced-colors rendered the Control Center with system black, white, borders, and focus treatment.
- Setup and baseline acceptance performed no message, relationship, notification-read, voice, stream, upload, OAuth, or Activity mutation.

## Privacy and storage truth

Lifecycle state, readiness, consent, and storage durability are separate properties. A module can be available while disabled, ready while awaiting consent, or functional with session-only storage. The Control Center must expose those distinctions rather than collapsing them into one badge.

Audience Guard checks encrypted-storage capability before a denylist exists. A missing account policy does not imply missing `safeStorage`. Reads, writes, clear operations, account changes, and restarts fail closed and never expose account identifiers in filenames or logs.

Friend Watch and Message Timeline remain opt-in, account-scoped, local, and bounded. Friend Watch has exact-client passive no-change evidence plus controlled fixture coverage for change classification and notifications. Acceptance must not add, remove, block, message, or otherwise mutate a real relationship.

## Circular dependency verdict

The current graph reports eleven groups. An exact comparison against the preserved clean BetterDiscord baseline reports the same eleven groups with the same paths. They are inherited architecture, not Solcord-introduced regressions:

1. Discord modules, Webpack filters/require, and patcher
2. Webpack index, filters/require, and patcher
3. Webpack require and searching
4. Webpack lazy helpers and utilities
5. Webpack index and stores
6. Addon manager, addon editor, Custom CSS editor, editor store, and theme manager
7. Plugin manager, addon manager, addon editor, Custom CSS editor, and editor store
8. Floating windows and floating container
9. Settings, addon pages/store, install modal, and shared addon UI
10. Settings and settings panel
11. Built-ins, Custom CSS, and settings

They remain measured technical debt. Do not churn public exports or upstream ownership solely to make the count zero. Revisit a group only when profiling or a concrete runtime failure proves risk.

## Final acceptance boundary

Safe source, disposable-runtime, packaging, recovery, accessibility, and documentation work runs without repeated owner pauses. One final owner session covers authenticated or account-affecting interactions:

1. Start and leave Codenames on the exact candidate.
2. Start and leave one second Discord Activity.
3. Confirm First Setup's final preview before applying it to the signed-in profile.
4. Review Friend Watch's live-profile passive state; export or clear is optional and must not involve changing a relationship.

The release is owner-ready only when the exact candidate survives two clean launches without an addon dialog, JavaScript error, sentinel translation, stale owned process, or rollback mismatch. No private feature may activate without consent.

## Binding nonclaims

- An unsigned candidate has no authenticated publisher identity or established SmartScreen reputation.
- A green build does not prove a Discord interaction until the exact client and candidate complete it.
- Solcord does not extract tokens, automate accounts, forge entitlements, reveal hidden content, or silently record/upload media.
- Existing owner plugins, themes, Custom CSS, and private databases are preserved; their presence is not compatibility certification.
- `v2.0.0-rc.2` remains immutable even after RC3 ships.
