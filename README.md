<p align="center">
  <img src="assets/branding/soulcord-wordmark.svg" width="560" alt="SoulCord">
</p>

<p align="center">
  <a href="https://github.com/slaveofsolace/Solcord/actions/workflows/soulcord-ci.yml"><img alt="SoulCord CI" src="https://img.shields.io/github/actions/workflow/status/slaveofsolace/Solcord/soulcord-ci.yml?branch=v2%2Fproduct-suite&style=flat-square&label=SoulCord%20CI"></a>
  <img alt="Version 2.0.0 release candidate" src="https://img.shields.io/badge/version-2.0.0--rc.1-4ecdc4?style=flat-square">
  <img alt="Apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-f4b860?style=flat-square">
</p>

# SoulCord

SoulCord is an owner-controlled Discord desktop power fork based on BetterDiscord. It preserves the public plugin and theme contracts, familiar data paths, and upstream history while adding bounded Activity compatibility, recovery controls, local privacy tools, and a coherent built-in utility suite.

V2 is a release-candidate branch, not a stable release. Source and deterministic tests establish mechanisms; they do not establish installed Discord compatibility, visual acceptance, or safety after a future Discord update.

## What V2 contains

| Area | V2 behavior | Current claim |
| --- | --- | --- |
| Activity Bridge | Accepts at most one verified, same-package Discord-owned late preload while the unrestricted override stays off | Previously owner-confirmed on an installed V1 generation; every new artifact still needs regression acceptance |
| Stream Audience Guard | Prevent Start, Stop on Join, and separately warned Stop on Watch modes; per-call arming and account-isolated denylist | Client guard, disabled by default; not per-viewer media access control |
| Plugin Doctor | Bounded failure history, three-in-ten-minute quarantine, explicit retry and recovery | Ready in source |
| Native Suite | Privacy Controls, Composer Toolkit, Call Context, Audio Console, Voice Note Studio, Translation Desk, People and Spaces, Channel Glance, Notification Review, Motion Studio, Voice Health, Permission Lens | Built-in source exists; each adapter reports ready or unavailable after structural validation |
| Local records | Message Timeline, Friend Watch, Settings Time Machine, Update Ledger, profiles and rollback | Opt-in, bounded, and account-isolated; installed persistence acceptance remains separate |
| Creator/privacy tools | Link Lens, Invite Inspector, Stream Shield, Screenshot Scrubber, Attachment Guard | Local and reversible; no automatic upload or navigation |
| Theme family | SoulCord Default plus ten alternatives, including six structurally distinct V2 full-shell themes | Eleven self-contained local themes; V2 live scaling review remains pending |
| Provider migration | Hash-bound preview, replacement health check, source-file archive outside the scanned plugin directory, receipt-bound rollback | Never deletes a provider or reads private plugin data |
| Windows installer | Stable/PTB/Canary detection, exact artifact verification, backup, install, verify, repair/update, rollback/uninstall, explicit launch | Unsigned, self-contained Windows x64 release candidate |

The Native Suite replaces overlapping community-plugin cards only when the owner chooses the SoulCord provider and the built-in health check passes. It does not rename or claim authorship of community work. Existing configuration and private databases stay where they are. See [V2 built-in migration](docs/V2_PLUGIN_MIGRATION.md).

## Important limits

- Stream Audience Guard cannot stop Discord's server from forwarding a normal Go Live stream to one selected person. It can refuse to start or stop the owner's stream when a denied person is detected. Stop on Watch may occur after brief frame exposure. Only channel permissions provide server-enforced access control.
- SoulCord does not extract tokens, fetch deleted messages, backfill history, access hidden channels, automate account actions, forge premium state, or hide telemetry. There is no SoulCord telemetry service.
- Voice Note Studio requires record, stop, preview, and explicit upload preparation. It never records or uploads on startup.
- Translation Desk has no active provider by default. It shows the endpoint and text scope before sending text to DeepL or a configured LibreTranslate service. Credentials are encrypted with Electron `safeStorage`; without it, credentials are memory-only.
- Message Timeline records only events already observed by the running client after opt-in. It does not inspect or import MessageLoggerV2 data.
- Fake Deafen remains default-off Power Lab work with separate consent and per-call arming. Other account-risk experiments remain outside normal installation acceptance.
- A catalog hash or static review is not runtime acceptance. Community candidates remain fail-closed until their individual gates pass.

Read [Security and privacy](docs/SECURITY_AND_PRIVACY.md), [Stream Audience Guard](docs/STREAM_AUDIENCE_GUARD.md), and [Install and rollback](docs/INSTALL_AND_ROLLBACK.md) before testing.

## About-one-minute install

The intended RC path takes about one minute on a typical Windows PC after download. It is not a time guarantee.

1. Download the complete `SoulCord-v2.0.0-rc.1-win-x64` folder and verify `SHA256SUMS.txt`.
2. Quit Discord completely. The installer refuses to change the shared core while Stable, PTB, or Canary is running.
3. Run `SoulCordInstaller.exe`, review the detected Discord channel, and choose **Install**.
4. Choose **Verify**, then **Launch Discord**. Open **User Settings → SoulCord Suite** before enabling optional features.

The executable is unsigned. Windows may display an unknown-publisher warning; do not bypass a security prompt unless the file hash matches the release manifest obtained from the owner-controlled repository. The installer preserves plugins, themes, settings, Custom CSS, and private message data. Keep its receipt-bound backup until the RC is accepted. Full recovery steps are in [Install and rollback](docs/INSTALL_AND_ROLLBACK.md).

## Build

Requirements: Bun `1.4.0`, .NET 8 SDK for installer creation, and a standard local Discord installation for later acceptance.

```sh
bun install --frozen-lockfile
bun run test
bun run lint
bun run lint-css:soulcord
bun run typecheck
bun run dist
bun run installer:candidate -- dist/soulcord.asar <new-output-directory> <40-character-source-commit>
```

The installer builder accepts only a clean exact commit, rebuilds `dist/soulcord.asar`, verifies embedded provenance, publishes one self-contained `SoulCordInstaller.exe`, runs its disposable lifecycle self-test, and writes the installer manifest and checksums. The production ASAR is installed under the legacy `betterdiscord.asar` filename only because the existing injector requires it.

## Repository and updates

- Product repository: [`slaveofsolace/Solcord`](https://github.com/slaveofsolace/Solcord)
- Upstream: [`BetterDiscord/BetterDiscord`](https://github.com/BetterDiscord/BetterDiscord)
- Upstream baseline: `development` commit `b28306898136ee5157f7ecb352d2ae307a646dec`
- V2 review branch: `v2/product-suite`
- Core updater: disabled until SoulCord has owner-controlled integrity metadata
- Catalog: attributed BetterDiscord metadata; no blanket reuse or runtime claim

Discord-internal adapters must pass their structural canaries again after a Discord or Electron update. The project does not merge, release, or change the default branch merely because local checks pass.

## Attribution

SoulCord preserves BetterDiscord's Git history, contributors, Apache-2.0 license, public APIs, and fork lineage. BetterDiscord and Discord names are used only for factual compatibility and attribution. SoulCord's mark and theme family are original and do not use either project's logo.

See [NOTICE](NOTICE), [LICENSE](LICENSE), and [the provenance registry](docs/PROVENANCE_REGISTRY.md).
