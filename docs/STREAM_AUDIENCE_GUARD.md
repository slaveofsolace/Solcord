# Stream Audience Guard

Stream Audience Guard is a disabled-by-default, per-call safety adapter for the broadcaster's own Discord Go Live stream.

## Guarantee and nonclaims

When enabled, configured, and explicitly armed for a call, Solcord promises:

> Your stream will not start or continue while a denied user is detected in the current call or viewer list.

This is not a per-viewer media permission. Prevent Start and Stop on Join use the current voice-state store. Stop on Watch uses Discord's current viewer list and may react only after brief frames have already been delivered. The feature never patches the displayed viewer list as a security mechanism.

Only native channel access restrictions are server-enforced. Solcord does not create channels, move members, or edit permission overwrites through a user account.

## Invariants

- The module is disabled and unarmed by default.
- Arming requires a current account, current voice channel, at least one denied user, one active mode, and fresh confirmation in the UI.
- Account changes, channel moves, disconnects, module disable, recovery mode, and adapter disposal disarm the controller and clear private renderer state.
- Stop requests are latched once per observed stream and verified after three seconds. Failure presents an explicit manual-stop warning.
- Discord action, stream, viewer, voice-state, account, and store-listener adapters must all validate. Missing or ambiguous adapters make the feature unavailable.
- Denied IDs and labels use an account-bound private IPC path. They do not enter ordinary settings, profiles, exports, health records, logs, or diagnostics.
- Persistent policy bytes are encrypted with Electron `safeStorage`; unavailable encryption produces a session-only fallback.

## Acceptance boundary

Pure controller tests cover arming, blocking, join/watch stops, deduplication, verification failure, identity drift, and disposal. Runtime start/stop acceptance still requires the owner in a designated call. Automated acceptance must not begin a stream or represent the owner to another Discord user.
