# Solcord quick start

This guide applies to `v2.0.0-rc.32` on the official Solcord release page. The steps are written for someone who has never installed a Discord client mod.

On a typical Windows PC, the normal install is designed to take about one minute after the files are downloaded. That is a usability target, not a guarantee; Windows review prompts, Discord shutdown, recovery, and first-run choices can take longer.

> [!WARNING]
> Solcord RC32 is not code-signed. Windows may call it an unknown publisher. Download only from `slaveofsolace/Solcord` and compare the installer SHA-256 with `SHA256SUMS.txt` before opening it. `release-manifest.json` is the separate machine-readable evidence manifest.

## 1. Download

Download both files into the same folder:

- [SolcordInstaller.exe](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.32/SolcordInstaller.exe)
- [SHA256SUMS.txt](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.32/SHA256SUMS.txt)

The assembled candidate stores the executable at `installer/SolcordInstaller.exe` inside its local evidence directory. Release publishing maps that exact hash-verified file to the root GitHub asset name `SolcordInstaller.exe`; it does not rebuild or change its bytes. `release-manifest.json` records this mapping and the installer build-receipt hash.

Walkthrough images are optional release assets. If present, each one is hash-bound in the release evidence; their absence does not weaken installer verification.

Optional verification in PowerShell:

```powershell
Get-FileHash .\SolcordInstaller.exe -Algorithm SHA256
```

Compare the result with the `installer/SolcordInstaller.exe` entry in `SHA256SUMS.txt`; that nested evidence name applies byte-for-byte to the root-published `SolcordInstaller.exe`. Stop if it differs.

## 2. Save anything in progress

Leave voice calls and save any unfinished message. The installer closes only the selected Discord desktop channel when a file change requires it, waits for that exact process tree to exit, and then continues. It does not close unrelated applications.

## 3. Install

Open the installer. Confirm the **Version** row shows the Discord channel and version you use, such as `Stable · 1.0.9255`, then choose the one available primary action: **Install Solcord** or **Update Solcord**. Solcord refuses to write if its embedded files fail verification or the selected Discord process cannot be stopped safely.

## 4. Verify and launch

Select **Verify files** after installation. When the installer reports that the installed files match, select **Open Solcord**.

## 5. Complete First Setup

A fresh installation opens **User Settings → Solcord Suite** on Welcome after Discord is ready. First Setup previews the selected theme, built-ins, privacy choices, and complete change list before applying anything. **Finish later** preserves the draft and leaves the current addon and theme state unchanged. Existing completed profiles do not reopen setup after an update or repair.

Recommended first check:

1. Leave Power Lab off.
2. Choose a theme.
3. Enable one safe built-in at a time.
4. Open Plugin Doctor and confirm there is no crash loop or quarantined core module.
5. Keep Audience Guard unarmed until you are in the call where you intend to use it.

## Recovery

If Discord fails to open correctly, run the same installer and choose **Roll back**. **Repair**, **Roll back**, and **Uninstall** are separate actions with separate explanations. Do not delete `%APPDATA%\BetterDiscord`, your plugins, themes, Custom CSS, or private addon databases.

For manual recovery and backup details, read [Install and rollback](INSTALL_AND_ROLLBACK.md).
