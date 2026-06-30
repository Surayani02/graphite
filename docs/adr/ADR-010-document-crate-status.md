# ADR-010: `packages/document` Rust Crate — Status and Ownership

**Date**: Phase 5 architecture review
**Status**: Accepted
**Deciders**: Engineering Team

> **Note on numbering**: this ADR is scoped to the `packages/document`
> _Rust crate's_ unresolved ownership/future question (raised during this
> review's ARCH-09 finding). It is distinct from
> [ADR-011](./ADR-011-typescript-document-model.md), which already covers
> _why TypeScript was chosen_ for the active document model — an earlier
> draft of this review's recommendations listed ADR-010 against that same
> "TypeScript document model" topic, which would have duplicated ADR-011.
> This ADR covers the narrower, still-open question instead: what happens
> to the Rust crate that ADR-011's decision left behind.

## Context

`packages/document` is a Rust crate in the Cargo workspace containing
Phase-0 scaffolding (a `version()` function and a `NodeId` newtype) that
predates ADR-011's decision to build the actual document model in
TypeScript. The crate compiles, has passing tests, and is not deprecated
— but nothing imports it, and no document existed explaining whether
contributors should build into it, ignore it, or expect it to be removed.

## Decision

`packages/document` remains in the workspace, unused, as a placeholder for
one of three possible futures (see `packages/document/README.md` for the
full list: staying unused indefinitely, becoming a WASM-accelerated
escape hatch if TypeScript document operations become a measured
bottleneck, or being absorbed into `packages/engine` if the
document/scene-graph boundary stops being meaningful). **No new
functionality should be built into this crate** until one of those
futures is chosen.

## Rationale

- Deleting the crate outright is premature: ADR-011 itself notes its
  decision should be revisited if document serialisation/deserialisation
  ever becomes a measured bottleneck (target: <10ms for 10,000 nodes) —
  at that point, this crate is the natural landing spot for a WASM-side
  implementation, and recreating the Cargo workspace wiring from scratch
  is pure overhead compared to leaving a documented placeholder in place.
- Leaving it _undocumented_, however, actively misleads contributors —
  someone grepping for "document model" finds this crate before they find
  `apps/web/src/document/model.ts`, with no signal that the Rust one is
  inert.

## Alternatives Considered

| Alternative                                                                 | Reason rejected                                                                                                                                                                                                                            |
|-----------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Delete the crate now                                                        | Throws away workspace wiring (Cargo.toml entry, CI matrix coverage) that has a plausible future use; cheap to keep, not cheap to perfectly recreate later                                                                                  |
| Build the real document model here instead of TypeScript, reversing ADR-011 | Reopens a decision that was made deliberately for a concrete reason (Yjs/CRDT integration in Phase 9 is JS-native); no new evidence has emerged that changes that calculus                                                                 |
| Leave it exactly as-is with no documentation                                | The status quo this ADR replaces — confirmed during this review to be actively confusing (the original analysis report itself mischaracterised this crate's contents, having apparently mistaken it for an untouched `cargo new` template) |

## Consequences

### Positive

- `packages/document/README.md` now gives a direct, immediate answer to
  "what is this and should I touch it."

### Negative

- A genuinely unused crate sits in the workspace, compiled by CI on every
  run, for a hypothetical future need. The cost is small (one small crate,
  a few seconds of CI time) relative to the cost of losing the workspace
  wiring.

## Review Criteria

Revisit at the first of: (a) document operations in TypeScript are
profiled and shown to be a bottleneck, (b) Phase 9's CRDT integration
reveals a concrete need for Rust-side document logic, or (c) this crate
has remained unused long enough (suggest: through Phase 8) that deleting
it is clearly lower-cost than continuing to carry it.
