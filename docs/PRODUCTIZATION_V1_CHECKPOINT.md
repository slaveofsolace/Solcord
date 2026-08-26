# Solcord V1 productization checkpoint

## 2026-08-26 closeout update

This section supersedes older counts and live-state descriptions below while retaining them as historical evidence.

- Owner branch baseline and remote: `fork/scaffold-baseline` at `e994096dff2a1992bf8b601087dcb394231581f1`.
- The working tree contains the final V1 productization delta and remains intentionally uncommitted pending the owner's explicit commit/push decision. Clean production/release packaging and the source-bound disposable launcher therefore remain correctly blocked.
- Exact current source gates: 599 tests, 3,500 assertions, 0 failures across 53 files; typecheck pass; Solcord CSS pass; type generation pass with the expected `node:https` external notice; production audit 0 vulnerabilities across 92 packages; ESLint 0 errors and the same 3 inherited warnings; 11 inherited circular dependencies.
- Setup draft and onboarding-step writes now roll in-memory state back when atomic persistence fails and show a bounded, actionable UI status. The setup **Review pending** action now switches to Tools, scrolls the mounted catalog into view, and restores keyboard focus instead of querying an unmounted workspace.
- The official BetterDiscord catalog APIs were refreshed on 2026-08-26: 209 plugins and 114 themes, all 36 requested preset names and 12 optional names matched. Metadata remains fail-closed: it is neither source approval nor runtime acceptance.
- Final changed-production-surface security review is recorded outside this self-referential source document. The immediately preceding production-surface scan reviewed 20/20 surfaces with zero findings; the final manifest binds the post-documentation source digest and scan identity.
- The current dirty-source diagnostic package is reproducible but is not a production release. A clean owner commit is required before `bun run dist`, installer generation, final disposable acceptance, or a review-branch push.
- The live Discord Stable installation already contains an earlier diagnostic productization generation. It does not contain the final setup-persistence/catalog-navigation closeout delta and must not be represented as the final source.

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
- Solcord no longer renders a competing launch layer; Discord's native spinning-logo splash remains unobstructed, and the inherited loading adapter is a side-effect-free no-op.
- Session Pulse bounded to three deterministic priorities.
- Friend Watch relationship-store adapter with store, online/resume, and 60-second reconciliation; bounded owner-action correlation; subject-free reconciliation markers; bounded daily/per-event local notices; zero manual Discord network interface; account-scoped HMAC subject keys in encrypted main-process storage; and session-only safeStorage fallback.
- Expiring exact-host Domain Memory, high-risk Attachment Guard inspection, Privacy Mode consolidation, Return Later internal-route reminders, and conservative plugin capability cards.
- Framework-dependent unsigned Windows installer candidate with Stable/PTB/Canary detection, hash-bound install/verify/repair/update, backup rollback/uninstall, explicit launch, and a disposable lifecycle self-test.

## Separated evidence states

| State | Current meaning |
| --- | --- |
| `SOURCE_GREEN` | Granted for the current dirty-source snapshot: 599 tests, 3,500 assertions, zero failures; typecheck, Solcord CSS, type generation, production audit, and reproducible diagnostic packaging pass. ESLint retains three inherited warnings and zero errors. Clean production packaging remains owner-commit-gated. |
| `DISPOSABLE_RUNTIME_GREEN` | Granted for startup, settings registration, five Control Center workspaces, setup entry, local Link Lens inspection, and cleanup against Discord Stable `1.0.9253`. The native external-link modal and DM navigation were deliberately not exercised. |
| `HUMAN_EYE_GREEN` | Granted for current dark rendering and the repaired Soul Light Appearance, Safety, People, and Tools workspaces at the current application scale. The owner visually accepted the V1 direction on 2026-08-26; exact Windows 100%/125% DPI remains separate. |
| `LIVE_PROFILE_ACCEPTED` | The previously installed `e1b40dff` generation remains the live boundary; this source wave is not installed. |
| `INSTALLER_ACCEPTED` | Granted only as an unsigned internal candidate: two independent builds emitted nine byte-identical files and both lifecycle self-tests passed. Signing, SmartScreen, and live-profile replacement remain open. |
| `PUBLIC_RELEASED` | False. No signing, merge, default-branch change, release, or publication is authorized. |

## Exact verification checkpoint

- Full suite: 599 passed, 0 failed, 3,500 assertions across 53 files.
- Production dependency audit: 0 vulnerabilities across 92 packages.
- Solcord CSS: clean. Repository-wide legacy BetterDiscord CSS remains inherited non-green and is not represented as resolved.
- Circular analysis: the same 11 inherited cycles remain visible.
- Installer/ASAR candidate at the Human Eye repair commit: ASAR SHA-256 `b7e00468073a0b53b4d56fdd49885d3f9c25b5abffd0374f346df4abff88a0be`; installer SHA-256 `641f23ffe6cdb0315c3ce19e7984d22797dcf8cff14b2c3e3d6b567dca4f8259`.
- A final evidence-only commit requires a fresh deterministic package. Its exact hashes belong in the external final manifest so the source commit does not become self-referential.

## Disposable Human Eye result

- **ACCEPT:** literal `Solcord Suite` navigation label; no translation sentinel.
- **ACCEPT:** dense five-workspace Control Center, cord-cut S mark, eight-step resumable setup entry, current dark rendering.
- **REVISE → ACCEPT:** Soul Light initially inherited contradictory Discord dark tokens. The repaired mode now owns its canvas, surfaces, normal/muted/header text, inputs, borders, interaction tokens, and native color scheme.
- **ACCEPT:** Soul Light Appearance, Safety, People, and Tools workspaces; forward and reverse keyboard focus outlines.
- **ACCEPT:** local-only Link Lens workbench disclosed the visible/final host and identified one removable tracking parameter without navigation or a network request.
- **ACCEPT:** Attachment Guard copy describes the implemented manual local inspector and makes no automatic-interception claim.
- **OWNER ACCEPT:** the current V1 visual direction, settings shell, mark, and theme treatment were accepted on 2026-08-26 as the baseline for V2.
- The first relaunch preserved and isolated three directories generated by the prior disposable run; after restoring the generated harness root to its prelaunch wrapper shape, the exact ASAR launched successfully. This was acceptance-harness residue, not a source or packaged-artifact defect.

## Exact nonclaims

- Catalog metadata is not live plugin behavior; every community candidate remains non-installable until exact runtime evidence exists.
- Friend Watch observes only already-loaded relationship and optional display-name state. It does not infer third-party blocks, fetch history, poll REST, request Gateway data, or store presence history. Persistent events replace raw Discord subject IDs with account-scoped HMAC keys; explicit exports remain pseudonymous, not anonymous.
- Attachment Guard currently provides local inspection. It does not download, open, scan, or upload a file.
- Return Later stores an internal Discord route and optional owner label; it does not fetch, send, react, or sync.
- The unsigned installer is an internal candidate. Authentic signing, SmartScreen expectations, lifecycle acceptance, and a stable distribution URL remain open gates.
- The native external-link review modal, DM navigation, exact Windows DPI changes, and live-profile replacement remain unclaimed. The isolated launcher visibly retained Discord's native startup spinner; no Solcord overlay is intended.
- No message, upload, file open, notification-read action, recording, voice join, stream, OAuth, Activity launch, or account mutation occurred during this productization acceptance.
