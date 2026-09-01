# Solcord V2 Installer

This is Solcord's self-contained Windows x64 installer. Its branded action center detects Stable, PTB, and Canary and keeps every operation explicit:

- **Install Solcord** performs first-time setup.
- **Update Solcord** replaces an older reviewed Solcord package and creates a rollback point.
- **Repair Solcord** reinstalls the exact package already recorded by the installer.
- **Roll Back** restores the receipt-bound state captured before the current installation.
- **Uninstall Solcord** removes only the recognized Solcord core and injector, returns the selected channel to vanilla Discord, and preserves a verified recovery copy.
- **Verify installation**, **Launch Discord**, and **Open recovery folder** remain secondary utilities.

The installer refuses shared-core mutation while any Discord channel is running. It never terminates Discord silently and does not delete BetterDiscord plugins, themes, settings, custom CSS, or message data. The executable and in-window identity both use the reviewed cord-cut Solcord mark.

The V2 release candidate is intentionally unsigned and is not a public stable installer. Windows may show an unknown-publisher warning. From a clean exact commit, build it with `bun run installer:candidate -- dist/solcord.asar <new-output-directory> <40-character-source-commit>`. The builder recreates the production ASAR and authoritative build manifest, verifies their source provenance, embeds both plus the hash-binding installer manifest into the published executable, and returns a six-file review bundle: `SolcordInstaller.exe`, `solcord.asar`, `solcord-build-manifest.json`, `solcord-installer-manifest.json`, `SHA256SUMS.txt`, and `solcord-installer-build-receipt.json`. Preserve the printed `installerReceiptSha256` outside that directory; release assembly uses it as the external trust anchor for every bundle file and the isolated self-test result.

At startup the executable validates all three embedded resources, extracts them with exclusive writes into a current-user-only random directory under local application data, revalidates the extracted bytes, and removes only its known files when it exits. `SolcordInstaller.exe --self-test` performs the same embedded-resource validation without any adjacent sidecars, then covers separate install/update/repair guards, exact verification, receipt-bound rollback, vanilla uninstall with user-data preservation, rejection of a rogue newer backup, and rejection of a tampered injector backup in disposable directories. The current recovery route is the retained receipt-selected backup and the separately preserved vanilla launcher. Authentic signing remains the stable-release gate.
