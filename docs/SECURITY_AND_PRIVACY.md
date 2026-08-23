# Security and privacy

## Trust boundary

SoulCord executes inside Discord’s desktop Electron process and retains BetterDiscord’s plugin/theme compatibility. Third-party plugins therefore remain executable local code. SoulCord can detect repeated failures and quarantine an addon, but it cannot make unreviewed addon code safe.

V1 adds no remote SoulCord service and no hidden telemetry. Retained network surfaces are Discord itself, user-initiated external navigation, the explicitly attributed upstream BetterDiscord addon catalog, and setup downloads from immutable `raw.githubusercontent.com` URLs only after every selected gate passes and the owner presses `Finish`. Translator is rejected for V1 and cannot be staged: static review found ordinary-settings provider credentials, embedded credentials, bearer-auth and arbitrary-endpoint support, and a composer-send transform. The SoulCord core updater is disabled.

## Data map

| Data | Location | Retention | Export behavior |
| --- | --- | --- | --- |
| Module settings and profiles | Atomic stable-channel `soulcord.json` under `%APPDATA%\BetterDiscord\data` | Until user changes/removes it | Versioned settings export; unknown fields are stripped and no secret field exists in V1 |
| Settings snapshots/update ledger | Same atomic SoulCord JSON | Last 20 snapshots / 100 entries | Included without paths, tokens, or account data |
| Onboarding selection and setup state | Same atomic SoulCord JSON | Current selection plus bounded transaction records | Settings export excludes renewed-consent acknowledgements and Timeline content |
| Addon failure/quarantine history | Existing stable-channel compatibility JSON | Failure window plus bounded records | Addon ID, time, phase, error class only |
| Activity compatibility ledger | Main-process memory | Last 64 events; lost on restart | Sanitized snapshot only |
| Performance samples | Renderer memory | Last 120 samples | Last 12 in diagnostics |
| Link inspection | Renderer memory | Current interaction only | Not persisted |
| Screenshot Scrubber image | Renderer memory/canvas | Current settings view only | Saved only when the user clicks Download PNG |
| Message Timeline renderer journal | Renderer memory, isolated to the validated current account | Current session | Visible in Timeline; cleared on account change or module stop |
| Persistent Message Timeline segments | Opaque account store under the BetterDiscord data boundary | Selected retention; 250 MiB text hard cap | Included only in an explicit Timeline export, never diagnostics or settings export |
| Setup staging files | Private SoulCord staging directory under the BetterDiscord data boundary | Removed after apply or failure | Never exported |
| Setup transaction journal | Private SoulCord transaction directory under the BetterDiscord data boundary | Until manual cleanup or rollback policy is implemented | Relative addon filenames and expected hashes only; no absolute paths or private content |

SoulCord diagnostics deliberately exclude tokens, message bodies, deleted messages, server/channel/DM names, account IDs, external OAuth credentials, absolute local paths, URLs, crash stacks, and user-authored profile or snapshot labels. Diagnostic update-ledger rows contain time, kind, and SoulCord version only. An explicit Timeline export is a separate user action and intentionally contains the selected Timeline records; it is not a diagnostic export.

Ordinary settings exports also remove every selected Timeline channel identifier and normalize the exported Timeline scope to DM-only, including its mirrored module setting. Imports show a privacy-safe complete diff for every field they apply: module/profile state, theme, addon selection/enabled mode and receipt/quarantine presence, Timeline policy and selected-channel count, and any Power Lab reset. Channel identifiers never appear in that preview. A SHA-256 fingerprint binds the complete normalized current and candidate states—including values deliberately summarized or hidden in the UI—and is recomputed synchronously immediately before mutation. Equal-looking summaries with different hidden state therefore fail closed.

## Preload and BrowserWindow policy

- The captured Discord version directory and preload roots must be absolute and structurally valid.
- Candidate preloads must resolve to the same `.asar` package under that captured version directory; sibling Discord versions remain outside the trust root.
- Runtime canonicalization failure, reparse divergence, traversal, device namespace, drive/share mismatch, sibling package, malformed type, or a second non-duplicate assignment is rejected.
- The original Discord preload is required exactly once and `process.kill` is restored in `finally`.
- Each renderer `webContents` is injected once.
- The compatibility ledger is bounded and sanitized.

## IPC

The `sc-get-activity-compatibility` channel is read-only and returns the bounded sanitized ledger. It performs no filesystem access and accepts no renderer parameters. Private Timeline IPC validates account/message/channel identifiers, bounds each event and batch, and exposes status, append, bounded read, and clear operations only. Private setup IPC accepts only known addon names and a known SoulCord theme, then applies the immutable manifest rules below. Existing BetterDiscord IPC names and preload globals remain for compatibility. The legacy unrestricted-preload setter remains an explicit compatibility API but has no hidden UI toggle and defaults to false.

## Setup transaction

