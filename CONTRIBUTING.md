# Contributing to SoulCord

SoulCord is a focused reliability, privacy, and productivity fork of BetterDiscord. Preserve upstream history and compatibility contracts; do not re-scaffold the project or rebrand stable APIs just because their names contain `BetterDiscord` or `bd`.

## Before changing code

- Start from `development` unless the owner names another branch. Do not publish, retag, or change the default branch without explicit authority.
- Read `docs/ACTIVITY_COMPATIBILITY.md`, `docs/SECURITY_AND_PRIVACY.md`, and `docs/BRAND_MIGRATION_LEDGER.md`.
- Treat Discord Webpack modules as volatile. Use structural filters, validate before patching, cache lookups, fail closed, and own teardown.
- Add every external source or asset to `docs/PROVENANCE_REGISTRY.md` before acquisition. A public URL is not a license.
- Do not include tokens, private server/chat content, account identifiers, or absolute user paths in tests, fixtures, logs, screenshots, commits, or issues.

## Product boundaries

SoulCord rejects token access, self-bot behavior, hidden-channel access, hidden telemetry, automated sending/joining/uploading, premium/entitlement mutation, and covert microphone traffic. Private local history observes only events already seen by the running client after opt-in. Account-risk or external-service experiments require a separate default-off boundary and explicit consent.

## Build and verification

Use the pinned Bun version:

```sh
bun install --frozen-lockfile
bun run test
bun run lint
bun run lint-css:soulcord
bun run typecheck
bun run generate-types
bun run circulars
bun run dist
git diff --check
```

Activity changes also require path-policy, BrowserWindow property, original-preload, and synthetic READY fixtures. Installed Activity acceptance must be performed by the owner; automation must not start an Activity or act on the account.

## Pull requests

Explain the observed failure, causal model, smallest change, cleanup behavior, tests, privacy impact, provenance, and nonclaims. Keep commits reviewable. Do not call a scaffold live or a synthetic fixture permanent production proof.

## Upstream

SoulCord is based on [`BetterDiscord/BetterDiscord`](https://github.com/BetterDiscord/BetterDiscord), licensed under Apache-2.0. Preserve upstream authorship, contribution history, `LICENSE`, and factual attribution. Contributions to upstream BetterDiscord should follow its own current contribution guide.
