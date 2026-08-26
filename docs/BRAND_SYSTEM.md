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

Six text-only concept studies were generated with OpenAI Image Generation on 2026-08-22 and 2026-08-23. No reference image was supplied. Their prompt records, hashes, and cold-eye decisions are retained in `docs/evidence/branding/README.md`. A, B, D, and F were rejected; C was marked `REVISE`; E is reference-only. The generated studies supplied direction and comparison evidence only.

The production vector was redrawn from first principles as original SVG paths. Required PNG sizes are deterministically rendered from that SVG by `scripts/render-soulcord-mark.cjs`; the generated raster concepts do not ship in the runtime. The vector also replaces the owner-rejected striped-square icon visible in the prior installed build. No icon pack, Discord asset, BetterDiscord asset, third-party font, or user-submitted image is embedded.

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

The theme family contains the recommended default, four accepted V1 alternatives, and six V2 full-shell alternatives. Every theme covers server/channel/chat/member and activity regions, composer and search fields, settings, popouts, and native dialogs. Each remains a self-contained local CSS file with no `@import`, remote font, remote image, or remote stylesheet.

| Theme | Character | SHA-256 |
| --- | --- | --- |
| SoulCord Default | Recommended graphite workstation, warm text, oxidized-teal interaction, and ember reserved for warnings. | `a7f47ae4b1a208f69545c9d6ef699e0a2cef831af63dadb4319597067d8329a9` |
| Obsidian Thread | Wide black gutters, squared graphite panels, warm bone, oxidized teal, and restrained ember. | `da11e6c4070a400cad3d0beb5e2e9284b18d9e9c52f8e57a3a0c022ae0a09c54` |
| Carbon Ember | Tight charcoal instrumentation with copper interaction rails and burgundy selection signals. | `ab2c74b1ce42720c99bf6d7a33f04befa47dd79d6c5537c8d974c0b555476f9c` |
| Midnight Glass | Navy-black translucent panels, restrained separation, silver seams, and ice-cyan focus without fragile modal overrides. | `4b605006305b114112c48ce6a89204259343d10d960b2a13a0366655e15c1a00` |
| Paper Signal | Warm paper, ink, coral, and teal with print-like square seams; it applies even when Discord was previously in dark mode. | `8f135c69e61499b660850016a6acbee7b92cf971264de5fd4bf595622690e00d` |
| Threadline | Compact ruled workspace with indexed navigation and precise message rails. | `8c8283b10e507daabe9af7c30bc3e1e563b6c1cbd44d76bb0eb97c27d1eac1ee` |
| Signal Block | High-contrast square containment with heavy, state-bearing block boundaries. | `4b648c012f9017cb3334c987e09fc3190b1ce30681d30d792e2860b756a0c071` |
| Relay Classic | Familiar Discord density with a continuous shell and restrained relay-blue state bars. | `07f3bf94c5bbf3d7fe7c8310ea2a2cf8134da4cc2367038fc9f2710aab036931` |
| Workshop | Tactile charcoal surfaces, recessed composition areas, and copper fixtures. | `d6e443561148683a556897b7bf0d869705b0521fa9a1204f38083f7c69b6faa3` |
| Quiet Read | Accessibility-first light surfaces, generous reading measure, large targets, and still interactions. | `0899ac827b8ffc669ba7e7adb27eabce58e0223282d82b97f8e5c94a72ba1643` |
| Night Transit | Navy shell with distinct route rails for selection, unread state, mentions, and voice. | `416028f03d7111f8b46d3f7608de741d7265ea148771a4dd64c04963089d460d` |

All eleven remain original implementations. The MIT-licensed `midnight-discord` source at pinned commit `0c6e4b5009df5f13fe33d9b279378378d5212330` was inspected as `REFERENCE ONLY` for general principles: cover current visual-refresh tokens, separate major work regions, expose bounded density tokens, and honor reduced motion. No selector block, hosted import, font, SVG, or asset was copied. The owner's existing `midnight.theme.css` was read only to confirm its canonical metadata/configuration shape and was not modified, staged, or replaced.

Only one SoulCord theme is selected by the setup transaction. The preview reports declared conflicts before **Apply and verify**; skipping the wizard changes no theme state. The six V2 themes differ in at least three structural axes rather than palette alone; see [V2 theme system](V2_THEME_SYSTEM.md).

## UI rules

- Follow Discord’s settings density and navigation model; SoulCord is a settings tool, not a marketing page.
- Prefer two-column fact grids and compact status rows over card walls.
- Status never relies on color alone: every state is written as text.
- Use `:focus-visible`, semantic headings, native controls, and keyboard-operable actions.
- Honor `prefers-reduced-motion`; the Accessibility Toolkit may reduce motion further.
- Explain preview and unavailable states. Do not represent a structural lookup as live when it failed validation.
- Empty states say what was observed, for example “No Activity window decision has been observed in this session.”

## Acceptance status

The owner visually accepted the current SoulCord V1 direction on 2026-08-26, including the active mark, settings shell, and current theme treatment. The 16 px and 256 px exports also passed the earlier technical silhouette inspection. This acceptance does not claim exact 100%/125% DPI coverage, every Timeline/recovery state, or V2 theme acceptance; those remain separate runtime checks.

## Voice

Use concrete sentences: “One same-package preload was accepted” or “No addon is quarantined.” Avoid anonymous collective voice, fictional metrics, fake quotes, canned testimonials, and vague cyber language.
