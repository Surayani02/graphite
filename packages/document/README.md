# @graphite/document (Rust crate)

**Status: placeholder, not currently consumed by anything.**

## What's here today

`src/lib.rs` defines a `version()` function and a `NodeId` newtype (string
wrapper with `Display`, equality, and serde round-trip support) — Phase 0
scaffolding, not a functioning document model. It compiles, has its own
test suite, and is part of the Cargo workspace, but nothing imports it.

## Where the real document model lives instead

The active document model — the actual source of truth for the scene — is
`apps/web/src/document/model.ts`, a TypeScript class. See
[ADR-011](../../docs/adr/ADR-011-typescript-document-model.md) for why:
in short, Phase 9's collaboration layer is built on Yjs, which is
JavaScript-native, so a TypeScript document model avoids a second WASM
initialisation step and integrates with Yjs directly.

## Why this crate hasn't been deleted

Three plausible futures exist, and none has been decided yet:

1. **Stays unused indefinitely** — if `apps/web/src/document/model.ts`
   continues to scale fine in pure TypeScript (current target: <15ms to
   parse/validate a 1,000-node document — see `document.bench.ts`), there
   may never be a reason to revisit this.
2. **Becomes a performance escape hatch** — if a future profiling pass
   shows document operations (large paste, bulk transform, multi-thousand
   node CRDT merge) becoming a bottleneck in JS, this crate is where that
   logic would move, compiled to WASM like `packages/engine`.
3. **Absorbed into `packages/engine`** — if the boundary between "document"
   and "scene graph" stops being meaningful at some point, this crate could
   simply be deleted and any genuinely-needed Rust-side document logic
   added directly to `graphite-engine`.

**Until one of those is decided: do not build new functionality into this
crate.** It is not on any critical path. If you're looking for the
document model, you want the TypeScript one above.
