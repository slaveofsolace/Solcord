# SoulCord V1 productization checkpoint

## Revalidated boundary

- Branch baseline: `fork/scaffold-baseline` at `e1b40dff9a5a7396872e3a717010a6dc5b17be2b` before this productization wave.
- Product implementation: `64c132e265becaa2c1326a08495068db97b875ff`.
- Security remediations: `4289835d49fb6fb014fe451b5feb47b95b4320ff` and `60f340ad88f53038bdbc8e64bbd1d956bd0ea296`.
- Human Eye appearance repair: `4630a7b48fa9d9b382014218516d374cdf948cda`.
- The accepted same-package Discord Activity preload policy remains unchanged by this wave.
- The installed Discord process set, installed ASAR, owner plugins/themes/settings, MessageLogger data, private Timeline data, and vanilla Activities launcher were not modified.
- The first-run setup transaction remains explicit: eight resumable steps, only the current onboarding step is persisted before **Apply and verify**, and rollback evidence is retained for product-state changes.

## Implemented source scope

- Five-workspace responsive Control Center and semantic appearance preferences in settings schema v4.
- `SOLcord` resolves to `SOULcord` in the launch layer with reduced-motion, high-contrast, timeout, and failure fallbacks.
- Session Pulse bounded to three deterministic priorities.
- Friend Watch relationship-store adapter with store, online/resume, and 60-second reconciliation; bounded owner-action correlation; subject-free reconciliation markers; bounded daily/per-event local notices; zero manual Discord network interface; account-scoped HMAC subject keys in encrypted main-process storage; and session-only safeStorage fallback.
- Expiring exact-host Domain Memory, high-risk Attachment Guard inspection, Privacy Mode consolidation, Return Later internal-route reminders, and conservative plugin capability cards.
- Framework-dependent unsigned Windows installer candidate with Stable/PTB/Canary detection, hash-bound install/verify/repair/update, backup rollback/uninstall, explicit launch, and a disposable lifecycle self-test.

## Separated evidence states

| State | Current meaning |
| --- | --- |
| `SOURCE_GREEN` | Granted through the appearance repair: 564 tests, 3,195 assertions, zero failures; typecheck, SoulCord CSS, production build, types, production audit, installer self-test, and deterministic packaging pass. ESLint retains three inherited warnings and zero errors. |
| `DISPOSABLE_RUNTIME_GREEN` | Granted for startup, settings registration, five Control Center workspaces, setup entry, local Link Lens inspection, and cleanup against Discord Stable `1.0.9253`. The native external-link modal and DM navigation were deliberately not exercised. |
| `HUMAN_EYE_GREEN` | Granted for current dark rendering and the repaired Soul Light Appearance, Safety, People, and Tools workspaces at the current application scale. Exact Windows 100%/125% DPI and owner taste acceptance remain separate. |
| `LIVE_PROFILE_ACCEPTED` | The previously installed `e1b40dff` generation remains the live boundary; this source wave is not installed. |
| `INSTALLER_ACCEPTED` | Granted only as an unsigned internal candidate: two independent builds emitted nine byte-identical files and both lifecycle self-tests passed. Signing, SmartScreen, and live-profile replacement remain open. |
| `PUBLIC_RELEASED` | False. No signing, merge, default-branch change, release, or publication is authorized. |

## Exact verification checkpoint

- Full suite: 564 passed, 0 failed, 3,195 assertions across 52 files.
- Production dependency audit: 0 vulnerabilities across 92 packages.
- SoulCord CSS: clean. Repository-wide legacy BetterDiscord CSS remains inherited non-green and is not represented as resolved.
- Circular analysis: the same 11 inherited cycles remain visible.
- Installer/ASAR candidate at the Human Eye repair commit: ASAR SHA-256 `b7e00468073a0b53b4d56fdd49885d3f9c25b5abffd0374f346df4abff88a0be`; installer SHA-256 `641f23ffe6cdb0315c3ce19e7984d22797dcf8cff14b2c3e3d6b567dca4f8259`.
- A final evidence-only commit requires a fresh deterministic package. Its exact hashes belong in the external final manifest so the source commit does not become self-referential.

## Disposable Human Eye result

- **ACCEPT:** literal `SoulCord Suite` navigation label; no translation sentinel.
- **ACCEPT:** dense five-workspace Control Center, cord-cut S mark, eight-step resumable setup entry, current dark rendering.
- **REVISE → ACCEPT:** Soul Light initially inherited contradictory Discord dark tokens. The repaired mode now owns its canvas, surfaces, normal/muted/header text, inputs, borders, interaction tokens, and native color scheme.
- **ACCEPT:** Soul Light Appearance, Safety, People, and Tools workspaces; forward and reverse keyboard focus outlines.
- **ACCEPT:** local-only Link Lens workbench disclosed the visible/final host and identified one removable tracking parameter without navigation or a network request.
- **ACCEPT:** Attachment Guard copy describes the implemented manual local inspector and makes no automatic-interception claim.
- The first relaunch preserved and isolated three directories generated by the prior disposable run; after restoring the generated harness root to its prelaunch wrapper shape, the exact ASAR launched successfully. This was acceptance-harness residue, not a source or packaged-artifact defect.

## Exact nonclaims

- Catalog metadata is not live plugin behavior; every community candidate remains non-installable until exact runtime evidence exists.
- Friend Watch observes only already-loaded relationship and optional display-name state. It does not infer third-party blocks, fetch history, poll REST, request Gateway data, or store presence history. Persistent events replace raw Discord subject IDs with account-scoped HMAC keys; explicit exports remain pseudonymous, not anonymous.
- Attachment Guard currently provides local inspection. It does not download, open, scan, or upload a file.
- Return Later stores an internal Discord route and optional owner label; it does not fetch, send, react, or sync.
- The unsigned installer is an internal candidate. Authentic signing, SmartScreen expectations, lifecycle acceptance, and a stable distribution URL remain open gates.
- The native external-link review modal, DM navigation, Windows DPI changes, frame-by-frame launch animation, and live-profile replacement remain unclaimed.
- No message, upload, file open, notification-read action, recording, voice join, stream, OAuth, Activity launch, or account mutation occurred during this productization acceptance.
