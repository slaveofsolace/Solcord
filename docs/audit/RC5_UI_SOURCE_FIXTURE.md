# RC5 Control Center source fixture

## Historical 118250cc scope

This evidence loads `src/betterdiscord/styles/solcord.css` from source checkpoint `118250cc463ca571181bda7a7baece21258d5e6a` in an isolated headless Chromium profile with representative Discord variables and Solcord DOM. It never attaches to, launches, closes, or restarts Discord and does not read the owner's profile.

The checkpoint matrix covered:

- every canonical workspace: Overview, Appearance & Accessibility, Performance, Privacy & Safety, Chat & Composer, Voice & Activities, Friends & Spaces, Extensions, and Recovery;
- the dedicated first-setup Privacy step;
- healthy, degraded, quarantine, long-copy, reduced-motion, and collapsed-Experimental states;
- dark, light, and OLED renderer modes;
- effective 100%, 125%, 150%, and 200% Windows layout boundaries;
- a real 320 CSS-pixel Control Center boundary and a 640-pixel compact-navigation viewport;
- all eleven packaged Solcord themes, loaded after the production Control Center stylesheet to match BetterDiscord's runtime cascade order.

## Result

All 26 checkpoint scenarios passed the automated fixture contract:

- no document-level horizontal overflow;
- no visible clipped or internally overflowing element;
- every visible enabled control accepted programmatic focus;
- the wide rail remained beside content and responsive navigation stacked above it;
- normal, muted, navigation, setting-title, and setting-copy samples exceeded 4.5:1; the lowest measured sample was 6.35:1;
- the reduced-motion scenario resolved control transitions to `0.01ms`;
- one workspace heading was rendered whenever a normal workspace was active.

The checkpoint captures were reviewed directly. Setup hierarchy, light-mode text, narrow and scaled layouts, voice warnings, recovery errors, theme-specific typography, and collapsed technical disclosures were readable and visually distinct. The expanded matrix caught and corrected two fixture defects before the checkpoint run: reversed theme cascade order and a compact section selector that always displayed Overview. Neither defect was in the production Control Center. This is preserved historical evidence for `118250cc`; the current modified fixture, renderer, stylesheet, panel, and tests require a new exact-source run after source freeze. The generated checkpoint evidence is in:

`<task-output-root>/solcord-ui-fixture`

The machine-readable scenario manifest is `manifest.json`. Its SHA-256 is `678a1f3c6b1601b16f227ba45be26373e91b1f836dc1d4ba3af2763470121be6`. It records 26 passing scenarios and was generated at `2026-08-30T21:41:01.907Z`. This source receipt does not claim a separate final-release artifact manifest; that hash binding is created with the frozen release evidence.

The exact fixture SHA-256 is `b6ef8faa75ce70ae3a5eb56088aff5d4dd242395f33dd25c6fdcb8fd2fecd26d`; the renderer SHA-256 is `8ccba52370616bd3c10387ec674bdb898ac05763e0e2d4bd66af8eb83299de77`.

## Reproduction

Run with the repository's pinned Bun 1.4.0 runtime:

```powershell
bun run verify:ui-fixture -- "<absolute-evidence-directory>"
```

The renderer uses a fresh temporary Chromium profile per capture, disables background networking and component updates, and deletes only that exact temporary profile after each invocation.

## Nonclaims

This historical fixture is not current-source or live Discord acceptance. It does not validate the modified Control Center sources, volatile Discord selectors, settings-shell ownership, popouts, modals, the installer, profile migration, Codenames, another Activity, or two clean signed-in starts. Those gates require new exact-candidate receipts.
