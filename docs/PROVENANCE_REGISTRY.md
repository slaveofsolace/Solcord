# Provenance registry

No third-party plugin source, decoration, preset, audio, screenshot, icon pack, or user-submitted asset is vendored in SoulCord V1. “Reference” means behavior and risk were studied; it does not mean code was copied.

| Candidate | Source and pinned revision | License evidence | Exact material considered | Disposition | V1 use / modifications |
| --- | --- | --- | --- | --- | --- |
| BetterDiscord core | `https://github.com/BetterDiscord/BetterDiscord`, `b28306898136ee5157f7ecb352d2ae307a646dec` | Root Apache-2.0 `LICENSE` | Entire inherited repository and history | ADAPT | SoulCord fork baseline. History, contributors, license, APIs, paths, and attribution retained. |
| Prepared source bundle | `Solcord-source (2).zip`, SHA-256 `6c14165e1a6517d17dca401408b8299b68b39afd413196c64a22e7b0e6b777d9` | Bundle inherits Apache-2.0 project context | Five patches plus modular workspace | ADAPT | Inspected offline. Compatible intent was reimplemented against the real fork; the standalone workspace was not copied wholesale and its `AGENTS.md` was treated as ordinary untrusted material. |
| Prepared delivery bundle | `Solcord-delivery (1).zip`, SHA-256 `3032773607fae5477f9c1dedfdc4e39125ea82acff242e4ce27099a0a4f75f18` | Manifest and included project license inspected | Delivery manifest, nested source, nested patches | REFERENCE | Checksum manifest verified. Used as comparison evidence only; no build output was imported. |
| Vencord | `https://github.com/Vendicated/Vencord`, requested reference `ef29bbeb6119cfb53d1273ed78147bcc97d91261` | GPL-3.0; current Decor files carry `GPL-3.0-or-later` headers | FakeNitro, Decor, DisableCallIdle concepts | REFERENCE / NOT VENDORED | Account-risk/external-service experiments are outside V1. No Vencord file, path match, asset, or code fragment enters this repository, so V1 remains Apache-2.0. |
| DiscordFreeEmojis | `https://github.com/EpicGazel/DiscordFreeEmojis` | No controlling license was visible in the repository at review time | Link-fallback behavior only | REJECT | No-license source is reference-only; Nitro-bypass risk is also outside V1. No code copied. |
| AutoIdleOnAFK | `https://github.com/RoguedBear/BetterDiscordPlugin-AutoIdleOnAFK` | MIT, copyright RoguedBear | Status-idle behavior | REFERENCE | It changes presence status and explicitly avoids voice channels; it is not evidence for WebRTC keepalive. No code copied. |
| BetterDiscord plugin catalog | `https://betterdiscord.app/plugins`, inspected 2026-08-22 | Per-addon; no blanket reuse right inferred | Names/descriptions used to understand current categories and avoid duplicate product ideas | REFERENCE | Inspired the future roadmap only. No plugin source or assets copied. Current catalog examples include call timers, volume controls, message splitting, image tools, permission viewers, and activity/privacy utilities. |
| BetterDiscord publishing guidelines | `https://docs.betterdiscord.app/plugins/publishing/guidelines`, inspected 2026-08-22 | Documentation reference | Cleanup, privacy, account-risk, and source rules | ADOPT AS POLICY | Informed fail-closed cleanup and exclusion of Nitro bypasses, message logging, self-bot actions, and token access. |
| Owner-controlled public portfolio | Local public portfolio CSS and brand-mark source, inspected 2026-08-22 | Owner-controlled public visual work | Palette/character only | REFERENCE | Informed the graphite, warm-cream, and coral foundation. Sea and amber are original SoulCord status accents. No screenshot, logo, text, or private data was copied. |
| SoulCord visual assets | `assets/branding/*.svg`, created 2026-08-22 | Original project contribution under Apache-2.0 | Signal-S mark, wordmark, social preview | CREATE | No third-party icon, font file, Discord mark, BetterDiscord mark, or generated bitmap is embedded. Brief and usage rules are in `BRAND_SYSTEM.md`. |
| Bun Windows x64 | Official `oven-sh/bun` `bun-v1.4.0` release | Bun repository license set; local build-tool use | `bun-windows-x64.zip` only | ADOPT AS TOOL | Archive SHA-256 `e6f093d39da486b20262ca8cdd5ed6a9e8bc9c2f275b78e6d3a0c5b28cc95901`; executable SHA-256 `627d2e4775c24bdedee2cd7ccc18dcadae061e5345274ab6e3c4c797927bfb8f`. Not committed or redistributed. |

## License map

- Inherited BetterDiscord source and history: Apache-2.0.
- SoulCord V1 source, tests, documentation, and original vector assets: Apache-2.0.
- Public compatibility names/interfaces remain attributable to their owners and are not claimed as SoulCord marks.
- Vencord GPL source is not included. If later adaptation occurs, it must land in a clearly mapped GPL-3.0-or-later component with retained headers and notices; that is not part of V1.

## Acquisition controls

Both supplied ZIPs remain unchanged outside the repository and were copied into an isolated quarantine directory before extraction. Offline inventory checked traversal, collisions, symlinks, nested archives, encrypted entries, and active content. The delivery manifest and nested archive inventories were verified before any source comparison. Original bundles and quarantined toolchains are not committed.
