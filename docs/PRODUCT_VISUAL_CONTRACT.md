# Solcord product visual contract

## Information architecture

Solcord owns five Control Center workspaces and no duplicate top-level destinations:

| Workspace | Canonical owner |
| --- | --- |
| Home | resumable setup, Session Pulse, Activity Bridge |
| Appearance | visual mode, accent, density, message shape, motion, accessibility |
| Safety | Privacy Mode, Link Lens and Domain Memory, Attachment Guard, Screenshot Scrubber |
| People | Friend Watch, Message Timeline, Return Later |
| Tools | module status, Add-ons and quarantine, Profiles and Recovery, Performance HUD, catalog evidence, Power Lab status, About |

At widths above 900 px the workspace rail and content are side by side. At 900 px and below, the rail becomes five horizontal tabs. At 520 px and below, controls and facts become one column. The content panel, not the Discord window, is the responsive boundary. Ordinary corners remain at or below 6 px.

## Semantic presentation

The appearance layer is a semantic token system, not five competing themes. Modes are Follow Discord, Soul Dark, Soul Light, and OLED. Accents are Discord/system, Glacier, Signal, Coral, and Forest. Density is Comfortable or Compact; motion is Follow Discord/Windows, Full, or Reduced. Focus, normal text, muted text, success, warning, and danger remain separate tokens and never rely on hue alone.

The Control Center inherits Discord typography and native form behavior. It avoids remote CSS, remote fonts, decorative gradients, ornamental effects, nested dashboards, invented telemetry, and repeated status cards. Empty states name what was actually observed and the available next action.

## Launch identity

Solcord does not draw a second product splash. Discord's updater and bootstrap window retain full ownership of the familiar spinning Discord mark, background, motion preferences, startup text, and handoff into the client. Solcord's loading adapter is an intentional no-op kept only to preserve the inherited startup call contract. It bundles no Discord mark, creates no renderer overlay, adds no timer, and cannot cover a recovery or authentication surface.

## Human Eye matrix

Source-frozen review must confirm that Discord's native spinner is unobstructed and that no Solcord launch overlay survives into the client. Home, Appearance, Safety, People, Tools, setup, recovery, and error/empty states remain required at 1280×720, 1142×1440, 1920×1080, ultrawide, and a narrow settings column. Required checks are clipping, focus order, keyboard operation, 100/125/150/200% scaling, dark/light/OLED contrast, high contrast, and reduced motion.

Technical render success is not Human Eye acceptance. Each surface receives `ACCEPT`, `REVISE`, `REJECT`, or `BLOCKED` with an observed reason. Real-profile appearance changes remain an owner gate.
