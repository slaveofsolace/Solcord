# Release status

## Downloads and source

| Item | Status |
| --- | --- |
| Published Windows download | [v2.0.0-rc.33](https://github.com/slaveofsolace/Solcord/releases/tag/v2.0.0-rc.33) |
| Current source candidate | RC37: startup, persistence, background visibility and verification repairs |
| Integration branch | `development` |
| Distribution | Unsigned Windows x64 prerelease |
| Stable release | Not published |

The [changelog](../CHANGELOG.md) describes source changes. A merge is not an installation or a release. Use the version and hashes in the downloaded release's manifest to identify a package.

## Current candidate

RC37 includes the shared-control and spacing repairs, the corrected installer startup handoff, renderer-compatible atomic settings saves, and visible animated workspace backgrounds. Private stores and completed onboarding are preserved.

On Discord Stable 1.0.9256, the RC36 update and first signed-in start were verified. The Control Center loaded, light/dark appearance changed immediately, Performance HUD enable/disable worked, and Layout Collapse's recovery action restored the server rail. These observations do not substitute for RC37's exact-package checks.

The [hosted checks](https://github.com/slaveofsolace/Solcord/actions/workflows/solcord-ci.yml) report the result for each exact commit. Tests and packaging do not certify every desktop interaction.

The final RC37 package still needs its own desktop, restart and artifact verification before publication. Release evidence must distinguish completed checks from untested account-affecting actions. Earlier candidate files must not be relabeled as packages of a later commit.

## Compatibility limits

- Discord internal APIs can change. Unsupported adapters stay inactive and report their status.
- On-device translation is available only where Discord exposes a compatible engine.
- External translation requires explicit provider configuration and disclosure.
- Audience Guard is detection-based, not per-viewer server access control.
- Private data uses encrypted account-scoped storage where available. Session-only fallback is labeled.
- Community addons retain their own compatibility and outbound-access requirements.
- Windows publisher warnings remain possible because the installer is unsigned.

## Historical results

[RC33 acceptance notes](archive/RC33_ACCEPTANCE.md) and older records are preserved in the [archive](archive/README.md). They describe the exact versions and conditions named there. They do not certify a new candidate.

For current installation instructions, use [Quick start](QUICK_START.md). For live testing, use the [desktop checklist](development/DESKTOP_TESTING.md).
