<p align="center">
  <img src="assets/branding/solcord-social-preview.svg" width="100%" alt="Solcord — a BetterDiscord fork for Windows">
</p>

<h1 align="center">Solcord</h1>

<p align="center"><strong>Make Discord your own, with local tools, full-shell themes, and a way back if something breaks.</strong></p>

<p align="center">
  <a href="https://github.com/slaveofsolace/Solcord/actions/workflows/solcord-ci.yml"><img alt="Solcord checks" src="https://img.shields.io/github/actions/workflow/status/slaveofsolace/Solcord/solcord-ci.yml?branch=development&style=for-the-badge&label=Checks"></a>
  <a href="LICENSE"><img alt="Apache 2.0 license" src="https://img.shields.io/badge/License-Apache--2.0-4ECDC4?style=for-the-badge"></a>
  <a href="https://github.com/slaveofsolace/Solcord/releases"><img alt="Solcord releases" src="https://img.shields.io/badge/Releases-Review%20artifacts-FF735F?style=for-the-badge"></a>
</p>

<p align="center"><sub>Fork lineage: <a href="https://github.com/BetterDiscord/BetterDiscord">BetterDiscord/BetterDiscord</a> → <a href="https://github.com/slaveofsolace/Solcord">slaveofsolace/Solcord</a>. Upstream history, contributors, public APIs, addon paths, and Apache-2.0 attribution are preserved.</sub></p>

---

## Install in about a minute

