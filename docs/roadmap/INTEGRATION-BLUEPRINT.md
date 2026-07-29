# Integration Blueprint — Figma Parity Programme

Companion to [BLUEPRINT.md](../BLUEPRINT.md) (the architecture map) and
[PARITY.md](../PARITY.md) (the living status matrix). This document covers
the seven new subsystems, the module boundaries they need, the sequencing,
the performance contracts, and the gate recommendations.

**Written 2026-07-20 against `main` at Phase 7 M5.** No application code is
proposed here — this is Phase A/B for the programme as a whole. Each
milestone still runs its own A–H.

---

## 0. Two things to settle before anything starts

### 0.1 Phase 7 is not closed

Phase 7's exit gate is the 10k/100k capture, and it is outstanding. Partial
10k data exists (load 61.6 ms median, reload 39.5 ms, render cost
0.10–0.20 ms/frame); selection response, hit-test, and the whole 100k table
are unmeasured. **The 100k hit-test number is a direct input to ADR-023's
R-tree decision, which this programme will lean on.**

**Decided (2026-07-20): close it, do not defer.** The selection and
hit-test benchmarks are completed on the reference machine, and the 100k
hit-test result feeds ADR-023's re-adoption trigger. Phase 8 opens once the
tables are filled and the exit assessment is written.

### 0.2 The sequencing change is approved

**Approved 2026-07-20 and recorded as
[ADR-029](../adr/ADR-029-phase-resequencing.md).** The document-model
expansion precedes collaboration; Phases 11 and 12 keep the standing
backend and collaboration scope verbatim and change position only.
Reasoning in §4.

---

## 1. The deltas

Seven subsystems, ordered by risk. The first is the largest single
technical risk in the entire programme.

### 1.1 Render pipeline — arbitrary paths and glyphs

**Today.** One instanced draw. 16 floats per shape. A two-branch SDF
(round-rect / ellipse), analytic AA via `smoothstep`, centre-aligned
strokes, Porter-Duff blending. It is fast, small, and meets its budget.

**Required by Tier 1.** Arbitrary filled and stroked paths (C1.1–C1.4),
glyph rendering (C4), gradients and image/video paint (C1.16), clipping
masks (C1.17), blend modes (C1.12), and effects needing offscreen targets
(C1.14). None of this fits an SDF branch — an SDF describes a _closed-form_
shape; a Bézier path with holes has no closed form.

**Options.**

| Option                                                  | Pros                                                                                                                              | Cons                                                                                                                                                     |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. CPU tessellation** (lyon) → triangle meshes        | Mature, deterministic, debuggable, unit-testable; incremental — sits beside the existing pass; no compute-shader portability risk | Retessellation on geometry edit and on large zoom changes (flatness tolerance); vertex bandwidth at high path counts; AA needs MSAA or analytic coverage |
| **B. GPU compute rasterisation** (Vello/piet-gpu class) | Resolution-independent (no retessellation on zoom); uniform path + glyph handling; best-in-class quality and scaling              | Very large complexity and shader surface; WebGPU compute perf varies by backend; hard to debug; significant bundle; a research bet on the critical path  |
| **C. Stencil-and-cover**                                | Robust fills without interior tessellation                                                                                        | Multi-pass; weak stroke story; dated AA                                                                                                                  |
| **D. Keep extending the SDF**                           | Cheapest short term                                                                                                               | Does not generalise to arbitrary paths or glyphs at all — a dead end for C1 and C4                                                                       |

**Recommendation — A now, B as a measured Tier 2 upgrade.** Adopt CPU
tessellation for paths and glyph outlines, and **keep the existing SDF pass
as a fast path for rectangles and ellipses**, which are the overwhelming
majority of UI-design primitives and already meet budget with zero
tessellation cost. Two pipelines behind one frame graph.

This mirrors ADR-023's discipline exactly: adopt the sophisticated
structure when measurement demands it, not in anticipation. It keeps the
60 FPS mandate continuously _measurable_ instead of pausing the programme
for a rasteriser research project. The revisit trigger is explicit and
belongs in the ADR: **when tessellation time or vertex bandwidth breaches
the frame budget at the 10k target, Option B opens as a performance
epic.**

