<p align="center">
  <img src="assets/branding/solcord-mark.svg" width="96" alt="Solcord cord-cut S mark">
</p>

<h1 align="center">Solcord</h1>

<p align="center"><strong>A Windows desktop fork of BetterDiscord, rebuilt around safer compatibility, useful local tools, and recovery you can understand.</strong></p>

<p align="center">
  <a href="https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.1/SolcordSetup-v2.0.0-rc.1-win-x64.exe"><img alt="Download Solcord for Windows" src="https://img.shields.io/badge/Download-Windows%20x64-2f9e92?style=for-the-badge&logo=windows&logoColor=white"></a>
  <a href="https://github.com/slaveofsolace/Solcord/releases/tag/v2.0.0-rc.1"><img alt="Solcord v2.0.0 release candidate 1" src="https://img.shields.io/badge/Release-v2.0.0--rc.1-d76b43?style=for-the-badge"></a>
  <a href="https://github.com/slaveofsolace/Solcord/actions/workflows/solcord-ci.yml"><img alt="Solcord CI" src="https://img.shields.io/github/actions/workflow/status/slaveofsolace/Solcord/solcord-ci.yml?branch=development&style=for-the-badge&label=Checks"></a>
</p>

<p align="center">
  <sub><strong>Fork lineage:</strong> <a href="https://github.com/BetterDiscord/BetterDiscord">BetterDiscord/BetterDiscord</a> → <a href="https://github.com/slaveofsolace/Solcord">slaveofsolace/Solcord</a>. Upstream history, contributors, APIs, and Apache-2.0 attribution are preserved.</sub>
</p>

---

## Install in four steps

> [!IMPORTANT]
> `v2.0.0-rc.1` is an unsigned Windows release candidate. Windows may show an **Unknown publisher** warning. Verify the checksum before running it.

1. **[Download the Windows installer](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.1/SolcordSetup-v2.0.0-rc.1-win-x64.exe)** and the matching [SHA-256 list](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.1/SHA256SUMS.txt).
2. **Quit Discord completely** from the Windows system tray.
3. Run the installer, review the detected Discord channel, and select **Install**, then **Verify**.
4. Launch Discord and open **User Settings → Solcord Suite**. First Setup explains themes, built-ins, privacy choices, and rollback before changing anything.

On a typical PC this takes about a minute after download; it is not a timing guarantee. The installer keeps existing plugins, themes, Custom CSS, settings, and private addon databases in place.

**New to client mods?** Use the illustrated [one-minute setup guide](docs/QUICK_START.md). It includes checksum verification, every installer screen, First Setup, and recovery.

<p align="center">
  <img src="https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.1/01-download.png" width="49%" alt="Solcord download step">
  <img src="https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.1/03-install.png" width="49%" alt="Solcord installer ready to install">
</p>

## Why Solcord exists

BetterDiscord provides the addon ecosystem and the foundation. Solcord keeps that compatibility while concentrating on the parts that need stronger boundaries on a personal Windows client:

- **Compatibility you can inspect.** Activity Bridge permits only a verified Discord-owned late preload from the same package root. The unrestricted global override remains off.
- **Daily tools without a wall of plugin cards.** Privacy Controls, Composer Toolkit, Call Context, Audio Console, Translation Desk, People and Spaces, Channel Glance, Voice Health, and more live in one consistent suite.
- **A real recovery path.** Plugin Doctor, Addon Quarantine, Patch Canary, Settings Time Machine, and a receipt-bound installer rollback make failures visible and reversible.
- **Local-first privacy.** Sensitive IDs, credentials, notes, and timeline data stay out of ordinary settings exports and diagnostics. There is no Solcord telemetry service.
- **A complete visual system.** Eleven self-contained local themes change the Discord shell, not just the Solcord panel, with readable focus states and reduced-motion handling.

## What is built in

