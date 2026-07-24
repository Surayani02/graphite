# ADR-031: General Path Rendering — Hybrid SDF and CPU Tessellation

- **Status:** Accepted (direction); implementation opens Phase 8 M1 after a spike
- **Date:** 2026-07-20
- **Phase:** 8, Milestone 1
- **Related:** ADR-002 (WebGPU, no WebGL fallback), ADR-006 (SDF shape
  rendering — extended, not replaced), ADR-008 (slot-map scene storage),
  ADR-023 (adopt structure when measurement demands), ADR-025 (damage
  model), ADR-029 (phase resequencing)

## Context

The renderer is one instanced draw: 16 floats per shape, a two-branch
signed-distance field (round-rect / ellipse), analytic antialiasing via
`smoothstep`, centre-aligned strokes, Porter-Duff blending. It is small,
fast, and meets its frame budget at the 10k target.

It also cannot express Tier 1. An SDF is a _closed-form_ description of a
shape; an arbitrary Bézier path with holes and self-intersections has none.
Vector paths (C1.1), booleans (C1.3), path operations (C1.4), glyphs (C4),
gradients and image paint (C1.16), and clipping masks (C1.17) are all out
of reach of the current pipeline. This is the largest single technical
delta in the parity programme.

## Decision

A **hybrid pipeline**: keep the SDF pass, add a mesh pass.

**1. Retain the SDF instanced pass as the fast path** for rectangles,
round-rectangles, and ellipses. These dominate UI design work, already meet
budget, and cost zero tessellation. Deleting a working fast path to route
everything through a general one would be a regression sold as a
simplification.

**2. Add CPU tessellation for arbitrary paths and glyph outlines**, in a
new Rust crate `packages/geometry`, using **lyon** for fill and stroke
tessellation. Output is triangle meshes drawn by a second pipeline.

**3. Both passes render into one multisampled target.** The SDF pass keeps
its analytic AA; the mesh pass relies on MSAA (4× initially, measured).
Mixing AA strategies across passes into a single resolve is coherent and
keeps quality consistent; the alternative — analytic coverage for meshes —
is significantly more work for a quality difference we have not yet
measured a need for.

**4. Mesh caching is part of the decision, not an optimisation.** Without
it, Option A fails its own budget on the first drag.

- **Key:** `(node geometry version, tolerance bucket)`. _Not_ a hash of the
  path data — hashing large paths per frame is itself a per-frame cost. A
  monotonically incremented geometry version on the node is O(1) to compare
  and is bumped only by edits that change geometry.
- **Tolerance buckets:** curve flattening tolerance is defined in _device_
  pixels, so world-space tolerance scales with zoom. Quantise it to
  power-of-two buckets, so smooth zooming re-tessellates at a handful of
  discrete steps instead of invalidating every path every frame.
- **Invalidation:** rides the existing damage model (ADR-025). A cached
  mesh is dropped when its node's geometry version changes or its tolerance
  bucket shifts.

**5. Glyphs go through the same tessellator** as paths — one code path,
one AA story, one set of golden images. A raster/MSDF glyph atlas for small
sizes is an obvious later optimisation and is **deliberately deferred until
measurement demands it** (ADR-023's discipline), not built speculatively.

## Dependency justification — lyon

1. **Why does it exist?** Converting arbitrary Bézier paths into triangle
   meshes correctly is a deep, well-specified problem: curve flattening
   within tolerance, fill rules, robust handling of self-intersection and
   coincident edges, and stroke expansion with caps, joins, miter limits,
   and dash patterns.
2. **What specific problem does it solve?** Exactly the operation the GPU
   cannot perform for arbitrary paths — and, via its stroke tessellator,
   the whole of C1.15 (dash patterns, caps, joins) as a side effect.
3. **Why is in-house insufficient?** Writing it ourselves is a multi-month
   effort in a domain whose difficulty is numerical robustness at
   intersections, with zero product differentiation — and any in-house
   tessellator is the component a future compute rasteriser would replace
   anyway. This is the clearest "buy" in the programme.

**Scoping caveat, recorded now to prevent a surprise later:** lyon
tessellates; it does not provide robust general path _booleans_. C1.3 is a
**separate evaluation** (candidate crates, or an implementation of a
sweep-line algorithm) with its own ADR in Phase 8 M3. Do not assume this
decision covers it.

## The revisit trigger — GPU compute rasterisation

Vello-class compute rasterisation is the better long-term answer:
resolution-independent (no retessellation on zoom), uniform path and glyph
handling, superior scaling. It is **not** adopted now because putting a
rasteriser research project on the critical path of Tier 1 would stall the
programme on an unmeasured bet.

It reopens — as a Phase 13+ performance epic with its own ADR — when any of
these is measured on the reference machine:

- Tessellation time breaches the frame budget at the 10k object target, or
- Vertex bandwidth or mesh-cache memory becomes the dominant frame cost, or
- Zoom-driven retessellation causes visible stalls that tolerance bucketing
  does not absorb.

Recording the trigger is the point. "Revisit later" without a threshold is
how deferrals become permanent by accident.

## Alternatives considered

- **Full GPU compute rasterisation now (Vello / piet-gpu class).** Best
  end state, and genuinely tempting. Rejected for _sequencing_, not merit:
  very large complexity and shader surface, WebGPU compute performance that
  varies by backend, difficult debugging, significant bundle cost, and a
  team ramp — all in front of every Tier 1 feature that depends on it. We
  would be betting the programme's largest phase on a subsystem we cannot
  yet measure.
- **Stencil-and-cover.** Robust fills without interior tessellation, but
  multi-pass, a weak stroke story, and dated AA. It solves less than lyon
  for comparable integration effort.
- **Keep extending the SDF per primitive.** Cheapest short term and a dead
  end: it cannot express arbitrary paths or glyphs at all. Adding a third
  and fourth SDF branch would buy weeks and forfeit C1 and C4 entirely.

## Consequences

- Two pipelines behind one frame graph. The frame graph — pass ordering,
  shared target, resolve — becomes a real component and needs its own
  design in Phase 8 M1, not an accretion of special cases.
- **Golden-image visual regression becomes mandatory and lands before the
  first path ships.** A tessellation change can be type-correct,
  lint-clean, and visually wrong in ways no unit test detects. This is the
  highest-value test addition in the programme.
- MSAA raises render-target memory and bandwidth; measure at 10k and 100k
  and record it in `docs/benchmarks/`, since ADR-025's damage model numbers
  were taken without it.
- WASM binary grows materially (tessellation, and later shaping). WASM size
  gets its own budget line alongside the JS main-chunk ceiling (ADR-024);
  the current 12 kB of JS headroom does not absorb this, so code-splitting
  becomes a Phase 8 precondition.
- Criterion benches for tessellation and cache hit/miss are defined before
  implementation, with CI-enforced ceilings in `benchmarks/ceilings.json`.