- The request is normalized against the generated 36-addon manifest and four embedded SoulCord themes; unknown or duplicate names abort.
- The Electron transaction checks the generated `installable` decision again; renderer UI state is not authorization. `HOLD`, `REJECT`, action-pending, dependency-pending, or runtime-pending records abort before staging.
- Dependency closure is resolved before any target file changes.
- Remote payloads must use HTTPS, `raw.githubusercontent.com`, and a 40-character immutable revision in the path. Redirects and payloads larger than 5 MiB are rejected.
- Every payload and embedded theme is SHA-256 verified in a private staging directory before copy.
- Reviewed catalog identities are checked again synchronously at the actual plugin/theme execution sink. The guard resolves the canonical filename, case-folded aliases, declared addon metadata names, and byte-identical reviewed copies; renaming or case-changing a reviewed payload therefore cannot move it onto the ordinary owner-addon path. A reviewed identity whose bytes no longer match its immutable manifest hash is disabled and quarantined before `new Function` or CSS injection can run, including filesystem-watcher reloads and startup races. Unrelated owner-managed addon files retain ordinary BetterDiscord behavior.
- An existing identical file is reused. An existing differing file aborts the transaction and is never overwritten.
- Apply writes a durable intent before copying, then uses exclusive same-volume hard links from private staging. Per-file device/inode receipts prove which filesystem object the transaction actually added. Failure removes only a reviewed-hash file whose identity is proven by a receipt or by the still-present staging link.
- The journal contains relative filenames, hashes, and filesystem identity receipts. Rollback removes only unchanged files that the transaction proved it added; reused and subsequently modified or recreated files are preserved. A durable `rolledback` marker makes rollback replay an idempotent no-op.
- An addon update is paused for re-review only when the candidate is runtime-accepted, its installed bytes still match the reviewed hash, and a completed, unrolled SoulCord journal proves the transaction added that file. Reused, modified, unaccepted, or owner-managed files remain under the ordinary addon updater.
- Renderer setup records prior enabled states and restores them if enablement fails. This mechanism is source-implemented but remains unaccepted until staged-failure, conflict, quarantine, and rollback tests pass.

`stageable: true` means only that deep static review permits isolated testing. It does not mean `installable`, enabled, compatible, or runtime-accepted. Eleven requested candidates are safe to runtime-test, four need an action-specific test gate, 19 are held, two are rejected, and BDFDB is held. All community candidates remain `installable: false`. A hash match alone never changes that state.

## Network and navigation

Link Lens does not follow redirects or fetch invite metadata. It parses the user-visible URL locally, surfaces well-known redirect parameters, strips known tracking parameters only after visible review, and requires confirmation for warning signals. It patches only a verified external-link activation path, owns at most one native modal, closes that modal on route change or teardown, and restores focus when possible. If the review adapter throws or drifts, the original activation runs without a prevented default. Internal Discord routes are excluded. Confirmed links open with `noopener,noreferrer`.

Native-fetch redirect handling follows HTTP method semantics, resolves relative `Location` values, strips authorization/cookie/proxy credentials on cross-origin redirects, rejects unsafe streamed-body replay, caps redirects, and drains redirect responses.

## Addons and recovery

Plugin Doctor stores only an addon identifier, failure timestamp, phase, and error class. Three failures in ten minutes set the addon state off, persist it, attempt cleanup once, and require a manual retry. It never silently re-enables quarantined code.

An interrupted-renderer crash guard enters recovery after three interrupted starts within ten minutes. Recovery loads only Plugin Doctor; other SoulCord adapters stay stopped until the user chooses “Try normal startup.”

## Private Message Timeline

Message Timeline is disabled in stored defaults and becomes selected in the first-run draft only; skipping setup changes nothing. Its default completed policy is DMs and group DMs, seven days, text only. Server channels require explicit selection.

The renderer subscribes only to create, update, delete, and bulk-delete events already delivered to the running client. It performs no API backfill, hidden-channel access, deleted-message fetch, offline recovery, or import from MessageLoggerV2. Account changes synchronously invalidate an account-generation guard, clear the renderer journal, reset persistent status, and emit a fresh UI snapshot before any asynchronous release, bind, or read for the next isolated account store. Manual clear/export captures that generation and revalidates it before binding, before IPC, after IPC, and before any renderer clear or download effect.

Persistent records use independent random AES-256-GCM data keys. Electron `safeStorage` wraps those keys, and a separate wrapped identity key creates HMAC-obscured account-directory names. If `safeStorage` is unavailable or persistent storage fails, the adapter reports degraded health and falls back to session memory. Message and channel IDs do not appear in filenames.

Text persistence is capped at 250 MiB and pruned by the selected retention period. The renderer additionally caps its journal at 20,000 records, 80,000 tracked event IDs, 100 edits per message, 250 snapshot rows, 500 unique IDs per bulk delete, and a 250 MiB estimated in-memory budget. Reads are bounded to 10,000 events and 32 MiB per operation. The implemented attachment mode stores only bounded filename, content type, and size metadata; it stores no attachment URL. Encrypted media caching, media budgets, CSV export, fresh-confirmation media export, and CDN retrieval are not implemented or offered as accepted V1 behavior.

Opaque recovery recognizes only regular, non-link SoulCord identity and store artifacts. Unknown files, directories, symlinks, or reparse points under the Timeline root are preserved and counted as remaining residue, so a clear cannot falsely report completion or traverse an unreviewed entry.

