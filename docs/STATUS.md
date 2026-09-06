# Release status

## Downloads and source

| Item | Status |
| --- | --- |
| Published Windows download | [v2.0.0-rc.33](https://github.com/slaveofsolace/Solcord/releases/tag/v2.0.0-rc.33) |
| Current candidate | RC38, installed and accepted by the project owner on September 6, 2026 |
| Source delivery branch | `main` |
| Upstream integration branch | `development` |
| Distribution | Unsigned Windows x64 prerelease |
| Stable release | Not published |

The [changelog](../CHANGELOG.md) describes source changes. A merge is not an installation or a release. Use the version and hashes in the downloaded release's manifest to identify a package.

## Current candidate

RC38 combines the corrected installer startup handoff, renderer-compatible settings saves, visible workspace backgrounds, keyboard-focus repairs, effective accessibility controls, accurate provider readiness, and the built-in Fake Deafen lifecycle fixes. Private stores and completed onboarding are preserved. Fake Deafen stays off until explicitly enabled and armed for a call.

RC38 was built from `f1c3f1cab29b1543268e28175cad021fc8275e09` and installed into the existing Discord Stable 1.0.9256 profile. The update preserved the checked plugin, theme, and settings files and created a verified rollback backup. Later documentation and maintenance commits do not change that installed package's identity.

| Check | Recorded result |
| --- | --- |
| Source tests | 1,080 passed; no failures |
| Rendered fixtures | 35 fixtures across eleven themes |
| Package | Two installer builds matched byte for byte; embedded-resource and isolated lifecycle checks passed |
| Installed client | One clean launch and renderer reload passed |
| Live navigation | All nine workspaces, Friends, two existing DMs, and profile modal passed |
| Live controls | Light/dark switching, effect-slider drag, HUD on/off, compact navigation, and zoom passed; tested settings were restored |
| Fake Deafen | Built-in control visible and off; active-call behavior was not exercised |

The owner accepted this candidate for current use and closed this work on September 6, 2026. This is separate from checks not performed: a second full-process cold start, an exhaustive native theme/DPI matrix, a fresh exact-client soak, call-dependent adapters and Activities, a privacy network audit, and destructive lifecycle tests in the owner profile. Isolated tests do not stand in for those checks.

The [hosted checks](https://github.com/slaveofsolace/Solcord/actions/workflows/solcord-ci.yml) report the result for each commit. RC38 remains an unsigned local candidate; the public download is still RC33. Earlier packages and their manifests are never relabeled or overwritten.

### RC38 package identity

| File | SHA-256 |
| --- | --- |
| Core ASAR | `b23c2c19230b9b588f455006b4887d2b8870f211590e808b9dd5d9331b9b654a` |
| Windows installer | `b45c07ce922fffa3a9c048ee5594449d9fff05d27c69da930da76ee3c6cc8839` |

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
