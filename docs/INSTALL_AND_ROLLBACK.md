# Windows install and rollback

Solcord V2 RC is installed only after tests, lint, type checks, production build, packaging, security review, artifact hashing, disposable acceptance, and rollback proof pass. Installation follows the exact reviewed candidate and leaves Windows security, authentication, and permission dialogs manual.

## Current live checkpoint

`v2.0.0-rc.2`, `v2.0.0-rc.3`, and `v2.0.0-rc.4` remain immutable. The owner-machine install manifest, not this repository page, identifies whichever exact build is currently installed in the signed-in profile.

The RC3 source line passed transactional First Setup, the five baseline capabilities, encrypted Friend Watch restart/export/clear, all eleven themes, keyboard/reduced-motion/forced-colors review, and the installer self-test's install, upgrade, repair, downgrade refusal, interrupted recovery, rollback, and uninstall cases in disposable targets. RC4 added provider-consolidation fixes and restored the built-in Fake Deafen control. RC5 corrects the Control Center's narrow layout, makes strict privacy the fresh-install baseline, completes the built-in adapter and secure-storage boundaries, and keeps Activity Bridge's restricted preload policy unchanged. Audience Guard now proves encrypted `safeStorage` availability, adapter enable, process restart, unarmed recovery, and disable in the isolated exact client; it still makes no per-person media-delivery claim.

The local machine-readable install evidence is authoritative for the exact repository SHA, artifact SHA-256, backup directory, rollback script, Discord version, and process set. Those owner-machine paths are intentionally not embedded in repository documentation. Applying setup to the signed-in owner profile, Message Timeline persistence, and Link Lens's external-link modal remain separate optional choices even though disposable setup acceptance is complete.

## Compatibility paths

- Staged production artifact: repository `dist\solcord.asar`
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
5. Hash `dist\solcord.asar` and verify the package contains the expected main, preload, renderer, editor, and package files.
6. Confirm no token-like string, private content, absolute user path, or secret appears in the diff, package, screenshots, docs, or build manifest.
7. Do not continue if any required gate fails.

## Disposable acceptance mode

Solcord can prepare a copied Discord runtime for core-only acceptance without changing the installed Discord resources or copying the owner's Discord/BetterDiscord profile. Acceptance mode requires an explicit absolute root and derives every Solcord data path from that root. It also suppresses `betterdiscord://` registration and disables core/addon update writes for the copied run.

The preparer has a true dry-run mode. Before any destination write, it validates a bounded CommonJS `resources/app/package.json`, matches bounded `resources/build_info.json` metadata to the `app-<version>` directory, rejects a source that already contains `resources/solcord.asar`, canonicalizes the physical source and existing destination parent, and rejects links/reparse aliases or physical destination containment. It verifies the caller-bound Solcord ASAR SHA-256 and full source commit, prechecks bounded ASAR file/header sizes before parsing, validates every packed entry range, and requires the exact self-contained runtime entrypoints plus embedded clean `production` or `release` build provenance. The caller must supply both `--expected-sha256 <sha256>` and `--expected-source-commit <40-character git commit>`; corrupt, truncated, oversized, copied, or stale diagnostic artifacts fail closed.

The source runtime may contain either Discord's direct desktop-core entry or the exact recognized legacy BetterDiscord injector entry. The preparer validates the physical `discord_desktop_core/core.asar` and package identity, copies the full runtime, verifies the copy, and neutralizes only that copied injector entry. It never edits the installed Discord tree or installed BetterDiscord core. The copied shim then validates every copied native module wrapper before loading Solcord, disables copied-runtime updater behavior, and writes a bounded content-free lifecycle ledger. The isolated 1.0.9253 run at `32e65a3` reached desktop-core startup and main-window visibility without a duplicate core/preload collision. It stopped at the expected unauthenticated connection boundary; this is startup evidence, not authenticated UI or Activity acceptance.

