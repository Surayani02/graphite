# Phase 8 M1 — close record

The path render pipeline (ADR-031, ADR-032). Reviewed against the exit
criteria as committed in
[design/phase8-m1-path-pipeline.md](../design/phase8-m1-path-pipeline.md),
not against memory of them.

## Exit criteria

| Criterion                                                 | Status                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All CI gates green, including the two new ones            | ✅ geometry benches ceilinged from a measured reference run (10 `geometry::*` entries); WASM budget armed at 80 kB against a measured 64.62 kB. A third gate was added during the close: dev-surface exclusion                                                                                        |
| Golden nets live and blocking                             | ⚠️ **Net 1 blocking everywhere** (exact Rust mesh snapshots, portable by construction). **Net 2 reference-machine verified, annotated skip in CI** — runners render but cannot capture. Recorded in [benchmarks/phase8-m1-goldens.md](../benchmarks/phase8-m1-goldens.md) and as an ADR-032 amendment |
| Invariants D.5 asserted in the suite                      | ✅ all six — 1/2 by tessellation call counts against the real repair loop, 3 by draw-plan ordering, 4 by cache accounting, 5 by measured mesh area in Rust, 6 by the new build gate                                                                                                                   |
| MSAA reference capture recorded                           | ✅ [benchmarks/phase8-m1-msaa.md](../benchmarks/phase8-m1-msaa.md) — a _bound_ (< ~0.6 ms) rather than an isolated cost, with the reason stated                                                                                                                                                       |
| Fixture corpus renders correctly on the reference machine | ✅ verified by eye on two machines and two adapters: fill rules, stroke matrix, curve refinement across buckets, and the interleaved strip                                                                                                                                                            |
| Status docs updated                                       | ✅                                                                                                                                                                                                                                                                                                    |

**M1 is complete**, with Net 2 carried by a documented reference-machine
procedure rather than CI. That is a real reduction in automated coverage
and is stated as such, not smoothed over.

## Two criteria that were not met until the close

Worth recording because both were nearly signed off on:

- **D.5-1/2 had no assertion.** The cache's unit tests proved `status()`
  returns `"fresh"`, which is a different statement from "the loop
  therefore does not tessellate". `repairMeshes.test.ts` now asserts the
  call counts against the real function: zero on an unchanged frame, zero
  on a pan, zero within a bucket, at most one per path across a boundary.
- **D.5-6 had no assertion.** Production exclusion had been checked by
  grepping a build by hand — which is how the corpus-in-production bug was
  found in the first place. `scripts/check-dev-surfaces.mjs` makes that
  grep a gate.

Both were exit criteria I wrote, and both would have passed review on the
strength of adjacent tests that did not actually cover them.

## Delivered

Two precondition commits (`@graphite/document-model` extraction, ADR-030;
startup budgets, ADR-033), then: the `graphite-geometry` crate with lyon
behind a §D.1 contract and libm-free golden hashing; engine path nodes,
the mesh-handle arena and path render records; the frame graph with a
shared 4× MSAA target including export parity; the mesh pipeline; the draw
planner and mesh cache; the dev fixture corpus; and both golden nets.

**Tests:** 418 web + 114 Rust. **Gates:** 8 (bundle closure, WASM, geometry
and engine bench ceilings, dev-surface exclusion, Windows golden
portability, plus the standing typecheck/lint/format/test set).

## Carried into M2 — open, not forgotten

1. **Net 2 is not in CI.** The pixel path — pipeline state, uniform layout,
   MSAA resolve — is unguarded between reference runs. Net 1 and the
   engine contract tests cover tessellated geometry exactly, which is the
   larger share but not all.
2. **Palette interaction under a live engine.** Two CI failures in ways
   that do not reproduce without an adapter; mechanism never established;
   an earlier explanation was recorded and retracted as wrong. Needs a
   reproduction, not another inference.
3. **100k render-path throughput.** A discarded capture measured 10 fps
   with ~6.4 MB of render list per frame — the first counter-evidence to
   ADR-023's measured deferral of the spatial index.
4. **The MSAA figure is a bound**, not an isolated cost: no probe scene
   became GPU-bound at the reference viewport. Worth revisiting when M4's
   text makes fragment cost material, or on a high-dpr display.
5. **Reference machine changed** mid-milestone (i3-1115G4 → i3-6006U).
   Ceilings carry 8–16× margin so gates hold, but any new capture must
   name its machine.
6. **Hit-testing on paths is bounds-only.** Deliberate: exact winding
   hit-tests arrive with the path model in M2, which is also when a tool
   can first select one.
7. **Dashes excluded** from `StrokeStyle` — they need lyon_algorithms'
   path measure and land with C1.15 in M2+.

## What M2 inherits

The document model does not know paths exist. M2 adds `DocNodeKind`
`"path"`, the `.graphite` v2 migration, path ops, and the pen tool — at
which point the fixture corpus can be retired in favour of real documents,
and hit-testing can become exact.
