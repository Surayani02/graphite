# Phase 6 — Milestone 5 benchmarks

Recorded 2026-07-08 at the M5 commit. Sandbox numbers are _indicative_
(Node 22, no GPU); canonical baselines are recorded on the reference machine
per [README.md](./README.md).

## Production bundle (routing + theming + settings split)

`vite build`, minified, main chunk vs the **175 kB gzip ceiling** (raised
from 160 in ADR-017; see that ADR for the rationale):

| Asset               | M4                      | M5                      | Δ                        |
| ------------------- | ----------------------- | ----------------------- | ------------------------ |
| `index-*.js`        | 455.94 kB (142.93 gzip) | 548.09 kB (171.99 gzip) | +92.15 (**+29.06 gzip**) |
| `SettingsPage-*.js` | —                       | 3.43 kB (1.45 gzip)     | new lazy chunk           |
| `index-*.css`       | 17.77 kB (4.25 gzip)    | 19.55 kB (4.60 gzip)    | +1.78 (+0.35 gzip)       |
| `engine.worker`     | 21.27 kB                | 21.27 kB                | 0                        |

Main chunk **171.99 kB gzip < 175 kB ceiling** (~3 kB headroom). The +29 kB
is TanStack Router (framework, verified not trimmable). Settings correctly
code-splits — its 1.45 kB never loads on the editor route. Watch item
(ADR-017): if a later milestone approaches 175 kB, lazy-load the palette /
recorder modal layer (hot-path cost accepted at that point).

## Command palette open — target < 50 ms, CI gate < 150 ms

Instrumentation ships in the app (`performance.measure("graphite:palette-
open")`, ADR-015). `palette.spec.ts` now asserts it in CI: the measure
exists and its minimum is < 150 ms (flake-resistant headless gate). The true
< 50 ms reference target is measured manually on the reference machine.

| Date | Machine               | Median | Max | Source                                         |
| ---- | --------------------- | ------ | --- | ---------------------------------------------- |
| —    | reference run pending |        |     | manual protocol (docs/benchmarks/phase6-m4.md) |

## Settings route first load

Lazy chunk is 1.45 kB gzip; first navigation to `/settings` parses and
renders it. Reference target < 300 ms navigation→interactive; record on the
reference machine.

## Theme switch

Expected paint-only (CSS-variable swap, no layout). Verify no CLS in a
Playwright trace on the reference run and record here.