**[Download the Windows installer](https://github.com/slaveofsolace/Solcord/releases/tag/v2.0.0-rc.33)** · [Step-by-step guide](docs/QUICK_START.md) · [Recovery](docs/INSTALL_AND_ROLLBACK.md)

You need Windows x64 and the official Discord desktop app. Stable, PTB, and Canary are detected separately. You do **not** need Git, Bun, .NET, or a separate BetterDiscord installation to use the installer.

1. Download **SolcordInstaller.exe** and **SHA256SUMS.txt** from the same release. Compare the download's hash using the [quick guide](docs/QUICK_START.md#check-the-download).
2. Save unfinished drafts and leave calls. The installer closes verified Discord desktop processes when replacing the shared core.
3. Open the installer, choose your Discord entry in **Version**, then select **Install Solcord** or **Update Solcord**.
4. Select **Open Solcord**. A fresh installation opens **Solcord Suite → Welcome**. Choose your preferences or use **Finish later** to return when ready.

About one minute **after download** is a typical-PC target, not a guarantee. Updates and repairs keep completed setup and existing settings.

> [!WARNING]
> This is an **unsigned release candidate**, not a signed stable build. Windows may show an unknown-publisher warning. Use only this repository's release assets; do not disable Windows security to install it. Unreleased audit changes in the source checkout are not included in the RC33 download.

## What you get

Solcord is a fork of [BetterDiscord](https://github.com/BetterDiscord/BetterDiscord). It keeps the addon ecosystem and public `BdApi`, then adds one Control Center for the first-party suite.

| Workspace | Useful tools |
| --- | --- |
| Appearance & Accessibility | Eleven local shell themes, adjustable density and accents, animated backgrounds, reduced motion, and reading aids |
| Chat & Composer | Character count, timestamps, reply shortcuts, reviewed message splitting, Translation Desk, loaded-message previews, and Media Shelf |
| Voice & Activities | Call context, volume controls, Voice Note Studio, connection diagnostics, and the restricted Activity Bridge |
| Friends & Spaces | DM pins, local server aliases and hiding, Focus Channels, and optional private notes |
| Privacy & Safety | Strict Privacy, Link Lens, attachment metadata review, Stream Shield, and optional Audience Guard |
| Recovery | Plugin Doctor, quarantine, settings snapshots, profiles, and setup rollback |

Tools that depend on Discord internals check their adapter before starting. **Off** means disabled; **Unavailable** means the current client did not expose a safely supported path. A catalog listing is not proof that a community plugin is installed or compatible.

### Start small

Open **User Settings → Solcord Suite**. Use the workspace search to find a feature. Enable one tool at a time and check its status; optional community-plugin migration lives in **Extensions**, not First Setup.

Lean, Balanced, and Visual change sampling and motion policy. Animated backgrounds need motion to be allowed; Lean, Subtle, or Windows reduced-motion preferences can suppress them. The settings page explains the effective policy.

### Private by choice

Friend Watch, Message Timeline, Audience Guard, and account-risk experiments start off. Private stores stay account-scoped, and the interface distinguishes encrypted persistence from session-only storage when Windows encryption is unavailable. Portable exports exclude private identifiers and history.

On-device translation uses a compatible engine exposed by Discord when available; unsupported builds or language pairs stay unavailable. External providers are not silently selected: DeepL or LibreTranslate requires your explicit choice, credential where required, and review of the text being sent. Voice Note Studio requires Record, preview, and a separate send or file-save action.

Audience Guard can prevent or stop a stream when a denied person is detected. It cannot promise per-person stream blocking or zero-frame exposure. [Audience Guard limits](docs/STREAM_AUDIENCE_GUARD.md) · [Security and privacy](docs/SECURITY_AND_PRIVACY.md)

## Update, repair, or remove

Open the installer for the release you intend to use. Each action is separate:

| Action | What it does |
| --- | --- |
| Update | Installs a newer core and keeps a verified rollback point |
| Repair | Reinstalls the same package when its files are damaged or missing |
| Roll back | Restores the backup captured immediately before the last core change |
| Uninstall | Removes Solcord's core/injector while keeping plugins, themes, settings, and recovery files |
| Verify files | Checks that installed files match this package |
| Open recovery folder | Shows the local receipts and backups |

Uninstall is **not** a private-data wipe. Keep your backup until you have checked Discord after the change. [Detailed install and rollback behavior](docs/INSTALL_AND_ROLLBACK.md)

## If something is wrong

- **Discord will not open:** run the installer and use **Roll back**. Do not delete the BetterDiscord data directory.
- **A tool says Unavailable:** check **Recovery → Plugin Doctor**. Discord updates can change internal interfaces; do not stack the old community plugin over a failing built-in.
- **A background is still:** check the effective motion policy, the selected effect, and Windows reduced motion.
- **A save fails:** keep your draft, check the reported error, and use Recovery. A switch changing color is not proof that a setting was saved.

When reporting a bug, include the Solcord release, Discord version, workspace, and exact steps. Remove private names, messages, and account details from screenshots. Use [GitHub issues](https://github.com/slaveofsolace/Solcord/issues); report security problems through [SECURITY.md](SECURITY.md).

## Build and verify

For contributors: install Git and Bun **1.4.0**. Building the Windows installer additionally requires the **.NET 8 SDK**. These are build tools, not user-install prerequisites.

```sh
bun install --frozen-lockfile
bun run verify
bun run dist
```

Useful individual gates:

```sh
bun run test
bun run lint
bun run lint-css:solcord
bun run typecheck
bun run generate-types
bun run circulars
bun run audit:repo:check
```

Run these from a clean checkout. Production packaging deliberately refuses dirty source. After changing tracked source, regenerate the line inventory with `bun run audit:repo` before verification. The production build writes `dist/solcord.asar`; installation retains the `betterdiscord.asar` filename required by the existing injector.

For ordinary source work, `bun run build` permits a clearly labeled development build. It does not install or restart Discord. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and [release evidence](docs/RELEASE_EVIDENCE_ASSEMBLY.md) for packaging.

## Repository map

- [`AGENTS.md`](AGENTS.md) — maintainer and Codex rules
- [`docs/QUICK_START.md`](docs/QUICK_START.md) — installation and first setup
- [`docs/SECURITY_AND_PRIVACY.md`](docs/SECURITY_AND_PRIVACY.md) — local-data and network boundaries
- [`docs/OWNER_READY_CLOSEOUT.md`](docs/OWNER_READY_CLOSEOUT.md) — current works/on/off/preview/blocked state and final acceptance boundary
- [`docs/ACTIVITY_COMPATIBILITY.md`](docs/ACTIVITY_COMPATIBILITY.md) — Activities architecture
- [`docs/audit/FULL_REPOSITORY_AUDIT.md`](docs/audit/FULL_REPOSITORY_AUDIT.md) — repeatable tracked-line audit
- [`docs/audit/PLUGIN_BASELINE_REVIEW.md`](docs/audit/PLUGIN_BASELINE_REVIEW.md) — plugin-store decisions
- [`docs/handoff/CODEX_HANDOFF.md`](docs/handoff/CODEX_HANDOFF.md) — exact remaining engineering work
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — development workflow
- [`SECURITY.md`](SECURITY.md) — security reports

## Honest limits

Solcord does not provide end-to-end encryption for ordinary Discord messages, eliminate all Discord-side collection, backfill unseen messages, or grant access to hidden channels. It does not silently send messages, record audio, or upload files. Experimental tools require separate consent and any required per-call arming.

A green source build does not prove every current Discord desktop interaction. Live Activities, injection, UI, accessibility, installer, and rollback acceptance must be rerun against the Discord version actually installed on the target machine.

## Fork and attribution

Solcord is forked from [BetterDiscord/BetterDiscord](https://github.com/BetterDiscord/BetterDiscord), originally from its `development` branch. BetterDiscord's history, contributors, license, public APIs, addon paths, and compatibility identifiers remain intact. Solcord's identity, installer, themes, safety layers, compatibility work, and native suite are fork additions.

BetterDiscord and Discord names are used for factual compatibility and attribution. Solcord is not endorsed by Discord. See [LICENSE](LICENSE), [NOTICE](NOTICE), and the [provenance registry](docs/PROVENANCE_REGISTRY.md).
