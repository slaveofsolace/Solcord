# SoulCord brand system

## Character

SoulCord is a quiet technical tool: direct, inspectable, and owner-controlled. Copy names the mechanism, risk, and next action. It avoids promises such as “seamless,” “ultimate,” “revolutionary,” or “optimized” unless a measurement and baseline are shown.

The visual system uses a graphite foundation with three functional accents rather than a single purple gradient:

| Token | Value | Use |
| --- | --- | --- |
| Graphite | `#171a1c` | Mark field, diagnostic surfaces |
| Panel graphite | `#22272a` | Dense secondary surfaces |
| Warm cream | `#f2eadf` | Mark foreground, high-emphasis text on graphite |
| Signal coral | `#ff735f` | Recovery, causal warnings, first signal line |
| Instrument sea | `#4ecdc4` | Healthy state, focus, primary action |
| Checkpoint amber | `#f4b860` | Preview/pending state, third signal line |

The graphite, warm-cream, and coral direction was selected after inspecting the owner-controlled public portfolio source already present locally; its active palette uses near-black neutrals, warm paper tones, and coral `#ff755f`. SoulCord’s sea and amber are original functional complements for healthy and pending states. No private content, portfolio logo, or copied asset was used.

## Mark

The active V2 mark is an original faceted quartz core with one restrained orbital line and a small checkpoint light. Its graphite, warm-cream, sea, coral, and amber faces preserve the functional palette without resembling Discord’s controller shape, BetterDiscord’s `BD` monogram, a cryptocurrency coin, or a game-rank badge. Active runtime asset:

- `assets/branding/soulcord-mark-v2.png`

The first angular `S` direction is retained as a historical, reversible source set but is no longer used by the Suite header or settings icon:

- `assets/branding/soulcord-mark.svg`
- `assets/branding/soulcord-wordmark.svg`
- `assets/branding/soulcord-social-preview.svg`

At 16–24 pixels use the V2 mark only; do not use the wordmark. Maintain a clear area equal to the amber checkpoint diameter. Do not recolor it to Discord blurple or place it inside a Discord-shaped silhouette.

## Asset provenance

The V2 PNG was generated with OpenAI Image Generation on 2026-08-22 from a text-only SoulCord brief. No reference image was supplied. Prompt brief: “A compact, quiet power-tool mark: a single faceted quartz core in graphite, warm cream, sea, and coral; one precise orbital line and one small amber checkpoint; transparent background; crisp silhouette at small sizes; no lettering, coin, shield, game-rank badge, Discord controller, BetterDiscord monogram, gradient blob, stock icon, or cyber cliché.” The first output was rejected during review as too close to a game/crypto emblem and is not included. The retained V2 file is RGBA, 1254 × 1254, and has SHA-256 `c25742e5925e93cb7f9ee45fe1bf62b5f76892daa239c1d979bb14b0211afffc`.

The historical SVG assets were constructed as original paths in this repository on 2026-08-22. No icon pack, Discord asset, BetterDiscord asset, third-party font, or user-submitted image is embedded.

## UI rules

- Follow Discord’s settings density and navigation model; SoulCord is a settings tool, not a marketing page.
- Prefer two-column fact grids and compact status rows over card walls.
- Status never relies on color alone: every state is written as text.
- Use `:focus-visible`, semantic headings, native controls, and keyboard-operable actions.
- Honor `prefers-reduced-motion`; the Accessibility Toolkit may reduce motion further.
- Explain preview and unavailable states. Do not represent a structural lookup as live when it failed validation.
- Empty states say what was observed, for example “No Activity window decision has been observed in this session.”

## Voice

Use concrete sentences: “One same-package preload was accepted” or “No addon is quarantined.” Avoid anonymous collective voice, fictional metrics, fake quotes, canned testimonials, and vague cyber language.
