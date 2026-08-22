# Activity compatibility

## Decision

SoulCord V1 implements a restricted late-preload policy. The global BetterDiscord compatibility flag remains off. For each wrapped `BrowserWindow`, SoulCord initially installs its own preload and accepts at most one later absolute JavaScript preload only when canonical path checks place the original and candidate inside the same Discord `.asar` package and the captured Discord version directory. That accepted assignment replaces SoulCord injection for that window. Reassigning the current value is an idempotent no-op; every later or ambiguous assignment is rejected.

This is the smallest source-supported fix for the leading hypothesis. It is not called a complete live fix until the installed owner build passes Codenames and one second Activity.

## Evidence ledger

| Claim | Class | Confidence | Evidence |
| --- | --- | --- | --- |
| Codenames works in browser Discord | Owner-reported observation | High | Existing control result on this PC; not rerun by automation because starting an Activity is account-representational. |
| Codenames works through the preserved vanilla desktop launcher | Owner-reported observation | High | Existing `Discord Activities (Vanilla).cmd` control result. |
| Codenames previously stalled in the BetterDiscord-injected desktop client | Owner-reported observation | High | Same Discord account/PC control; live logs from that earlier run were not retained. |
| The pinned BetterDiscord wrapper replaces the original preload and rejects later assignments while the unrestricted flag is false | Direct source observation | High | `src/electron/main/modules/browserwindow.ts` at upstream baseline `b283068…`. Installed BetterDiscord `1.13.14` matched that baseline. |
| The installed compatibility flag was absent, therefore false | Local measured state | High | Pre-edit inventory of the stable-channel compatibility JSON. |
| The late-preload setter is the leading causal boundary | Inference | Medium | It differs between vanilla and injected paths and matches the supplied candidate patch. No live Activity assignment trace existed before this change. |
| Cache-only state is the primary cause | Inference rejected | Medium | Browser and vanilla controls worked while the injected desktop path did not. |

No token, URL, message content, server name, channel name, account identifier, or absolute local path is written to the compatibility ledger.

## Competing hypotheses

1. **Late Discord preload rejected — leading.** The baseline setter ignores all later assignments unless the unrestricted flag is on. SoulCord instruments and constrains this boundary.
2. **Injection into an Activity child context — still observable, not proven causal.** Window tokens, structural context labels, injection counts, and destruction are recorded. If runtime evidence shows child injection is responsible, the child-context skip must remain a separate change.
3. **CSP, webRequest, referrer, sandbox, or permission mutation — unresolved live.** The upstream wrapper’s CSP behavior remains a review target. Synthetic handshake tests do not prove production network behavior.
4. **Renderer/Webpack lifecycle interception — weakened, not eliminated.** Current source shows the decisive preload wrapper in the main process. Drift Radar fails closed when structural renderer contracts are missing.
5. **Cache-only Discord state — less likely.** The browser and vanilla controls are causal controls, not proof of the SoulCord patch.

## Invariants

- Relative, empty, non-string, malformed, device-namespace, mixed-flavor, traversal, different-drive/share, external, sibling-directory, and sibling-`.asar` candidates are rejected.
- Windows comparison is case-insensitive; POSIX comparison remains case-sensitive.
- The Discord version directory is captured as the parent of `process.resourcesPath`; this covers both `resources\app.asar` and the sibling `modules\...\core.asar` without trusting another installed version.
- Runtime `realpath` resolution must succeed for the version and package boundaries. Reparse or canonical-root divergence fails closed.
- At most one verified Discord-owned late assignment is accepted per `BrowserWindow` options object.
- Reassigning the current value is an idempotent no-op.
- Original Discord preload execution is guarded exactly once and `process.kill` is restored even when the original preload throws.
- SoulCord renderer injection is guarded per `webContents`; protocol listeners are registered once.
- Public `BdApi`, plugin/theme paths, `betterdiscord://`, preload globals, IPC contracts, and ordinary shell/settings/popout/editor behavior are preserved.
- The legacy unrestricted override can only be enabled explicitly through the retained compatibility API; SoulCord exposes no hidden toggle and never enables it automatically.

## Sanitized runtime ledger

The in-memory ledger is capped at 64 events. It records sequence, timestamp, ephemeral window token, numeric `webContents` ID, structural context class, action, decision reason, and package filename. It records preload error class, never the message or stack. It does not retain even a hash derived from the local package path. The renderer receives only a snapshot through the internal `sc-get-activity-compatibility` IPC channel.

## Verification matrix

| Gate | Baseline | SoulCord result | Status |
| --- | --- | --- | --- |
| Browser Codenames | Works (owner report) | Not applicable | Control recorded |
| Vanilla desktop Codenames | Works (owner report) | Not applicable | Control recorded |
| Pinned BetterDiscord desktop | Infinite loader (owner report) | Not applicable | Failure control recorded |
| Path policy unit matrix | No restricted policy | Windows, UNC, POSIX, traversal, sibling-asar, malformed, and canonicalization fixtures | Automated pass |
| BrowserWindow property integration | Rejects all later assignments by default | SoulCord preload installed initially, one same-package assignment accepted, external assignment rejected | Automated pass |
| Original-preload chaining | Unguarded in supplied patch set | Exactly once; `process.kill` restored on success/failure | Automated pass |
| Embedded App SDK READY fixture | Not present | Origin/source/timing/permission fixture | Automated pass |
| Open/close/reload/rejoin cycles | Not exercised | Requires owner Activity actions | Pending owner |
| Codenames + second Activity | Controls only | Requires owner Activity actions after launch | Pending owner |
| Main/settings/popout/editor | Baseline tests only | Build and installed smoke checks required | Pending installed gate |

## Rollback

The Windows install procedure copies the previous `%APPDATA%\BetterDiscord\data\betterdiscord.asar`, injector entry point, settings, plugins, themes, and custom CSS into a timestamped backup before replacement. Restore the recorded `betterdiscord.asar` and injector from that backup, or launch the preserved vanilla shortcut. Exact paths and hashes are written to the install manifest; see [INSTALL_AND_ROLLBACK.md](INSTALL_AND_ROLLBACK.md).

## Nonclaims

- Synthetic READY classification does not prove Discord’s production Embedded App SDK handshake.
- A green build does not prove Codenames renders, reconnects, or exits cleanly.
- The policy does not weaken Discord sandboxing, grant permissions, bypass Activity eligibility, or alter account state.
- No automated test in this repository starts an Activity or interacts with the owner’s account.
