# V2 built-in migration

SoulCord V2 replaces a reviewed community plugin only after its built-in adapter starts, passes its health check, and can be rolled back. A matching catalog card or source hash alone is not parity evidence.

## Transaction

1. Preview the exact community filenames, hashes, enabled states, replacement modules, dependencies, and archive destination.
2. Start and validate the selected SoulCord built-ins without touching the community files.
3. Disable only the exact matching community providers.
4. Move their unchanged `.plugin.js` files to a transaction-specific archive outside BetterDiscord's scanned plugin directory.
5. Verify the archived bytes and record a bounded rollback receipt.
6. Retire BDFDB last, and only when no retained external plugin still depends on it.

Any source mismatch, ambiguous filename, persistence failure, adapter failure, linked path, or incomplete cleanup aborts or rolls back the transaction. SoulCord never deletes a provider file. A file changed after preview is preserved for manual review.

Provider retirement has two distinct readiness checks. The renderer first starts
and health-checks the matching SoulCord adapter. The main process then confines
the archive operation to replacement contracts compiled into that SoulCord
build. This second check prevents an arbitrary filename from entering the
archive transaction; it does not pretend Electron's main process can directly
observe Discord renderer health.

Plugin configuration and private databases remain untouched. MessageLoggerV2 source is all-rights-reserved and is never adapted; if the owner selects the independent Message Timeline replacement, only the exact plugin source file may be archived. Existing MessageLogger data is not inspected, imported, moved, or deleted.

## Rights boundary

- MIT and similarly permissive adaptations retain notices and modification records.
- GPL, unresolved-license, and no-license behavior is implemented independently or remains reference-only.
- VoiceMessages is GPL-3.0, not AGPL; the V2 registry records the corrected pinned license.
- BDFDB and DevilBro community files remain separate GPL-2.0 programs and are not embedded in the Apache-2.0 SoulCord core.

Rollback restores archived bytes only when the destination is absent or still matches the transaction's recorded state, restores prior enabled states, and leaves later owner changes alone.
