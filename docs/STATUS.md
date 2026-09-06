# Release status

## Downloads and source

| Item | Status |
| --- | --- |
| Published Windows download | [v2.0.0-rc.33](https://github.com/slaveofsolace/Solcord/releases/tag/v2.0.0-rc.33) |
| Current source candidate | RC38: startup, backgrounds, focus, accessibility and Fake Deafen corrections |
| Source delivery branch | `main` |
| Upstream integration branch | `development` |
| Distribution | Unsigned Windows x64 prerelease |
| Stable release | Not published |

The [changelog](../CHANGELOG.md) describes source changes. A merge is not an installation or a release. Use the version and hashes in the downloaded release's manifest to identify a package.

## Current candidate

RC38 combines the corrected installer startup handoff, renderer-compatible settings saves, visible workspace backgrounds, keyboard-focus repairs, effective accessibility controls, accurate provider readiness, and the built-in Fake Deafen lifecycle fixes. Private stores and completed onboarding are preserved. Fake Deafen stays off until explicitly enabled and armed for a call.

The prior RC37 candidate was installed on Discord Stable 1.0.9256 and reached the signed-in session on two starts. Keyboard checks covered Control Center navigation, immediate light/dark changes, background control and persistence. Those observations belong to RC37, not the later source corrections.

The [hosted checks](https://github.com/slaveofsolace/Solcord/actions/workflows/solcord-ci.yml) report the result for each exact commit. Tests and packaging do not certify every desktop interaction.

Source tests and isolated rendered fixtures cover the corrections. Native mouse/drag checks, each volatile adapter's positive interaction, exact-candidate owner update/restart, and live resource teardown are not certified. The Windows input bridge has also failed to expose a targetable Discord window; that external limitation is recorded separately from application defects.

A reviewed source merge does not mean these manual checks passed. RC38 remains an unsigned candidate, not a stable-ready release. Each package identifies its actual source commit in its embedded manifest; earlier candidate files are never relabeled or overwritten.

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
