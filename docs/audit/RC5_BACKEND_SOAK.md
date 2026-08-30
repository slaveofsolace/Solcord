# RC5 backend lifecycle soak

This receipt covers source-only, renderer-independent lifecycle testing for the RC5 working tree based on `development@01a65c48f7c0317219991e50e9e279bfdff19026`.

## Exact run

- Harness: `scripts/soak-solcord-backend.ts`
- Harness SHA-256: `b56d8b136f9f3201a0e46846f5e4186f21f77ce34aca0907aeb0bfc8ae8007df`
- Embed Controls implementation SHA-256: `5888e946a6d995e7f5984ad3fb9d9b7c3e03eb70efa4ecea8c2b60674a75ebf8`
- Scenario: `all`
- Configured duration: 1,800,000 ms
- Measured duration: 1,800,070 ms
- Lifecycle cycles: 17,643
- Adapter executions: 0
- Maximum owned resources: 17
- Maximum Voice Health samples: 120
- Final heap growth: 12,340,876 bytes
- Heap-growth ceiling: 67,108,864 bytes
- Peak heap: 19,386,860 bytes
- Peak RSS: 113,901,568 bytes
- Failures: none
- Result: PASS
- Report: `outputs/rc5-backend-soak-exact-2026-08-30/backend-soak-report.json`
- Report SHA-256: `2df3924089993410bd74111a313eef51d6c94dceb6eeef9602ba66ad909d1cdb`

The harness repeatedly exercises all thirteen disposal resource kinds, the DOM-backed Baseline Suite, twelve V2 clean-room controllers, and Stream Audience Guard with a fake adapter. Every cycle verifies idempotent teardown, empty owned-resource counts, bounded Voice Health history, no delayed DOM residue, and zero adapter execution.

## Memory interpretation

An accelerated 20,000-cycle control and per-scenario bisect isolated most synthetic heap growth to Happy DOM node and observer allocation:

| Scenario | Cycles | Final growth | Approx. bytes/cycle |
| --- | ---: | ---: | ---: |
| Disposal only | 10,000 | 804,941 bytes | 80.49 |
| Baseline DOM suite | 10,000 | 8,816,585 bytes | 881.66 |
| V2 controllers | 10,000 | 1,532,002 bytes | 153.20 |
| Audience Guard | 10,000 | 966,036 bytes | 96.60 |
| Happy DOM control | 10,000 | 2,603,764 bytes | 260.38 |

The Baseline Suite was further split into Layout Collapse, Embed Controls, Cross-platform Autoscroll, and Message Link Preview. Embed Controls now explicitly removes every tracked click listener and injected button on teardown. The remaining synthetic growth continues to track Happy DOM allocation behavior; it is not presented as a live Discord renderer leak or as proof that no live leak exists.

## Companion gates

- Full source matrix: 784 tests, 0 failures, 4,875 assertions.
- ESLint, Solcord CSS lint, TypeScript, and type generation: PASS.
- Repository audit: PASS after regeneration.
- Production dependency audit: 92 packages checked, 0 vulnerabilities.
- Codex Security diff scan `bf2d6941-f9e1-4ddc-b370-c933c8d2f734`: 18/18 changed files reviewed, six security surfaces closed, zero findings.
- Minified diagnostic build: PASS for Solcord, main, preload, early renderer, editor preload, editor, and editor HTML.
- Production-mode build: intentionally blocked because the reviewed source is still an uncommitted working tree. The build provenance guard requires a clean commit before release packaging.

## Nonclaims

- Discord was not launched, inspected, closed, or restarted.
- No owner profile, account, plugin directory, theme directory, installer, Activity, or external provider was touched.
- This synthetic Happy DOM run does not establish live renderer memory behavior, UI quality, selector compatibility, installer acceptance, or owner-profile acceptance.
- The RC5 release remains blocked on the deferred frontend/live acceptance matrix and exact reviewed installation.
