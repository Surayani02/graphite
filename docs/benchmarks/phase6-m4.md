# Phase 6 — Milestone 4 benchmarks

Recorded 2026-07-07 at the M4 commit. Numbers below marked *indicative* come
from the sandboxed build environment (Node 22); per
[README.md](./README.md), canonical baselines are recorded on the reference
machine — append reference rows with the commands given.

## Fuzzy scorer

Target: **10,000 `fuzzyScore()` calls < 10 ms** — an order of magnitude
above real load (one palette keystroke ≈ 100 scores: 12 commands + capped
node results).

Indicative (sandbox, vitest bench, 355 samples):
**mean 1.41 ms / p75 1.45 ms / p99 2.14 ms** per 10,000 mixed
query×target scores — 7× headroom; one keystroke costs ~14 µs.

Reference run:

```powershell
pnpm --filter web exec vitest bench --run src/__tests__/fuzzy.bench.ts > docs/benchmarks/<date>-fuzzy.txt
```

## Command palette open — target < 50 ms

Instrumented in code, always on: `uiStore.openPalette()` marks
`graphite:palette-open:start`; `CommandPalette` marks the end on the second
`requestAnimationFrame` after opening (first painted frame) and records
`performance.measure("graphite:palette-open")`.

Structural budget backing the target: the registry is populated at module
scope (shell bootstrap), the palette is permanently mounted (opening is a
state flip, no dynamic import on the hot path), and a render shows ≤ ~20
rows.

Manual protocol (until Playwright automates it at M5): dev or preview
build → press mod+K, Escape, ×10 → in the DevTools console:

```js
performance.getEntriesByName("graphite:palette-open").map((e) => Math.round(e.duration));
```

| Date | Machine | Median | Max | Notes |
| ---- | ------- | ------ | --- | ----- |
| —    | reference run pending | | | record on first M4 session |

## Production bundle delta (react-aria-components adoption)

`vite build`, minified sizes, main chunk:

| Asset            | M3 baseline            | M4                      | Δ                        |
| ---------------- | ---------------------- | ----------------------- | ------------------------ |
| `index-*.js`     | 283.13 kB (90.99 gzip) | 455.94 kB (142.93 gzip) | **+172.81 (+51.94 gzip)** |
| `index-*.css`    | 15.40 kB (3.82 gzip)   | 17.77 kB (4.25 gzip)    | +2.37 (+0.43 gzip)       |
| `engine.worker`  | 21.27 kB               | 21.27 kB                | 0                        |

Justification and the code-splitting watch item: ADR-015 §Consequences.