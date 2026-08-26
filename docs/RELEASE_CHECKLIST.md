# SoulCord V2 RC release checklist

This document does not authorize a merge, tag, GitHub release, live-profile installation, or default-branch change.

## Source and provenance

- [ ] `v2/product-suite` is clean, pushed, and remote SHA verified.
- [ ] The exact source/delivery ZIPs and their SHA-256 values are recorded outside the source archive.
- [ ] The catalog still contains 209 plugins and 114 themes, or drift has been reviewed rather than silently accepted.
- [ ] Current raw catalog hashes and generated registry hashes match `PROVENANCE_REGISTRY.md`.
- [ ] VoiceMessages is identified as GPL-3.0, not AGPL; no GPL or unresolved-license implementation was copied into the Apache-2.0 core.
- [ ] Every adapted source retains its controlling license, header, authorship, pinned revision, file list, and modification note.

## Build and security

- [ ] Frozen install, full tests, ESLint, focused SoulCord CSS/theme lint, typecheck, type generation, circular-dependency measurement, production build, package, audit, and `git diff --check` pass.
- [ ] A security-diff review covers BrowserWindow/preload, IPC, updater, installer, translation credentials, provider archive/rollback, addon execution, diagnostics, and network calls.
- [ ] No token, private content, account identifier, denied-user ID, credential, message body, absolute owner path, or secret appears in Git, artifacts, screenshots, logs, or release copy.
- [ ] Two clean builds produce byte-identical ASARs, or any difference is explained and the release is held.
- [ ] `SoulCordInstaller.exe --self-test` passes for the exact self-contained executable included in the RC directory.

## Disposable runtime

- [ ] Main/settings/popout/editor/plugin/theme/Custom CSS surfaces open without duplicate injection or crash loop.
- [ ] All eleven themes cover the full shell and pass keyboard, focus, contrast, reduced-motion, and 100%/125%/150%/200% scaling review.
- [ ] Native Suite replacements report truthful `ready` or `unavailable` state; no visible card is counted as live without its adapter.
- [ ] Provider preview/apply/rollback proves exact-byte archive, BDFDB-last ordering, preservation of private data, owner-change refusal, and cleanup.
- [ ] Translation Desk proves endpoint disclosure, confirmation expiry, response bounds, secure-storage persistence, memory fallback, account isolation, and clear.
- [ ] Stream Audience Guard proves disarm boundaries, join/watch deduplication, manual-stop warning, disposal, and the explicit per-viewer nonclaim without starting a live owner stream.
- [ ] A 30-minute disposable soak shows bounded samples/caches and owned listeners, timers, patches, media tracks, and object URLs returning to baseline after disable.

## Installer and human acceptance

- [ ] The RC directory contains one self-contained `SoulCordInstaller.exe`, `soulcord.asar`, both manifests, and `SHA256SUMS.txt`; every hash matches.
- [ ] The executable is labeled unsigned and Windows unknown-publisher behavior is stated without advising users to disable security.
- [ ] Six privacy-clean screenshots come from this exact RC: download/hash, Discord closed, target review, installed/verified, first setup, and rollback/recovery.
- [ ] The quick guide says “about one minute on a typical Windows PC after download,” not a guarantee.
- [ ] Install, Verify, Repair/Update, Roll Back/Uninstall, and explicit Launch pass against a disposable target.
- [ ] Settings, About, Activity Bridge, Audience Guard, Plugin Doctor, setup/provider migration, themes, diagnostics, and recovery receive Human Eye `ACCEPT`.
- [ ] The owner performs any authenticated Activity, stream, voice-note, translation, notification-read, message, upload, or live-profile action requiring fresh confirmation.

## Release decision

- [ ] The core updater still fails closed without SoulCord-owned integrity metadata.
- [ ] Exact commit, ASAR hash, installer hash, test summary, runtime nonclaims, backup location, and rollback route are in the external release manifest.
- [ ] Separate owner authority exists for pushing the RC tag and GitHub prerelease.
- [ ] Stable publication remains blocked until authentic signing or an independently authenticated distribution mechanism and a fresh stable decision exist.
