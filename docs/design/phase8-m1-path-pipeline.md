# Phase 8 M1 — Path Render Pipeline: Design and Contracts

- **Status:** Phases A–D delivered for approval; Phase E (implementation)
  opens on sign-off
- **Date:** 2026-07-25
- **Governed by:** [ADR-031](../adr/ADR-031-general-path-rendering.md)
  (pipeline decision), [ADR-032](../adr/ADR-032-frame-graph-and-mesh-cache.md)
  (the integration decisions made in this design),
  [ADR-025](../adr/ADR-025-damage-model.md) (damage model),
  [ADR-027](../adr/ADR-027-dev-only-surfaces.md) (dev-only surfaces)
- **Milestone scope (recorded in the
  [integration blueprint §4](../roadmap/INTEGRATION-BLUEPRINT.md)):**
  geometry crate, tessellation, mesh cache, frame graph, SDF fast path
  preserved. Rendering-only tests; no new UI. The path _document model_
  and pen tool are Phase 8 M2; booleans are M3.

## A. Requirements

**Functional.**

1. The engine renders arbitrary vector paths: multiple contours, cubic
   Bézier segments, open and closed, holes and self-intersections, under
   both `nonzero` and `evenodd` fill rules.
2. Paths take a solid fill, a stroke of uniform width with butt/round/square
   caps, miter/round/bevel joins and a miter limit. Dash patterns are
   **out**: lyon's stroke tessellator does not dash on its own — dashing is
   a path-measure pre-pass (`lyon_algorithms`) and lands with the rest of
   C1.15 alongside the stroke _model_ in M2+.
3. Rectangles and ellipses keep the SDF instanced fast path unchanged —
   same shader, same analytic AA, same cost (ADR-031 §1).
4. Paths and SDF shapes composite in exact document paint order, with
   correct alpha blending between them.
5. Rendering rides the existing damage model (ADR-025): an idle editor with
   paths on screen costs nothing; a camera pan re-draws from cached meshes
   without re-tessellating.
6. The whole frame — both passes — is antialiased coherently: SDF analytic
   AA plus 4× MSAA for meshes, resolved into one image (ADR-031 §3). Raster
   export renders through the same target configuration so exported pixels
   match the screen.
7. Verification surfaces, no product UI: a dev-only fixture corpus behind a
   Debug palette command (ADR-027 pattern), Rust golden mesh snapshots, and
   thresholded visual goldens.

**Explicitly out of scope for M1** (and therefore untouched): `DocNode`,
`DocumentOp`, `NodePatch`, `validate.ts` ceilings, the `.graphite` format
and its version, SVG export, the Inspector, hit-testing of paths, and every
tool. All of these arrive with the path _model_ in M2, where the schema
bump ships with its migration in the same milestone (ADR-030).

**Non-functional (targets before implementation — see §Benchmarks).**
1k-segment tessellation < 4 ms; cache hit < 0.1 ms; ≥ 60 FPS at the 10k
stress target with MSAA enabled; bounded re-tessellation per frame; bounded
mesh-cache memory; WASM growth measured and budgeted.

## B. Architecture

### B.1 Layer placement

Unchanged in shape, extended in content:

- **`packages/geometry` (new Rust crate, `graphite-geometry`).** Pure
  geometry: path types, lyon fill/stroke tessellation, bounds. No
  wasm-bindgen surface of its own — per the module map, `geometry` is an
  internal crate that `graphite-engine` depends on and re-exports through
  the existing single WASM artifact. Independently `cargo test`-able and
  `cargo bench`-able.
- **`packages/engine`.** `NodeKind::Path` joins the scene graph; the
  wasm-bindgen surface gains `add_path`, a mesh-handle tessellation API,
  and `geometry_version`. The render list gains a third record kind.
- **Worker (`apps/web/src/workers/engine/`).** Owns the GPU consequences:
  the multisampled target, the second (mesh) pipeline, the mesh cache, and
  the frame graph that interleaves both passes in paint order.
- **React / protocol.** No product surface. One DEV-gated protocol message
  loads the fixture corpus; it compiles out of production exactly as
  `debug:load_stress` does (ADR-027).

### B.2 The interleaved render list (ADR-032 §1)

Paint order is the whole problem: one document list contains SDF shapes
and paths interleaved, and z-correct alpha blending forbids reordering.
The design keeps **one** culled, paint-ordered list from Rust and teaches
the worker to split it into contiguous runs:

- `get_render_list` keeps its 16-float stride. `shape_type` gains value
  `2` — a **path reference record**: world bounds in floats 0–3 (already
  used for culling engine-side), `2` in float 4, the arena id in float 5,
  the geometry version in float 6, zeros reserved in 7–15. Ids and versions
  ride f32 exactly below 2^24 — five orders of magnitude above
  `SYSTEM_MAX_OBJECTS`, debug-asserted in Rust.
- The worker walks the list once and builds a **draw plan**: maximal runs
  of SDF records become instanced sub-draws
  `draw(6, runLength, 0, runStart)` — `instance_index` starts at
  `firstInstance` in WGSL, so the existing shader indexes the existing
  storage buffer with **zero** changes to either; each path record becomes
  one or two mesh draws (fill, then stroke).
- Upload is unchanged: one buffer, one `writeBuffer`, grown by doubling.
  A pure `buildDrawPlan(list)` function is the unit-test seam.

The pathological cost is a document alternating shape/path/shape/…, which
degrades to one draw per node. That is a bench scenario, not a design
blocker — see §Benchmarks and the ADR-032 record of the rejected depth-buffer
reordering alternative.

### B.3 The frame graph (ADR-032 §2)

`render.ts` currently draws straight into the swap-chain texture. M1
formalises the frame as a small explicit graph in `gpu/frame.ts`:

1. **Acquire targets** (`gpu/targets.ts`): one shared 4× multisampled
   colour texture at viewport size, recreated on resize; the swap-chain
   view is the resolve target. The MSAA attachment uses
   `storeOp: "discard"` — only the resolved image survives, saving
   bandwidth.
2. **One render pass, two pipelines**: clear → interleaved SDF/mesh draws
   from the plan → selection overlay draw (unchanged) → resolve.
3. **Export** rebuilds its offscreen path the same way — 4× target
   resolved into the copyable `rgba8unorm` texture — so ADR-026 exports
   match the screen sample-for-sample.

Both pipelines set `multisample: { count: 4 }`. Memory cost is
`width × height × 4 samples × 4 bytes` of device pixels — ≈ 16.8 MiB at
the reference machine's 1366×768@1×, ≈ 33 MiB at 1920×1080@1×. ADR-031
requires the MSAA frame-cost delta measured against the ADR-025 baselines
at 10k and 100k on the reference machine; that capture is an M1 exit
criterion and lands in `docs/benchmarks/`.

### B.4 Mesh pipeline

- **Vertex format:** `float32x2` position, **node-local** coordinates.
  Meshes therefore survive node moves untouched: translation rides a
  per-draw uniform, so a drag re-draws cached meshes and re-tessellates
  nothing. (Resize semantics for paths are an M2 model decision; the
  uniform block reserves room for a full 2×3 transform so M2 extends it
  without touching the pipeline.)
- **Per-draw data:** one frame-persistent uniform buffer, 256-byte-aligned
  slots bound with dynamic offsets — `{ translate: vec2f, color: vec4f }`
  per draw, colours converted from the protocol's u8 `Color` at this call
  site exactly as its doc comment mandates. Buffer grows by doubling, like
  the shape buffer.
- **Index format:** `uint32`.
- **Shader:** `gpu/meshShader.ts` — camera uniform shared with the SDF
  pass (same `cameraBuffer`), position transform identical to the SDF
  vertex math, flat colour fragment; MSAA supplies the edges.

### B.5 Tessellation boundary (ADR-032 §3)

wasm-bindgen cannot return `(Vec<f32>, Vec<u32>)` in one call, and
smuggling indices through floats is an encoding trick waiting to bite.
The boundary is an explicit **mesh handle** API on `SceneGraph`:

```
tessellate_path(id, part, tolerance) → handle   // part: 0 fill, 1 stroke
mesh_positions(handle) → Float32Array           // xy pairs, node-local
mesh_indices(handle) → Uint32Array
mesh_free(handle)
```

One tessellation, three cheap crossings, no hidden state: the handle store
is an explicit arena the worker frees after GPU upload. Tessellation cost
dominates the crossings by orders of magnitude.

### B.6 Tolerance buckets and the mesh cache (ADR-032 §4)

- **Quality constant:** `TOLERANCE_DEVICE_PX = 0.25` — flattening error at
  most a quarter device pixel at a bucket's floor, at most half a pixel at
  its ceiling.