A real preparation snapshots a deterministic hash inventory of the complete Discord application tree, builds under a random sibling staging directory whose physical identity is rechecked, verifies both the unchanged source tree and the complete copied tree against that snapshot, writes the shim/artifact/manifest inside staging, and atomically renames staging to the still-absent final destination. Failure cleanup removes only the staging directory whose recorded identity is still owned by that invocation; it never deletes a competing or replaced destination. The shim then requires the launcher-provided `SOLCORD_ACCEPTANCE_ROOT`, `APPDATA`, `LOCALAPPDATA`, and `DISCORD_USER_DATA_DIR` to canonically match its copied location before enabling acceptance mode or loading Solcord. Direct `Discord.exe` execution therefore fails closed. Preparation never launches Discord. The generated launcher uses `--multi-instance`; authentication remains a manual owner action.

Residual nonclaim: the staging-identity check and recursive failure cleanup are separate filesystem operations. A hostile process running as the same Windows user with write access to the destination parent could attempt a directory swap in that narrow interval. Random staging names, repeated physical identity checks, and replacement-preserving failure behavior reduce exposure and fail closed when a swap is observed, but they do not make recursive deletion kernel-atomic. Use a destination parent that untrusted same-user processes cannot modify, or a separate Windows account, for a stronger boundary.

Do not copy `%APPDATA%\Discord`, `%APPDATA%\BetterDiscord`, tokens, Timeline data, or browser session material into the disposable profile. A same-Windows-user profile separates files and Discord state but still shares the Windows account and DPAPI boundary. A separate standard Windows account is the stronger acceptance boundary.

Disposable acceptance does not authorize messages, uploads, notification reads, voice joins, recordings, streams, OAuth, links, or Activity launches. The owner performs those actions after reviewing the prepared build. The copied runtime is evidence only for the exact artifact hash and Discord version recorded in its manifest.

## Reversible install procedure

1. Post the exact close/install action in the active task.
2. Ask Discord to close gracefully and wait for its processes to exit. Do not kill unrelated processes.
3. Create a timestamped backup outside the repository under the task evidence directory.
4. Copy, without deleting originals, the current injector entry point, installed core asar, stable settings, plugin files, theme files, Custom CSS, MessageLoggerV2 files/data, any Solcord Timeline state, and compatibility state. Record SHA-256 values and relative paths without reading private message content.
5. Preserve the vanilla launcher unchanged and hash it.
6. Copy the verified `solcord.asar` to a staged install path; hash again and require equality.
7. Run `bun run inject release stable`. Release mode verifies and atomically stages `dist/solcord.asar` to `%APPDATA%\BetterDiscord\data\betterdiscord.asar`, then creates the standard Discord resource injector pointing at that compatibility target. Do not overwrite plugins, themes, settings, or Custom CSS.
8. Launch Discord Stable normally. Do not start an Activity, join voice, send, upload, or authorize anything.
9. Confirm Discord stays open, Solcord settings/About render, Activity Bridge reports the restricted policy, and no crash loop or duplicate injection is visible.
10. Open the first-run setup preview but do not press **Apply and verify**. Existing addon/theme states must remain unchanged until the owner reviews the complete diff and presses it.
11. Leave Discord open for the owner.

The machine-readable install manifest records exact backup and rollback paths after execution. Until that manifest exists, this document describes the procedure but is not evidence that installation or backup occurred.

## About-one-minute RC install

The normal RC path is designed to take about one minute on a typical Windows PC after download. This is a usability target, not a time guarantee.

1. Download `SolcordInstaller.exe` and the release-level `SHA256SUMS.txt` from the same owner-controlled `v2.0.0-rc.5` release. The complete review bundle is also available inside the delivery ZIP under its exact generated name.
2. Compare the executable hash with the `installer/SolcordInstaller.exe` entry in the release-level `SHA256SUMS.txt`; that nested evidence name applies byte-for-byte to the root-published executable. Stop on any mismatch.
3. Quit Discord completely. Run `SolcordInstaller.exe`, confirm the detected Stable/PTB/Canary target, and choose **Install**.
4. Choose **Verify**, then **Launch Discord**. Open **User Settings → Solcord Suite** and review the setup diff before enabling optional features.

