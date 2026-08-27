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
| Layout Collapse | Off | Exact-client acceptance pending | One structural adapter; zero runtime work while disabled |
| Embed Controls | Off | Exact-client acceptance pending | Presentation only; message data is unchanged |
| Cross-platform Autoscroll | Off | Exact-client acceptance pending | Stops on release, Escape, disable, route loss, or drift |
| Message Link Preview | Off | Exact-client acceptance pending | Reads only messages already loaded by Discord |
| Media Shelf | Off | Ready as local storage | Stores validated local references; owns no Discord adapter or background work |
| Audience Guard | Off | Preview | Encrypted persistence when Electron `safeStorage` is available; otherwise visibly session-only and fail-closed |
| Friend Watch | Off | Preview, acceptance pending | Consent-gated, account-scoped, local change log; no automated relationship mutations |
| Message Timeline | Off | Preview | Consent-gated local observations; no unseen-message backfill |
| Link Lens | Off | Preview | Native review modal only; internal Discord routes bypass it |
| Stream Shield | Off | Preview | No silent recording or upload |
| Accessibility Toolkit | Off | Preview | User-selected local presentation controls |
| Curated addons | Off | Held | `0/36` enabled; a catalog entry is not an installable or accepted addon |

First Setup is transactional and resumable. Skipping changes only the onboarding marker. Apply must show the complete planned diff, preserve owner-managed files, and roll back atomically on failure.

## Privacy and storage truth

Lifecycle state, readiness, consent, and storage durability are separate properties. A module can be available while disabled, ready while awaiting consent, or functional with session-only storage. The Control Center must expose those distinctions rather than collapsing them into one badge.

Audience Guard checks encrypted-storage capability before a denylist exists. A missing account policy does not imply missing `safeStorage`. Reads, writes, clear operations, account changes, and restarts fail closed and never expose account identifiers in filenames or logs.

Friend Watch and Message Timeline remain opt-in, account-scoped, local, and bounded. Automated acceptance may use fixtures and passive no-change observation. It must not add, remove, block, message, or otherwise mutate a real relationship.

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
4. Confirm any live-profile Friend Watch notification/export/clear check without changing a relationship.

The release is owner-ready only when the exact candidate survives two clean launches without an addon dialog, JavaScript error, sentinel translation, stale owned process, or rollback mismatch. No private feature may activate without consent.

## Binding nonclaims

- An unsigned candidate has no authenticated publisher identity or established SmartScreen reputation.
- A green build does not prove a Discord interaction until the exact client and candidate complete it.
- Solcord does not extract tokens, automate accounts, forge entitlements, reveal hidden content, or silently record/upload media.
- Existing owner plugins, themes, Custom CSS, and private databases are preserved; their presence is not compatibility certification.
- `v2.0.0-rc.2` remains immutable even after RC3 ships.
