# ADR-002: WebGPU as the Rendering API

**Date**: Phase 1
**Status**: Accepted
**Deciders**: Surajit (Project Lead)

## Context

The engine needs a GPU rendering API reachable from a Web Worker via
`OffscreenCanvas`, capable of instanced draw calls for 100,000+ shapes, and
viable as a long-term foundation (this project is meant to be maintained
for years, not months).

## Decision

Use **WebGPU** exclusively. No WebGL 2 fallback path.

## Rationale

- **Compute shaders**: WebGPU exposes general-purpose compute, which WebGL
  2 does not. Future phases (path tessellation at scale, physics, image
  filters) will likely need this.
- **Explicit, modern API**: storage buffers, bind groups, and pipeline
  state objects map directly onto how the renderer is architected (see
  ADR-008's slot-map scene graph feeding a single instanced draw call).
  WebGL 2's implicit global-state model fights this design.
- **Worker-native**: `OffscreenCanvas.getContext("webgpu")` is
  first-class; WebGPU was designed alongside the offscreen-canvas-in-Worker
  pattern this project depends on (ADR-003).
- Browser support (Chrome/Edge 113+, and shipping or in-progress in
  Firefox and Safari at time of writing) is acceptable for a project whose
  own roadmap spans years, not a project shipping next month.

## Alternatives Considered

| Alternative                                   | Reason rejected                                                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| WebGL 2                                       | No compute shaders; implicit global state fights the renderer's architecture; no clear migration path to WebGPU later without a rewrite |
| WebGL 2 with a WebGPU migration planned later | Building two render backends multiplies maintenance cost for a feature (broader browser support) this project doesn't urgently need     |
| Canvas2D                                      | No GPU instancing; cannot hit the 60 FPS / 100,000-object performance targets                                                           |

## Consequences

### Positive

- Direct path to compute-shader-accelerated features later (tessellation, filters).
- One render backend to maintain, test, and benchmark.

### Negative

- Requires a WebGPU-capable browser. No fallback for older browsers.

## Review Criteria

Revisit if WebGPU adoption stalls significantly across major browsers, or
if a hard requirement emerges to support a browser that never ships it.