The RC executable is unsigned. Windows may display an unknown-publisher warning. Do not disable Windows security or automate its prompts. The published guide must use screenshots captured from this exact RC executable; source mockups and images from an older build are not installation evidence.

## Installer behavior

`installer/Solcord.Installer` is the original Solcord Windows installer source. A candidate bundle places one self-contained Windows x64 `SolcordInstaller.exe`, `solcord.asar`, the authoritative `solcord-build-manifest.json`, `solcord-installer-manifest.json`, installer-only `SHA256SUMS.txt`, and `solcord-installer-build-receipt.json` together. The receipt's SHA-256 is retained outside the bundle before release assembly. No separate .NET installation is required to run it. The builder accepts only a clean exact `HEAD`, recreates the ignored `dist` directory from that source, and proves that the new ASAR byte count and SHA-256 match both the post-build source manifest and the ASAR's embedded provenance. It rechecks `HEAD`, cleanliness, and generated hashes after publishing, then rehashes the staged payload. The installer detects Discord Stable, PTB, and Canary, shows the selected target/version, refuses any shared-core mutation while any of those Discord channels is running, verifies the manifest-bound ASAR before and after installation, captures and verifies stable prior-core and injector backup snapshots, and supports Verify, Repair/Update, Roll Back/Uninstall, and explicit launch.

It never deletes plugins, themes, settings, custom CSS, MessageLogger data, Timeline data, Friend Watch data, provider archives, or translation credential stores. It does not terminate Discord, bypass Windows prompts, authenticate, start an Activity, or perform account actions. Its lifecycle self-test uses disposable directories and verifies install, exact hash, refusal of oversized receipts, receipt-bound rollback, refusal of a rogue newer backup, refusal of a tampered injector backup, preservation of an unexpected current-core change during automatic recovery, canonicalization of an identical stale pending receipt, and retry after an injected partial-rollback interruption. A `pending.json` receipt is durable before mutation; a successful install becomes `current.json`, while a failed update retains pending recovery. Rollback recognizes the candidate and already-restored hashes, restores the injector before the core, and is safe to retry from a mixed state. It refuses to replace or delete a current core whose hash is neither the installed candidate nor the captured prior core, including during automatic recovery. It accepts only the exact direct-child backup recorded by the selected recovery receipt and validates every restored hash before mutation. Launch re-detects and containment-checks the selected channel/version/path. The current candidate is unsigned and self-contained; it is not a stable installer until signing or independently authenticated release metadata, SmartScreen, clean install/update/rollback, and stable-link evidence pass.

The core ASAR and injector entry files are replaced as separately verified filesystem operations, not as one kernel-atomic transaction, and the installer does not claim a durable parent-directory flush on Windows. A power loss or process failure between those surfaces can leave a mixed state. The pending recovery receipt and idempotent state classification make the tested interruption retryable, but they do not turn the two replacements into one atomic filesystem operation. Keep the receipt-bound backup and vanilla launcher available; recover through the verified rollback path before relaunching Discord.

## First-run setup transaction

The V2 first-run draft selects Solcord Default and the 21 behavior mappings implemented by the Native Suite. Those mappings include the three established interaction controls and grouped composer, call, audio, voice-note, translation, people/space, glance, notification, and motion tools. A mapping is not a blanket live claim: its adapter must report ready before a matching community provider may be archived. Message Timeline, Stream Audience Guard, and every Power Lab experiment remain off. The other catalog entries are optional and carry an individual reason/status; unavailable choices never block **Apply**. **Finish later** changes no addon file, enabled state, theme, Timeline setting, credential, or provider archive; only the resumable onboarding marker is recorded.

After the owner presses **Apply and verify**, Solcord stages only accepted requested candidates and their complete dependency closure, verifies immutable hashes, and refuses a differing local file. It enables accepted choices one at a time and activates one of eleven Solcord themes. Requested-but-held and unrequested owner addons remain untouched and owner-managed; setup does not replace, stop, or certify them. When an active community plugin overlaps a selected built-in, the community provider remains active until the owner chooses Solcord and that exact replacement reports ready. The wizard then seals the feature name, community filename/hash, enabled state, dependency state, archive destination, and provider choice. Apply rechecks the source bytes and readiness before moving only the provider `.plugin.js` into `solcord-provider-archive-v2`, outside the scanned plugin folder. BDFDB is archived last and only when no retained consumer remains. Configuration and private databases are not moved, read, or deleted. Any drift aborts or rolls back the transaction. A start failure is reported and quarantined; it is not counted as working. Reduced-motion conflicts suppress optional animation/effect behavior. This transaction is not installation evidence until the disposable-profile tests pass.

