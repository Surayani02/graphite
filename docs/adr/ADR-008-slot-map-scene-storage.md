# ADR-008: Slot-Map Scene Storage

**Date**: Phase 2
**Status**: Accepted
**Deciders**: Engineering Team

## Context

The scene graph needs O(1) lookup by ID for `set_stroke`, `set_corner_radius`,
`set_node_position`, and `get_node_bounds` — all called from per-frame or
per-drag-event code paths — while supporting an arbitrary, growing number
of nodes.

## Decision

Store nodes in a flat `Vec<Option<SceneNode>>`, indexed directly by a
monotonically-increasing `u32` ID (`NodeId`). IDs are never reused within
a single `SceneGraph` instance.

## Rationale

- **O(1) access, no hashing.** `self.nodes[id as usize]` is direct array
  indexing — faster and simpler than a `HashMap<NodeId, SceneNode>` for the
  dense, append-heavy access pattern this scene graph actually has (nodes
  are added far more often than removed, and there is no current "remove"
  operation at all as of this review).
- **Stable IDs across mutation.** Because IDs are never reused, a `NodeId`
  captured by the TypeScript side (e.g. `selectedId`, or the
  `uuidToEngineId` map in the engine worker) remains valid for the
  lifetime of that `SceneGraph` instance, with no risk of silently
  pointing at a different, later-inserted node.
- **`Option<SceneNode>` reserves room for `remove`.** No removal API exists
  yet, but the `Option` wrapper means a future `remove_node(id)` can set a
  slot to `None` without shifting every subsequent index — removal is an
  O(1) write, not an O(n) array shift.

## Alternatives Considered

| Alternative                                                                     | Reason rejected                                                                                                                                                                                                                                                                                     |
|---------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `HashMap<NodeId, SceneNode>`                                                    | Hashing overhead with no benefit for this access pattern; iteration order also becomes hash-order rather than insertion-order, which the current z-order semantics (insertion order = render order, see `hit_test`'s tests) depend on                                                               |
| Generational slot-map (e.g. the `slotmap` crate, with an index+generation pair) | Adds a generation-counter dependency and an extra `u32` per ID for "detect a stale handle to a removed-then-reused slot" safety this scene graph doesn't need yet, since IDs are never reused. Worth reconsidering if/when slot reuse is introduced for memory efficiency at very large scene sizes |
| `Vec<SceneNode>` with explicit tombstone removal (swap-remove)                  | Swap-remove changes a node's index on removal, breaking ID stability — exactly the property this design exists to preserve                                                                                                                                                                          |

## Consequences

### Positive

- Every per-node mutation method (`set_stroke`, `set_corner_radius`,
  `set_node_position`) is O(1).
- `node_count()` is now a maintained `u32` field (see this review's
  QUAL-04 entry) rather than a per-call scan, keeping every public method
  on this type O(1) or O(n) only where genuinely necessary
  (`get_render_list`, `hit_test` — both must visit every node at least
  once by nature).

### Negative

- The arena can have "holes" once removal exists (a `None` slot with no
  node), so `nodes.len()` is _not_ the same as the live node count — this
  is exactly why `node_count()` is a separately maintained counter, not
  `self.nodes.len()`.
- No external crate dependency (e.g. `slotmap`) means no generational
  safety net if a stale ID is ever held past a node's removal — acceptable
  today since no removal API exists; revisit if/when one is added.

## Review Criteria

Revisit the "no generational safety" trade-off when a `remove_node` API is
introduced — at that point, decide whether ID reuse is acceptable (current
design: it would not be, since IDs never reuse) or whether a lightweight
generation check is worth adding.
