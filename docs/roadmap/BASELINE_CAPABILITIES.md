# Baseline Capability Roadmap

## Performance-first order

1. **Layout Collapse** — establish region adapters and prove no work occurs while disabled.
2. **Embed Controls** — patch only the embed renderer, preserve the original React tree, and remove all patches on disable.
3. **Cross-platform Autoscroll** — use pointer events and an owned animation frame only during an active user gesture.
4. **Media Shelf** — index only user-saved local references with bounded storage and no background network work.
5. **Message Link Preview** — resolve only messages already present in loaded stores; do not fetch or mark read.

## Shared acceptance criteria

- Default disabled.
- Optional code loaded only after enablement.
- No Webpack search, listener, observer, timer, patch, or storage read while disabled.
- Structural module discovery uses multiple signals and a cached result.
- Adapter failure marks only that capability unavailable.
- Start/stop/reload cycles are idempotent and leave no owned resources.
- Keyboard, focus, reduced-motion, narrow-container, and screen-reader behavior is tested where applicable.
- Runtime measurements are recorded before promotion to `ready`.

## Status

| Capability | Model | Discord adapter | Runtime evidence | UI | Release status |
| --- | --- | --- | --- | --- | --- |
| Layout Collapse | Implemented | Reversible region CSS | Enable/disable teardown captured; region selection pending | Implemented | Preview |
| Embed Controls | Implemented | Loaded embed containers only | Automated lifecycle green; hands-on embed interaction pending | Implemented | Preview |
| Cross-platform Autoscroll | Implemented | Pointer gesture and owned animation frame | Automated lifecycle green; hands-on gesture pending | Implemented | Preview |
| Media Shelf | Implemented | Bounded local references | Automated validation green; hands-on save/remove pending | Implemented | Preview |
| Message Link Preview | Implemented | Loaded MessageStore only | Automated loaded/missing-link cases green; hands-on link hover pending | Implemented | Preview |

No row is promoted to ready until its adapter, lifecycle evidence, and row-specific live interaction are complete.
