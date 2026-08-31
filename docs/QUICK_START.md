# Solcord quick start

This guide applies only after `v2.0.0-rc.5` appears on the official Solcord release page with matching installer and checksum assets. Until then, RC5 is a candidate under review—not a downloadable release. The steps are written for someone who has never installed a Discord client mod.

On a typical Windows PC, the normal install is designed to take about one minute after the files are downloaded. That is a usability target, not a guarantee; Windows review prompts, Discord shutdown, recovery, and first-run choices can take longer.

> [!WARNING]
> Solcord RC5 is not code-signed. Windows may call it an unknown publisher. Download only from `slaveofsolace/Solcord`, confirm that the release is actually published, and compare its SHA-256 value with `SHA256SUMS.txt` before opening it. `release-manifest.json` is the separate machine-readable evidence manifest.

## 1. Download

Download both files into the same folder:

- [SolcordInstaller.exe](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.5/SolcordInstaller.exe)
- [SHA256SUMS.txt](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.5/SHA256SUMS.txt)

The assembled candidate stores the executable at `installer/SolcordInstaller.exe` inside its local evidence directory. Release publishing maps that exact hash-verified file to the root GitHub asset name `SolcordInstaller.exe`; it does not rebuild or change its bytes. `release-manifest.json` records this mapping and the installer build-receipt hash.

The six walkthrough images in this guide are optional release assets captured only after exact-candidate acceptance. When published, their exact names are `01-download.png`, `02-quit-discord.png`, `03-install.png`, `04-verified.png`, `05-first-setup.png`, and `06-recovery.png`; each published image must also appear as a hash-bound evidence file. A missing image never weakens checksum or installer verification.

![Download Solcord and its checksum list](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.5/01-download.png)

Optional verification in PowerShell:

```powershell
Get-FileHash .\SolcordInstaller.exe -Algorithm SHA256
```

Compare the result with the `installer/SolcordInstaller.exe` entry in `SHA256SUMS.txt`; that nested evidence name applies byte-for-byte to the root-published `SolcordInstaller.exe`. Stop if it differs.

## 2. Quit Discord

Right-click Discord in the Windows system tray and choose **Quit Discord**. Closing only the main window is not enough.

![Quit Discord before installation](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.5/02-quit-discord.png)

## 3. Install

Open the installer. Check the detected Discord channel and installation path, then select **Install**. Solcord refuses to write if Discord is still running or its embedded files fail verification.

![Install the verified Solcord artifact](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.5/03-install.png)

## 4. Verify and launch

Select **Verify** after installation. When the installer reports the expected artifact and backup receipt, select **Launch Discord**.

![Verify the installed artifact before launch](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.5/04-verified.png)

## 5. Complete First Setup

Open **User Settings → Solcord Suite**. First Setup previews the selected theme, built-ins, privacy choices, and complete change list before applying anything. Skipping setup leaves the current addon and theme state unchanged.

![Solcord First Setup](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.5/05-first-setup.png)

Recommended first check:

1. Leave Power Lab off.
2. Choose a theme.
3. Enable one safe built-in at a time.
4. Open Plugin Doctor and confirm there is no crash loop or quarantined core module.
5. Keep Audience Guard unarmed until you are in the call where you intend to use it.

## Recovery

If Discord fails to open correctly, quit it and run the same installer. Choose **Rollback / Uninstall** and use the exact backup shown by Recovery. Do not delete `%APPDATA%\BetterDiscord`, your plugins, themes, Custom CSS, or private addon databases.

![Solcord recovery and Plugin Doctor](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.5/06-recovery.png)

For manual recovery and backup details, read [Install and rollback](INSTALL_AND_ROLLBACK.md).
