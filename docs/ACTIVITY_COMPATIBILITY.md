# Activity compatibility

## Decision

Solcord V1 implements restricted Activity compatibility policy version 2. The global BetterDiscord compatibility flag remains off. For each wrapped `BrowserWindow`, Solcord initially installs its own preload and accepts at most one later absolute JavaScript preload only when canonical path checks place the original and candidate inside the same Discord `.asar` package and the captured Discord version directory. That accepted assignment replaces Solcord injection for that window. Reassigning the current value is an idempotent no-op; every later or ambiguous assignment is rejected.

The preload itself has a second, independent boundary. Solcord's cloned `process`, privileged API, native patch, early renderer, and renderer-start bridge are exposed only in a top-level document on an exact, default-port Discord origin. Embedded frames, external Activity hosts, lookalike subdomains, custom ports, and non-HTTPS documents receive none of those Solcord surfaces. Discord's own preload is still resolved for that exact `webContents` and chained, so a rejected context receives Discord's preload rather than an empty preload. This source policy does not identify a hypothetical top-level Activity guest that shares an approved Discord origin; current installed topology remains an acceptance observation, not a source claim. The original preload is no longer selected through process-global `BD_DISCORD_PRELOAD` state.

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
| An embedded or external-origin Activity document cannot receive Solcord's cloned `process` or bridge APIs | Deterministic policy test | High for the stated source boundary | Exact-origin and main-frame fixtures reject subframes, external Activity hosts, lookalikes, custom ports, and custom protocols while Discord's original-preload chain remains unconditional. A top-level guest on an approved Discord origin is not distinguished by this policy. |
| Concurrent windows cannot overwrite another window's original-preload association | Deterministic registry test | High for the source boundary | Original preload paths are keyed by numeric `webContents` ID and removed on destruction; no process-global path variable remains. |
| Cache-only state is the primary cause | Inference rejected | Medium | Browser and vanilla controls worked while the injected desktop path did not. |

No token, URL, message content, server name, channel name, account identifier, or absolute local path is written to the compatibility ledger.

## Competing hypotheses

1. **Late Discord preload rejected — leading.** The baseline setter ignores all later assignments unless the unrestricted flag is on. Solcord instruments and constrains this boundary.
2. **Injection into an Activity child context — not proven causal; common embedded/external exposure is contained.** A main-frame/exact-origin preload policy withholds all Solcord bridge surfaces and early renderer work from embedded or external-origin contexts while still chaining Discord's own per-window preload. It does not speculate about an unobserved top-level same-origin guest. This is an independent containment boundary, not evidence that child injection caused the historical loader.
3. **CSP, webRequest, referrer, sandbox, or permission mutation — unresolved live.** The upstream wrapper’s CSP behavior remains a review target. Synthetic handshake tests do not prove production network behavior.
4. **Renderer/Webpack lifecycle interception — weakened, not eliminated.** Current source shows the decisive preload wrapper in the main process. Drift Radar fails closed when structural renderer contracts are missing.
5. **Cache-only Discord state — less likely.** The browser and vanilla controls are causal controls, not proof of the Solcord patch.

## Invariants

- Relative, empty, non-string, malformed, device-namespace, mixed-flavor, traversal, different-drive/share, external, sibling-directory, and sibling-`.asar` candidates are rejected.
- Unpacked same-directory fallbacks are rejected. V1 accepts only a same-`.asar` package; a packaging-layout change requires review.
- Windows comparison is case-insensitive; POSIX comparison remains case-sensitive.
- The Discord version directory is captured as the parent of `process.resourcesPath`; this covers both `resources\app.asar` and the sibling `modules\...\core.asar` without trusting another installed version.
- Runtime `realpath` resolution must succeed for the version and package boundaries. Reparse or canonical-root divergence fails closed.
- At most one verified Discord-owned late assignment is accepted per `BrowserWindow` options object.
- Reassigning the current value is an idempotent no-op.
- Original-preload association is per `webContents`, never process-global, and is removed when that `webContents` is destroyed.
- Original Discord preload execution is guarded exactly once and `process.kill` is restored even when the original preload throws.
- Solcord bridge exposure requires an exact approved Discord hostname, HTTPS with the default port, and a top-level frame. Rejected contexts still chain the matching Discord preload.
- Solcord renderer injection is guarded by a main-process document boundary created only after a successful top-level `did-navigate`: renderer callers cannot mint another generation, duplicate calls in one document are ignored, and a full navigation in the same `webContents` receives one fresh attempt. Execution targets the exact sending `WebFrameMain`; a detached or replaced frame fails closed.
- A `BrowserWindow` constructor failure records only the error class and removes its pending compatibility context.
- `window-ready` alone leaves health `idle`; `healthy` requires an observed restricted same-package preload acceptance. Constructor/preload failures, rejected assignments, the current unrestricted override, or any unrestricted acceptance earlier in the process produce sticky `attention`.
- Disposable acceptance mode does not register `betterdiscord://`, confines Solcord state to its declared absolute root, and disables updater/addon writes.
- Public `BdApi`, plugin/theme paths, `betterdiscord://`, preload globals, IPC contracts, and ordinary trusted top-level shell/settings/popout/editor behavior are preserved.
- The legacy unrestricted override can only be enabled explicitly through the retained compatibility API; Solcord exposes no hidden toggle and never enables it automatically.

