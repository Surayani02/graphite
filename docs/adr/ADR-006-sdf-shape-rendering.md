# ADR-006: SDF-Based Shape Rendering

**Date**: Phase 3
**Status**: Accepted
**Deciders**: Engineering Team

## Context

Rectangles (with optional corner radius) and ellipses need to render with
clean, anti-aliased edges at every zoom level, including strokes, without
a per-shape geometry-tessellation step that would complicate the single
instanced draw call established in Phase 2.

## Decision

Every shape is drawn as a unit quad (6 vertices, 2 triangles) per
instance. The fragment shader evaluates a **signed distance function**
(SDF) per pixel — `sdf_round_rect` or `sdf_ellipse` depending on a
`shape_type` parameter — and uses `smoothstep` across the SDF's zero
crossing for antialiasing, with the AA bandwidth driven by
`pixel_size = 1/zoom` so edges stay ~1 screen pixel wide at any zoom.

## Rationale

- **One draw call regardless of shape complexity.** Every shape — sharp
  rect, rounded rect, ellipse — uses the identical 6-vertex quad; only the
  per-instance data (size, corner radius, shape type) differs. No
  per-shape vertex-count variation to manage on the CPU side.
- **Resolution-independent antialiasing.** `pixel_size` ties the AA band
  directly to the current zoom level, so edges are crisp whether zoomed to
  10% or 5000% — geometry-based tessellation would need re-tessellation on
  zoom to achieve the same effect.
- **Stroke is "free."** A centre-aligned stroke is `abs(sdf) - stroke_width/2`
  evaluated in the same fragment shader pass — no separate stroke geometry,
  no second draw call per stroked shape.

## Alternatives Considered

| Alternative                                                                   | Reason rejected                                                                                                                                                                                                                    |
|-------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| CPU-side polygon tessellation (e.g. earcut for rounded rects)                 | Requires re-tessellating on every corner-radius or zoom change; defeats the "one quad per shape" instancing model                                                                                                                  |
| MSAA (hardware multisampling)                                                 | Anti-aliases the quad's outer silhouette but cannot anti-alias an _interior_ feature like a rounded corner cut into a quad, or a stroke band — MSAA operates on primitive edges, not on values computed inside the fragment shader |
| Per-shape-type draw calls (one draw for all rects, one for all ellipses, ...) | More draw calls than the unified approach for no quality benefit; breaks the single-bind-group, single-draw-call simplicity established in Phase 2                                                                                 |

## Consequences

### Positive

- Visual quality (smooth edges, clean strokes) at every zoom level with no
  geometry regeneration.
- Adding a new shape type (Phase 4+: lines, polygons) is "add a new SDF
  function and a new `shape_type` value," not "build a new geometry
  pipeline."

### Negative

- SDFs for complex shapes (arbitrary paths, not just rects/ellipses) get
  significantly harder to express in closed form — vector path rendering
  (Phase 6+) will likely need a different technique (e.g. a stencil-based
  or coverage-based approach) layered alongside this one, not a pure SDF
  extension.

## Review Criteria

Revisit when arbitrary vector paths (Bézier curves, not just rects and
ellipses) are implemented — confirm whether SDF approximation is
sufficient or a dedicated path-rendering technique is needed alongside it.
