# Windows install and rollback

SoulCord V1 is installed only after tests, lint, type checks, production build, packaging, security review, and artifact hashing pass. The owner authorized a reversible install on this PC, but Windows security, authentication, and permission dialogs remain manual.

## Compatibility paths

- Staged production artifact: repository `dist\soulcord.asar`
- Installed compatibility target: `%APPDATA%\BetterDiscord\data\betterdiscord.asar`
- Existing plugin folder: `%APPDATA%\BetterDiscord\plugins`
- Existing theme folder: `%APPDATA%\BetterDiscord\themes`
- Existing stable settings: `%APPDATA%\BetterDiscord\data\stable`
- Preserved vanilla escape hatch: the existing Desktop “Discord Activities (Vanilla)” launcher

The installed filename remains `betterdiscord.asar` because that is the existing injector contract. This is an intentional compatibility identifier, not product branding.

## Pre-install gate

1. Record repository root, branch, HEAD, remotes, dirty state, Discord channel/version, installed BetterDiscord version/hash, injector hash, active Discord PIDs, and compatibility paths.
2. Verify both original bundle SHA-256 values and the delivery manifest.
3. Run frozen dependency installation, full tests, lint, type check, type generation, circular-dependency check, production build, package, and `git diff --check`.
4. Hash `dist\soulcord.asar` and verify the package contains the expected main, preload, renderer, editor, and package files.
5. Confirm no token-like string, private content, absolute user path, or secret appears in the diff, package, screenshots, docs, or build manifest.
6. Do not continue if any required gate fails.

## Reversible install procedure

1. Post the exact close/install action in the active task.
2. Ask Discord to close gracefully and wait for its processes to exit. Do not kill unrelated processes.
3. Create a timestamped backup outside the repository under the task evidence directory.
4. Copy, without deleting originals, the current injector entry point, installed core asar, stable settings, plugin files, theme files, Custom CSS, and compatibility state. Record SHA-256 values and relative paths.
5. Preserve the vanilla launcher unchanged and hash it.
6. Copy the verified `soulcord.asar` to a staged install path; hash again and require equality.
7. Replace only `%APPDATA%\BetterDiscord\data\betterdiscord.asar` using an atomic same-directory temporary file and rename. Do not overwrite plugins, themes, settings, or Custom CSS.
8. Launch Discord Stable normally. Do not start an Activity, join voice, send, upload, or authorize anything.
9. Confirm Discord stays open, SoulCord settings/About render, Activity Bridge reports the restricted policy, and no crash loop or duplicate injection is visible.
10. Leave Discord open for the owner.

The machine-readable install manifest records exact backup and rollback paths after execution.

## Owner Activity acceptance

1. Open SoulCord Suite → Activity Bridge and confirm the unrestricted override reads **Off by default**.
2. In a designated low-risk server/channel, start **Codenames** yourself. Wait for READY and complete one join/leave/rejoin cycle.
3. Return to Activity Bridge. Confirm one verified late preload was accepted, no preload error appeared, and the ledger remains bounded.
4. Start one second Discord Activity yourself. Repeat open/close/rejoin.
5. Check main chat, Settings, plugin list, theme list, Custom CSS editor, one popout, Command Deck, Stream Shield preview, and recovery panel.
6. If any Activity stalls, stop testing and use rollback. Do not enable the unrestricted override as a shortcut.

## Rollback

With Discord closed, atomically restore the recorded backup copy of `betterdiscord.asar` to `%APPDATA%\BetterDiscord\data\betterdiscord.asar`. Restore the injector only if its hash changed during installation. Launch Discord normally, or use the preserved vanilla launcher immediately.

Do not delete the SoulCord artifact or backup until the owner accepts both Activities and ordinary settings/plugin/theme behavior. Exact commands are generated from resolved absolute paths in the install manifest; this document intentionally contains no user-specific path.

## Nonclaims

- A successful copy is not runtime acceptance.
- A visible SoulCord settings page is not proof an Activity handshake completes.
- The owner’s existing plugins/themes are preserved, not certified compatible.
- The vanilla launcher is an escape hatch, not a SoulCord validation path.