Mesh caching is not optional — cache per-path meshes keyed by
`(geometry hash, flatness tolerance)`, invalidated by the existing damage
model (ADR-025). Without it, Option A fails its own budget.

**Recorded as [ADR-031](../adr/ADR-031-general-path-rendering.md)**
(approved 2026-07-20), including the mesh-cache key design, the MSAA
decision, and the explicit measurement thresholds that reopen Option B.
Path _booleans_ are scoped out of it and get their own ADR in Phase 8 M3 —
lyon tessellates, it does not provide robust general boolean operations.

### 1.2 Text engine

Shaping, font parsing, line breaking, bidi, variable axes, OpenType
features. Must run in the worker, in Rust/WASM, never via DOM or canvas
text measurement.

**Candidates.** `cosmic-text` bundles shaping + layout + editing (over
`rustybuzz` + `swash`), which is a large head start but an opinionated
layout and editing model. `rustybuzz` + `swash` with our own layout gives
the per-glyph positional control a design tool needs (text on a path,
per-character transforms, precise variable-axis interpolation) at the cost
of writing line breaking and bidi ourselves.

**Recommendation.** Spike `cosmic-text` first against three design-tool
requirements — per-glyph positioning, variable-axis control, and text on a
path (A1.5) — and fall back to `rustybuzz` + `swash` if its layout model
fights any of them. Glyph rendering goes through the same tessellator as
paths (§1.1) with a raster atlas cache for small sizes. **Bundle impact is
material**: shaping plus font parsing in WASM is heavy, so the text module
is a code-split candidate from day one and budgets against the ceiling.

### 1.3 Layout engine

**Recommendation: adopt `taffy`**, wrapped behind our own contract. It
implements Flexbox and CSS Grid against the CSS test suites — precisely the
two models C2 must mirror, and precisely the mapping C2.9 requires for
handoff fidelity. Figma's `Hug` / `Fill` / `Fixed` translate onto taffy's
sizing model; that translation layer is ours and is where the design-tool
semantics live.

Three-question test: it exists because CSS layout is genuinely hard and
heavily specified; it solves Flexbox and Grid correctly with a conformance
suite behind it; writing our own is months of spec-chasing for zero
differentiation, in a subsystem where being _unsurprising_ is the feature.

Solving must be worker-side, incremental, and dirty-tracked — a full pass
over every layout node per frame will not meet the 8 ms budget at scale.

### 1.4 Component system

Lives in the TypeScript document model (the source of truth), not React,
not Rust. Main/instance links, override maps, nested resolution order,
variant sets as a property grid.

The performance target (1,000 instances updated in < 16 ms) forbids eager
deep-copy propagation. Instances resolve **lazily against their main, with
a memoised resolution cache invalidated by main-component edits** — the
same read-through pattern the variables layer needs, and worth designing
once for both.

### 1.5 Variables & tokens

Collections, four value types, modes, aliasing, scoping, DTCG interchange —
plus the committed differentiator, **inheritable base values across modes**
(A2.9). That last one is a _model_ decision, not a feature bolt-on: the
value of a variable in a mode must be able to resolve to "inherit from
base" as a first-class state, not be a copied duplicate. Design it in from
the first line or it becomes unfixable.

Aliasing is a DAG and needs cycle detection at edit time, not resolve time.
The 100 ms whole-document mode switch requires a precomputed
variable→binding index; walking every node per switch will not hold at
scale.

### 1.6 Prototype runtime

A deterministic state machine over the scene graph, rendered by the same
pipeline — not a second renderer. Play-mode state (current frame, overlay
stack, variable values, history for `back`) lives beside the document,
never inside it. Smart animate is layer matching plus interpolation, and
its 60 FPS requirement makes matching an indexed operation, not a search.

### 1.7 Collaboration & backend

Already the standing plan and unchanged in scope: Axum + PostgreSQL +
Redis + S3 + JWT, then Yjs over WebSocket. ADR-011 chose the TypeScript
document model specifically to enable this, and ADR-020 already shapes
`DocumentOp` as wire material. The work is real but the architecture is
decided; the open question is _when_ (§4).

### 1.8 Dev mode & handoff

A read-only projection over the document model plus resolved layout, into
CSS/Swift/Compose. Output quality is bounded by C2.9 — if the layout model
maps cleanly onto Flexbox and Grid, codegen is translation; if it does not,
codegen becomes invention and will be permanently mediocre. This is the
strongest argument for taffy in §1.3.

