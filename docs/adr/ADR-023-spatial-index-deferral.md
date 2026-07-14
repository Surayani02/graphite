# ADR-023: Spatial Index (rstar) Deferred on Measured Evidence

- **Status:** Accepted (reverses the Phase 7 blueprint's approval of `rstar`)
- **Date:** 2026-07-14
- **Phase:** 7, pre-M3
- **Related:** `docs/benchmarks/phase7-baseline.md` (the evidence),
  ADR-022, Phase 7 blueprint §M3

## Context

The Phase 7 blueprint approved the `rstar` R-tree under the dependency
framework, justified by the hit-test target (<1 ms at 10 000 objects) and
the 100 k-object trajectory. That approval predated any measurement — no
benchmark had ever run on real hardware. The first reference-machine
Criterion run (2026-07-14, deliberately floor-spec: 2-core i3-1115G4,
integrated Xe graphics) changed the evidentiary basis.

## The evidence

- `hit_test_1000` measures **797 ns for a 60 %-depth hit** (the query
  point lands in shape #404 of 1 000; the reverse scan visits ~596 nodes)
  → **~1.3 ns/node**. Worst-case extrapolations: ~1.3 µs @ 1k,
  ~13–30 µs @ 10k, ~0.3–0.6 ms @ 100k. The target that motivated the
  index is met by the unaccelerated linear scan with ~50× headroom at MVP
  scale, and plausibly met at the system ceiling — on the floor-spec CPU.
- The index's other candidate workload, per-frame culling, is closed by
  the same run: `render_list_all_visible/10000` costs 331.6 µs and is
  **output-bound** (16 floats × n are written regardless of how the
  visible set is found), while the case an index would accelerate —
  mostly-culled — already costs 7.95 µs.
- Hit-tests currently fire per click, not per frame; there is no
  per-pointer-move spatial query in the product today.

## Decision

`rstar` does not ship in M3. What ships instead:

1. **The damage model** (unchanged — Finding 1 is untouched by this
   evidence; rebuild-on-create is real and its true through-worker cost
   becomes an M3 measurement, since `insert_shapes/10000` = 352 µs covers
   only the Rust half).
2. **`insert_node_at`** for order-exact undo-of-delete without rebuild.
3. **Bench semantics fixed**: the current hit-test bench measures neither
   bound. M3 adds hit-case and miss-case variants at 1k/10k/100k, so the
   extrapolations above become measurements.
4. **CI Criterion ceilings derived from the recorded baseline** rather
   than guesses.

## The re-adoption trigger

Deferral, not rejection. The index returns when a measured workload needs
it, defined now so the decision is mechanical later: **any spatial query
issued per pointer-move or per frame that exceeds 200 µs at 10 k objects
(or 1 ms at 100 k) on the reference machine.** The workloads most likely
to trip it: hover-highlight hit-testing, marquee selection, and snapping
guides — none of which exist yet. Whichever milestone ships the tripping
feature re-runs the three-question framework with its own numbers; this
ADR's evidence table is the baseline it argues against.

## Why not ship it anyway

The genuinely hard part of a spatial index is not the query — it is
**incremental maintenance on every move and resize**, a cost paid on the
60 Hz hot path to accelerate operations measured in single-digit
microseconds on the cold one. Shipping that trade today, against this
evidence, is precisely the premature optimization and unjustified
dependency the project charter forbids. The external review's Finding 2
("a naive scan is very unlikely to fit inside a sub-millisecond budget at
100 k") was reasonable a priori and is contradicted by measurement — the
correction is recorded in the review-validation document.
