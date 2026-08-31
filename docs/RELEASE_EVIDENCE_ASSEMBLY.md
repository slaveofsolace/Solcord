# Release evidence assembly

This operator workflow assembles an already-built Solcord release candidate. It does not build, install, sign, merge, publish, or launch Discord.

Run it only after production source is frozen. Regenerate the repository audit once after that freeze, review it, commit the evidence-only result, and then use `bun run audit:repo:check`. Do not regenerate the audit while assembling a candidate. The assembler refuses any source checkout whose exact `HEAD` is dirty.

## Inputs

The installer builder produces an exact six-file directory:

- `SolcordInstaller.exe`
- `solcord.asar`
- `solcord-build-manifest.json`
- `solcord-installer-manifest.json`
- `SHA256SUMS.txt`
- `solcord-installer-build-receipt.json`

The builder prints `installerReceiptSha256`. Preserve that value outside the bundle. It anchors every bundle file, the exact source commit and candidate, and the isolated installer self-test result. The assembler will not trust a receipt hash read only from the bundle itself.

Create a JSON evidence-input manifest and record its SHA-256 separately:

```json
{
  "schemaVersion": 1,
  "kind": "solcord-release-evidence-inputs",
  "candidateLabel": "v2.0.0-rc.6",
  "sourceCommit": "<40-character lowercase commit>",
  "files": [
    {
      "source": "backend-soak-report.json",
      "name": "backend-soak-report.json",
      "category": "runtime-evidence",
      "sha256": "<sha256>"
    },
    {
      "source": "backup-receipt.json",
      "name": "backup-receipt.json",
      "category": "rollback-evidence",
      "sha256": "<sha256>"
    },
    {
      "source": "rollback-receipt.json",
      "name": "rollback-receipt.json",
      "category": "rollback-evidence",
      "sha256": "<sha256>"
    },
    {
      "source": "installer-lifecycle.json",
      "name": "installer-lifecycle.json",
      "category": "installer-evidence",
      "sha256": "<sha256>"
    }
  ],
  "releaseContext": {
    "discord": {"version": "1.0.9255", "channel": "Stable", "profileType": "owner"},
    "backup": {"identity": "<backup-id>", "status": "PASS", "evidenceName": "backup-receipt.json", "evidenceSha256": "<sha256>"},
    "rollback": {"backupIdentity": "<same-backup-id>", "status": "PASS", "evidenceName": "rollback-receipt.json", "evidenceSha256": "<sha256>"},
    "acceptanceGates": [
      {"id": "installer-lifecycle", "status": "PASS", "evidenceName": "installer-lifecycle.json", "evidenceSha256": "<sha256>"}
    ],
    "distribution": {"signed": false, "merged": false, "published": false, "installed": false}
  }
}
```

Every `source` is a single file name in the manifest directory. Every backup, rollback, and gate reference must name one of the hash-bound evidence files. Valid gate states are `PASS`, `BLOCKED`, and `NOT_RUN`. Distribution state is ordered: `installed: true` requires `merged: true`, and `published: true` requires both `merged: true` and `installed: true`; leave all three false for pre-merge evidence.

## Assemble

```powershell
bun run release:evidence -- assemble `
  --source-commit <commit> `
  --candidate-label v2.0.0-rc.6 `
  --installer-bundle <installer-directory> `
  --installer-receipt-sha256 <externally-recorded-receipt-sha256> `
  --evidence-manifest <evidence-inputs.json> `
  --evidence-manifest-sha256 <externally-recorded-input-manifest-sha256> `
  --output <new-directory-outside-the-repository>
```

The output directory must not already exist. Its parent and every path component must be free of symlinks, junctions, and other canonical-path redirects.

## Output and publication mapping

The assembler writes:

- `Solcord-source-<short-commit>.zip`
- `Solcord-delivery-<short-commit>.zip`
- `release-manifest.json`
- release-level `SHA256SUMS.txt`
- `installer/` containing the exact six installer files
- `evidence/` containing the hash-bound evidence inputs

The GitHub release asset `SolcordInstaller.exe` is the byte-identical local file `installer/SolcordInstaller.exe`. Publish the root release `SHA256SUMS.txt` and `release-manifest.json` beside it. Do not substitute the similarly named installer-only checksum file from `installer/`.

Publish the byte-identical `Solcord-source-<short-commit>.zip` and `Solcord-delivery-<short-commit>.zip` using the generated names recorded in `release-manifest.json`. Privacy-clean walkthrough PNGs, when accepted, are supplied as hash-bound evidence inputs with the six names documented in `QUICK_START.md`; copy those exact bytes from `evidence/` only after confirming their manifest records. They are documentation aids, not installer trust anchors.

Record the `manifestSha256` printed by assembly outside the output directory. Standalone validation requires that external value:

```powershell
bun run release:evidence -- validate `
  --source-commit <commit> `
  --candidate-label v2.0.0-rc.6 `
  --release-directory <assembled-directory> `
  --release-manifest-sha256 <externally-recorded-manifest-sha256>
```

Validation regenerates the stored source and delivery ZIPs, verifies the pinned release manifest and installer receipt, enforces bounded file counts and sizes, and rejects linked, redirected, missing, additional, or changed files.