---

## 2. Module map

Additive. ADR-001's monorepo structure stands; the Rust workspace gains
sibling crates and the TypeScript side gains one extracted package.

```
packages/
  engine/        Rust — wasm-bindgen facade + scene graph + render      (exists)
  geometry/      Rust — paths, curves, booleans, tessellation           NEW
  text/          Rust — shaping, font parsing, line layout, outlines    NEW
  layout/        Rust — taffy wrapper + Hug/Fill/Fixed semantics        NEW
  document/      Rust — placeholder, ADR-010                            (exists)
  protocol/      TS   — IPC + wire contracts                            (extends heavily)
  document-model/TS   — the DocumentModel, extracted from apps/web      NEW (ADR needed)
  crdt/          TS   — Yjs binding                                     (stub → real, P12)
  plugin-api/    TS   — plugin surface                                  (stub → real)
  ui-core/       TS   — primitives + tokens                             (extends)
apps/
  web/           React shell + worker orchestration
  server/        Rust + Axum                                            (stub → real, P11)
```

**One WASM artifact.** `geometry`, `text`, and `layout` are internal crates
that `engine` depends on and re-exports through its existing wasm-bindgen
surface. Multiple `.wasm` binaries would multiply runtime overhead and
complicate the Turborepo build graph for no benefit.

**Extracting `document-model` is a monorepo change and needs an ADR.**
Justification: it is the source of truth, and Phase 11 (backend
persistence) and Phase 12 (CRDT binding) both need it without depending on
`apps/web`. It lived in `apps/web/src/document/` — correct while the web app was its
only consumer, wrong the moment the server and the CRDT layer are
consumers too — until Phase 8 PC-1 delivered the extraction (2026-07-25),
before those phases rather than during them.

**Boundary rule, unchanged and non-negotiable.** React owns UI chrome. The
worker owns the render loop, GPU state, the interaction hot path, and the
document. Rust owns the scene graph and geometry. `@graphite/protocol` is
the only crossing. Every new subsystem lands behind that line: text
shaping, layout solving, component resolution, and variable resolution are
all worker-side, and the UI edits them through the protocol.

---

## 3. Performance targets

Every target below is a **CI-checkable contract defined before
implementation**, with the measurement method stated. Targets from the
programme brief are restated with their method; new ones are marked ⁿ.

| Subsystem           | Target                                                                                        | Measured by                                                  |
| ------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Canvas render       | ≥ 60 FPS at 10k objects                                                                       | HUD + worker frame-time trace, reference machine             |
| Path tessellationⁿ  | 1k-segment path → mesh in < 4 ms; cache hit < 0.1 ms                                          | Criterion, `packages/geometry`                               |
| Vector booleans     | 10k-segment live boolean group updates in < 10 ms                                             | Criterion                                                    |
| Text shaping        | 1,000 glyphs shaped + laid out in < 2 ms, incremental; never reshape unchanged text per frame | Criterion + a worker-side "reshape count" assertion in tests |
| Glyph atlas uploadⁿ | New-glyph upload < 1 ms amortised per frame                                                   | Criterion + frame trace                                      |
| Layout              | Full pass over 5,000 nodes < 8 ms; typical incremental relayout < 2 ms                        | Criterion, `packages/layout`                                 |
| Components          | Main edit → 1,000 instances in < 16 ms                                                        | Vitest bench over the document model                         |
| Variables           | Collection mode switch rebinds whole document < 100 ms                                        | Vitest bench                                                 |
| Prototyping         | Transitions hold 60 FPS; trigger→response < 16 ms                                             | Frame trace in play mode                                     |
| Collaboration       | Propagation < 100 ms; presence/cursors ≥ 20 Hz                                                | Integration harness, two clients                             |
| Hit testing         | < 1 ms at 10k                                                                                 | Criterion (`hit_test_miss`), CI-gated ceiling                |
| Selection           | < 16 ms response                                                                              | Performance-panel capture                                    |
| Document load       | < 1 s medium files                                                                            | `[stress]` worker timing                                     |
| Command palette     | Results < 50 ms                                                                               | Vitest bench (`fuzzy.bench.ts`, exists)                      |
| Inspector           | Keystroke → frame ≤ 2 frames                                                                  | Manual + trace                                               |
| Version history     | Checkpoints fully async, zero dropped frames                                                  | Frame trace during checkpoint                                |
| Object budget       | 10k at MVP quality, 100k system target                                                        | Stress scenes (ADR-027)                                      |
| Bundle              | Main-chunk gzip ceiling, CI-enforced (190 kB, ADR-024)                                        | `check-bundle-size.mjs`                                      |