| Area | Solcord tools |
| --- | --- |
| Compatibility and safety | Activity Bridge, Module Drift Radar, Patch Canary, Plugin Doctor, Addon Quarantine |
| Privacy | Privacy Controls, Link Lens, Invite Inspector, Stream Shield, Screenshot Scrubber, Attachment Guard |
| Messages | Composer Toolkit, Double Click to Reply, guarded message splitting, Translation Desk, Channel Glance |
| Calls and audio | Call Context, Audio Console, Voice Note Studio, Voice Health, Shared Call Badge |
| People and spaces | Pin DMs, server hiding and details, local server aliases, Focus Channels, encrypted Local Identity Notes |
| Local history and recovery | Message Timeline, Friend Watch, Workspace Profiles, Settings Time Machine, Update Ledger |
| Power Lab | Scoped Fake Deafen and other separately consented, default-off experiments |

Built-ins start only after their Discord adapters pass structural checks. If Discord changes an internal module, the affected feature reports **Unavailable** instead of guessing.

## Stream Audience Guard

Audience Guard can prevent Go Live from starting or stop your stream when a denied person is detected in the current call. **Stop on Watch** is separately warned because brief frame exposure may occur before detection.

> Your stream will not start or continue while a denied user is detected in the current call or viewer list.

This is not per-viewer encryption. Discord does not expose an individual `VIEW_STREAM` permission for normal Go Live streams; only correctly configured channel permissions provide server-enforced access control. Read the full [Audience Guard boundary](docs/STREAM_AUDIENCE_GUARD.md).

## Themes

Solcord ships eleven local, dependency-free themes. No remote fonts, images, or CSS imports are required.

**Core family** — Default, Obsidian Thread, Carbon Ember, Midnight Glass, Paper Signal<br>
**V2 full-shell family** — Threadline, Signal Block, Relay Classic, Workshop, Quiet Read, Night Transit

Only one Solcord base theme is active at a time. Selector drift restores ordinary Discord styling rather than leaving a half-themed client. See the [theme system](docs/V2_THEME_SYSTEM.md).

## Designed to be reversible

- The installer verifies its embedded ASAR and build manifest before touching Discord.
- Discord must be closed before install, repair, or rollback.
- Existing addons and their private data are not deleted.
- Community providers are archived only after a replacement health check succeeds.
- Rollback is tied to the exact installer receipt and backup, not a guessed folder.

Keep the backup until you are satisfied with the RC. The [install and rollback reference](docs/INSTALL_AND_ROLLBACK.md) covers manual recovery and the preserved BetterDiscord paths.

## Honest limits

Solcord does not extract tokens, backfill message history, access hidden channels, automate user-account actions, forge premium state, or silently record/upload media. Message Timeline observes only events already seen by the running client after opt-in. Translation has no provider enabled by default. Fake Deafen and other Power Lab experiments are off until separately armed.

This repository is a release candidate, not a promise that future Discord updates cannot cause adapter drift. Current release evidence includes 654 passing tests, zero production-audit vulnerabilities, two completed security diff scans with zero findings, and a 30-minute disposable Windows soak. Installed behavior still depends on the Discord version present on the user’s PC.

## Build from source

Solcord uses Bun `1.4.0`. The Windows installer also requires the .NET 8 SDK.

```sh
bun install --frozen-lockfile
bun run test
bun run lint
bun run lint-css:solcord
bun run typecheck
bun run generate-types
bun run dist
```

The production build writes `dist/solcord.asar`. Installation uses the legacy `betterdiscord.asar` target filename because the preserved injector contract requires it.

## Project map

- [Quick start](docs/QUICK_START.md)
- [Security and privacy](docs/SECURITY_AND_PRIVACY.md)
- [Activity compatibility](docs/ACTIVITY_COMPATIBILITY.md)
- [V2 built-in migration](docs/V2_PLUGIN_MIGRATION.md)
- [Provenance and third-party notices](docs/PROVENANCE_REGISTRY.md)
- [Contributing](CONTRIBUTING.md)
- [Security reports](SECURITY.md)

## Fork and attribution

Solcord is forked from [BetterDiscord/BetterDiscord](https://github.com/BetterDiscord/BetterDiscord), originally from its `development` branch. BetterDiscord’s Git history, contributors, license, public APIs, addon paths, and compatibility identifiers remain intact. Solcord’s name, mark, themes, installer, safety layers, and built-in suite are the fork’s additions.

BetterDiscord and Discord names are used for factual compatibility and attribution. Solcord is not endorsed by Discord. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
