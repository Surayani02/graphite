# ADR-004: Rust/WASM for the Graphics Engine

**Date**: Phase 2
**Status**: Accepted
**Deciders**: Engineering Team

## Context

The scene graph must hold and query 100,000+ objects (the blueprint's
stated system target) without entering JavaScript's garbage collector in
the hot path. `get_render_list()` runs every rendered frame.

## Decision

The scene graph (`packages/engine`) is written in Rust, compiled to
WebAssembly via `wasm-bindgen`, and called from the engine worker.

## Rationale

- **No GC pauses in the hot path.** `Vec<Option<SceneNode>>` is a flat
  arena with manual, predictable memory layout — there is no garbage
  collector to pause mid-frame, unlike an equivalent JS object/Map-based
  structure.
- **Memory safety without a GC.** Rust's ownership model catches an entire
  class of bugs (use-after-free, data races) at compile time that would
  otherwise need careful manual discipline in a handwritten
  high-performance JS data structure.
- **One serialisation hop, not many.** `get_render_list()` returns a single
  flat `Vec<f32>`, which `wasm-bindgen` copies directly into a JS
  `Float32Array` — that buffer is written straight into the GPU storage
  buffer with no further transformation (see ADR-006's shader format).
- **Numeric throughput.** Per-shape SDF parameter math (corner radius
  clamping, bounds computation) benefits from Rust's optimiser in ways a
  JIT-compiled equivalent cannot guarantee consistently frame over frame.

## Alternatives Considered

| Alternative                                              | Reason rejected                                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure TypeScript scene graph (typed arrays, manual arena) | Achievable, but re-implements by hand what Rust's ownership model gives for free, and still pays a real (if smaller) GC tax for any object-shaped intermediate data |
| AssemblyScript                                           | Smaller ecosystem, less mature tooling, and the team has no advantage over plain Rust for this use case                                                             |
| C++ via Emscripten                                       | No memory safety guarantees; steeper toolchain (Emscripten + CMake) for no benefit over Rust + wasm-bindgen                                                         |

## Consequences

### Positive

- Scene graph performance is decoupled from JS engine GC behaviour.
- `cargo bench` (Criterion) gives reproducible, low-noise performance
  numbers independent of browser JIT warm-up effects.

### Negative

- Two languages, two toolchains, two test runners in one repository.
  Mitigated by Turborepo wiring `wasm-pack build` into the same `pnpm dev`
  pipeline a contributor already runs (see `turbo.json`'s `dependsOn`).
- Every change to the scene graph's public API requires a WASM rebuild
  before the TypeScript side sees the new shape — slower iteration than
  editing TypeScript directly, by design (this boundary is meant to be
  crossed deliberately, not casually).

## Review Criteria

Revisit only if `wasm-bindgen` call overhead is ever shown to dominate
frame time at the 100,000-object target — at that point, consider batching
more state into fewer, larger WASM calls per frame rather than abandoning
Rust/WASM itself.
