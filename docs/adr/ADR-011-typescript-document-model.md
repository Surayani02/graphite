# ADR-011: TypeScript Document Model for Phase 5

**Date**: 29-06-2026  
**Status**: Accepted  
**Deciders**: Engineering Team

## Context

Phase 5 requires a serialisable, UUID-keyed document model separate from
the engine's arena-indexed `SceneGraph`. The `packages/document` Rust crate
was defined in the blueprint for this purpose.

## Decision

Implement the document model as a TypeScript class (`DocumentModel`) in
`apps/web/src/document/model.ts`, running in the engine worker thread.

## Rationale

1. **Phase 9 CRDT is Yjs** — ADR-005 specifies Yjs for the initial CRDT.
   Yjs is JavaScript-native. A TypeScript document model integrates with
   Yjs directly (`Y.Map`, `Y.Array`) without a WASM boundary.

2. **No extra WASM initialisation** — A Rust document crate would require a
   second `await init()` in the worker, increasing startup latency and
   complicating the worker boot sequence.

3. **`localStorage` via IPC** — The document must be serialised to JSON and
   stored by the main thread (`localStorage` is DOM-only). A TypeScript
   model already serialises to JSON natively; no additional WASM serialisation
   boundary is needed.

## Consequences

### Positive

- Single WASM module (`@graphite/engine`) in the worker.
- Phase 9 Yjs integration is trivial: mutate `DocumentModel` methods and
  broadcast via a Yjs provider.

### Negative

- `packages/document` Rust crate remains a stub until the CRDT decision
  is revisited.

## Review Criteria

Reconsider migrating to a Rust document model if:

- Phase 9 adopts Auto-merge (Rust-native CRDT) instead of Yjs.
- Document serialisation/deserialisation becomes a measured bottleneck
  (target: < 10 ms for 10 000 nodes).
