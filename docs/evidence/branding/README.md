# SoulCord mark concept evidence

Generated 2026-08-22 and 2026-08-23 with OpenAI Image Generation from text-only prompts. No reference image, Discord asset, BetterDiscord asset, icon pack, owner-private material, or third-party artwork was supplied. The prompt records below are normalized records of the generation requests; they preserve the requested subject, exclusions, layout, and palette without claiming the model followed them.

## Fixed art direction shared by all studies

Flat transparent concept art for an original SoulCord mark: an asymmetrical cord-cut `S` made from two interlocking signal or audio cords with one deliberate break. Graphite, warm bone, oxidized teal, and a restrained ember accent. Crisp silhouette suitable for 16, 24, 32, 64, and 256 pixels. No lettering, crystal, orbit, shield, controller, Discord or BetterDiscord mark, gradient, crypto badge, game-rank emblem, fake telemetry, or generic cyber imagery.

## Study prompts and decisions

- **Concept A — audio cable.** Add two visibly physical 3.5 mm audio cords whose curves form the `S`; keep connectors subordinate and the center break unmistakable. SHA-256 `11fb017fe57d3ac68d736ee179ea1a34f8eb27189db8f2a8561c06e5a5026629`. **REJECT:** illustrative connector detail collapses at navigation-icon size.
- **Concept B — data cable.** Explore a stricter geometric `S` built from USB-style signal cords with fewer details and harder endpoints. SHA-256 `2e13551c65b550135dbe1e9d3508e04f80ea80f9bacbfd1329bbfc3dcf7c06d3`. **REJECT:** too literal and too close to a generic connectivity product.
- **Concept C — abstract cord.** Remove recognizable connector hardware; make the upper and lower cord strokes carry the silhouette, with negative space and a single center cut. SHA-256 `b0f0768ce084b3d9a8920febe7e54365a68b17bfebf38c1116899cd2283b4dbc`. **REVISE:** strongest silhouette, but generated volume and shading were unsuitable for the final flat mark.

The owner rejected the previously installed striped-square icon on 2026-08-23. A second cold-eye pass deliberately tested whether generation could improve on the clean vector redraw:

- **Concept D — physical-cord sheet.** Prompt record: “Six original SoulCord app-mark studies in a 2 by 3 sheet. Each is an asymmetrical cord-cut S made from two interlocking audio or signal cords with one deliberate break. Use graphite, warm bone, oxidized teal, and one restrained ember accent. Flat, transparent, crisp at 16 pixels. No text, crystal, orbit, shield, controller, Discord or BetterDiscord mark, gradient, glow, crypto badge, telemetry, or background.” SHA-256 `2137cb0a3dbb9fd6891197cc5692e70ae7a12feaf9ca9c544b225d0f66f47855`. **REJECT:** the result ignored the flat/transparent constraints, added glow and a dark presentation field, and made connector hardware dominate the silhouette.
- **Concept E — abstract signal sheet.** Prompt record: “Six highly reduced cord-cut S symbols in a 2 by 3 sheet. Build the S from two separate interlocking signal strokes and a single unmistakable cut. No plugs or literal hardware. Use only graphite, warm bone, oxidized teal, and restrained ember. Flat vector-like geometry on transparency, no lighting, shadow, glow, gradient, lettering, shield, crystal, orbit, controller, Discord shape, or BetterDiscord monogram.” SHA-256 `4fced56901ba6dfce48f9d3b551e3fc75d57a1ba4f463ad8febd3720a7b16ebc`. **REFERENCE ONLY:** this is the strongest second-pass silhouette sheet, but the generated glow, field, and inconsistent cut geometry make it unsuitable for runtime use or direct tracing.
- **Concept F — monochrome silhouette check.** Prompt record: “Six black-only cord-cut S silhouette thumbnails on a plain white field. One deliberate center break, two distinct strokes, no shading, lighting, gradient, border, text, plug hardware, or decorative imagery. Optimize only for legibility at 16 and 24 pixels.” SHA-256 `0842b51fc233e15d0211081e317e95ca9984a5b2a83212cc74da4f930a347c74`. **REJECT:** the result rendered near-black forms on a black field, so the required small-size silhouette could not be evaluated.

## Production redraw

The selected direction was redrawn as two original cubic paths with independent graphite outlines, an oxidized-teal upper cord, warm-bone lower cord, and ember cut face. None of the concept rasters was traced, bundled, or used at runtime. The second pass confirms that the deterministic vector is materially clearer than the generated sheets and replaces the rejected installed striped-square icon once this source build is installed.

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

The 16 px and 256 px renders were visually inspected after deterministic export. Technical verdict: **ACCEPT for implementation**. Owner acceptance remains pending after installed UI review.
