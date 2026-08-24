# Release checklist

No V1 release is authorized by this document.

- [ ] Owner branch is clean, pushed, and remote SHA verified. The last verified remote checkpoint is `b0a569b`; the isolated-runtime repair commits are local until the final exact-artifact gates pass.
- [x] Frozen install, tests, TypeScript lint, changed-CSS lint, typecheck, type generation, circular check, production build, and package pass at isolated-runtime repair checkpoint `32e65a3`. Repository-wide legacy CSS remains measured separately against its pinned inherited baseline.
- [x] Repair-checkpoint artifact contents and SHA-256 are recorded. A final documentation-bound artifact is still to be rebuilt twice and hashed.
- [x] BrowserWindow/preload, IPC, updater, installer, network, addon execution, and diagnostics static security review passes. The latest sealed delta scan is `90cf3078-93d0-4e20-9839-ff93b439d999`, with zero findings across both changed production surfaces.
- [ ] License/NOTICE/provenance review passes.
- [ ] Installed Windows backup and rollback are verified.
- [ ] Settings, About, Activity Bridge, Plugin Doctor, profiles, diagnostics, recovery, light/dark contrast, and 100%/125% scaling receive Human Eye ACCEPT. Computer Use is operational, but the clean disposable profile requires manual owner authentication before these views exist.
- [ ] Owner passes Codenames and one second Activity, including open/close/rejoin.
- [ ] Main/settings/popout/editor/plugin/theme/Custom CSS smoke checks pass.
- [ ] Core update feed has SoulCord-owned signed integrity metadata, or remains disabled.
- [ ] No token, private content, account identifier, absolute user path, or secret exists in Git history/artifacts/screenshots/release copy.
- [ ] Separate authority exists for merge, tag, release, or default-branch changes.