**Bundle discipline is the sleeper risk.** Text shaping, tessellation, and
a layout solver are each substantial WASM additions, and the current main
chunk sits at 177.66 kB against a 190 kB ceiling — roughly 12 kB of
headroom for a programme that triples the feature surface. Route- and
feature-level code splitting stops being "the productive future lever"
(bundle-analysis-phase7.md) and becomes a **precondition** of Phase 8. WASM
growth is measured separately from the JS ceiling and needs its own budget
line in the same ADR.

---

## 4. Sequencing

### The decision (ADR-029)

| Phase   | Scope                                                                                      | Epics           |
| ------- | ------------------------------------------------------------------------------------------ | --------------- |
| 7       | MVP — **close the capture**                                                                | —               |
| **8**   | **Vector & text foundation** — path render pipeline, geometry crate, booleans, text engine | C1, C4          |
| **9**   | **Layout engine** — auto layout, grid, constraints                                         | C2              |
| **10**  | **Components, styles & variables**                                                         | C3, A2          |
| **11**  | Backend — Axum, PostgreSQL, Redis, JWT, S3                                                 | (C6 groundwork) |
| **12**  | Collaboration — Yjs, presence, comments, versions, permissions                             | C6              |
| **13**  | Prototyping runtime                                                                        | C5              |
| **14**  | Dev mode & handoff                                                                         | A3              |
| **15**  | Illustration mode                                                                          | A1              |
| **16**  | Plugins & extensibility                                                                    | (standing)      |
| **17+** | AI layer, gated items                                                                      | A4              |

Phases 11 and 12 keep the standing backend and collaboration scope
verbatim. They move _later in sequence_, they do not change in content.

### Why the document model expands before collaboration

The standing plan puts collaboration at Phase 9, ahead of paths, text,
layout, components, and variables. That ordering has one concrete problem:

**Schema churn is free before multiplayer and expensive after.** A CRDT
binding is a mapping from document schema to Yjs types. Shipping
collaboration over today's `frame | rect | ellipse` model means building
that mapping, then rebuilding it for paths, then text, then components,
then variables, then layout — six times, and every rebuild after the first
live document is a migration with real users' data at stake. Sequencing the
model expansion first means the CRDT mapping is authored **once**, against
a schema that has stopped moving.

The counter-argument is real and worth stating: users get sharing and
persistence later, and the collaboration work carries more unknowns the
longer it waits. I judge the migration risk the larger of the two, because
migrations of live collaborative documents are among the hardest things
this project will ever have to do, and doing five avoidable ones is a
self-inflicted wound.

Secondary benefit: the render-pipeline delta (§1.1) is the programme's
largest technical risk. Putting it in Phase 8 de-risks the whole plan
early, when a bad answer is cheap to reverse.

**Approved 2026-07-20; recorded as ADR-029.**

### Ordering within Phase 8

C1 and C4 share the render delta, so they share a phase, but they are
sequenced inside it:

1. **M1 — path render path.** Geometry crate, tessellation, mesh cache,
   SDF fast path preserved. Ships with rendering-only tests; no new UI.
2. **M2 — path model & pen tool.** `DocNode` gains a path kind; pen tool,
   path ops (C1.1, C1.4).
3. **M3 — booleans.** Live non-destructive boolean groups (C1.3).
4. **M4 — text engine core.** Shaping, layout, glyph rendering (C4.1–C4.6).
5. **M5 — font management.** Local access, bundled library, missing-font
   handling (C4.7, C4.8).

Transforms (C1.9 rotation/skew), opacity, blend modes, effects, gradients,
and masks are **not** in Phase 8 despite being C1: each changes the render
instance format or adds passes, and bundling them with the tessellation
rewrite would make one milestone unreviewable. They sequence into Phase 8.5
or early Phase 9 as a "paint & compositing" milestone — flagged here so
they are not lost.