- **Bucket:** `clamp(floor(log2(zoom × dpr)), −4, 12)`. Zoom spans
  0.1–512 and dpr up to 3, so the clamp has margin at both ends. World
  tolerance passed to lyon: `0.25 / 2^bucket`, in the node-local frame.
- **Cache key per node:** `(geometryVersion, bucket)` exactly as ADR-031
  fixes; entries hold fill and stroke GPU meshes plus byte accounting.
- **Invalidation:** compared at draw time — no plumbing. An edit bumps the
  version (Rust-side, O(1)); a zoom past a power-of-two boundary shifts
  the bucket; either mismatch marks the entry stale.
- **Budgeted re-tessellation with stale fallback:** stale meshes are
  **still drawn** while fresh ones are produced under a per-frame budget —
  `2 ms` while input is active, `8 ms` otherwise — ordered by screen area,
  largest first. A zoom across a bucket boundary therefore never stalls a
  frame; quality catches up over the next few. A path with no mesh at all
  (first appearance) skips its draw until its turn arrives — visible only
  on massive cold loads, bounded by the idle budget.
- **Memory:** LRU over total mesh bytes, cap `64 MiB`, entries used this
  frame never evicted. Breaching this cap persistently is one of ADR-031's
  recorded triggers to reopen compute rasterisation.

### B.7 Fixture corpus and fixture mode (ADR-032 §5)

M1 must render paths the product cannot yet create. A DEV-gated
`debug:load_path_fixtures` message (ADR-027 pattern; command
`debug.pathFixtures`) builds a deterministic corpus **at the engine
level** — `SceneGraph.add_path` directly, no document nodes — mixing SDF
shapes between paths to exercise run-splitting. Because these scene nodes
have no document backing, the worker enters **fixture mode**:
scene-mutating pointer paths (select, move, create) early-return; camera
pan/zoom/wheel remain live for inspection and for the zoom-bucket golden
scenes. `document:new` / `document:load` exit fixture mode. The flag, the
handler, and the command are all compiled out of production builds.

Corpus (deterministic, seed-fixed where randomised): triangle; five-point
star under `nonzero` **and** `evenodd`; figure-eight self-intersection;
donut (two contours, hole); open polyline through the full cap × join
matrix; a miter-limit spike pair (clamped vs unclamped); one long
single-cubic; a 1,024-segment quantised blob (the bench shape); and an
SDF/path alternating strip for the batching worst case.

## C. File Structure (Phase E map)

New and changed files, honouring the ~250-line file law:

```
packages/geometry/
  Cargo.toml                     graphite-geometry; deps: lyon (workspace-pinned)
  src/lib.rs                     re-exports; crate docs
  src/types.rs                   PathPoint, Contour, PathGeometry, FillRule,
                                 StrokeStyle, LineCap, LineJoin, Mesh
  src/fill.rs                    lyon fill adapter
  src/stroke.rs                  lyon stroke adapter
  src/bounds.rs                  control-polygon bounds (conservative, cull-grade)
  benches/geometry.rs            Criterion: tessellate fill/stroke × segment counts
  tests/golden.rs                golden mesh snapshots (Net 1)
  tests/goldens/*.snap           committed snapshot data

packages/engine/
  Cargo.toml                     + graphite-geometry dependency
  src/scene/node.rs              + NodeKind::Path { geometry, fill, stroke,
                                   stroke_style, geometry_version }
  src/scene/graph.rs             + add_path, geometry_version, path-ref records
                                   in get_render_list
  src/scene/mesh_store.rs        new — tessellation handle arena (§B.5)

apps/web/src/workers/engine/
  gpu/targets.ts                 new — MSAA target lifecycle
  gpu/meshShader.ts              new — mesh WGSL
  gpu/meshPipeline.ts            new — mesh pipeline + per-draw uniform ring
  gpu/meshCache.ts               new — buckets, cache, budget scheduler, LRU
  gpu/frame.ts                   new — draw plan + frame graph (pass assembly)
  gpu/render.ts                  slimmed — loop/scheduling only; frame body
                                   moves to frame.ts (stays under the file law)
  scene/fixtures.ts              new — DEV-gated corpus builder + fixture mode

packages/protocol/src/index.ts   + debug:load_path_fixtures (DEV-gated member)
apps/web/src/features/commands/builtin/debugCommands.ts   + debug.pathFixtures

apps/web/e2e/golden.spec.ts      new — Net 2 visual goldens
apps/web/e2e/goldens/*.png       committed visual goldens
apps/web/playwright.config.ts    + "golden" project with WebGPU flags

scripts/check-wasm-size.mjs      new — WASM budget gate (ceiling set from
                                   measurement in ADR-033 at Phase-E entry)
.github/workflows/ci.yml         + geometry bench invocation + WASM gate
benchmarks/ceilings.json         + geometry::* entries (measured basis)
docs/benchmarks/phase8-m1-msaa.md  capture procedure + reference results
```

