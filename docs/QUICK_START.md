# Solcord quick start

Use this guide for the published **v2.0.0-rc.33** Windows installer. Unreleased source changes are not part of that download.

Allow about one minute on a typical PC **after download**. Windows prompts, Discord shutdown, or recovery can take longer.

## Before you start

- Use Windows x64 with the official Discord desktop app installed.
- Open ordinary Discord at least once so it can finish installing.
- You do not need to install Bun, Git, .NET, plugin libraries, or BetterDiscord separately.
- Save unfinished drafts and leave voice/video calls before continuing.

> [!WARNING]
> This build is unsigned. Windows may show an unknown-publisher warning. Download only from `slaveofsolace/Solcord`, compare the hash below, and do not disable Windows security to install it.

## 1. Download

Download both files into the same folder:

- [SolcordInstaller.exe](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.33/SolcordInstaller.exe)
- [SHA256SUMS.txt](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.33/SHA256SUMS.txt)

### Check the download

Open PowerShell in your download folder and run:

```powershell
Get-FileHash .\SolcordInstaller.exe -Algorithm SHA256
```

Compare the result with the `installer/SolcordInstaller.exe` line in **SHA256SUMS.txt**. The extra `installer/` folder in that line is normal; it refers to the same executable. Do not run a file whose hash differs.

## 2. Save anything in progress

Solcord's core is shared by Discord Stable, PTB, and Canary. When changing that core, the installer closes running Discord processes whose executable paths it verifies, including another installed channel. It does not close unrelated applications. If a process cannot be verified or stopped, installation stops with an error.

## 3. Install

Open **SolcordInstaller.exe**. In **Version**, choose the Discord installation you use, such as `Stable · 1.0.9255`.

Choose **Install Solcord** for a first installation or **Update Solcord** for a newer release. Wait for the verified success status. Do not move or delete recovery files while an action is running.

## 4. Verify and launch

Select **Verify files**. When the installed files match the package, choose **Open Solcord**. This launches your existing Discord installation; you do not need a separate account or a new Discord profile.

## 5. Complete First Setup

A fresh installation opens **User Settings → Solcord Suite** at **Welcome** once Discord is ready. Follow Welcome, Privacy, Appearance, Features, and Review and Apply.

**Back** keeps the draft. **Finish later** saves your place without applying the proposed choices. Existing completed profiles do not reopen setup after an update or repair. You can reopen it manually in **Solcord Suite → Recovery**.

Recommended first check:

1. Choose a theme and leave optional private/history features off until you need them.
2. Try one built-in at a time in its matching workspace.
3. Check **Recovery → Plugin Doctor** if a tool reports a problem.
4. Leave Experimental tools off. Audience Guard stays unarmed until you explicitly arm it for a call.

Translation is optional. On-device translation requires a compatible engine in your Discord build and a supported language pair. DeepL and LibreTranslate need an explicit provider choice and may require a credential; no remote provider is silently selected.

## Updating

Download the new release's installer and checksum file, verify the download, and choose **Update Solcord**. Plugins, themes, settings, and private stores remain in place. **Repair** reinstalls the exact package you opened; it does not download an update.

## Recovery

| Problem | Next step |
| --- | --- |
| Discord does not appear in Version | Open the official desktop app once, quit it, then reopen the installer. |
| Discord cannot close | Quit it from the Windows system tray, then retry. The installer will not guess at an unverified process. |
| Files are missing or damaged | Run the same package and choose **Repair**. |
| The new core will not start | Use **Roll back** to restore the verified pre-change backup. |
| A feature says Unavailable | Check Plugin Doctor; the current Discord build may not support that adapter. |
| A background is not moving | Check the effect, the effective motion policy, and Windows reduced motion. |

**Open recovery folder** shows local backups and receipts. Do not delete `%APPDATA%\BetterDiscord`, plugins, themes, Custom CSS, or private databases to troubleshoot.

## Removing Solcord

Choose **Uninstall** in the installer. It removes the core/injector and keeps plugins, themes, settings, private stores, and backups. This is deliberately not a data-wipe action.

For manual recovery and backup details, read [Install and rollback](INSTALL_AND_ROLLBACK.md).