### Per-milestone exit criteria

Every milestone in every phase carries the standing checklist, without
exception: `build`, `typecheck`, `lint`, `format:check`, `test` green;
`cargo test`, `clippy -D warnings`, `fmt --check` green; bundle ceiling
respected; benchmarks recorded under `docs/benchmarks/`; manual browser
verification; README and BLUEPRINT status rows flipped **in the same
commit**; ADRs written at decision time; **PARITY.md statuses updated**;
conventional commit; CI green before proceeding.

---

## 5. Gate recommendations

One paragraph each, seeding the future go/no-go ADR. These are
recommendations, not decisions.

**C3.8 — Design-system intelligence.** _Lean no, revisit after C3 ships._
It is a quality layer over a component system that does not exist yet;
scanning for inconsistency before there is anything to be inconsistent
about is meaningless. Much of its value (usage tracking, token sync) also
overlaps A2 and A3. Revisit once C3 and A2 are both shipped and there is
real design-system data to reason over.

**C7.6 — Desktop wrapper.** _Lean yes, but late._ The genuine driver is
local font access (C4.7), which the browser restricts. If the Local Font
Access API proves sufficient in Chromium, the wrapper's value drops to
performance and window management — nice, not necessary. Decide _after_
C4.7 measures what the browser can actually do.

**C7.7 — Mobile viewer.** _Lean yes, after C5._ View/comment/present is a
real workflow need and it is explicitly not an editor, so it does not
inherit the WebGPU editing constraints. It depends on prototyping (C5) and
comments (C6.4) to have anything to show. Cheap relative to its value once
those exist.

**C7.8 — Live device mirror.** _Lean no for now._ High plumbing cost
(device pairing, a streaming transport, latency work) for a narrow
workflow, and it duplicates much of C7.7's infrastructure. If the mobile
viewer ships, mirror becomes a much smaller increment — evaluate it then,
not before.

**A1.9 — Stylus/tablet pressure.** _Lean yes, cheap, gate is mostly
formality._ Pointer Events already carry pressure and tilt; the work is
plumbing them into the brush engine (A1.1) and variable-width strokes
(A1.7). It is gated only because second-screen support is a much larger
piece — recommend splitting the gate: approve pressure input with A1,
defer second-screen separately.

**A3.6 — Production component mapping.** _Lean yes, high value, after
A3.1._ This is what separates a handoff tool from a screenshot. It needs
repo integration (auth, parsing, a mapping store), so it is not small, but
it is the single highest-leverage item in A3 and the reason A3 exists.

**A3.7 — MCP server.** _Lean yes, and it is cheaper than it looks._ It is a
read-only projection over the document model, layout results, and component
mappings — most of the hard work is A3.1's inspection data, already built.
Gate it on A3.1 and A3.6 shipping, then it is largely a transport.

**A3.8 — Bidirectional code-to-canvas.** _Lean no._ Writing code back into
the canvas as editable native layers means a code→document compiler with
fidelity guarantees, and it inverts the source-of-truth relationship the
whole architecture rests on. Very high risk, unclear payoff. Revisit only
if A3.6 proves the mapping layer is genuinely reliable in practice.

**A3.9 — Packaged agent skills.** _Lean neutral, trivially reversible._ It
adds no capability — it is packaging over A3.7. Approve it as a thin layer
if and when the MCP server has real users; there is no architectural risk
either way.

**A4 (all items) — AI & generative tooling.** _Lean: build the boundary,
gate every feature individually._ The one thing worth doing early is the
provider-agnostic interface and the CI invariant that **the platform
builds, runs, and passes its full suite with zero providers configured** —
that constraint is cheap to hold from the start and expensive to retrofit.
Everything behind that boundary should be judged one at a time, on its own
merits, when the underlying subsystem exists (A4.3 Motion needs C5; A4.8
auto-layout suggestions need C2; A4.2 code layers need A3). Approving the
epic wholesale would be approving eleven unrelated products at once.

---

## 6. Testing & benchmarking strategy

The existing strategy (Vitest + RTL + Playwright + Criterion, coverage
floors, CI-gated bench ceilings) holds. Four additions the new subsystems
force:

