# Solcord product visual contract

## Control Center

Solcord owns one Control Center with nine destinations. Features live where a person would look for them; technical state stays secondary.

| Workspace | What belongs here |
| --- | --- |
| Overview | current state, up to three genuine actions, Activity readiness |
| Appearance & Accessibility | theme, mode, accent, density, motion, message shape, reading aids |
| Performance | Lean, Balanced, and Visual policies; bounded diagnostics |
| Privacy & Safety | Strict Privacy, outbound capability state, local safety and opt-in history |
| Chat & Composer | replies, counters, guarded splitting, previews, drafts |
| Voice & Activities | call context, Audience Guard, Activity health, collapsed experiments |
| Friends & Spaces | local organization and opt-in relationship history |
| Extensions | optional community software and transactional provider migration |
| Recovery | setup, rollback, quarantine, snapshots, About, technical details |

The rail stays beside content while the panel is wider than 720 CSS pixels. At 720 pixels and below it becomes a compact search-and-section row. At 520 pixels and below settings, facts, footer actions, and status rows use one column. At a 320-pixel content boundary the Discord settings rail may collapse only while the Solcord panel is active. There is one scroll owner and route changes return focus to the workspace heading.

## First setup

First setup is a dedicated five-step flow: Welcome, Privacy, Appearance, Features, and Review and Apply. Its footer has exactly three actions: Back, Continue or Apply, and Finish later. Choices persist as a draft, but no runtime or file state changes before Apply. Deferring setup leaves one small Overview reminder and never blocks another workspace.

## Type, color, and structure

The Control Center inherits Discord's body type and native control behavior. Hanken Grotesk is bundled for Solcord theme surfaces; there are no remote fonts or imports. Titles use one clear scale, setting rows use short outcome-first copy, and implementation language stays inside Technical details.

Follow Discord, Solcord Dark, Solcord Light, and OLED are renderer modes. Accent, density, message shape, and motion are independent semantic preferences. Eleven optional full-shell themes remain available: Solcord Default, Obsidian Thread, Carbon Ember, Midnight Glass, Paper Signal, Threadline, Signal Block, Relay Classic, Workshop, Quiet Read, and Night Transit. Only one Solcord theme may be active at a time.

Normal text, muted text, links, success, warning, danger, selection, and focus use separate tokens. Meaning never depends on color alone. Visible body and muted copy must meet a 4.5:1 contrast target in the Control Center. Reduced motion removes nonessential transitions and always follows the operating-system preference.

The interface avoids remote imagery, decorative gradients, fake telemetry, ambient motion, nested dashboards, and walls of cards. Borders separate regions or state; they are not decoration. Healthy state collapses to a single All clear row. Empty headings and empty collections do not render.

## Launch identity

Discord owns its updater and bootstrap window, including the familiar spinner and authentication handoff. Solcord does not draw a second splash or cover recovery and sign-in surfaces. Its loading adapter remains a no-op solely to preserve the inherited startup call contract.

## Acceptance boundary

Source acceptance covers the production stylesheet in a representative static shell at dark, light, OLED, 320-pixel content width, reduced motion, long copy, setup, degraded privacy, experimental voice, Extensions, and Recovery states. It checks visible overflow, focusability, contrast, responsive containment, and duplicate workspace headings.

That fixture does not prove Discord selector compatibility, live popouts, theme interactions with a new client build, installer behavior, or the owner's profile. Live Discord acceptance remains a separate final gate.
