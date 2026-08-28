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
| Layout Collapse | Implemented | Reversible region CSS | Exact-client server/channel hide and restore, restart, and zero-work teardown passed; no member rail was present on the observed `@me` route | Implemented | Ready |
| Embed Controls | Implemented | Loaded embed containers only | Exact-client controlled embed collapse/expand, restart, selector cleanup, and zero-work teardown passed; no organic embed was loaded in the observed route | Implemented | Ready |
| Cross-platform Autoscroll | Implemented | Pointer gesture and owned animation frame | A current Discord scroller moved under the owned loop and stopped on Escape; restart and zero-work teardown passed | Implemented | Ready |
| Media Shelf | Implemented | Bounded local references | Exact-client validated Discord-CDN reference save/remove passed with no navigation or background fetch | Implemented | Ready |
| Message Link Preview | Implemented | Loaded MessageStore only | Exact-client hover against a real loaded store record opened and closed a status preview; no fetch or read-state mutation occurred | Implemented | Ready |

The five rows are promoted on the exact-client evidence above plus their automated positive, missing/drift, restart, accessibility, and teardown coverage. Controlled DOM fixtures are identified explicitly and are not represented as organic message content.
