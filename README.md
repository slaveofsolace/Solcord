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

This branch is a review build, not a published release. Automated and synthetic gates can prove policy behavior, cleanup, and build integrity. The owner’s post-install Codenames and second-Activity checks remain the live acceptance gate.

## What changes

| Area | V1 behavior | Maturity |
| --- | --- | --- |
| Activity Bridge | Same-package preload policy, bounded sanitized ledger, diagnostics | Ready; owner Activity check pending |
| Plugin Doctor | Failure history, three-in-ten-minute quarantine, explicit retry | Ready |
| Drift Radar | Structural probes plus adapter-local fail-closed lookup checks | Preview |
| Performance HUD | Bounded renderer lag, heap-when-available, and owned-resource samples | Ready |
| Workspace Profiles | Activities, Gaming, Calls, Streaming, Focus, custom SoulCord-only profiles, diff and rollback | Preview; third-party addon execution excluded |
| Command Deck | Local settings/actions palette at `Ctrl+Alt+K` | Ready |
| Link Lens | Local host, tracker, declared-redirect, confusable-domain, and invite-code review | Preview; invite metadata is not fetched |
| Stream Shield | Reversible privacy preview and manual hotkey; structural Go Live detection | Preview |
| Screenshot Scrubber | Local cover/blur workflow and PNG export; never uploads | Ready |
| Time Machine | Versioned local snapshots, migration ledger, export and rollback | Ready |
| Accessibility Toolkit | Reduced motion, focus treatment, contrast aid, reading controls | Preview |

The global `BdApi`, plugin/theme folders, `betterdiscord://` protocol, preload globals, CSS hooks, and existing addon contracts remain unchanged for compatibility. These retained identifiers are documented in [the brand migration ledger](docs/BRAND_MIGRATION_LEDGER.md).

## Deliberate boundaries

SoulCord V1 does not extract tokens, log messages, recover deleted content, automate sending or joining, upload without confirmation, forge premium state, mutate entitlements, bypass account controls, or generate covert microphone traffic. There is no hidden telemetry.

Anti-AFK audio pulses, Fake-Nitro-like expression experiments, Decor/OAuth, stream-quality overrides, and other account-risk or external-service work are outside V1 installation acceptance. If explored later, they must remain separately consented, default-off, licensed, and fail-closed.

## Privacy and recovery

SoulCord stores settings, profiles, snapshots, and quarantine state locally in the existing BetterDiscord compatibility data directory. Sanitized diagnostics omit tokens, message content, server names, account identifiers, and absolute local paths. Link inspection and screenshot redaction run locally. No SoulCord service receives data.

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

The production artifact is `dist/soulcord.asar`. Windows installation stages that exact file, records its SHA-256, backs up the existing injector and `%APPDATA%\BetterDiscord` data, then copies it to the legacy `betterdiscord.asar` filename expected by the installed injector. SoulCord does not rename or erase the compatibility directory.

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
