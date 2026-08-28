# Solcord V2 theme system

The six V2 themes extend Solcord's accepted V1 direction without treating a palette swap as a new design. Each theme changes at least three of geometry, density, type treatment, spatial grouping, motion, and interaction feedback. All sources are original Apache-2.0 CSS implementations.

| Theme | Structural character | Signature behavior |
| --- | --- | --- |
| Threadline | Square, compact, ruled, index-like | A continuous left rail and row rules connect navigation to message state. |
| Signal Block | Heavy square containment, wider rhythm, and a restrained system condensed heading stack | Hover, selected, warning, and focus states change the physical block boundary. |
| Relay Classic | Familiar density, modest radii, continuous shell | Quiet blue state bars preserve Discord's normal reading rhythm. |
| Workshop | Tactile gaps, inset inputs, raised work surfaces | Copper fixtures distinguish pressable controls from recessed composition areas. |
| Quiet Read | Light, spacious, 78-character message measure, large targets | Motion stays off and state changes remain visible through border and contrast. |
| Night Transit | Compact navy shell, route-shaped rails, directional grouping | Selection, unread, mention, and live voice use distinct rail colors and labels. |

## Shared invariants

- Every theme source is self-contained: no imports, remote fonts, URLs, images, or copied texture. The shared Solcord renderer supplies one original low-opacity procedural grain and a static signal field when a Solcord product mode is active.
- Every source covers guild navigation, channels, chat, composer, member and activity columns, people lists, popouts, native dialogs, embeds, and settings.
- Normal and muted text meet WCAG AA against primary and secondary surfaces. Focus indicators meet the 3:1 non-text contrast requirement.
- Native Discord light, dark, darker, and midnight selections cannot leave a partial mixed theme.
- Every theme has an explicit `prefers-reduced-motion` fallback. Quiet Read remains still even when the system permits animation.
- Selector drift fails back to Discord's ordinary layout; no theme hides overflow or relies on JavaScript.

## Anti-slop decisions

The themes contain no decorative gradients, glowing telemetry, fake coordinates, card-wall ornament, remote imagery, or motion without state meaning. The ambient field is static, sparse, non-interactive, and faint enough that chat remains the visual priority. Borders and rails communicate selection, unread state, mentions, voice presence, containment, or focus. Shadows appear only where Workshop represents a raised or recessed control, Relay Classic distinguishes an overlay, or Signal Block makes modal stacking unambiguous.

## Runtime acceptance still required

Source and automated contrast checks do not grant visual acceptance. Each theme must still be inspected in the live Discord shell at 100%, 125%, 150%, and 200% Windows scaling, with keyboard-only navigation, reduced motion, a populated DM, a guild channel, member and activity panels, a native modal, settings, a popout, and empty/error states. Any clipped text, stale selector, ambiguous focus, or lower-contrast plugin surface is `REVISE`.
