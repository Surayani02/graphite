# ADR-005: wasm-bindgen for TypeScript Bindings

**Date**: Phase 2
**Status**: Accepted
**Deciders**: Engineering Team

## Context

Having chosen Rust/WASM for the engine (ADR-004), the Rust↔TypeScript call
boundary needs a binding mechanism. Hand-writing this boundary (manual
memory layout, manual `.d.ts` files, manual marshalling) is the main
alternative.

## Decision

Use `wasm-bindgen` (via `wasm-pack build --target web`) to generate the
JS glue and `.d.ts` types for `packages/engine` automatically from
`#[wasm_bindgen]`-annotated Rust.

## Rationale

- **Generated types can't drift from the implementation.** `pkg/graphite_engine.d.ts`
  is produced directly from the Rust source on every `wasm-pack build` —
  there is no second, hand-maintained type definition file that can fall
  out of sync with what the Rust code actually does.
- **Idiomatic mapping for the cases we need.** `Option<u32>` maps to
  `number | undefined`; `Vec<f32>` maps to `Float32Array`; both used
  directly by `SceneGraph::hit_test` and `SceneGraph::get_render_list`
  respectively, with no manual marshalling code on either side.
- **`--target web`, not `--target bundler`.** The `web` target produces a
  module with a `fetch`-based `init()` function that works directly inside
  a module Worker (`new Worker(url, { type: "module" })`) without an extra
  bundler plugin — `apps/web`'s Vite config aliases `@graphite/engine`
  straight to the generated `pkg/graphite_engine.js`.

## Alternatives Considered

| Alternative                                                                   | Reason rejected                                                                                                                                                                                               |
|-------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Hand-written bindings (manual `WebAssembly.instantiate`, manual memory views) | Far more error-prone; every new Rust method needs hand-written marshalling and a hand-written type signature that can silently drift                                                                          |
| `wasm-pack build --target bundler`                                            | Requires `vite-plugin-wasm` or equivalent; the `web` target works in a module Worker with zero extra Vite plugins                                                                                             |
| wasm-bindgen alternatives (e.g. `wit-bindgen` / Component Model tooling)      | Substantially more setup complexity for capabilities (cross-language component composition) this project doesn't need; wasm-bindgen's browser/JS-specific tooling is the better fit for a browser-only target |

## Consequences

### Positive

- One source of truth (the Rust source) for the engine's public API shape.
- `Option<T>` and `Vec<T>` map onto idiomatic, ergonomic TypeScript types
  with no sentinel values or manual buffer slicing required at call sites.

### Negative

- `wasm-opt`'s bulk-memory validation requires a Cargo.toml override
  (`package.metadata.wasm-pack.profile.release.wasm-opt`) on recent Rust
  toolchains that emit `memory.copy` instructions — a known, documented
  rough edge in the wasm-pack ecosystem, not specific to this project.

## Review Criteria

No planned revisit — wasm-bindgen is the de facto standard for this exact
use case (Rust library, browser JS consumer) and there is no signal that
should change.
