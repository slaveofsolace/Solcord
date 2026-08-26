# Build provenance

SoulCord separates release packaging from local diagnostic builds.

- `bun scripts/build.ts --minify --production` and `--release` refuse a dirty Git worktree before writing build output.
- A local dirty build must use `--diagnostic`. Its embedded label contains `dirty.<digest>`, where the digest is a deterministic SHA-256 over Git status plus every tracked and non-ignored untracked source entry.
- `dist/build-provenance.json` records the full source SHA, branch, clean state, source digest, status digest, complete module set, lockfile hash, Bun version and executable hash, package/build/pack script hashes, and a canonical UTC timestamp. It is packaged inside `soulcord.asar`.
- Clean builds derive that timestamp from `SOURCE_DATE_EPOCH` when it is present and valid, otherwise from the exact Git commit's committer timestamp. Invalid `SOURCE_DATE_EPOCH` values stop the build. Dirty diagnostics retain their `dirty.<digest>` source identity and use wall-clock time unless an explicit reproducible epoch is supplied.
- `bun scripts/pack.ts` accepts only a complete clean production/release build. `bun scripts/pack.ts --diagnostic` is the explicit local exception. Both modes reject source or toolchain drift between build and pack.
- `dist/soulcord-build-manifest.json` is written after packaging and binds the embedded provenance to the final ASAR, package metadata, checksum list, and their byte sizes and SHA-256 digests. Its `packagedAt` field is the same normalized source/build timestamp, not a nondeterministic wall-clock packaging time.

Generated manifests contain repository-relative artifact names only. They do not contain local absolute paths, raw environment values, credentials, Discord data, or owner profile content. Focused tests package identical inputs with deliberately different filesystem modification times and require byte-identical provenance, manifest, and ASAR output. This proves the current ASAR path does not encode those mtimes; it does not claim reproducibility across different operating systems, Bun/esbuild binaries, branches, or dependency locks.

The earlier V1 candidate at commit `d1744c573f12745b6262f2176c969bf232349915` was packaged twice from a clean `fork/scaffold-baseline` worktree with Bun 1.4.0. Both runs produced the same 1,280,533-byte `soulcord.asar`, SHA-256 `02f25dbc26bee3004a3a9f5278bba5e077677505358218d1adfe5ee3819255b0`.

The isolated-runtime repair checkpoint is commit `32e65a3b23e1020891d70ec17a2e5131bc949fcf`. Its 1,280,595-byte production ASAR has SHA-256 `8564888b63fc1e6eb33095b0dbe9691d14db9f67ee3c106767b419b09b9ebce3`. A copied Discord Stable 1.0.9253 runtime loaded 18 copied native modules, SoulCord, the copied Discord application, and the copied desktop core through startup and main-window visibility without loading the live BetterDiscord core. The sealed diff security scan `90cf3078-93d0-4e20-9839-ff93b439d999` covered both changed production security surfaces and reported zero findings. The unauthenticated renderer then reached SoulCord's loading/connection boundary. Authenticated UI, owner Activity acceptance, and live installation remain separate gates.

After the runtime evidence was documented, the final clean commit is built twice and compared byte-for-byte. Its exact commit, ASAR size/hash, bundle hashes, remote SHA, test summary, and owner-gated nonclaims are written outside the source archive in the task's `release-evidence.json`. Keeping that final manifest external avoids a self-referential commit/hash cycle while binding delivery to the exact pushed source.

## V2 installer binding

The V2 installer builder accepts only `dist/soulcord.asar` from the supplied clean 40-character source commit. It rebuilds that artifact, compares the ASAR byte count/hash with `soulcord-build-manifest.json` and the embedded provenance, rechecks the source commit and cleanliness after `dotnet publish`, then copies the verified ASAR and manifest into a new output directory. It publishes one self-contained Windows x64 `SoulCordInstaller.exe`, runs its disposable `--self-test`, and writes `soulcord-installer-manifest.json` plus `SHA256SUMS.txt`.

The installer executable is deliberately unsigned for `v2.0.0-rc.1`. Deterministic source/build evidence and a passing self-test do not establish publisher identity. The external release evidence must record the exact executable, ASAR, source ZIP, delivery ZIP, and manifest hashes before any prerelease is published.
