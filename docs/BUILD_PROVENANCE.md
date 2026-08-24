# Build provenance

SoulCord separates release packaging from local diagnostic builds.

- `bun scripts/build.ts --minify --production` and `--release` refuse a dirty Git worktree before writing build output.
- A local dirty build must use `--diagnostic`. Its embedded label contains `dirty.<digest>`, where the digest is a deterministic SHA-256 over Git status plus every tracked and non-ignored untracked source entry.
- `dist/build-provenance.json` records the full source SHA, branch, clean state, source digest, status digest, complete module set, lockfile hash, Bun version and executable hash, package/build/pack script hashes, and a canonical UTC timestamp. It is packaged inside `soulcord.asar`.
- Clean builds derive that timestamp from `SOURCE_DATE_EPOCH` when it is present and valid, otherwise from the exact Git commit's committer timestamp. Invalid `SOURCE_DATE_EPOCH` values stop the build. Dirty diagnostics retain their `dirty.<digest>` source identity and use wall-clock time unless an explicit reproducible epoch is supplied.
- `bun scripts/pack.ts` accepts only a complete clean production/release build. `bun scripts/pack.ts --diagnostic` is the explicit local exception. Both modes reject source or toolchain drift between build and pack.
- `dist/soulcord-build-manifest.json` is written after packaging and binds the embedded provenance to the final ASAR, package metadata, checksum list, and their byte sizes and SHA-256 digests. Its `packagedAt` field is the same normalized source/build timestamp, not a nondeterministic wall-clock packaging time.

Generated manifests contain repository-relative artifact names only. They do not contain local absolute paths, raw environment values, credentials, Discord data, or owner profile content. Focused tests package identical inputs with deliberately different filesystem modification times and require byte-identical provenance, manifest, and ASAR output. This proves the current ASAR path does not encode those mtimes; it does not claim reproducibility across different operating systems, Bun/esbuild binaries, branches, or dependency locks.