## Sanitized runtime ledger

The in-memory ledger is capped at 64 events and 32 KiB of serialized event data. It records sequence, timestamp, ephemeral window token, numeric `webContents` ID, heuristic context class, action, an allowlisted decision reason, and allowlisted generic preload/package labels. Unknown filenames and error names become generic labels; messages, stacks, titles, URLs, and path fragments are not retained. The renderer receives only a snapshot through the internal `sc-get-activity-compatibility` IPC channel.

## Verification matrix

| Gate | Baseline | Solcord result | Status |
| --- | --- | --- | --- |
| Browser Codenames | Works (owner report) | Not applicable | Control recorded |
| Vanilla desktop Codenames | Works (owner report) | Not applicable | Control recorded |
| Pinned BetterDiscord desktop | Infinite loader (owner report) | Not applicable | Failure control recorded |
| Path policy unit matrix | No restricted policy | Windows, UNC, POSIX, traversal, sibling-asar, malformed, and canonicalization fixtures | Automated pass |
| BrowserWindow property policy unit | Rejects all later assignments by default | Plain-object descriptor fixture installs Solcord, accepts one same-package assignment, and rejects an external assignment | Automated pass; Electron constructor integration pending disposable runtime |
| Preload exposure boundary | Cloned `process` was exposed before origin validation | Exact Discord top-level accepted; embedded/external/lookalike/custom-port/custom-protocol contexts rejected; Discord preload chaining remains unconditional | Automated pass |
| Concurrent original-preload selection | Process-global environment slot | Two simultaneous `webContents` retain distinct paths; destruction releases only the owning association | Automated pass |
| Constructor-failure cleanup | Pending context could remain | Error class recorded, pending context removed, later ready/destroy callbacks ignored | Automated pass |
| Original-preload chaining | Unguarded in supplied patch set | Exactly once; `process.kill` restored on success/failure | Automated pass |
| Embedded App SDK READY fixture | Not present | `[FRAME, {cmd: "DISPATCH", evt: "READY", data: ...}]` tuple with exact origin/source and monotonic bounded timing | Automated pass; production handshake remains pending |
| Open/close/reload/rejoin cycles | Not exercised | Requires owner Activity actions | Pending owner |
| Codenames + second Activity | Controls only | Requires owner Activity actions after launch | Pending owner |
| Main/settings/popout/editor | Baseline tests only | Build and installed smoke checks required | Pending installed gate |

## Rollback

The Windows install procedure copies the previous `%APPDATA%\BetterDiscord\data\betterdiscord.asar`, injector entry point, settings, plugins, themes, and custom CSS into a timestamped backup before replacement. Restore the recorded `betterdiscord.asar` and injector from that backup, or launch the preserved vanilla shortcut. Exact paths and hashes are written to the install manifest; see [INSTALL_AND_ROLLBACK.md](INSTALL_AND_ROLLBACK.md).

## Nonclaims

- Synthetic READY classification does not prove Discord’s production Embedded App SDK handshake.
- Exact-origin/main-frame tests prove the source policy, not Discord's current production Activity origin topology; installed Activity cycles remain required.
- A hypothetical top-level Activity guest on an approved Discord origin is not structurally distinguishable from an ordinary trusted window by the current source policy. No such topology is claimed or patched without runtime evidence.
- The inherited default-session CSP removal remains a separate unresolved hypothesis; this change does not claim to prove CSP, referrer, sandbox, or permission behavior.
- Plain-object preload property tests are not an Electron `BrowserWindow` constructor integration test.
- A green build does not prove Codenames renders, reconnects, or exits cleanly.
- The policy does not weaken Discord sandboxing, grant permissions, bypass Activity eligibility, or alter account state.
- No automated test in this repository starts an Activity or interacts with the owner’s account.
- A disposable copied runtime is not an authenticated Activity result; manual sign-in and owner-initiated Activity checks remain required.
