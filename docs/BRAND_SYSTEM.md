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

The original mark is an angular `S` crossed by three offset signal lines. It refers to an inspected compatibility bridge, not Discord’s controller shape or BetterDiscord’s `BD` monogram. Source assets:

- `assets/branding/soulcord-mark.svg`
- `assets/branding/soulcord-wordmark.svg`
- `assets/branding/soulcord-social-preview.svg`

The SVG view boxes scale cleanly at 16, 24, 32, 64, and 256 pixels. At 16–24 pixels use the mark only; do not use the wordmark. Maintain a clear area equal to one signal-line height. Do not recolor the three signals to Discord blurple or place the mark inside a Discord-shaped silhouette.

## Asset provenance

The assets were constructed as original SVG paths in this repository on 2026-08-22. Design brief: “Create an angular S made from a continuous light ribbon, crossed by three short signal bars in coral, sea, and amber; graphite field; no Discord controller, chat bubble, BetterDiscord monogram, gradient blob, stock icon, or third-party font dependency.”

No generative model output, icon pack, Discord asset, BetterDiscord asset, or downloaded image is embedded. SHA-256 values are generated in the build evidence manifest.

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
