<p align="center">
  <img src="assets/branding/soulcord-wordmark.svg" width="560" alt="SoulCord">
</p>

<p align="center">
  <a href="https://github.com/slaveofsolace/Solcord/actions/workflows/soulcord-ci.yml"><img alt="SoulCord CI" src="https://img.shields.io/github/actions/workflow/status/slaveofsolace/Solcord/soulcord-ci.yml?branch=fork%2Fscaffold-baseline&style=flat-square&label=SoulCord%20CI"></a>
  <img alt="Version 1.0.0" src="https://img.shields.io/badge/version-1.0.0-4ecdc4?style=flat-square">
  <img alt="Apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-f4b860?style=flat-square">
</p>

# SoulCord

SoulCord is an owner-controlled Discord desktop power fork built on BetterDiscord. It keeps the established plugin/theme contracts and data paths, then adds a restrained reliability, privacy, and productivity layer around them.

V1 exists for one concrete reason: Discord Activities that work in browser and vanilla desktop must not be broken merely because the client is injected. SoulCord replaces BetterDiscord’s all-or-nothing late-preload behavior with a narrow policy: one later absolute preload may be accepted only when canonical path checks prove it belongs to the same Discord package. The unrestricted compatibility override remains off.

This branch is a review build, not a published release. The owner accepted Activities on the previous installed generation; every newly packaged artifact still requires a disposable regression pass before live replacement. Automated checks do not substitute for owner-visible UI acceptance.

## What changes

| Area | V1 behavior | Maturity |
| --- | --- | --- |
| Control Center | Five responsive workspaces, semantic appearance modes, eight-step resumable setup, and bounded Session Pulse | Source-implemented; new Human Eye captures pending |
| Launch identity | `SOLcord` resolves to `SOULcord` over Discord's native splash with reduced-motion, timeout, and failure fallbacks | Source-implemented; cold/warm/update frame acceptance pending |
| Activity Bridge | Same-package preload policy, bounded sanitized ledger, diagnostics | Mechanism accepted on the prior live generation; exact new artifact regression pending |
| Plugin Doctor | Failure history, three-in-ten-minute quarantine, explicit retry | Ready |
| Drift Radar | Structural probes plus adapter-local fail-closed lookup checks | Preview |
| Performance HUD | Bounded renderer lag, heap-when-available, and owned-resource samples | Ready |
| Workspace Profiles | Activities, Gaming, Calls, Streaming, Focus, custom profiles, full diff, atomic apply and rollback | Preview; third-party addon sets require an extra warning |
| Command Deck | Local settings/actions palette at `Ctrl+Alt+K` | Ready |
| Link Lens | Local host, tracker, declared-redirect, confusable-domain, and invite-code review | Preview; invite metadata is not fetched |
| Stream Shield | Reversible privacy preview and manual hotkey; structural Go Live detection | Preview |
| Screenshot Scrubber | Local cover/blur workflow and PNG export; never uploads | Preview |
| Time Machine | Versioned local snapshots, migration ledger, export and rollback | Ready |
| Accessibility Toolkit | Reduced motion, focus treatment, contrast aid, reading controls | Preview |
| Daily interaction built-ins | Clean-room Do Not Track, Double Click to Reply, and Invisible Typing; no automatic send | Three accepted setup defaults; installed Discord adapter acceptance pending |
| Guarded Split Large Messages | Implemented modal/clipboard preview path; never multi-sends | Preview; not recommended or setup-enabled until a disposable Discord acceptance receipt exists |
| Setup and catalog | Recommended theme plus four alternatives, three ready clean-room features, optional 36-addon review catalog, immutable-source/hash checks, dependency closure, conflicts, quarantine and rollback | Community candidates and built-in previews remain fail-closed until their individual security/runtime gates pass |
| Message Timeline | Opt-in observed-message journal, DM-only default, explicit deleted/edited labels, retention/cap controls, AES-256-GCM persistence with a safeStorage-wrapped key | Experimental; media cache unavailable and live acceptance pending |
| Friend Watch | Opt-in already-loaded relationship reconciliation, encrypted account-isolated history, unknown-cause labels, local export and clear | Source-implemented; disabled by default and disposable runtime pending |
| Safety and return tools | Expiring exact-host Domain Memory, local Attachment Guard inspection, consolidated Privacy Mode, and internal-route Return Later reminders | Source-implemented; live interception/context adapters remain separately labeled |
| Windows installer | Stable/PTB/Canary detection, manifest-bound install/verify/repair/update, backup rollback/uninstall, explicit launch | Unsigned internal candidate; signing and lifecycle acceptance pending |

