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

The warm-black, paper, and coral direction was refined on 2026-08-27 after inspecting the owner-controlled public [SOL work page](https://slaveofsolace.com/work/). The reference established visual principles—warm near-black, paper-white type, coral signals, thin rules, assertive display type, and quiet grain—not reusable assets. Solcord uses original CSS, a different deterministic grain seed, a sparse static signal field, and Windows system-font fallbacks. No portfolio canvas code, font file, logo, image, or private content is copied or bundled. Oxidized teal remains Solcord's separate functional accent.

## Mark

The active mark is an original asymmetrical cord-cut `S`: two signal cords form the upper and lower strokes with a deliberate ember break at the center. It has no crystal, orbit, shield, controller, Discord shape, BetterDiscord monogram, gradient, or borrowed icon geometry. Active sources:

- `assets/branding/solcord-mark.svg`
- `assets/branding/solcord-wordmark.svg`
- `assets/branding/solcord-social-preview.svg`
- `assets/branding/icons/solcord-mark-{16,24,32,64,256}.png`

At 16–24 pixels use the mark only; do not use the wordmark. Preserve its transparent field and center break. Do not recolor it to Discord blurple or place it inside a Discord-shaped silhouette.

## Asset provenance

Six text-only concept studies were generated with OpenAI Image Generation on 2026-08-22 and 2026-08-23. No reference image was supplied. Their prompt records, hashes, and cold-eye decisions are retained in `docs/evidence/branding/README.md`. A, B, D, and F were rejected; C was marked `REVISE`; E is reference-only. The generated studies supplied direction and comparison evidence only.

The production vector was redrawn from first principles as original SVG paths. Required PNG sizes are deterministically rendered from that SVG by `scripts/render-solcord-mark.cjs`; the generated raster concepts do not ship in the runtime. The vector also replaces the owner-rejected striped-square icon visible in the prior installed build. No icon pack, Discord asset, BetterDiscord asset, third-party font, or user-submitted image is embedded.

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
| Solcord Default | Recommended warm-black workstation with ruled structure, paper-white type, sparse signal texture, teal interaction, and restrained ember. | `6e420bc3439ab00dc157ed41781a7cf72d4da12a849fb56e388f3944d75be705` |
| Obsidian Thread | Wide black gutters, square warm-carbon panels, condensed display type, oxidized teal, and restrained ember. | `8bee085b2c4c5d394d8b0f8e9b6624853e9ab8787e12b54a2c0f4993b15397ce` |
| Carbon Ember | Tight charcoal instrumentation with copper interaction rails and burgundy selection signals. | `848b6cf91e54cbc8ea648947a602f91f85a3de9b1e851f678544b5c7695ea9e9` |
| Midnight Glass | Navy-black translucent panels, restrained separation, silver seams, and ice-cyan focus without fragile modal overrides. | `e1ec9a985679f82738f4e314ef2d23f28e1e07ea22fdf4d79153b71f911a8665` |
| Paper Signal | Warm paper, readable ink, coral, and teal with print-like square seams; it applies even when Discord was previously in dark mode. | `26ecb1b7011e0a84d78e0769941e4c742d73dcd5bbc065c8699aa6589122f1c7` |
| Threadline | Compact ruled workspace with indexed navigation, condensed headings, and precise message rails. | `2a1f9029e702633e9a4daa9c265adcd8c1850f49144fa366f161732a51d8de10` |
| Signal Block | High-contrast square containment with heavy, state-bearing block boundaries and compressed display type. | `8c07bf7aceb6f7c5e2a2d8a10c6668d22944473c36935cdbaf34287462e1859f` |
| Relay Classic | Familiar Discord density with a continuous shell and restrained relay-blue state bars. | `9bce10cddabb71c25614cd11cfd9e0f6513b7353718952e8163963437574603e` |
| Workshop | Tactile charcoal surfaces, recessed composition areas, copper fixtures, and compact tool headings. | `99d520779425c157886679e50cd73949ff40b6e98d81fe716f4f51703b4457c0` |
| Quiet Read | Accessibility-first light surfaces, ink-dark text, generous measure, editorial headings, large targets, and still interactions. | `f753384baece844cede6d8f864c00cf2c588bd80da3e8d94a9c3debe93e9b95d` |
| Night Transit | Navy shell with condensed wayfinding type and distinct route rails for selection, unread state, mentions, and voice. | `eb6fa5a73a5ba53403bfdda2c53141268f0249e8a73ad7f1e8af0f2b504871a2` |

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
