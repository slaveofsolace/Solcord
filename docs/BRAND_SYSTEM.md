# SoulCord brand system

## Character

SoulCord is a quiet technical tool: direct, inspectable, and owner-controlled. Copy names the mechanism, risk, and next action. It avoids promises such as “seamless,” “ultimate,” “revolutionary,” or “optimized” unless a measurement and baseline are shown.

The visual system uses a graphite foundation with three functional accents rather than a single purple gradient:

| Token | Value | Use |
| --- | --- | --- |
| Graphite | `#171a1c` | Mark field, diagnostic surfaces |
| Panel graphite | `#22272a` | Dense secondary surfaces |
| Warm bone | `#f0e5d5` | Lower cord, high-emphasis text on graphite |
| Ember | `#df6b52` | Deliberate break, recovery, causal warnings |
| Oxidized teal | `#4b9d96` | Upper cord, healthy state, focus, primary action |

The graphite, warm-bone, and ember direction was selected after inspecting the owner-controlled public portfolio source already present locally; its active palette uses near-black neutrals, warm paper tones, and coral `#ff755f`. Oxidized teal is an original SoulCord functional accent. No private content, portfolio logo, or copied asset was used.

## Mark

The active mark is an original asymmetrical cord-cut `S`: two signal cords form the upper and lower strokes with a deliberate ember break at the center. It has no crystal, orbit, shield, controller, Discord shape, BetterDiscord monogram, gradient, or borrowed icon geometry. Active sources:

- `assets/branding/soulcord-mark.svg`
- `assets/branding/soulcord-wordmark.svg`
- `assets/branding/soulcord-social-preview.svg`
- `assets/branding/icons/soulcord-mark-{16,24,32,64,256}.png`

At 16–24 pixels use the mark only; do not use the wordmark. Preserve its transparent field and center break. Do not recolor it to Discord blurple or place it inside a Discord-shaped silhouette.

## Asset provenance

Three text-only concept studies were generated with OpenAI Image Generation on 2026-08-22. No reference image was supplied. Their prompt records, hashes, and cold-eye decisions are retained in `docs/evidence/branding/README.md`. Concepts A and B were rejected; C was marked `REVISE` and supplied silhouette direction only.

The production vector was redrawn from first principles as original SVG paths. Required PNG sizes are deterministically rendered from that SVG by `scripts/render-soulcord-mark.cjs`; the generated raster concepts do not ship in the runtime. No icon pack, Discord asset, BetterDiscord asset, third-party font, or user-submitted image is embedded.

Current production-source hashes:

| Asset | SHA-256 |
| --- | --- |
| `assets/branding/soulcord-mark.svg` | `6128f02f3c8606bb6d07ea021a0594740245ea6ac37ace7412df45df77a67511` |
| `assets/branding/soulcord-wordmark.svg` | `b3e13145be014b8b3bbd88be11c7efefd84ad8fae68bcc73e836f17d442fde67` |
| `assets/branding/soulcord-social-preview.svg` | `ea24d085ff2660e381535c7701156d7a4cb851450e8b48d0de624c4128b2bd76` |
| `assets/branding/icons/soulcord-mark-16.png` | `8e3b10bb5094c65c497cd4fd1b60e5e670f0f9775ee1a42ba1e77883a1a32387` |
| `assets/branding/icons/soulcord-mark-24.png` | `cae50045e449673aea5f919cf94d69cb14d7f7bbc24efffbdbc56488ecee591f` |
| `assets/branding/icons/soulcord-mark-32.png` | `868bdb6498d99ce69bea29f0737ea6c05c5f47f459985b6b0f748f5253d4d20a` |
| `assets/branding/icons/soulcord-mark-64.png` | `2c43fee1e0c5756a32bb602d90e3c0684adcce14a347f2185a0834806932414b` |
| `assets/branding/icons/soulcord-mark-256.png` | `2a0b0f786c9f5e0effe9ca7113a08f47a974d54b0efeff9b9dfba59e9bd2f746` |

## Theme family

The four themes share dense Discord-compatible spacing, explicit keyboard focus, written status labels, 1 px seams, and a `prefers-reduced-motion` fallback. Each is a self-contained local CSS file with no `@import`, remote font, remote image, or remote stylesheet.

| Theme | Character | SHA-256 |
| --- | --- | --- |
| Obsidian Thread | Graphite, warm bone, oxidized teal, and restrained ember; the default setup choice. | `a7fadd2a08784595318199dc68fe8db179f514950b6cd6c615d34ed39ef5bd8b` |
| Carbon Ember | Charcoal and ash with copper and burgundy signals. | `a8180d684e6543e8c15a7b18a1f747e96ed17855a2f30a967baeb7ff88d7a65d` |
| Midnight Glass | Navy-black, silver, ice cyan, bounded blur, and reduced-transparency fallback. | `fe8585ef1a8e8967de29b7d78b59c88cdc89d85d2b298e41b28739ecc85048fd` |
| Paper Signal | Warm paper, ink, coral, and teal for Discord light mode. | `2d310da956e00dd392de8ce575c42d7852f4595ff3f0b19409e0a8a100c22dc2` |

All four are original. The MIT-licensed `midnight-discord` candidate was considered as a possible reference, but no file, selector block, asset, or code from it was used. The owner’s existing `midnight.theme.css` is a separate user file and is not inspected, modified, or replaced by this theme family.

Only one SoulCord theme is selected by the setup transaction. The preview reports declared conflicts before `Finish`; skipping the wizard changes no theme state.

## UI rules

- Follow Discord’s settings density and navigation model; SoulCord is a settings tool, not a marketing page.
- Prefer two-column fact grids and compact status rows over card walls.
- Status never relies on color alone: every state is written as text.
- Use `:focus-visible`, semantic headings, native controls, and keyboard-operable actions.
- Honor `prefers-reduced-motion`; the Accessibility Toolkit may reduce motion further.
- Explain preview and unavailable states. Do not represent a structural lookup as live when it failed validation.
- Empty states say what was observed, for example “No Activity window decision has been observed in this session.”

## Acceptance status

The 16 px and 256 px mark exports passed a technical silhouette inspection. That is implementation evidence, not owner acceptance. The mark, all four themes, onboarding, settings, Timeline tombstones, recovery, 100%/125% scaling, light/dark contrast, focus order, and reduced-motion behavior remain `REVISE` or `UNREVIEWED` until installed Human Eye captures receive an explicit owner verdict.

## Voice

Use concrete sentences: “One same-package preload was accepted” or “No addon is quarantined.” Avoid anonymous collective voice, fictional metrics, fake quotes, canned testimonials, and vague cyber language.
