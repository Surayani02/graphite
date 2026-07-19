# Phase 7 Baseline — First Reference-Machine Run

- **Date:** 2026-07-14
- **Tree:** `f94d1c5` (Phase 7 M2 merged)
- **Command:** `cargo bench --all` (Criterion 0.5, `bench` profile, release-optimised)
- **Machine:** the reference machine (see README) — deliberately a floor-spec
  environment: if the targets hold here, they hold broadly.

This is the first empirical performance data ever recorded for this project
— every prior number was a design target. Recorded verbatim from the run
(Criterion middle estimates; full three-value ranges in the run output):

| Benchmark                                |      n | Time (mid) | Per node |
| ---------------------------------------- | -----: | ---------: | -------: |
| `engine::version`                        |      — |   34.99 ns |        — |
| `scene_graph::insert_shapes`             |    100 |    1.34 µs |  13.4 ns |
|                                          |  1 000 |    7.51 µs |   7.5 ns |
|                                          | 10 000 |  352.18 µs |  35.2 ns |
| `scene_graph::set_stroke_100`            |    100 |    1.37 µs |  13.7 ns |
| `scene_graph::render_list_all_visible`   |    100 |    1.83 µs |  18.3 ns |
|                                          |  1 000 |   15.25 µs |  15.3 ns |
|                                          | 10 000 |  331.62 µs |  33.2 ns |
| `scene_graph::render_list_mostly_culled` |    100 |  353.31 ns |        — |
|                                          |  1 000 |    1.27 µs |        — |
|                                          | 10 000 |    7.95 µs |        — |
| `scene_graph::hit_test_1000`             |  1 000 |  797.42 ns | ~1.3 ns¹ |
| `scene_graph::remove_node_1000`          |  1 000 |    5.97 µs |        — |

¹ **Read this row carefully.** The bench queries `(500, 500)` against the
mixed grid, which lands inside shape #404's inscribed ellipse — the reverse
(topmost-first) scan therefore visits ~596 of 1 000 nodes before returning.
This is a **60 %-depth hit, not a worst case**. Per-node cost ≈ 1.3 ns
(L2-resident). Derived estimates, to be replaced by direct measurements when
M3 extends the bench with miss-case and 10k/100k variants:
worst-case full scan ≈ **1.3 µs @ 1k**, ≈ **13–30 µs @ 10k**,
≈ **0.3–0.6 ms @ 100k** (cache-hierarchy dependent).

## Reading against the Blueprint targets

- **Hit-test < 1 ms @ 10k**: met by the _unaccelerated linear scan_ with
  ~50× headroom (est. 13–30 µs); even the 100k estimate fits under 1 ms on
  this floor-spec CPU. The target that motivated the Phase 7 R-tree is
  already satisfied without one — see ADR-022 for the consequence.
- **Render-list build (per frame)**: 331.6 µs @ 10k all-visible = 2 % of the
  16.67 ms frame budget; 7.95 µs when mostly culled. The all-visible cost is
  **output-bound** (16 floats × n written regardless of any acceleration
  structure), so a spatial index cannot meaningfully reduce it; the case an
  index _would_ accelerate is already at 8 µs.
- **Full-rebuild cost proxy** (`insert_shapes/10000` = 352 µs Rust-side):
  the real `rebuildSceneFromDocument` adds per-node WASM boundary crossings
  on top, so the true rebuild-on-create cost (Finding 1 / M3 damage-model
  scope) needs its own measurement through the worker — queued for M3's
  bench work rather than inferred from this proxy.
- Per-node insert cost rises 7.5 → 35 ns between 1k and 10k (working set
  leaving L1/L2) — worth re-checking at 100k when the bench extends.

## Outstanding to complete the baseline row

The TypeScript columns (`document.bench`, `ops.bench`, `format.bench`,
`protocol.bench`) still need one reference-machine run:

```powershell
pnpm --filter @graphite/protocol exec vitest bench --run > docs/benchmarks/2026-07-14-protocol.txt
pnpm --filter @graphite/web exec vitest bench --run > docs/benchmarks/2026-07-14-web.txt
```
