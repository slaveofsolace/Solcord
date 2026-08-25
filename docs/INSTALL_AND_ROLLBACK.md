# Windows install and rollback

SoulCord V1 is installed only after tests, lint, type checks, production build, packaging, security review, artifact hashing, disposable acceptance, and the live-install checkpoint pass. Source work does not authorize closing Discord or changing the live profile; fresh owner approval is required at that checkpoint. Windows security, authentication, and permission dialogs remain manual.

## Current live checkpoint

Fresh owner approval for a reversible live install was received for the earlier pre-productization `e1b40dff` generation. That task created a complete pre-install backup and hash inventory, preserved the vanilla Activities launcher, installed a byte-verified production ASAR through the supported injector path, and launched Discord Stable. No-send acceptance covered startup stability, the SoulCord navigation label, the Suite/settings surface, the setup no-change boundary, Command Deck cleanup, and an already-read DM route without the defective Link Lens overlay. The owner separately confirmed Activities are working and waived a repeated Activity launch. This is not acceptance evidence for the current productization wave.

The local machine-readable install evidence is authoritative for the exact repository SHA, artifact SHA-256, backup directory, rollback script, Discord version, and process set. Those owner-machine paths are intentionally not embedded in repository documentation. Setup **Apply and verify**, theme activation, Message Timeline persistence, and Link Lens’s external-link modal remain separate optional gates.

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

## Disposable acceptance mode

SoulCord can prepare a copied Discord runtime for core-only acceptance without changing the installed Discord resources or copying the owner's Discord/BetterDiscord profile. Acceptance mode requires an explicit absolute root and derives every SoulCord data path from that root. It also suppresses `betterdiscord://` registration and disables core/addon update writes for the copied run.

The preparer has a true dry-run mode. Before any destination write, it validates a bounded CommonJS `resources/app/package.json`, matches bounded `resources/build_info.json` metadata to the `app-<version>` directory, rejects a source that already contains `resources/soulcord.asar`, canonicalizes the physical source and existing destination parent, and rejects links/reparse aliases or physical destination containment. It verifies the caller-bound SoulCord ASAR SHA-256 and full source commit, prechecks bounded ASAR file/header sizes before parsing, validates every packed entry range, and requires the exact self-contained runtime entrypoints plus embedded clean `production` or `release` build provenance. The caller must supply both `--expected-sha256 <sha256>` and `--expected-source-commit <40-character git commit>`; corrupt, truncated, oversized, copied, or stale diagnostic artifacts fail closed.

The source runtime may contain either Discord's direct desktop-core entry or the exact recognized legacy BetterDiscord injector entry. The preparer validates the physical `discord_desktop_core/core.asar` and package identity, copies the full runtime, verifies the copy, and neutralizes only that copied injector entry. It never edits the installed Discord tree or installed BetterDiscord core. The copied shim then validates every copied native module wrapper before loading SoulCord, disables copied-runtime updater behavior, and writes a bounded content-free lifecycle ledger. The isolated 1.0.9253 run at `32e65a3` reached desktop-core startup and main-window visibility without a duplicate core/preload collision. It stopped at the expected unauthenticated connection boundary; this is startup evidence, not authenticated UI or Activity acceptance.

A real preparation snapshots a deterministic hash inventory of the complete Discord application tree, builds under a random sibling staging directory whose physical identity is rechecked, verifies both the unchanged source tree and the complete copied tree against that snapshot, writes the shim/artifact/manifest inside staging, and atomically renames staging to the still-absent final destination. Failure cleanup removes only the staging directory whose recorded identity is still owned by that invocation; it never deletes a competing or replaced destination. The shim then requires the launcher-provided `SOULCORD_ACCEPTANCE_ROOT`, `APPDATA`, `LOCALAPPDATA`, and `DISCORD_USER_DATA_DIR` to canonically match its copied location before enabling acceptance mode or loading SoulCord. Direct `Discord.exe` execution therefore fails closed. Preparation never launches Discord. The generated launcher uses `--multi-instance`; authentication remains a manual owner action.

Residual nonclaim: the staging-identity check and recursive failure cleanup are separate filesystem operations. A hostile process running as the same Windows user with write access to the destination parent could attempt a directory swap in that narrow interval. Random staging names, repeated physical identity checks, and replacement-preserving failure behavior reduce exposure and fail closed when a swap is observed, but they do not make recursive deletion kernel-atomic. Use a destination parent that untrusted same-user processes cannot modify, or a separate Windows account, for a stronger boundary.

Do not copy `%APPDATA%\Discord`, `%APPDATA%\BetterDiscord`, tokens, Timeline data, or browser session material into the disposable profile. A same-Windows-user profile separates files and Discord state but still shares the Windows account and DPAPI boundary. A separate standard Windows account is the stronger acceptance boundary.