**Golden-image visual regression.** Non-negotiable once rendering
generalises. A tessellation change can be type-correct, lint-clean, and
visually wrong in ways no unit test catches. Render a fixture corpus
(paths, strokes, joins, caps, fill rules, glyphs at several sizes,
gradients, masks) to PNG in CI and diff against committed goldens with a
perceptual threshold. **This is the single highest-value test addition in
the programme** and should land in Phase 8 M1, before the first path ships.

**Conformance suites over hand-written cases.** Text shaping and layout
both have external ground truth: shaping against HarfBuzz reference output,
layout against the CSS Flexbox/Grid test suites taffy already tracks.
Wire those in rather than inventing assertions — they encode a decade of
edge cases we would otherwise rediscover in bug reports.

**Property and fuzz testing where the input space is adversarial.**
Booleans and path parsing take hostile geometry (self-intersections,
degenerate segments, coincident edges); fuzz them. CRDT convergence is a
property, not an example: random concurrent op sequences must converge to
identical documents across peers.

**Performance gates as CI-enforced ceilings, not reports.** Every target in
§3 gets a machine-checkable ceiling in `benchmarks/ceilings.json`, the way
hit-test already does (`check-bench-ceilings.mjs`). A target no one is
alerted about is documentation, not a contract.

Accessibility remains a phase gate: axe per route × theme in CI, and every
new Tier 1 surface (inspector sections, prototype player, comment threads,
the text editing surface) passes before its milestone closes.

---

## 7. Documentation strategy

- **`docs/adr/`** — unchanged and authoritative. Written at decision time.
  This programme opens with ADR-029 (phase resequencing) and the render
  pipeline ADR; a running index lives in `docs/adr/README.md` (**to add** —
  28 ADRs is past the point where a directory listing serves).
- **`docs/PARITY.md`** — the matrix. Updated at every milestone close, in
  the same commit as the code. Scope changes need an ADR; status changes
  do not.
- **`docs/roadmap/`** — this document, plus per-phase scoping notes as each
  opens.
- **`docs/benchmarks/`** — unchanged: recorded baselines and capture
  procedures, reference-machine numbers only.
- **`docs/contributing/`** — needs a per-subsystem guide as each lands
  (geometry, text, layout, collaboration). A new contributor should be able
  to find the boundary they are working behind without reading the whole
  blueprint.
- **`BLUEPRINT.md`** — stays the map: the runtime architecture diagram and
  phase table get extended per §4, not duplicated here.

---

## 8. Decisions taken (2026-07-20)

All four open questions are settled and recorded:

1. **Phase 7** — close, do not defer. Selection and hit-test benchmarks
   completed on the reference machine; the 100k hit-test result feeds
   ADR-023.
2. **Sequencing** — approved as §4, recorded as
   [ADR-029](../adr/ADR-029-phase-resequencing.md). Phase 8 = Vector &
   Text, 9 = Layout, 10 = Components & Variables, 11 = Backend,
   12 = Collaboration.
3. **Document-model extraction** — approved, with boundaries, ownership,
   public API, serialisation, and migration strategy defined in
   [ADR-030](../adr/ADR-030-document-model-package.md) ahead of any
   implementation.
4. **Rendering** — Option A approved and recorded as
   [ADR-031](../adr/ADR-031-general-path-rendering.md): SDF fast path
   retained, lyon tessellation added, mesh cache keyed by
   `(geometry version, tolerance bucket)`, compute rasterisation held as a
   future optimisation behind measured triggers.

### Next deliverable

**Delivered 2026-07-25:**
[design/phase8-m1-path-pipeline.md](../design/phase8-m1-path-pipeline.md)
(Phases A–D — requirements, architecture, exact file structure, interface
contracts) and [ADR-032](../adr/ADR-032-frame-graph-and-mesh-cache.md)
(frame graph with one 4× MSAA target including export, interleaved render
list with contiguous-run batching, mesh-handle tessellation boundary,
bucket/budget/cap mechanics, engine-level fixture corpus behind an
ADR-027 surface). The three under-scope risks called out at approval are
all bound in that pair: the frame graph is Decision 2, golden-image
regression is specified as a two-net strategy (exact Rust mesh snapshots +
thresholded visual goldens), and code splitting is precondition commit
PC-2 with its budgets recorded as ADR-033 at Phase-E entry.

