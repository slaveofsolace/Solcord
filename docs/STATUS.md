# Release status

## Downloads and source

| Item | Status |
| --- | --- |
| Published Windows download | [v2.0.0-rc.33](https://github.com/slaveofsolace/Solcord/releases/tag/v2.0.0-rc.33) |
| Development work | RC34 Control Center, persistence, and test-isolation repairs |
| Integration branch | `development` |
| Distribution | Unsigned Windows x64 prerelease |
| Stable release | Not published |

The [changelog](../CHANGELOG.md) describes source changes. A merge is not an installation or a release. Use the version and hashes in the downloaded release's manifest to identify a package.

## RC34

RC34 corrects shared controls, spacing, native theme propagation, account-scoped private state, persistence failure handling, and duplicate lifecycle work. It also isolates test files so plugin mocks cannot affect the real translation or storage tests.

The [hosted checks](https://github.com/slaveofsolace/Solcord/actions/workflows/solcord-ci.yml) report the result for each exact commit. Tests and packaging do not certify every desktop interaction.

Before publishing RC34, the final package still needs exact-client visual, accessibility, restart, installer, and private-state acceptance. The completed release manifest must also identify the final security review and artifact hashes. Earlier candidate files must not be relabeled as packages of a later commit.

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