The clean-room model, encrypted-storage source, and deterministic account-switch, budget, clear, export, and secure-storage fallback tests pass. Persistent Timeline is still not called Windows-runtime-ready until the installed client exercises Electron `safeStorage`, corrupt-segment recovery, account switching, and restart persistence. Existing MessageLoggerV2 files and private data remain untouched and are not inspected or silently imported.

## Updater

The inherited core updater previously targeted `BetterDiscord/BetterDiscord` releases and wrote `betterdiscord.asar`. SoulCord’s core check and update methods now fail closed and show the reason. Re-enabling core updates requires an owner-controlled release feed, artifact digest, signed integrity metadata, rollback metadata, and tests. Addon updates remain the upstream BetterDiscord compatibility behavior.

## V1 prohibited capabilities

No token extraction, self-bot action, hidden telemetry, hidden-channel or offline deleted-message recovery, automated send/join/upload, entitlement or SKU mutation, premium impersonation, bypass/evasion, or covert microphone traffic. The private Message Timeline is an explicit local logger of events the running client already observed, is outside BetterDiscord store compliance, and is never disguised as a store-safe feature. Anti-AFK audio, expression fallback, Decor/OAuth, fake mute/deafen, and stream overrides remain unavailable, off, and excluded from V1 install acceptance.

Guarded large-message splitting previews parts and copies them after confirmation; it does not send and does not require the held community plugin. Native mode remains blocked with the community plugin and BDFDB. Voice Messages is held pending isolated record/preview/cancel/upload UI acceptance; SoulCord setup and acceptance do not record or upload on the owner’s behalf.

## Verification snapshot

The third content-bound security scan `613c9a31-5f8f-4aad-864f-26efba412719` (`codex-security-snapshot/v1:sha256:b9dc7acd6da303b5f1afa7446e920748b0f1b4baab81d0803d4d5f48ddbe49fc`) reviewed 42 security-relevant diff items and reported two medium and four low findings. They covered reviewed-addon aliasing, a manual Timeline account-switch race, rollback replay, unbounded renderer journal state, setup recovery ownership, and opaque Timeline clear residue. All six were remediated at the final sinks as described above and are covered by deterministic regression tests.

The fourth sealed scan `ba4287a6-4398-4467-9516-d504544418f6` (`codex-security-snapshot/v1:sha256:eda684ef3ab3a40d9ff5f0baa99799b77b573770de408265d1974b9555b844d5`) then found two medium settings-boundary issues: ordinary exports retained opted-in Timeline channel identifiers, and the import dialog called an incomplete theme/addon/Timeline diff complete. Both are now remediated by the identifier-free DM-only export projection, complete privacy-safe diff, and an apply-time SHA-256 binding over the full normalized current/candidate states.

The fifth content-bound scan `1fa1a86b-2a59-4d33-a247-7c70d06b7ed3` (`codex-security-snapshot/v1:sha256:229fb0f1a2043d0439ba9b5caa93f00b19c0de13f36f3b18d978b03995829aaa`) reviewed all 42 security-relevant diff items after those remediations. Seven candidate findings were independently validated as suppressed, and the scan completed with zero reportable findings. This is static source evidence only: it does not substitute for disposable-profile addon acceptance, an installed Electron/Discord run, Windows reparse-race testing, or the owner’s Activity and visual acceptance.

Current deterministic verification is 388 passing tests with 1,222 assertions across 30 files. Frozen dependency resolution, TypeScript checking, SoulCord CSS lint, production renderer/main/preload builds, ASAR packaging, type generation, circular-dependency analysis, and `git diff --check` pass. ESLint reports zero errors and three inherited warnings. The full upstream stylesheet lint still reports 197 pre-existing errors and 27 warnings in untouched legacy stylesheets; that inherited baseline is recorded as a nonclaim rather than rewritten as part of this fork wave.

An in-range `bun audit fix` updated only `bun.lock` and removed 38 dependency findings. `bun audit --production` now reports zero vulnerabilities across 92 packages. The full development audit still reports 38 findings in pinned Electron 36, esbuild 0.24, Happy DOM 18, and Electron's `extract-zip` dependency; resolving them requires major toolchain changes or, for `extract-zip`, has no published fixed release. The production ASAR inventory contains only compiled SoulCord main/preload/renderer files and the editor bundle—no `node_modules`, Electron, esbuild, Happy DOM, eslint, or extract-zip. These development findings remain an explicit maintenance item, not a claim of a vulnerability-free development workstation.

No live message, upload, notification action, recording, stream, OAuth flow, voice join, or Activity launch was used for these automated gates. The 36 community candidates remain `installable: false` and runtime-pending until a genuinely isolated disposable-profile matrix is available; static review and exact hashes do not promote them.

## Reporting

Use a private report if an issue may expose credentials, private content, or a filesystem path. Otherwise file an issue at `https://github.com/slaveofsolace/Solcord/issues` with SoulCord version, Discord channel/version, reproduction steps, and a sanitized diagnostics export. Never attach raw Discord logs without reviewing them first.
