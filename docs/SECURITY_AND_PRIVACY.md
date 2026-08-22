# Security and privacy

## Trust boundary

SoulCord executes inside Discord’s desktop Electron process and retains BetterDiscord’s plugin/theme compatibility. Third-party plugins therefore remain executable local code. SoulCord can detect repeated failures and quarantine an addon, but it cannot make unreviewed addon code safe.

V1 adds no remote SoulCord service and no hidden telemetry. The only retained network surfaces are Discord itself, user-initiated external navigation, and the explicitly attributed upstream BetterDiscord addon catalog/updater. The SoulCord core updater is disabled.

## Data map

| Data | Location | Retention | Export behavior |
| --- | --- | --- | --- |
| Module settings and profiles | Atomic stable-channel `soulcord.json` under `%APPDATA%\BetterDiscord\data` | Until user changes/removes it | Versioned settings export; unknown fields are stripped and no secret field exists in V1 |
| Settings snapshots/update ledger | Same atomic SoulCord JSON | Last 20 snapshots / 100 entries | Included without paths, tokens, or account data |
| Addon failure/quarantine history | Existing stable-channel compatibility JSON | Failure window plus bounded records | Addon ID, time, phase, error class only |
| Activity compatibility ledger | Main-process memory | Last 64 events; lost on restart | Sanitized snapshot only |
| Performance samples | Renderer memory | Last 120 samples | Last 12 in diagnostics |
| Link inspection | Renderer memory | Current interaction only | Not persisted |
| Screenshot Scrubber image | Renderer memory/canvas | Current settings view only | Saved only when the user clicks Download PNG |

SoulCord diagnostics deliberately exclude tokens, message bodies, deleted messages, server/channel/DM names, account IDs, external OAuth credentials, absolute local paths, URLs, crash stacks, and user-authored profile or snapshot labels. Diagnostic update-ledger rows contain time, kind, and SoulCord version only.

## Preload and BrowserWindow policy

- The captured Discord version directory and preload roots must be absolute and structurally valid.
- Candidate preloads must resolve to the same `.asar` package under that captured version directory; sibling Discord versions remain outside the trust root.
- Runtime canonicalization failure, reparse divergence, traversal, device namespace, drive/share mismatch, sibling package, malformed type, or a second non-duplicate assignment is rejected.
- The original Discord preload is required exactly once and `process.kill` is restored in `finally`.
- Each renderer `webContents` is injected once.
- The compatibility ledger is bounded and sanitized.

## IPC

The new `sc-get-activity-compatibility` channel is read-only and returns the bounded sanitized ledger. It performs no filesystem access and accepts no renderer parameters. Existing BetterDiscord IPC names and preload globals remain for compatibility. The legacy unrestricted-preload setter remains an explicit compatibility API but has no hidden UI toggle and defaults to false.

## Network and navigation

Link Lens does not follow redirects or fetch invite metadata. It parses the user-visible URL locally, surfaces well-known redirect parameters, strips known tracking parameters only after visible review, and requires confirmation for warning signals. Confirmed links open with `noopener,noreferrer`.

Native-fetch redirect handling follows HTTP method semantics, resolves relative `Location` values, strips authorization/cookie/proxy credentials on cross-origin redirects, rejects unsafe streamed-body replay, caps redirects, and drains redirect responses.

## Addons and recovery

Plugin Doctor stores only an addon identifier, failure timestamp, phase, and error class. Three failures in ten minutes set the addon state off, persist it, attempt cleanup once, and require a manual retry. It never silently re-enables quarantined code.

An interrupted-renderer crash guard enters recovery after three interrupted starts within ten minutes. Recovery loads only Plugin Doctor; other SoulCord adapters stay stopped until the user chooses “Try normal startup.”

## Updater

The inherited core updater previously targeted `BetterDiscord/BetterDiscord` releases and wrote `betterdiscord.asar`. SoulCord’s core check and update methods now fail closed and show the reason. Re-enabling core updates requires an owner-controlled release feed, artifact digest, signed integrity metadata, rollback metadata, and tests. Addon updates remain the upstream BetterDiscord compatibility behavior.

## V1 prohibited capabilities

No token extraction, self-bot action, message logging/deleted-message recovery, hidden telemetry, automated send/join/upload, entitlement or SKU mutation, premium impersonation, bypass/evasion, or covert microphone traffic. Anti-AFK audio, expression fallback, Decor/OAuth, and stream overrides are excluded from V1 install acceptance.

## Reporting

Use a private report if an issue may expose credentials, private content, or a filesystem path. Otherwise file an issue at `https://github.com/slaveofsolace/Solcord/issues` with SoulCord version, Discord channel/version, reproduction steps, and a sanitized diagnostics export. Never attach raw Discord logs without reviewing them first.
