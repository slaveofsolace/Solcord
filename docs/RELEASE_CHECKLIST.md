# Solcord V2 RC release checklist

This checklist governs the owner-ready unsigned candidate. Historical candidates remain immutable. `release-manifest.json` is authoritative for artifact and runtime identities; `SHA256SUMS.txt` is the human-readable checksum list.

## Source and provenance

- [ ] The final source commit is clean, reachable from `development`, pushed, and remote SHA verified.
- [ ] The exact source/delivery ZIPs and their SHA-256 values are recorded outside the source archive.
- [ ] Record the current plugin/theme catalog counts and API hashes, compare them with the last reviewed 209-plugin/114-theme snapshot, and explicitly disposition any drift rather than silently accepting it.
- [ ] Current raw catalog hashes and generated registry hashes match `PROVENANCE_REGISTRY.md`.
- [ ] VoiceMessages is identified as GPL-3.0, not AGPL; no GPL or unresolved-license implementation was copied into the Apache-2.0 core.
- [ ] Every adapted source retains its controlling license, header, authorship, pinned revision, file list, and modification note.
- [ ] Published historical candidates remain byte-for-byte immutable; the current source and release assets identify `v2.0.0-rc.33`.

## Build and security

- [ ] Frozen install, full tests, ESLint, focused Solcord CSS/theme lint, typecheck, type generation, circular-dependency measurement, production build, package, audit, and `git diff --check` pass.
- [ ] A security-diff review covers BrowserWindow/preload, IPC, updater, installer, translation credentials, provider archive/rollback, addon execution, diagnostics, and network calls.
- [ ] No token, private content, account identifier, denied-user ID, credential, message body, absolute owner path, or secret appears in Git, artifacts, screenshots, logs, or release copy.
- [ ] Two clean builds produce byte-identical ASARs, or any difference is explained and the release is held.
- [ ] `SolcordInstaller.exe --self-test` passes for the exact self-contained executable included in the RC directory.

## Disposable runtime

- [ ] Main/settings/popout/editor/plugin/theme/Custom CSS surfaces open without duplicate injection or crash loop.
- [ ] All eleven themes cover the full shell and pass keyboard, focus, contrast, reduced-motion, and 100%/125%/150%/200% scaling review.
- [ ] Native Suite replacements report truthful `ready` or `unavailable` state; no visible card is counted as live without its adapter.
- [ ] Provider preview/apply/rollback proves exact-byte archive, BDFDB-last ordering, preservation of private data, owner-change refusal, and cleanup.
- [ ] Translation Desk proves endpoint disclosure, confirmation expiry, response bounds, secure-storage persistence, memory fallback, account isolation, and clear.
- [ ] Audience Guard distinguishes storage availability from policy-loaded state, proves encrypted restart/account isolation when `safeStorage` is available, and remains visibly session-only and fail-closed otherwise.
- [ ] Friend Watch proves fixture-driven change classification, encrypted restart/account isolation, no-change reconciliation, export, clear, notification, and truthful unknown-cause handling without mutating a real relationship.
- [ ] Layout Collapse, Embed Controls, Autoscroll, Message Link Preview, and local Media Shelf prove positive, disabled-zero-work, drift, restart, accessibility, and teardown behavior appropriate to each capability.
- [ ] A 30-minute disposable soak shows bounded samples/caches and owned listeners, timers, patches, media tracks, and object URLs returning to baseline after disable.

## Installer and human acceptance

- [ ] The assembled release contains root `release-manifest.json`, release-level `SHA256SUMS.txt`, source and delivery ZIPs, hash-bound `evidence/`, and an `installer/` directory containing exactly `SolcordInstaller.exe`, `solcord.asar`, both installer/build manifests, installer-only `SHA256SUMS.txt`, and `solcord-installer-build-receipt.json`.
- [ ] The installer receipt hash and release-manifest hash are preserved outside their respective directories and standalone validation succeeds with those external pins.
- [ ] The executable is labeled unsigned and Windows unknown-publisher behavior is stated without advising users to disable security.
- [ ] Six privacy-clean screenshots come from this exact RC with the documented names: Download/hash, Quit Discord, Install/target review, Verified, First Setup, and Recovery.
- [ ] The quick guide says “about one minute on a typical Windows PC after download,” not a guarantee.
- [ ] Install, Verify, Repair/Update, Roll Back/Uninstall, and explicit Launch pass against a disposable target.
- [ ] Settings, About, Activity Bridge, Audience Guard, Friend Watch, Plugin Doctor, setup/provider migration, themes, diagnostics, and recovery receive Human Eye `ACCEPT`.
- [ ] The owner performs any authenticated Activity, stream, voice-note, translation, notification-read, message, upload, or live-profile action requiring fresh confirmation.

## Release decision

- [ ] The core updater still fails closed without Solcord-owned integrity metadata.
- [ ] Exact commit, ASAR and installer hashes, runtime nonclaims, backup identity, rollback route, and acceptance receipts are bound by `release-manifest.json`; test and hosted-check receipts are present as hash-bound evidence files.
- [ ] The tag, GitHub prerelease, documentation, source, installer, ASAR, and installed About surface identify the same final source SHA.
- [ ] Stable publication remains blocked until authentic signing or an independently authenticated distribution mechanism and a fresh stable decision exist.
