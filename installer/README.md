# Solcord V2 Installer

This is Solcord's self-contained Windows x64 installer. Its branded action center detects Stable, PTB, and Canary and keeps every operation explicit:

- **Install Solcord** performs first-time setup.
- **Update Solcord** replaces an older reviewed Solcord package and creates a rollback point.
- **Repair Solcord** reinstalls the exact package already recorded by the installer.
- **Roll Back** restores the receipt-bound state captured before the current installation.
- **Uninstall Solcord** removes only the recognized Solcord core and injector, returns the selected channel to vanilla Discord, and preserves a verified recovery copy.
- **Verify installation**, **Launch Discord**, and **Open recovery folder** remain secondary utilities.

Save drafts and leave calls before starting an install, update, repair, rollback, or uninstall. The installer first asks running Discord clients to close, then stops only processes verified under the selected Windows user's Discord installation paths. If a client cannot close, it leaves the shared core unchanged and asks you to quit Discord from the system tray. Plugins, themes, settings, custom CSS, and message data stay in place. The executable and in-window identity both use the Solcord mark.

The version picker ignores partially downloaded Discord updates. If no complete version is available, finish Discord's own update before running Solcord Setup. The installer checks the selected application files before closing Discord and again before changing anything.

Verification checks the startup loader and original Discord archive, not only the Solcord core. Discord's original archive is preserved under its BetterDiscord-compatible name while Solcord is installed; rollback restores its previous location, and uninstall restores the normal Discord startup entry. Install and Repair capture the current archive as a new baseline. Conflicting archives or changes during an operation stop it for review instead of being overwritten.

Roll Back and Uninstall use the Discord version recorded by the Solcord installation, even if Discord has since downloaded a newer version. They leave that newer version's files alone.

The V2 release candidate is intentionally unsigned and is not a public stable installer. Windows may show an unknown-publisher warning. From a clean exact commit, build it with `bun run installer:candidate -- dist/solcord.asar <new-output-directory> <40-character-source-commit>`. The builder recreates the production ASAR and authoritative build manifest, verifies their source provenance, embeds both plus the hash-binding installer manifest into the published executable, and returns a six-file review bundle: `SolcordInstaller.exe`, `solcord.asar`, `solcord-build-manifest.json`, `solcord-installer-manifest.json`, `SHA256SUMS.txt`, and `solcord-installer-build-receipt.json`. Preserve the printed `installerReceiptSha256` outside that directory; release assembly uses it as the external trust anchor for every bundle file and the isolated self-test result.

At startup the executable validates all three embedded resources, extracts them with exclusive writes into a current-user-only random directory under local application data, revalidates the extracted bytes, and removes only its known files when it exits. `SolcordInstaller.exe --self-test` performs the same embedded-resource validation without any adjacent sidecars, then covers separate install/update/repair guards, exact verification, receipt-bound rollback, vanilla uninstall with user-data preservation, rejection of a rogue newer backup, and rejection of a tampered injector backup in disposable directories. The current recovery route is the retained receipt-selected backup and the separately preserved vanilla launcher. Authentic signing remains the stable-release gate.
