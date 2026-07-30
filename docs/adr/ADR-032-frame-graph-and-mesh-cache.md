# ADR-032: Frame Graph, Interleaved Render List, and Mesh-Cache Mechanics

- **Status:** Accepted
- **Date:** 2026-07-25
- **Phase:** 8, Milestone 1 (Phases A–D)
- **Related:** ADR-031 (hybrid pipeline — the governing decision this ADR
  implements), ADR-025 (damage model), ADR-027 (dev-only surfaces),
  ADR-026 (export architecture), ADR-006 (SDF rendering)
- **Design doc:** [phase8-m1-path-pipeline.md](../design/phase8-m1-path-pipeline.md)

## Context

ADR-031 chose the hybrid pipeline and named its own gaps: "the frame
graph — pass ordering, shared target, resolve — becomes a real component
and needs its own design in Phase 8 M1, not an accretion of special
cases." This record fixes the five decisions that design forced. Each one
shapes contracts that three later milestones (path model, booleans, text)
build on, so they are recorded at decision time, before implementation.

## Decision 1 — One interleaved render list; contiguous-run batching

The renderer keeps **one** culled, paint-ordered render list from Rust.
`shape_type` gains value `2`: a path-reference record carrying world
bounds, the arena id, and the geometry version in the existing 16-float
stride. The worker splits the list into maximal contiguous runs: SDF runs
draw as instanced sub-ranges via `draw(6, count, 0, firstInstance)` —
WGSL's `instance_index` starts at `firstInstance`, so the existing shader
and storage buffer are untouched — and path records draw as meshes in
place. Ids and versions ride f32 exactly below 2^24; Rust debug-asserts
the bound (five orders of magnitude above `SYSTEM_MAX_OBJECTS`).

**Alternative rejected — depth-buffer reordering** (give every node a
depth, draw all SDF then all meshes, let the z-test sort it out): breaks
the moment any fill or stroke is translucent, which the product allows
everywhere. Correct alpha compositing requires paint order; batching must
live within it.

**Alternative rejected — two lists (SDF list + path list) with a merge
key:** two culls, two uploads, and a merge step that reinvents the order
the document already has. More code for the same draws.

The recorded worst case is a document strictly alternating shape / path,
degrading to one draw per node. It is a committed bench fixture, and the
mitigation if it ever measures as real — opaque-only depth reordering as
an optimisation pass — is noted here so it is a lever, not a rewrite.

## Decision 2 — One pass, one 4× MSAA target, export included

Both pipelines render into a single shared 4×-multisampled colour target
(sample count 4 is the WebGPU-guaranteed tier), resolved to the swap
chain; the MSAA attachment uses `storeOp: "discard"`. The SDF pass keeps
its analytic AA and simply renders multisampled; meshes get their edges
from MSAA (ADR-031 §3). **Raster export renders through the same target
configuration** — an exported PNG must match the screen sample-for-sample,
and a second, non-MSAA export path would be a permanent source of "why
does the export look different" reports.

