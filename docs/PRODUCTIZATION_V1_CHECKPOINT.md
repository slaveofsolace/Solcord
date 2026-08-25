# SoulCord V1 productization checkpoint

## Revalidated boundary

- Branch baseline: `fork/scaffold-baseline` at `e1b40dff9a5a7396872e3a717010a6dc5b17be2b` before this productization wave.
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
| `SOURCE_GREEN` | Pending exact-head full test/lint/type/build/security/package rerun after this wave. |
| `DISPOSABLE_RUNTIME_GREEN` | Previous core/startup evidence does not cover the changed Control Center, storage bridge, launch identity, or installer. New acceptance is required. |
| `HUMAN_EYE_GREEN` | Not granted. Prior 1142×1440 Settings was `REVISE`; the responsive replacement needs captures. |
| `LIVE_PROFILE_ACCEPTED` | The previously installed `e1b40dff` generation remains the live boundary; this source wave is not installed. |
| `INSTALLER_ACCEPTED` | Not granted. Source compilation and self-test are necessary but not sufficient. |
| `PUBLIC_RELEASED` | False. No signing, merge, default-branch change, release, or publication is authorized. |

## Exact nonclaims

- Catalog metadata is not live plugin behavior; every community candidate remains non-installable until exact runtime evidence exists.
- Friend Watch observes only already-loaded relationship and optional display-name state. It does not infer third-party blocks, fetch history, poll REST, request Gateway data, or store presence history. Persistent events replace raw Discord subject IDs with account-scoped HMAC keys; explicit exports remain pseudonymous, not anonymous.
- Attachment Guard currently provides local inspection. It does not download, open, scan, or upload a file.
- Return Later stores an internal Discord route and optional owner label; it does not fetch, send, react, or sync.
- The unsigned installer is an internal candidate. Authentic signing, SmartScreen expectations, lifecycle acceptance, and a stable distribution URL remain open gates.
