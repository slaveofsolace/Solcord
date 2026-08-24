# Release checklist

No V1 release is authorized by this document.

- [x] Owner branch is clean, pushed, and remote SHA verified.
- [ ] Frozen install, tests, TypeScript lint, changed-CSS lint, typecheck, type generation, circular check, production build, and package pass. Compare repository-wide legacy CSS lint with the pinned upstream baseline; do not hide a new SoulCord error inside inherited debt.
- [x] Artifact contents and SHA-256 are recorded.
- [x] BrowserWindow/preload, IPC, updater, installer, network, addon execution, and diagnostics static security review passes.
- [ ] License/NOTICE/provenance review passes.
- [ ] Installed Windows backup and rollback are verified.
- [ ] Settings, About, Activity Bridge, Plugin Doctor, profiles, diagnostics, recovery, light/dark contrast, and 100%/125% scaling receive Human Eye ACCEPT.
- [ ] Owner passes Codenames and one second Activity, including open/close/rejoin.
- [ ] Main/settings/popout/editor/plugin/theme/Custom CSS smoke checks pass.
- [ ] Core update feed has SoulCord-owned signed integrity metadata, or remains disabled.
- [ ] No token, private content, account identifier, absolute user path, or secret exists in Git history/artifacts/screenshots/release copy.
- [ ] Separate authority exists for merge, tag, release, or default-branch changes.
