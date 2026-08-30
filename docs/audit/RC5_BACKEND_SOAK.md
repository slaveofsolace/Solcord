# RC5 backend lifecycle soak

This receipt covers source-only, renderer-independent lifecycle testing for the frozen RC5 source checkpoint `4fe8008e25be2cd658b9d6b14bae6f5ab52173e4`, based on `development@01a65c48f7c0317219991e50e9e279bfdff19026`.

## Exact run

- Harness: `scripts/soak-solcord-backend.ts`
- Harness SHA-256: `ccd5eab5334a3b48c37c0faea8dd33dd399be28cfc289a1b063b04ae8788e6a6`
- Embed Controls implementation SHA-256: `5888e946a6d995e7f5984ad3fb9d9b7c3e03eb70efa4ecea8c2b60674a75ebf8`
- Scenario: `all`
- Configured duration: 1,800,000 ms
- Measured duration: 1,800,092 ms
- Lifecycle cycles: 17,662
- Adapter executions: 0
- Maximum owned resources: 17
- Maximum Voice Health samples: 120
- Final heap growth: 12,263,647 bytes
- Heap-growth ceiling: 67,108,864 bytes
- Peak heap: 19,302,013 bytes
- Peak RSS: 115,965,952 bytes
- Failures: none
- Result: PASS
- Report: external release evidence `backend-soak-report.json`
- Report SHA-256: `702323120f3a3c75c3e0e81e2cf545a2f241497b2d70e48eed6e462326a93ac6`

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

- Full source matrix: 814 tests, 0 failures, 5,099 assertions.
- ESLint, Solcord CSS lint, TypeScript, and type generation: PASS.
- Repository audit: PASS after regeneration.
- Production dependency audit: 92 packages checked, 0 vulnerabilities.
- Codex Security diff scan `36cb987a-9573-46f7-93d3-f22fbb246c77`: 38/38 production or executable review items closed across eight security surfaces, zero findings.
- Two clean production builds emitted byte-identical 2,032,032-byte ASARs at SHA-256 `1b674f2a05ed07860b9fd3b46042e4e8eb80921c2f31c0434d8b661a24024d2e` for source checkpoint `4fe8008e25be2cd658b9d6b14bae6f5ab52173e4`.
- The self-contained Windows installer passed its embedded-resource and disposable lifecycle self-test. All three exact-head GitHub checks passed on PR #13.

## Nonclaims

- Discord was not launched, inspected, closed, or restarted.
- No owner profile, account, plugin directory, theme directory, installer, Activity, or external provider was touched.
- This synthetic Happy DOM run does not establish live renderer memory behavior, UI quality, selector compatibility, installer acceptance, or owner-profile acceptance.
- The RC5 release remains blocked on the deferred frontend/live acceptance matrix and exact reviewed installation.
