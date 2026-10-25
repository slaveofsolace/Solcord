# Release status

## Downloads and source

| Item | Status |
| --- | --- |
| Published Windows download | [Solcord 2.0 — Signal](https://github.com/slaveofsolace/Solcord/releases/tag/v2.0.0) |
| Current release | `v2.0.0` |
| Source delivery branch | `main` |
| Upstream integration branch | `development` |
| Distribution | Unsigned Windows x64 stable release |
| Code signing | Not available; Windows may show an unknown-publisher warning |

The [changelog](../CHANGELOG.md) describes source changes. A merge is not an installation or a release. Use the version and hashes in the downloaded release's manifest to identify a package.

## Current release

Solcord 2.0 — Signal promotes the reviewed V2 line without relabeling any release candidate. It keeps the tested Discord-update recovery path and adds a lower-cost ambient renderer: fewer backing pixels, paced background frames, cached field geometry, and no self-triggered DOM synchronization pass. When Discord replaces its startup files, **Update Solcord** or **Repair Solcord** restores the startup handoff without replacing plugins, themes, settings, or private stores.

The exact source commit, core hash, installer hash, and Windows build results are recorded in the release manifest and `SHA256SUMS.txt` attached to `v2.0.0`. Older candidates keep their own immutable receipts and are not relabeled.

| Check | Recorded result |
| --- | --- |
| Source matrix | 1,081 tests and 7,499 assertions passed before packaging; lint, Solcord CSS, TypeScript, unused-code analysis, types, documentation links, circular inventory, and repository audit are separate gates |
| Discord-update fixture | A newer Discord version replaces the startup archive; the installer updates the receipt, restores injection, verifies the result, and preserves plugin, theme, and settings bytes |
| Installer | Embedded-resource self-test covers install, update, repair, rollback, interrupted recovery, downgrade refusal, and uninstall in isolated targets |
| Installed client | The exact release receipt identifies the Discord version and current rollback backup; source tests alone are not presented as live acceptance |
| Private and experimental tools | Stay opt-in. Fake Deafen stays off until explicitly enabled and armed for a call |

Destructive installer lifecycle cases remain isolated from the signed-in owner profile. Call-dependent tools, Activities, account actions, and every Discord update remain separate live checks. Isolated tests do not stand in for those checks.

The [hosted checks](https://github.com/slaveofsolace/Solcord/actions/workflows/solcord-ci.yml) report the result for each commit. The Windows installer remains unsigned. Earlier packages and their manifests are never relabeled or overwritten.

## Compatibility limits

- Discord internal APIs can change. Unsupported adapters stay inactive and report their status.
- On-device translation is available only where Discord exposes a compatible engine.
- External translation requires explicit provider configuration and disclosure.
- Audience Guard is detection-based, not per-viewer server access control.
- Private data uses encrypted account-scoped storage where available. Session-only fallback is labeled.
- Community addons retain their own compatibility and outbound-access requirements.
- Windows publisher warnings remain possible because the installer is unsigned.

## Historical results

[RC33 acceptance notes](archive/RC33_ACCEPTANCE.md), RC38 receipts, and older records are preserved. They describe the exact versions and conditions named there. They do not certify the stable package.

For current installation instructions, use [Quick start](QUICK_START.md). For live testing, use the [desktop checklist](development/DESKTOP_TESTING.md).
