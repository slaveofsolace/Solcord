# Solcord quick start

This guide uses the verified `v2.0.0-rc.3` release. It is designed for someone who has never installed a Discord client mod.

> [!WARNING]
> Solcord RC3 is not code-signed. Windows may call it an unknown publisher. Download only from `slaveofsolace/Solcord` and compare its SHA-256 value with the release manifest before opening it.

## 1. Download

Download both files into the same folder:

- [SolcordSetup-v2.0.0-rc.3-win-x64.exe](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.3/SolcordSetup-v2.0.0-rc.3-win-x64.exe)
- [SHA256SUMS.txt](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.3/SHA256SUMS.txt)

![Download Solcord and its checksum list](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.3/01-download.png)

Optional verification in PowerShell:

```powershell
Get-FileHash .\SolcordSetup-v2.0.0-rc.3-win-x64.exe -Algorithm SHA256
```

Compare the result with the exact installer entry in `SHA256SUMS.txt`. Stop if it differs.

## 2. Quit Discord

Right-click Discord in the Windows system tray and choose **Quit Discord**. Closing only the main window is not enough.

![Quit Discord before installation](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.3/02-quit-discord.png)

## 3. Install

Open the installer. Check the detected Discord channel and installation path, then select **Install**. Solcord refuses to write if Discord is still running or its embedded files fail verification.

![Install the verified Solcord artifact](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.3/03-install.png)

## 4. Verify and launch

Select **Verify** after installation. When the installer reports the expected artifact and backup receipt, select **Launch Discord**.

![Verify the installed artifact before launch](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.3/04-verified.png)

## 5. Complete First Setup

Open **User Settings → Solcord Suite**. First Setup previews the selected theme, built-ins, privacy choices, and complete change list before applying anything. Skipping setup leaves the current addon and theme state unchanged.

![Solcord First Setup](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.3/05-first-setup.png)

Recommended first check:

1. Leave Power Lab off.
2. Choose a theme.
3. Enable one safe built-in at a time.
4. Open Plugin Doctor and confirm there is no crash loop or quarantined core module.
5. Keep Audience Guard unarmed until you are in the call where you intend to use it.

## Recovery

If Discord fails to open correctly, quit it and run the same installer. Choose **Rollback / Uninstall** and use the exact backup shown by Recovery. Do not delete `%APPDATA%\BetterDiscord`, your plugins, themes, Custom CSS, or private addon databases.

![Solcord recovery and Plugin Doctor](https://github.com/slaveofsolace/Solcord/releases/download/v2.0.0-rc.3/06-recovery.png)

For manual recovery and backup details, read [Install and rollback](INSTALL_AND_ROLLBACK.md).
