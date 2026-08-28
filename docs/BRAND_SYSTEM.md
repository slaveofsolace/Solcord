# Solcord brand system

## Character

Solcord is a quiet technical tool: direct, inspectable, and owner-controlled. Copy names the mechanism, risk, and next action. It avoids promises such as “seamless,” “ultimate,” “revolutionary,” or “optimized” unless a measurement and baseline are shown.

The visual system uses a graphite foundation with three functional accents rather than a single purple gradient:

| Token | Value | Use |
| --- | --- | --- |
| Warm black | `#11100e` | Primary shell and quiet gutters |
| Carbon paper | `#1a1815` | Dense secondary surfaces |
| Warm bone | `#f3eee5` | High-emphasis text on dark surfaces |
| Ember | `#ff755f` | Deliberate break, recovery, causal warnings |
| Oxidized teal | `#4b9d96` | Upper cord, healthy state, focus, primary action |

The warm-black, paper, and coral direction was refined on 2026-08-27 after inspecting the owner-controlled public [SOL work page](https://slaveofsolace.com/work/). The reference established visual principles—warm near-black, paper-white type, coral signals, thin rules, assertive display type, and quiet grain—not reusable assets. Solcord uses original CSS, a different deterministic grain seed, and a sparse static signal field. No portfolio canvas code, logo, image, or private content is copied. Oxidized teal remains Solcord's separate functional accent.

The runtime bundles Hanken Grotesk for interface text from the official Google Fonts repository at pinned revision `ade3d1533e06b2b1462ffcde8e08b129627ca360`. It is SIL Open Font License 1.1 and is compiled into the local Solcord payload, so no font request leaves Discord. Discord's own `gg sans` leads display hierarchy for a more native, readable Control Center. The previously evaluated Anybody font remains in source provenance but is no longer referenced by runtime CSS or shipped themes. Georgia remains the local editorial fallback for selected reading surfaces.

## Mark

The active mark is an original asymmetrical cord-cut `S`: two signal cords form the upper and lower strokes with a deliberate ember break at the center. It has no crystal, orbit, shield, controller, Discord shape, BetterDiscord monogram, gradient, or borrowed icon geometry. Active sources:

- `assets/branding/solcord-mark.svg`
- `assets/branding/solcord-wordmark.svg`
- `assets/branding/solcord-social-preview.svg`
- `assets/branding/icons/solcord-mark-{16,24,32,64,256}.png`

At 16–24 pixels use the mark only; do not use the wordmark. Preserve its transparent field and center break. Do not recolor it to Discord blurple or place it inside a Discord-shaped silhouette.

## Asset provenance

Six text-only concept studies were generated with OpenAI Image Generation on 2026-08-22 and 2026-08-23. No reference image was supplied. Their prompt records, hashes, and cold-eye decisions are retained in `docs/evidence/branding/README.md`. A, B, D, and F were rejected; C was marked `REVISE`; E is reference-only. The generated studies supplied direction and comparison evidence only.

The production vector was redrawn from first principles as original SVG paths. Required PNG sizes are deterministically rendered from that SVG by `scripts/render-solcord-mark.cjs`; the generated raster concepts do not ship in the runtime. The vector also replaces the owner-rejected striped-square icon visible in the prior installed build. No icon pack, Discord asset, BetterDiscord asset, or user-submitted image is embedded. The two embedded typefaces are the separately documented OFL fonts above.

Current production-source hashes:

| Asset | SHA-256 |
| --- | --- |
| `assets/branding/solcord-mark.svg` | `6128f02f3c8606bb6d07ea021a0594740245ea6ac37ace7412df45df77a67511` |
| `assets/branding/solcord-wordmark.svg` | `b3e13145be014b8b3bbd88be11c7efefd84ad8fae68bcc73e836f17d442fde67` |
| `assets/branding/solcord-social-preview.svg` | `ea24d085ff2660e381535c7701156d7a4cb851450e8b48d0de624c4128b2bd76` |
| `assets/branding/icons/solcord-mark-16.png` | `8e3b10bb5094c65c497cd4fd1b60e5e670f0f9775ee1a42ba1e77883a1a32387` |
| `assets/branding/icons/solcord-mark-24.png` | `cae50045e449673aea5f919cf94d69cb14d7f7bbc24efffbdbc56488ecee591f` |
| `assets/branding/icons/solcord-mark-32.png` | `868bdb6498d99ce69bea29f0737ea6c05c5f47f459985b6b0f748f5253d4d20a` |
| `assets/branding/icons/solcord-mark-64.png` | `2c43fee1e0c5756a32bb602d90e3c0684adcce14a347f2185a0834806932414b` |
| `assets/branding/icons/solcord-mark-256.png` | `2a0b0f786c9f5e0effe9ca7113a08f47a974d54b0efeff9b9dfba59e9bd2f746` |

## Theme family

The theme family contains the recommended default, four accepted V1 alternatives, and six V2 full-shell alternatives. Every theme covers server/channel/chat/member and activity regions, composer and search fields, settings, popouts, and native dialogs. Each remains a self-contained local CSS file with no `@import`, remote font, remote image, or remote stylesheet.

| Theme | Character | SHA-256 |
| --- | --- | --- |
| Solcord Default | Recommended warm-black workstation with ruled structure, paper-white type, sparse signal texture, teal interaction, and restrained ember. | `7812427a8321aefe8a74e63d49c825b4ecb0dcba321da9b40934f6e7a00fa912` |
| Obsidian Thread | Wide black gutters, square warm-carbon panels, expanded signal headings, oxidized teal, and restrained ember. | `37d41e1d3bcb8a7ac57add1da0cde7bada92d362e1274d48d5f892b375d26a11` |
| Carbon Ember | Tight charcoal instrumentation with copper interaction rails and burgundy selection signals. | `a18c0bee8e2554a92019eeedd3c720196b63d7269cc70c0bc6aa8ae9b6e49209` |
| Midnight Glass | Navy-black translucent panels, restrained separation, silver seams, and ice-cyan focus without fragile modal overrides. | `e70464ea5ddb541a023d8b20ca6108d72ea2e737064262658c994cd492a3134a` |
| Paper Signal | Warm paper, readable ink, coral, teal, and editorial headings with print-like square seams. | `db3ec833356f7f44c3d18ab3396c52d69ab8f9c7ba2500e7d6dbac9741f90482` |
| Threadline | Compact ruled workspace with indexed navigation, measured display headings, and precise message rails. | `d2ed8101937e9e914f77890ad71a10b1c5cff0bd7a516e258997d5c002681211` |
| Signal Block | High-contrast square containment with heavy, state-bearing block boundaries and deliberately compressed display type. | `e24badd1c5eb82d6c5c18e4840b1579bce178f12e70546a1ceeb4658eb3f394f` |
| Relay Classic | Familiar Discord density with a continuous shell and restrained relay-blue state bars. | `e7e78d4995cfc233a92dd2c10135e76ec918eb86dac0cae70cbafeab7cce1faa` |
| Workshop | Tactile charcoal surfaces, recessed composition areas, copper fixtures, and compact tool headings. | `ba15b9d4665a0947879cb996eb0ed14e3ccb90fa614287d299cea353ed5959ac` |
| Quiet Read | Accessibility-first light surfaces, ink-dark text, generous measure, editorial headings, large targets, and still interactions. | `880b2111a1bcda5d2839849c38687a6694de34dd140249f01c58295df79b2bee` |
| Night Transit | Navy shell with broad wayfinding type and distinct route rails for selection, unread state, mentions, and voice. | `a04debcbbc1b6b1fd5e9f0f6239edd2ac0ca24c8b3bb164c224cc672c896729f` |

All eleven remain original implementations. The MIT-licensed `midnight-discord` source at pinned commit `0c6e4b5009df5f13fe33d9b279378378d5212330` was inspected as `REFERENCE ONLY` for general principles: cover current visual-refresh tokens, separate major work regions, expose bounded density tokens, and honor reduced motion. No selector block, hosted import, font, SVG, or asset was copied. The owner's existing `midnight.theme.css` was read only to confirm its canonical metadata/configuration shape and was not modified, staged, or replaced.

Only one Solcord theme is selected by the setup transaction. The preview reports declared conflicts before **Apply and verify**; skipping the wizard changes no theme state. The six V2 themes differ in at least three structural axes rather than palette alone; see [V2 theme system](V2_THEME_SYSTEM.md).

## UI rules

- Follow Discord’s settings density and navigation model; Solcord is a settings tool, not a marketing page.
- Prefer two-column fact grids and compact status rows over card walls.
- Status never relies on color alone: every state is written as text.
- Use `:focus-visible`, semantic headings, native controls, and keyboard-operable actions.
- Honor `prefers-reduced-motion`; the Accessibility Toolkit may reduce motion further.
- Explain preview and unavailable states. Do not represent a structural lookup as live when it failed validation.
- Empty states say what was observed, for example “No Activity window decision has been observed in this session.”

## Acceptance status

The owner retained the Solcord mark but rejected the prior V2 typography and generic blue-gray theme treatment on 2026-08-27. The replacement source described above is therefore `REVISE` until it passes fresh installed-shell review at the required Windows scales. Earlier technical contrast or silhouette checks do not grant acceptance to this visual pass.

## Voice

Use concrete sentences: “One same-package preload was accepted” or “No addon is quarantined.” Avoid anonymous collective voice, fictional metrics, fake quotes, canned testimonials, and vague cyber language.