The setup rollback action restores the recorded prior plugin/theme enabled states and pre-setup Solcord snapshot, removes only unchanged files the setup transaction proved it added, and invokes provider rollback for its recorded archive transaction. Provider rollback restores only a hash-matching archived source to an absent plugin destination. It never overwrites a replacement file or touches private data. Identical pre-existing files are reused and never removed; user changes are preserved for manual review.

## Owner Activity acceptance

The owner reported Activities working for the accepted live build. RC5 does not change Activity Bridge or preload policy, so that result remains the product acceptance record. Re-run the matrix after a future change to either mechanism. No automated test starts an Activity on the owner’s behalf.

1. Open Solcord Suite → Activity Bridge and confirm the unrestricted override reads **Off by default**.
2. In a designated low-risk server/channel, start **Codenames** yourself. Wait for READY and complete one join/leave/rejoin cycle.
3. Return to Activity Bridge. Confirm one verified late preload was accepted, no preload error appeared, and the ledger remains bounded.
4. Start one second Discord Activity yourself. Repeat open/close/rejoin.
5. Check main chat, Settings, plugin list, theme list, Custom CSS editor, one popout, Command Deck, Stream Shield preview, and recovery panel.
6. If any Activity stalls, stop testing and use rollback. Do not enable the unrestricted override as a shortcut.

## Rollback

There are two separate rollback scopes:

1. **Setup/provider rollback:** while Solcord is running, use Solcord Suite → Setup → **Roll back latest setup**. This restores prior enabled states and the Solcord settings snapshot, removes only unchanged files the setup transaction added, and restores hash-matching provider source files only when their plugin destinations are absent.
2. **Core rollback:** close Discord, verify it has exited, and atomically restore the manifest-recorded backup copy of `betterdiscord.asar` to `%APPDATA%\BetterDiscord\data\betterdiscord.asar`. Restore the injector only if the install manifest proves its hash changed. Launch Discord normally, or use the preserved vanilla launcher immediately.

The manifest-generated core restore uses resolved literal paths and a staged copy/hash/rename sequence. Before any recursive cleanup, it verifies the resolved target remains inside the manifest's timestamped backup or Solcord staging directory. No rollback command deletes the plugin directory, theme directory, stable settings directory, MessageLoggerV2 data, Timeline store, translation credential store, provider archive, or vanilla launcher.

If Solcord cannot open far enough to expose setup rollback, use the core rollback first. The setup journal remains available for later reviewed recovery; do not manually delete candidate files in bulk.

Do not delete the Solcord artifact or backup until the owner accepts both Activities and ordinary settings/plugin/theme behavior. Exact commands are generated from resolved absolute paths in the install manifest; this document intentionally contains no user-specific path.

## Nonclaims

- A successful copy is not runtime acceptance.
- A visible Solcord settings page is not proof an Activity handshake completes.
- The owner’s existing plugins/themes are preserved, not certified compatible.
- The vanilla launcher is an escape hatch, not a Solcord validation path.
- A catalog hash match or static pass is not plugin runtime acceptance.
- The 36-entry catalog is not an enabled-addon list. V2's recommended mappings select built-in behavior, not community payloads; every runtime adapter can still report unavailable and every provider migration remains separately hash- and health-gated.
- Message Timeline remains opt-in; its encrypted storage and fallback paths are tested, but no automated acceptance captures or exports owner messages.
- “About one minute” describes the intended happy path after download. It does not include download time, Windows review prompts, Discord shutdown delays, backup recovery, or first-run feature decisions.
- The unsigned RC has no publisher identity in Windows. A successful lifecycle self-test does not replace code signing or authenticated release distribution.
