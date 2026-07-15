# ADR-025: Damage Model — Two States, Audit-Grounded

- **Status:** Accepted
- **Date:** 2026-07-15
- **Phase:** 7, Milestone 3
- **Related:** ADR-023 (M3 rescope + measurement items), ADR-020 (the op
  funnel this plugs into), Phase 7 blueprint §M3 (the four-state contract
  this deviates from)

## Context

Before M3 the render loop paid the full pipeline every ~16.67 ms forever —
`get_render_list` (with culling), buffer upload, selection buffer, GPU
submit, `frame:rendered` — regardless of whether anything had changed. An
idle editor burned a core and a GPU queue doing nothing. Separately, the
funnel's `node:create` path rebuilt the entire scene because an
append-only SceneGraph could not splice an undone delete back into its
original stacking position (the M1 stopgap, flagged in ADR-020).

## Decision 1 — two loop states, not the blueprint's four

The blueprint contracted `Clean / NeedsSync / NeedsRender / FullRebuild`.
The render-loop audit collapsed that honestly:

- **`NeedsRender` (redraw with the existing list) cannot exist here**:
  `get_render_list` culls against the camera frustum, so any camera change
  invalidates the list itself — a uniforms-only redraw would paint stale
  culling at the viewport edges. There is no "scene valid, camera moved"
  state in this architecture.
- **`NeedsSync` (document ahead of engine) cannot exist either**: engine
  synchronisation is synchronous inside the message handlers (the funnel
  mirrors each op as it applies). No frame can observe an unsynced scene.
- **`FullRebuild` is an event, not a loop state**: it happens inline in
  `document:load`/`document:new` handling (and the funnel's all-or-nothing
  rollback), never carried across frames.

What remains is a boolean: **`sceneDirty`**. A dirty slot pays the full
pipeline and clears the flag (clear-_before_-work, so a mark landing
mid-slot survives into the next one); a clean slot pays **nothing** — no
list fetch, no upload, no submit, no message. Marking is a single
`markSceneDirty(state)` seam called wherever a frame's output can change:
the op funnel (`syncOpToEngine`), direct drag writes
(`writePosition`/`writeSize`), camera wheel + pointer pan, selection
changes (the overlay is a rendered pass), creation previews, scene
rebuilds, and viewport resizes. The helper is cheap enough that a
redundant mark costs one extra frame while a missing one costs a stale
screen — the asymmetry that decides every marginal call site.

Shipping four states to honour a pre-audit contract would have meant two
states that no code path can reach — dead machinery with a maintenance
bill. Deviation flagged per project rule, with this audit as evidence.

## Decision 2 — `frame:idle`, edge-triggered

With frames skipped, `frame:rendered` stops and the fps readout would
either freeze at a stale "60" (a lie) or decay to "0" (looks broken). The
worker posts a single **`frame:idle`** on the dirty→clean transition —
never per skipped slot, so an idle editor generates zero message traffic —
and the StatusBar shows **`idle`** in place of fps/frame-time.
`frame:rendered` resuming is the implicit wake signal. A 60 Hz heartbeat
message was rejected: it would preserve the fps number by reintroducing
per-frame work and traffic, defeating the observability of "0 submits".

## Decision 3 — append-then-move retires rebuild-per-create

The SceneGraph gains an explicit paint order (`order: Vec<NodeId>`) as the
single traversal authority — the arena stays index-addressed and ids are
still never reused (ADR-008). One new WASM function,
**`move_node_to_index(id, index)`** (clamped splice, silent no-op on a
missing id like the `set_*` family), turns creation into
_append-then-move_: `insertNodeIntoScene` mirrors rebuild's per-node block,
registers the id maps, then splices to the document's `orderIndex` — so an
undone mid-stack delete lands back exactly where it was. One function
instead of three `insert_*_at` variants keeps the WASM surface minimal.

With that, `needsRebuild` became provably dead (only create ever set it)
and was **removed end-to-end**: `syncOpToEngine` returns void,
`executeOps` returns the applied ops directly, and four caller branches —
including commitEdit's restore-selection-after-rebuild special case — are
gone. `rebuildSceneFromDocument` survives for exactly two callers:
document load/new, and the rollback path.

## Decision 4 — rebuild instrumentation is User Timing, nothing more

ADR-023 promised the _through-worker_ rebuild cost as an M3 measurement
(the 352 µs baseline covers only the Rust half). A `perf:sample` protocol
message was designed and **rejected**: with no consumer until M5, it would
ship as dead code. Instead `rebuildSceneFromDocument` wraps itself in a
`performance.measure("scene-rebuild")` — worker-timeline User Timing,
readable in any DevTools Performance recording, zero protocol or UI churn.
Capture procedure: `docs/benchmarks/README.md`. **Refinement, flagged:**
the 10 k _workload_ needs M5's seeded stress scene; until then the
instrument stands ready and real documents give lower-bound readings.

## Targets

| Target                                      | Mechanism                                                                  | Verified by                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Idle editor: **0 GPU submits**              | clean-slot skip                                                            | `render-damage.test.ts` (unit); StatusBar `idle` (observable) |
| Undo-of-delete: **no rebuild**, order-exact | append-then-move                                                           | `undoRedo.test.ts` + 9 `graph.rs` order tests                 |
| Interaction frames: 60 fps unchanged        | dirty path byte-identical to the old always-path                           | existing fps gate + reference run                             |
| Hit-test bounds measured, not extrapolated  | `hit_test_miss/{1k,10k,100k}` + `hit_test_top_10k`                         | first reference run (M3 exit)                                 |
| Regressions caught in CI                    | quick Criterion + `check-bench-ceilings.mjs` vs `benchmarks/ceilings.json` | the gate's own run log                                        |

## Consequences

- Battery/thermals: an idle Graphite tab now costs a timer tick, not a
  render pipeline. This also makes M5's stress numbers honest — measured
  frames will be _demanded_ frames.
- The `fps` stat freezes at its last real value while `idle: true`;
  consumers must key off the flag, not staleness (the bridge/`useEngine`
  merge already does).
- Criterion 0.5→0.8 (held Dependabot PR #4) should now merge with **zero
  edits**: the bench rewrite imports `std::hint::black_box` and uses only
  macros stable across both majors. Any diff on that merge is a finding.
- Analytical ceilings in `benchmarks/ceilings.json` are recalibrated from
  the first reference-machine run of the new benches — an M3 exit item.