Disposable acceptance does not authorize messages, uploads, notification reads, voice joins, recordings, streams, OAuth, links, or Activity launches. The owner performs those actions after reviewing the prepared build. The copied runtime is evidence only for the exact artifact hash and Discord version recorded in its manifest.

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
10. Open the first-run setup preview but do not press **Apply and verify**. Existing addon/theme states must remain unchanged until the owner reviews the complete diff and presses it.
11. Leave Discord open for the owner.

The machine-readable install manifest records exact backup and rollback paths after execution. Until that manifest exists, this document describes the procedure but is not evidence that installation or backup occurred.

## One-click installer candidate

`installer/SoulCord.Installer` is the original SoulCord Windows installer source. A candidate bundle places `SoulCordInstaller.exe`, its framework-dependent runtime files, `soulcord.asar`, the authoritative `soulcord-build-manifest.json`, `soulcord-installer-manifest.json`, and `SHA256SUMS.txt` together. The builder accepts only a clean exact `HEAD` and proves that the ASAR byte count and SHA-256 match the post-build source manifest. The installer detects Discord Stable, PTB, and Canary, shows the selected target/version, refuses any shared-core mutation while any of those Discord channels is running, verifies the manifest-bound ASAR before and after installation, backs up the prior core and injector files with hashes, and supports Verify, Repair/Update, Roll Back/Uninstall, and explicit launch.

It never deletes plugins, themes, settings, custom CSS, MessageLogger data, Timeline data, or Friend Watch data. It does not terminate Discord, bypass Windows prompts, authenticate, start an Activity, or perform account actions. Its lifecycle self-test uses disposable directories and verifies install, exact hash, receipt-bound rollback, refusal of a rogue newer backup, and refusal of a tampered injector backup. Rollback accepts only the exact direct-child backup recorded by the current install receipt and validates every restored hash before mutation. Launch re-detects and containment-checks the selected channel/version/path. The current candidate is unsigned and framework-dependent; it is not a public stable installer until signing or independently authenticated release metadata, SmartScreen, clean install/update/rollback, and stable-link evidence pass.

The core ASAR and injector entry files are replaced as separately verified filesystem operations, not as one kernel-atomic transaction, and the installer does not claim a durable parent-directory flush on Windows. A power loss or process failure between those surfaces can leave a mixed state. Keep the receipt-bound backup and vanilla launcher available; recover through the verified rollback path before relaunching Discord.

## First-run setup transaction

The first-run draft selects SoulCord Default and three ready local features: DoNotTrack, Invisible Typing, and Double Click to Reply. Guarded Split Large Messages remains visible as a preview but is not selected, executable, or eligible to replace a community provider until disposable Discord modal/clipboard acceptance passes. Message Timeline and every Power Lab experiment remain off. The other catalog entries are optional and carry an individual reason/status; unavailable choices never block **Apply and verify**. `Skip` changes no addon file, enabled state, theme, or Timeline setting; only the resumable onboarding marker is recorded.

After the owner presses **Apply and verify**, SoulCord stages only accepted requested candidates and their complete dependency closure, verifies immutable hashes, and refuses a differing local file. It enables accepted choices one at a time and activates one SoulCord theme. Requested-but-held and unrequested owner addons remain untouched and owner-managed; setup does not replace, stop, or certify them. When an active community plugin overlaps a selected clean-room built-in, the community plugin remains active and the built-in dynamically stands down until the owner makes a separate reversible choice. If the owner chooses the SoulCord provider, the wizard seals the exact feature name, community filename, enabled state, and provider choice shown in the confirmation. The runtime rechecks that plan before staging and immediately before disabling the community file; any drift aborts and rolls the transaction back without disabling a replacement file. A start failure is reported and quarantined; it is not counted as working. Reduced-motion conflicts keep DiscordEffects and BetterAnimations off. This transaction is not installation evidence until the disposable-profile tests pass.

The setup rollback action restores the recorded prior plugin/theme enabled states and the pre-setup SoulCord snapshot, then asks the main process to remove only unchanged files added by that transaction. Identical pre-existing files are reused and never removed. A user-modified file is preserved rather than overwritten or deleted.

## Owner Activity acceptance

The owner reported Activities working for the accepted live build. The matrix below remains the regression procedure after a Discord, Electron, preload-policy, or packaging change; it is not repeated automatically and no agent starts an Activity on the owner’s behalf.

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
- The 36-entry catalog is not an enabled-addon list. Only accepted choices can run, and the beginner default contains three clean-room features.
- Persistent Timeline and setup rollback are source-implemented, not Windows-accepted, until their integration gates pass.
