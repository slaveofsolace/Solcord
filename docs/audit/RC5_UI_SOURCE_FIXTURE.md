# RC5 Control Center source fixture

## Scope

This evidence loads `src/betterdiscord/styles/solcord.css` in an isolated headless Chromium profile with representative Discord variables and Solcord DOM. It never attaches to, launches, closes, or restarts Discord and does not read the owner's profile.

The final matrix covers:

- every canonical workspace: Overview, Appearance & Accessibility, Performance, Privacy & Safety, Chat & Composer, Voice & Activities, Friends & Spaces, Extensions, and Recovery;
- the dedicated first-setup Privacy step;
- healthy, degraded, quarantine, long-copy, reduced-motion, and collapsed-Experimental states;
- dark, light, and OLED renderer modes;
- effective 100%, 125%, 150%, and 200% Windows layout boundaries;
- a real 320 CSS-pixel Control Center boundary and a 640-pixel compact-navigation viewport;
- all eleven packaged Solcord themes, loaded after the production Control Center stylesheet to match BetterDiscord's runtime cascade order.

## Result

All 24 scenarios passed the automated fixture contract:

- no document-level horizontal overflow;
- no visible clipped or internally overflowing element;
- every visible enabled control accepted programmatic focus;
- the wide rail remained beside content and responsive navigation stacked above it;
- normal, muted, navigation, setting-title, and setting-copy samples exceeded 4.5:1; the lowest measured sample was 6.35:1;
- the reduced-motion scenario resolved control transitions to `0.01ms`;
- one workspace heading was rendered whenever a normal workspace was active.

The captures were reviewed directly. Setup hierarchy, light-mode text, narrow and scaled layouts, voice warnings, recovery errors, theme-specific typography, and collapsed technical disclosures were readable and visually distinct. The expanded matrix caught and corrected two fixture defects before the final run: reversed theme cascade order and a compact section selector that always displayed Overview. Neither defect was in the production Control Center. The generated evidence is in:

`<task-output-root>/rc5-ui-fixture-matrix-final-2026-08-30`

The machine-readable scenario manifest is `manifest.json`. Its SHA-256 is `38B035D45035386B97CC141CA60EB209953AE840340A9F4DB0B13D32FE676727`. The separate artifact manifest is `<task-output-root>/rc5-ui-fixture-matrix-final-2026-08-30-evidence-manifest.json`, SHA-256 `396B8DF4D418492B01F3255EA15375A0DDCB57273579766FBD9BC93351C2BDCA`.

The exact fixture SHA-256 is `DFE8E5E4C53FDE3AD25FD044DB9E9320E5637E239CDECE9FC1809EB87F150F0D`; the renderer SHA-256 is `441C7BF61D21F6B50A4E8BD3C8BB032683732911873974DE975F4A14B4B306D9`.

## Reproduction

Run with the repository's pinned Bun 1.4.0 runtime:

```powershell
bun run verify:ui-fixture -- C:\absolute\evidence\directory
```

The renderer uses a fresh temporary Chromium profile per capture, disables background networking and component updates, and deletes only that exact temporary profile after each invocation.

## Nonclaims

This is not live Discord acceptance. It does not validate volatile Discord selectors, settings-shell ownership, popouts, modals, the installer, profile migration, Codenames, another Activity, or two clean signed-in starts. Those gates remain deferred while Discord is in use and Computer Control is out of scope.
