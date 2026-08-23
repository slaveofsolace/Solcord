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
4. Prove setup failure atomicity, existing-file conflict behavior, addon quarantine, state rollback, Timeline encryption fallback/retention/account isolation, and the disposable-profile addon matrix. Do not convert `runtime: PENDING` to accepted on static evidence alone.
5. Hash `dist\soulcord.asar` and verify the package contains the expected main, preload, renderer, editor, and package files.
6. Confirm no token-like string, private content, absolute user path, or secret appears in the diff, package, screenshots, docs, or build manifest.
7. Do not continue if any required gate fails.

## Reversible install procedure

1. Post the exact close/install action in the active task.
2. Ask Discord to close gracefully and wait for its processes to exit. Do not kill unrelated processes.
3. Create a timestamped backup outside the repository under the task evidence directory.
4. Copy, without deleting originals, the current injector entry point, installed core asar, stable settings, plugin files, theme files, Custom CSS, MessageLoggerV2 files/data, any SoulCord Timeline state, and compatibility state. Record SHA-256 values and relative paths without reading private message content.
5. Preserve the vanilla launcher unchanged and hash it.
6. Copy the verified `soulcord.asar` to a staged install path; hash again and require equality.
7. Run `bun run inject release stable`. Release mode verifies and atomically stages `dist/soulcord.asar` to `%APPDATA%\BetterDiscord\data\betterdiscord.asar`, then creates the standard Discord resource injector pointing at that compatibility target. Do not overwrite plugins, themes, settings, or Custom CSS.
8. Launch Discord Stable normally. Do not start an Activity, join voice, send, upload, or authorize anything.
9. Confirm Discord stays open, SoulCord settings/About render, Activity Bridge reports the restricted policy, and no crash loop or duplicate injection is visible.
10. Open the first-run setup preview but do not press `Finish`. Existing addon/theme states must remain unchanged until the owner reviews the complete diff and presses it.
11. Leave Discord open for the owner.

The machine-readable install manifest records exact backup and rollback paths after execution. Until that manifest exists, this document describes the procedure but is not evidence that installation or backup occurred.

## First-run setup transaction

The first-run selection is a draft: Obsidian Thread, the 36-addon aggressive selection, guarded message splitting, DM/group-DM Timeline with seven-day text-only retention, and every Power Lab experiment off. `Skip` changes no addon file, enabled state, theme, or Timeline setting.

After the owner presses `Finish`, SoulCord stages the complete dependency closure, verifies immutable hashes, and refuses a differing local file. It then enables selected addons one at a time and activates one SoulCord theme. A start failure is reported and quarantined; it is not counted as working. Reduced-motion conflicts keep DiscordEffects and BetterAnimations off. This transaction is not installation evidence until the disposable-profile tests pass.

The setup rollback action restores the recorded prior plugin/theme enabled states and the pre-setup SoulCord snapshot, then asks the main process to remove only unchanged files added by that transaction. Identical pre-existing files are reused and never removed. A user-modified file is preserved rather than overwritten or deleted.

## Owner Activity acceptance

1. Open SoulCord Suite → Activity Bridge and confirm the unrestricted override reads **Off by default**.
2. In a designated low-risk server/channel, start **Codenames** yourself. Wait for READY and complete one join/leave/rejoin cycle.
3. Return to Activity Bridge. Confirm one verified late preload was accepted, no preload error appeared, and the ledger remains bounded.
4. Start one second Discord Activity yourself. Repeat open/close/rejoin.
5. Check main chat, Settings, plugin list, theme list, Custom CSS editor, one popout, Command Deck, Stream Shield preview, and recovery panel.
6. If any Activity stalls, stop testing and use rollback. Do not enable the unrestricted override as a shortcut.

## Rollback

There are two separate rollback scopes:

1. **Setup rollback:** while SoulCord is running, use SoulCord Suite → Setup → **Roll back latest setup**. This restores the prior enabled states and SoulCord settings snapshot, and removes only unchanged files that the setup transaction added.
2. **Core rollback:** close Discord, verify it has exited, and atomically restore the manifest-recorded backup copy of `betterdiscord.asar` to `%APPDATA%\BetterDiscord\data\betterdiscord.asar`. Restore the injector only if the install manifest proves its hash changed. Launch Discord normally, or use the preserved vanilla launcher immediately.

The manifest-generated core restore uses resolved literal paths and a staged copy/hash/rename sequence. Before any recursive cleanup, it verifies the resolved target remains inside the manifest’s timestamped backup or SoulCord staging directory. No rollback command deletes the plugin directory, theme directory, stable settings directory, MessageLoggerV2 data, Timeline store, or vanilla launcher.

If SoulCord cannot open far enough to expose setup rollback, use the core rollback first. The setup journal remains available for later reviewed recovery; do not manually delete candidate files in bulk.

Do not delete the SoulCord artifact or backup until the owner accepts both Activities and ordinary settings/plugin/theme behavior. Exact commands are generated from resolved absolute paths in the install manifest; this document intentionally contains no user-specific path.

## Nonclaims

- A successful copy is not runtime acceptance.
- A visible SoulCord settings page is not proof an Activity handshake completes.
- The owner’s existing plugins/themes are preserved, not certified compatible.
- The vanilla launcher is an escape hatch, not a SoulCord validation path.
- A catalog hash match or static pass is not plugin runtime acceptance.
- The 36-addon wizard selection is not an enabled-addon list until the owner presses `Finish` and each addon passes its one-at-a-time start check.
- Persistent Timeline and setup rollback are source-implemented, not Windows-accepted, until their integration gates pass.