Engine-stub note: the container's hand-written
`packages/engine/pkg/graphite_engine.{d.ts,js}` stub gains the six new
`SceneGraph` methods; the real surface is `cargo`-verified on the
reference machine as always.

## D. Interfaces and Contracts

### D.1 `graphite-geometry` (Rust, pure)

```rust
/// Anchor with absolute-coordinate handles. A corner point is exactly
/// `h_in == h_out == anchor` — no Option branches in the math.
pub struct PathPoint { pub x: f32, pub y: f32,
    pub h_in_x: f32, pub h_in_y: f32, pub h_out_x: f32, pub h_out_y: f32 }

pub struct Contour { pub closed: bool, pub points: Vec<PathPoint> } // len ≥ 2
pub enum FillRule { NonZero, EvenOdd }
pub struct PathGeometry { pub contours: Vec<Contour>, pub fill_rule: FillRule }

pub enum LineCap  { Butt, Round, Square }
pub enum LineJoin { Miter, Round, Bevel }
pub struct StrokeStyle { pub width: f32, pub cap: LineCap,
    pub join: LineJoin, pub miter_limit: f32 }

/// Triangle mesh in the path's local frame. `positions` is xy-interleaved.
pub struct Mesh { pub positions: Vec<f32>, pub indices: Vec<u32> }

pub enum TessellationError { Degenerate, TooManyVertices, Internal(String) }

pub fn tessellate_fill(g: &PathGeometry, tolerance: f32)
    -> Result<Mesh, TessellationError>;
pub fn tessellate_stroke(g: &PathGeometry, s: &StrokeStyle, tolerance: f32)
    -> Result<Mesh, TessellationError>;
/// Control-polygon bounds (anchors ∪ handles) — conservative, exact enough
/// for culling; never smaller than the true ink extents of the fill.
pub fn bounds(g: &PathGeometry) -> Option<[f32; 4]>;   // x, y, w, h
```

### D.2 `graphite-engine` additions (wasm-bindgen surface)

```rust
impl SceneGraph {
    /// Flat boundary encoding: `contour_descs` is `[point_count, closed]`
    /// pairs; `points` is 6 f32 per point (§D.1 field order). Initial
    /// geometry_version is 1. Returns the arena id.
    pub fn add_path(&mut self, x: f32, y: f32,
        contour_descs: &[u32], points: &[f32], fill_rule: u8,
        fill_r: u8, fill_g: u8, fill_b: u8, fill_a: u8,
        stroke_r: u8, stroke_g: u8, stroke_b: u8, stroke_a: u8,
        stroke_width: f32, cap: u8, join: u8, miter_limit: f32) -> u32;

    /// 0 for non-path nodes; bumped by every geometry edit (M3+).
    pub fn geometry_version(&self, id: u32) -> u32;

    /// part: 0 = fill, 1 = stroke. u32::MAX on error/absent part.
    pub fn tessellate_path(&mut self, id: u32, part: u8, tolerance: f32) -> u32;
    pub fn mesh_positions(&self, handle: u32) -> Vec<f32>;
    pub fn mesh_indices(&self, handle: u32) -> Vec<u32>;
    pub fn mesh_free(&mut self, handle: u32);
}
```

`get_render_list` contract change: path nodes emit the §B.2 path-reference
record; existing SDF records are byte-identical to today.

### D.3 Protocol (single DEV-gated addition)

```ts
// MainToEngineMessage — Phase 8 Milestone 1
| {
    /** Dev-only (ADR-027): replace the scene with the deterministic path
     *  fixture corpus at the engine level — no document nodes exist yet
     *  (the path model is M2) — and enter fixture mode: scene-mutating
     *  pointer input is ignored; camera stays live. Compiled out of
     *  production builds on both ends. */
    readonly type: "debug:load_path_fixtures";
  }
```

### D.4 Worker (TypeScript, pure seams first)

