# Owner follow-up queue

Discord Stable currently runs an earlier SoulCord diagnostic productization build, and the owner separately confirmed Activities work. The source tree now contains additional setup-persistence, catalog-navigation, theme, refreshed-catalog, and bounded Fake Deafen work that has not been installed as a final clean release. Exact final commit, artifact, backup, process, and rollback identities belong in the external machine-readable closeout manifest rather than this self-referential repository document.

The source is at a fail-closed owner gate: tests and diagnostic packaging are green, but the branch is dirty. No final production artifact, current-source disposable launcher, commit, push, merge, or release is claimed. Link Lens and Message Timeline remain off by default; Power Lab remains off by default and Fake Deafen requires separate enable and arm confirmations.

## 1. Freeze the review branch when ready

Review the dirty V1 delta, then explicitly authorize the final commit and optional push. A clean commit is required so the build provenance system can produce a production-labeled ASAR and the disposable preparer can bind its launcher to one immutable source revision. Do not bypass this gate with a dirty diagnostic artifact.

## 2. Review setup when ready

After a separately approved live installation, open **User Settings → SoulCord Suite** and review all eight resumable setup steps. The wizard must show the complete file/state diff before **Apply and verify**. Before Apply, only the resumable step marker changes; skipping leaves addon files, enabled states, themes, private-history policy, and account state untouched. Do not accept a candidate merely because it is present in the catalog; `NOT STAGED`, `HOLD`, and owner-managed community files are intentionally not claimed live.

The 36-entry aggressive catalog is a reviewed choice set, not an enabled-addon count. Only candidates with exact staged bytes, dependencies, and runtime evidence may become installable. A failing addon is quarantined and reported rather than counted as working.

## 3. Optional local appearance acceptance

The Control Center dark presentation and repaired Soul Light presentation passed disposable review across all five workspaces, including forward/reverse keyboard focus. Preview the five separately bundled SoulCord themes and activate at most one only if desired. Exact Windows 100%/125% DPI, ordinary chat, plugin/theme pages, and popouts remain owner-visible follow-up surfaces.

Theme activation is a local reversible change, but it was deliberately not performed during unattended acceptance. The owner’s existing `midnight.theme.css` remains untouched.

## 4. Optional Link Lens acceptance

Link Lens remains off. If enabling it later, use a deliberately chosen harmless external URL and confirm one native Discord review modal, readable contrast, final-host disclosure, Escape/cancel behavior, focus restoration, route cleanup, and ordinary fail-open navigation when the adapter drifts.

Internal Discord routes and DM selection must never trigger Link Lens. No agent opens an external link or enables this feature without fresh action-time approval.

## 5. Activities status

The owner reported Activities working and explicitly waived a repeated live Activity test for this acceptance pass. Activity Bridge must continue to show the restricted same-package policy with the unrestricted override off. A future Discord update that changes the package/preload structure should fail closed and return the bridge to review instead of silently broadening the policy.

## 6. Rollback if needed

Close Discord before running the manifest-recorded core rollback script. The rollback stages and byte-verifies the previous core and restores the injector entry files. It does not delete or reset plugins, themes, stable settings, Custom CSS, MessageLogger data, Timeline state, or the preserved vanilla Activities launcher.

## Current nonclaims

- The setup **Apply and verify** transaction and setup rollback were not run in the owner profile.
- No SoulCord theme was activated in the owner profile during unattended acceptance.
- Link Lens’s native external-link modal remains unexercised because Link Lens stayed off.
- Message Timeline persistent Windows behavior remains runtime-pending and no existing MessageLogger data was inspected or imported.
- No message, upload, notification-read action, recording, voice join, stream, OAuth mutation, or Activity launch was performed by Codex.
- The owner’s existing plugins and themes were preserved; presence or enabled state is not a SoulCord compatibility certification.
- The live diagnostic generation does not include the final setup-persistence and catalog-navigation closeout delta. Do not replace it without a fresh owner decision using the exact final ASAR, installer hash, backup destination, and rollback command.