Cost is explicit: `w × h × 16` bytes of device pixels (16.05 MiB at the
reference machine's 1255 × 838 viewport) plus resolve bandwidth. ADR-031
requires the frame-cost delta measured on the reference machine; that
capture is an M1 exit criterion.

**Captured 2026-07-25 — criterion met**
([benchmarks/phase8-m1-msaa.md](../benchmarks/phase8-m1-msaa.md)). 4× MSAA
costs **under ~0.6 ms per frame** at that viewport: the measured 10k delta
was +0.34 ms, the method's noise floor ±0.62 ms, and the resolve bandwidth
the configuration implies ~0.42 ms — three quantities in one
sub-millisecond band. Two honest limits on that number. The capture is a
_bound_, not a point estimate: neither probe scene became GPU-bound at this
resolution, so the cost could not be isolated, and a fragment-bound probe
is worth building when M4's text rendering makes fragment cost material.
And the figures are dev-mode (the stress commands are DEV-gated, ADR-027,
so a production preview cannot run them), which makes the _delta_ valid
against a same-session baseline but the absolute FPS incomparable to the
ADR-025 production baselines.

## Decision 3 — Mesh-handle tessellation boundary

wasm-bindgen returns one typed array per call, and encoding `u32` indices
into an `f32` payload is a trick with a 2^24 cliff. The boundary is an
explicit handle arena on `SceneGraph`:
`tessellate_path(id, part, tolerance) → handle`, then `mesh_positions`,
`mesh_indices`, `mesh_free`. One tessellation, three cheap crossings, no
hidden "last result" state, and the arena is unit-testable in Rust.
Tessellation dominates the crossing cost by orders of magnitude.

## Decision 4 — Bucket function, budgets, and cache bounds

Numbers ADR-031 left open, fixed here so tests and benches bind to them:

- `TOLERANCE_DEVICE_PX = 0.25`; bucket
  `clamp(floor(log2(zoom × dpr)), −4, 12)`; world tolerance
  `0.25 / 2^bucket`. Error is ≤ ¼ device pixel at a bucket floor, ≤ ½ at
  its ceiling — and dpr is part of the scale, because tolerance is defined
  in _device_ pixels, not CSS pixels.
- **Budgeted re-tessellation, stale-mesh fallback.** Cache misses are
  repaired under a per-frame budget — 2 ms while input is active, 8 ms
  idle — largest screen area first, drawing the previous mesh meanwhile.
  A bucket-crossing zoom therefore never stalls a frame; quality converges
  over the following ones. The alternative — eager re-tessellation on
  invalidation — re-derives exactly the stall ADR-031's bucketing exists
  to prevent.
- **Memory cap 64 MiB**, LRU by last-used frame, entries drawn this frame
  never evicted. Persistent breach is one of ADR-031's recorded triggers
  to reopen compute rasterisation, which is why the cap is enforced and
  counted rather than aspirational.

## Decision 5 — Engine-level fixture corpus behind a dev-only surface

M1 must render paths the product cannot yet create (the path document
model is M2). A DEV-gated `debug:load_path_fixtures` message builds a
deterministic corpus via `SceneGraph.add_path` directly — no document
nodes — and puts the worker in **fixture mode**: scene-mutating pointer
input early-returns, camera stays live, `document:new`/`document:load`
exit the mode. Command, handler, and flag compile out of production
(ADR-027's existing production-bundle assertion extends to cover it).

**Alternative rejected — pull the path `DocNode` kind forward into M1** so
fixtures ride the real document pipeline: drags the schema bump, `.graphite`
v2 migration, validation ceilings, and op semantics into a rendering
milestone, dissolving the recorded M1/M2 boundary and coupling a renderer
landing to a model landing. The stress probe precedent (ADR-027) went
through the real pipeline because the pipeline existed; here it does not
yet, and pretending otherwise via placeholder document nodes would be a
lie in the document model.

## Consequences

- `render.ts` splits: loop/scheduling stays; pass assembly moves to
  `gpu/frame.ts` behind a pure `buildDrawPlan` seam. The frame is now a
  component with tests, as ADR-031 demanded.
- The per-draw mesh uniform reserves transform room, so M2's resize
  semantics extend a struct, not the pipeline.
- Golden nets land with the first path (ADR-031's mandate): exact Rust
  mesh snapshots as the blocking primary, thresholded Playwright visual
  goldens (SwiftShader WebGPU) as the integration net, with a loud,
  annotated skip plus a reference-machine procedure if CI cannot produce
  an adapter — recorded, never silent.
- **Amendment (2026-07-30, Net 2 status).** The loud-skip fallback this
  ADR wrote down as a contingency is now the operating state. GitHub's
  runners render the corpus correctly and cannot capture it: two tolerance
  buckets produce byte-identical pixels while the engine reports no error.
  Installing the Vulkan runtime fixed an earlier device loss and is kept;
  `--enable-unsafe-swiftshader` and `--disable-gpu-sandbox` changed
  nothing. The suite now probes the capability once per worker and skips
  with an annotation when captures are indistinguishable, so a runner that
  gains the capability re-enables the gate without a code change. Net 2 is
  discharged on a reference machine —
  [benchmarks/phase8-m1-goldens.md](../benchmarks/phase8-m1-goldens.md).
  The cost is stated there rather than glossed: the pixel path (pipeline
  state, uniform layout, MSAA resolve) is unguarded between reference
  runs, while Net 1 continues to gate tessellated geometry exactly on
  every push.
- **Amendment (2026-07-25, geometry commit).** Net 1's exactness has a
  precondition this ADR did not state: _nothing upstream of a hashed byte
  may call libm_. Two cross-platform drifts proved it on the maintainer's
  Windows machine — round-join trig inside the tessellated style, then
  the fixture generator's own `cos`/`sin` — both at identical vertex and
  index counts. Hashes are therefore taken over a trig-free stroke style
  and libm-free fixture generation (`corpus::unit_dir`: half-angle
  descent plus binary rotation exponentiation, `sqrt` and arithmetic
  only), with round-arc geometry held by counts-only snapshot lines and
  by Net 2's thresholds. A `windows-2025` CI job now runs the golden
  suite so this class fails in CI rather than by hand.
- Two new CI gates arrive with implementation: `geometry` Criterion
  ceilings in `benchmarks/ceilings.json` (measured basis, ADR-023
  discipline) and the WASM size budget whose ceiling ADR-033 sets from the
  measured pre/post-lyon binary at Phase-E entry.
- The f32 id/version encoding caps both at 2^24 − 1. Documented and
  debug-asserted; revisiting it means widening the record stride, which
  this ADR's layout leaves eight reserved floats to absorb.
- **Amendment (2026-07-25, engine-integration commit).** Decision 1
  sketched the path record as `[bounds, 2, id, version, zeros]`. The
  implementation instead reuses the existing 16-float stride's _free_
  slots — id at 13 (SDF: corner radius), type at 14, version at 15 (SDF:
  pad), fill/stroke/width where SDF already carries them — so SDF
  records stay byte-identical and the host's storage buffer needs no
  change at all, which was the point of Decision 1. Slots 0–1 carry the
  node **origin** rather than the bounds minimum: culling happens in
  Rust, so the host's only spatial need is the per-draw translate
  (Decision 4's uniform), and spending those slots on it removes a
  second crossing. Bounds size stays at 2–3 for debug overlays. Path
  bounds exclude stroke inflation, matching `add_rect`'s existing
  convention rather than introducing a second one.