```ts
// gpu/meshCache.ts
export const TOLERANCE_DEVICE_PX = 0.25;
export const RETESS_BUDGET_ACTIVE_MS = 2;
export const RETESS_BUDGET_IDLE_MS = 8;
export const MESH_CACHE_MAX_BYTES = 64 * 2 ** 20;

export function toleranceBucket(zoom: number, dpr: number): number;
export function worldTolerance(bucket: number): number;

export interface GpuMesh {
  readonly vertexBuffer: GPUBuffer;
  readonly indexBuffer: GPUBuffer;
  readonly indexCount: number;
  readonly bytes: number;
}
export interface MeshCacheEntry {
  version: number;
  bucket: number;
  fill: GpuMesh | null;
  stroke: GpuMesh | null;
  bytes: number;
  lastUsedFrame: number;
}
export type MeshStatus = "fresh" | "stale" | "missing";

// gpu/frame.ts
export interface SdfRun {
  readonly kind: "sdf";
  readonly start: number;
  readonly count: number;
}
export interface PathDraw {
  readonly kind: "path";
  readonly engineId: number;
  readonly version: number;
  readonly boundsIndex: number;
}
export type DrawItem = SdfRun | PathDraw;
export function buildDrawPlan(list: Float32Array): readonly DrawItem[];
```

`EngineState` gains: `msaaTexture`, `msaaView`, `meshPipeline`,
`meshUniformBuffer` (+ bind group), `meshCache: Map<number, MeshCacheEntry>`,
`meshCacheBytes: number`, `fixtureMode: boolean`, `lastInputAt: number`.

### D.5 Contract invariants (tested, not aspirational)

1. A frame with an unchanged scene and camera issues **zero**
   `tessellate_path` calls.
2. A camera pan issues zero `tessellate_path` calls; a zoom within a
   bucket issues zero; a zoom across one boundary re-tessellates each
   visible path at most once.
3. Draw order equals paint order for every SDF/path interleaving.
4. Byte total of cached meshes never exceeds the cap after eviction, and
   an entry drawn this frame is never evicted.
5. Fill-rule fixtures: the evenodd star has a hole; the nonzero star does
   not; the donut has a hole under both.
6. Production bundles contain neither the fixture command nor the handler
   (existing ADR-027 assertion extended).

## Phase E–H Plan (opens on approval)

Two **precondition commits land first, before any feature code** — each
standalone, each suite-proved:

- **PC-1 — `@graphite/document-model` extraction** (ADR-030). Pure move,
  zero behaviour change. Sequencing note, flagged honestly: the decisions
  round positioned this "before M1 opens"; since M1's opening deliverable
  is this document (no code), the regression-isolation rationale binds it
  to precede feature _code_, which it does — it is simply first in Phase E.
  M2's schema work makes it mandatory by then regardless.
- **PC-2 — code splitting + budget lines** (new ADR-033 at decision time):
  route/feature-level splits to restore main-chunk headroom (currently
  ~12 kB under the 190 kB ceiling), plus the WASM size gate with its
  ceiling set from the measured pre/post-lyon binary — never guessed.

Then, gate-green at every step: geometry crate + Criterion + Rust goldens
→ engine additions (+ stub update) → targets/MSAA + export parity → mesh
pipeline → cache + budget scheduler → draw plan + frame graph → fixtures +
fixture mode → visual goldens + CI wiring → MSAA reference capture →
docs/status. Full-file zip delivery per standing practice.

## Tests

- **Rust (`geometry`):** determinism (same input → identical mesh);
  fill-rule table (§D.5-5); degenerate inputs (single point, zero-length
  handles, collinear contour) return `Degenerate`, never panic; cap × join
  matrix produces non-empty, finite meshes; miter-limit clamps; bounds ⊇
  flattened extents (property-checked across the corpus). Golden snapshots:
  vertex/index counts + position hash quantised at 1e-3 (absorbs float
  association noise, catches real geometry drift); `GOLDEN_UPDATE=1`
  regeneration documented in the test header.
- **Rust (`engine`):** add_path flat-encoding round-trip; version starts
  at 1 and is 0 for non-paths; render-list path-ref record layout; handle
  arena free/reuse; f32-safe id/version debug assertions.