Of the two prerequisites: the Phase 7 capture is complete (decision 1
above); the `document-model` extraction (ADR-030) is precondition commit
PC-1 — the first commit of Phase E, before any feature code, standalone
and suite-proved as specified.

**Phase E progress:** PC-1 (`document-model` extraction) ✅ delivered
2026-07-25 — 543 tests green across four TypeScript packages, bundle
neutral. PC-2 (startup budgets, ADR-033) ✅ delivered 2026-07-25 — the bundle
gate now measures the entry's static-import closure (177.71 kB against
the 190 kB ceiling) so splitting can never satisfy it without deferring;
three always-rendered lazy islands + `sideEffects` flags establish the
pattern every future closed-until-invoked surface uses at zero closure
cost; the palette stays eager under the rule the reference machine
proved (open-latency SLO ⇒ never an island — a lazy palette measured
347 ms against the 150 ms e2e gate); and the WASM gate is live in
capture mode (armed from the measured pre/post-lyon pair at the geometry
crate). The
**geometry crate** ✅ delivered 2026-07-25 — `graphite-geometry` in the
Cargo workspace: §D.1 types, lyon fill/stroke behind the crate boundary
(component crates pinned; no `lyon_algorithms` until C1.15's dashes),
cull-grade bounds, the ADR-032 §5 corpus, 25 unit tests + determinism +
bounds-containment properties, and golden Net 1 (ten `.snap` files
generated from real tessellator output, `GOLDEN_UPDATE=1` regeneration).
Criterion benches run in CI's quick pass, and their ten `ceilings.json`
entries are **armed from the 2026-07-25 reference capture** (ADR-023):
the recorded 1k-segment target of <4 ms measures **152.42 µs**, a ~26×
margin. Golden portability is CI-enforced on Windows as well as Linux
after two measured libm drifts (ADR-032 amendment). **Engine integration** ✅ delivered 2026-07-25 —
`NodeKind::Path` (node-local geometry + world origin, so a move reuses
cached meshes), `add_path` with a validated flat encoding,
`geometry_version` as the cache key, the `MeshStore` handle arena
(monotonic handles, no ABA), and path-reference render records in the
existing 16-float stride with SDF records byte-identical (ADR-032
amendment). 114 workspace tests green. ADR-033's WASM ceiling is **armed at 80 kB gzip** from the
measured post-integration binary (64.62 kB gzip / 152.14 kB raw).

The worker's **pure seams** ✅ delivered 2026-07-25 — `gpu/drawPlan.ts`
(contiguous-run batching via `firstInstance`, paint order preserved) and
`gpu/meshCache.ts` (tolerance buckets, the validity decision matrix, LRU
with the same-frame guard, and the budgeted repair scheduler), with 26
Vitest cases covering the §D.5 invariants that need no GPU. The **frame graph** ✅ delivered
2026-07-25 — `gpu/targets.ts` (4× MSAA lifecycle, per-frame size/format
reallocation) and `gpu/frame.ts` (single-pass assembly, resolve to the
swap chain), with `render.ts` reduced to scheduling and **export routed
through the same target configuration**, which WebGPU's sample-count
matching now enforces rather than convention. Landed before the mesh
pipeline on purpose, so the MSAA frame-cost capture had one changed
variable — [benchmarks/phase8-m1-msaa.md](../benchmarks/phase8-m1-msaa.md),
an M1 exit criterion, now **captured and met**: under ~0.6 ms per frame at
1255 × 838, bounded rather than isolated (no probe scene became GPU-bound
at this resolution). The **mesh pipeline** ✅ delivered
2026-07-25 — `gpu/meshShader.ts` (camera at the SDF shader's binding and
byte layout; a 256-aligned per-draw uniform carrying a 2×2 linear part,
translate, and colour) and `gpu/meshPipeline.ts` (indexed `float32x2`
draws, dynamic-offset bind group, culling off because tessellated winding
is not consistent, blend state and sample count matched to the SDF
pipeline field for field). The 2×2 is identity throughout M1 and exists so
M2's resize semantics change a struct field rather than a pipeline.
**Next:** mesh draws inside `frame.ts` against the cache, the DEV fixture
command, and Net 2's visual goldens.