The global `BdApi`, plugin/theme folders, `betterdiscord://` protocol, preload globals, CSS hooks, and existing addon contracts remain unchanged for compatibility. These retained identifiers are documented in [the brand migration ledger](docs/BRAND_MIGRATION_LEDGER.md).

## Deliberate boundaries

SoulCord V1 does not extract tokens, fetch deleted messages, backfill history, access hidden channels, automate sending or joining, upload without confirmation, forge premium state, mutate entitlements, bypass account controls, or generate covert microphone traffic. There is no hidden telemetry. The private Message Timeline records only in-scope events already observed by the running client after explicit opt-in.

Anti-AFK audio pulses, Fake-Nitro-like expression experiments, Decor/OAuth, stream-quality overrides, and other account-risk or external-service work are outside V1 installation acceptance. If explored later, they must remain separately consented, default-off, licensed, and fail-closed.

## Privacy and recovery

SoulCord stores settings, profiles, snapshots, quarantine state, expiring domain decisions, local reminders, and—when enabled—encrypted Message Timeline and Friend Watch records in the existing BetterDiscord compatibility data directory. Sanitized diagnostics omit tokens, message content, server names, account identifiers, and absolute local paths. Link/attachment inspection and screenshot redaction run locally. No SoulCord service receives data. Private-history persistence fails closed to session-only when Electron secure storage is unavailable.

After three interrupted SoulCord renderer starts within ten minutes, startup recovery loads only Plugin Doctor. Quarantined addons are never silently re-enabled. The core updater is intentionally disabled until SoulCord has owner-controlled signed integrity metadata, so an upstream BetterDiscord artifact cannot replace the fork.

Read [Security and privacy](docs/SECURITY_AND_PRIVACY.md) and [Install and rollback](docs/INSTALL_AND_ROLLBACK.md) before testing.

## Build

Requirements: Bun `1.4.0` and a standard local Discord install.

```sh
bun install --frozen-lockfile
bun run test
bun run lint
bun run lint-css:soulcord
bun run typecheck
bun run dist
```

An unsigned framework-dependent installer candidate can be built after `dist` with `bun run installer:candidate -- dist/soulcord.asar <new-output-directory> <40-character-source-commit>`. Its built-in `--self-test` exercises install, exact verification, and rollback only in disposable directories.

The production artifact is `dist/soulcord.asar`. The manual live-install procedure first makes and hashes a broader owner-data backup. The one-click installer candidate itself backs up the existing core ASAR and injector entry files, then copies the verified artifact to the legacy `betterdiscord.asar` filename expected by the installed injector. Neither path renames or erases the `%APPDATA%\BetterDiscord` compatibility directory.

## Update and upstream strategy

- Product repository: [`slaveofsolace/Solcord`](https://github.com/slaveofsolace/Solcord)
- Upstream: [`BetterDiscord/BetterDiscord`](https://github.com/BetterDiscord/BetterDiscord)
- V1 baseline: upstream `development` commit `b28306898136ee5157f7ecb352d2ae307a646dec`
- Owner review branch: `fork/scaffold-baseline`
- Core updates: fail closed until a SoulCord-owned signed feed exists
- Addon catalog: the upstream BetterDiscord catalog remains available as an explicitly attributed compatibility service

Upstream changes should be reviewed and merged deliberately. Discord-internal adapters must pass structural canaries again after a Discord or Electron update.

## Attribution

SoulCord is based on BetterDiscord and preserves its Git history, contributors, license, public APIs, and fork lineage. BetterDiscord and Discord names are used only for factual compatibility and attribution. SoulCord’s mark and visual system are original and do not use the BetterDiscord or Discord logos.

See [NOTICE](NOTICE), [LICENSE](LICENSE), and [the provenance registry](docs/PROVENANCE_REGISTRY.md).