- **Vitest (worker):** `toleranceBucket` table incl. clamp ends and dpr;
  `buildDrawPlan` on empty / all-SDF / all-path / alternating lists;
  cache decision matrix (version × bucket × presence → status); budget
  scheduler with a stubbed clock (area ordering, active vs idle budgets,
  stale-served accounting); LRU eviction respecting invariant D.5-4;
  integration through the existing `vi.mock` harness asserting invariants
  D.5-1/2 via `tessellate_path` call counts.
- **Playwright:** fixture command renders (smoke); **golden project** —
  corpus at three zooms spanning a bucket boundary, `maxDiffPixelRatio`
  0.01 against committed PNGs, Chromium launched with
  `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader`. If the CI
  runner cannot produce a WebGPU adapter, the project skips **loudly**
  (annotated in the run summary) and the reference-machine capture
  procedure in `docs/benchmarks/phase8-m1-msaa.md` carries the golden
  duty — recorded, never silent.
- Coverage floors: recalibrated from measured actuals minus the standing
  ~3-point churn margin after the new modules land.

## Benchmarks

| Bench                                            | Target                                     | Source of target      |
| ------------------------------------------------ | ------------------------------------------ | --------------------- |
| `geometry::tessellate_fill/{64,256,1024}`        | 1,024-segment path < 4 ms (reference)      | Blueprint §3          |
| `geometry::tessellate_stroke/{64,256,1024}`      | tracked; ceiling from measurement          | ADR-031               |
| Cache hit (`meshCache.bench.ts`, Vitest)         | < 0.1 ms                                   | Blueprint §3 ¹        |
| 10k stress, MSAA on, reference machine           | ≥ 60 FPS; delta vs ADR-025 baseline logged | ADR-031 consequence   |
| Alternating SDF/path strip (fixture)             | measured; recorded as batching worst case  | ADR-032 §1            |
| Zoom sweep across buckets (fixture, frame trace) | no frame > 16.67 ms at corpus scale        | ADR-031 §4            |
| WASM binary pre/post-lyon                        | measured; ceiling recorded in ADR-033      | Blueprint §3, ADR-031 |

¹ Measurement-site refinement, flagged: §3 lists the cache-hit target under
Criterion/`packages/geometry`, but the cache is worker TypeScript — the
honest instrument is a Vitest bench on the hit path plus the D.5-1
call-count assertion. The target is unchanged; only the instrument moves.

CI ceilings for every Criterion entry follow the standing ADR-023
discipline: measured reference-machine basis × a recorded noise margin in
`benchmarks/ceilings.json` — no analytical ceilings. The CI `rust` job's
bench step gains the `-p graphite-geometry --bench geometry` invocation
alongside the existing engine bench.

## Performance at Scale

Steady state renders entirely from cache: the marginal per-path frame cost
is two draws and one 256-byte uniform write. The three ways this design
degrades — tessellation time, vertex bandwidth / cache memory, zoom-driven
re-tessellation — are exactly ADR-031's recorded reopen triggers for
compute rasterisation, and every one is instrumented above, so the trigger
fires on evidence, not anecdote.

## Accessibility

No new UI in M1. The fixture command inherits the Debug palette's existing
keyboard and screen-reader behaviour. The a11y obligation of this phase
attaches to M2's tool surfaces; nothing here forecloses it. The standing
manual a11y protocol (~20 min, outstanding since Phase 6) remains on the
books and is unaffected by this milestone.

## Future Extensions

M2 attaches the document model (path `DocNode` kind, `.graphite` v2 with
its migration, SVG export, hit-testing, pen tool) onto these contracts
without renderer changes: the per-draw uniform reserves transform room,
`bounds` already feeds culling and selection overlays, and
`geometry_version` is the edit hook the pen tool bumps. M3 booleans emit
plain `PathGeometry`, so they inherit rendering for free. M4 text routes
glyph outlines through the same tessellator per ADR-031 §5. Gradients,
image paint, and masks (C1.16–17) slot in as fragment/pipeline variants
behind the same frame graph.

## Exit Criteria

**This deliverable (A–D):** documents land format-clean on `main`;
Surajit approves the contracts (or amends — contract changes are cheap
now, expensive after PC-1); `CONTINUE` opens Phase E at PC-1.

**Milestone M1 (E–H):** all CI gates green including the two new ones
(geometry benches ceilinged, WASM budget); golden nets live and blocking;
invariants D.5 asserted in the suite; MSAA reference capture recorded in
`docs/benchmarks/phase8-m1-msaa.md`; fixture corpus renders correctly on
the reference machine; status docs updated. Then M2 opens on the path
model.
