# ADR-020: Document Operations and History

- **Status:** Accepted
- **Date:** 2026-07-13
- **Phase:** 7, Milestone 1
- **Related:** ADR-009 (protocol-first IPC), ADR-011 (TypeScript document model), ADR-014 (leaf-only deletion), BLUEPRINT §Phase 7

## Context

Phases 5–6 mutate the document through five independent call sites (inspector
patches, move-drag, creation-drag, deletion, demo seeding) with no shared
choke-point and no way to reverse an edit. Phase 7's M2 (dirty tracking for
files) and M3 (damage model) both need a single seam through which every
mutation flows; undo/redo is the feature that forces that seam to exist and
proves it carries enough information to reverse anything it carried forward.

## Decision

### 1. Reversible ops in the protocol package

`DocumentOp` is a discriminated union in `@graphite/protocol` — `node:create`,
`node:remove`, `node:set-props` — because ops are wire material: Phase 9's
op-based CRDT ships exactly these shapes between peers, and protocol cannot
depend back on `apps/web`. `node:set-props` reuses the existing `NodePatch`
rather than introducing a parallel patch type.

`node:create` carries the full `DocNode` snapshot plus **two indices**:
`childIndex` (position in the parent's `children` array) and `orderIndex`
(position in the document's insertion order, which is paint/rebuild order).
Undoing a deletion must restore z-order exactly; a snapshot without the order
index would re-append and silently reshuffle paint order.

### 2. `applyOp` is the single application authority

`apps/web/src/document/ops.ts` owns applying an op to a `DocumentModel` and
deriving its exact inverse (`AppliedOp { forward, inverse }`). Inverse rules:
create→remove; remove→create with the pre-removal snapshot and both indices;
set-props→a patch holding the prior value of exactly the keys the forward
patch touches. Failures throw a typed `OpError`
(`missing-node | duplicate-node | missing-parent | has-children`) and leave
the document untouched. `DocumentModel` gained three narrowly-scoped methods
to support this: `restoreNode` (splice into both ordering arrays at exact
indices), `getNodeIndices` (capture those indices pre-removal), and
`setStrokeValue` (see §6).

### 3. The funnel has two doors

`workers/engine/scene/apply.ts` is the mutation funnel. Every user edit
becomes exactly one `HistoryEntry` through one of two entry points:

- **`commitEdit(state, label, ops, selectionAfter?)`** — the funnel applies
  the ops (document via `applyOp`, engine via targeted sync), records,
  restores/sets selection, broadcasts `document:nodes` + `history:state`.
  Used by inspector patches (`applyNodePatch`, relocated here from
  `scene/mutate.ts`) and deletion. Batches are all-or-nothing: an `OpError`
  mid-batch rolls the document back via the collected inverses, rebuilds the
  scene, posts `engine:error`, and records nothing.
- **`recordCompletedEdit(state, label, applied, selectionBefore)`** — for
  60 Hz drag gestures (move, creation) that already wrote document + engine
  incrementally through `writePosition`/`writeSize` for responsiveness. The
  producer supplies the precomputed forward/inverse pair at gesture end;
  before-state is captured naturally at gesture start (`moveStartBoundsX/Y`,
  the creation draft). One gesture, one entry; interim writes stay outside
  history by design.

Undo/redo (`undoEdit`/`redoEdit`) replay entries exclusively through
`applyOp` — the same authority that produced them.

### 4. Engine sync is deliberately asymmetric

- `node:set-props` and `node:remove` mirror to the SceneGraph with the same
  targeted calls Phase 6 used — order-safe and cheap.
- `node:create` forces a full `rebuildSceneFromDocument`: the SceneGraph can
  only append, but a create op may splice mid-order (undo of a mid-stack
  delete), and paint order must follow document order. This is the exact seam
  M3's damage model replaces with incremental insertion; the cost today is
  one rebuild per undo-of-delete/redo-of-create, which is the Phase 6 cost of
  any structural change.

### 5. History semantics

`workers/engine/history.ts` is a pure, bounded stack (`HISTORY_LIMIT = 100`,
oldest evicted silently). Entries store `label`, `forward[]`, `inverse[]`
(pre-reversed into undo-application order), and `selectionBefore/After`
(node UUIDs — restored through the one existing `setSelection` path after
resolving against the possibly-rebuilt arena mapping).

Dirty tracking uses monotonic sequence numbers, not stack indices:
`dirty = currentSeq !== savedSeq`, with `floorSeq` representing "below the
bottom" after eviction. Once the saved position is evicted, no amount of
undoing reaches it and the arithmetic reports permanently-dirty-until-save
with no special case. `document:request_save` marks saved (mod+S clears
dirty under the current localStorage autosave); M2 re-points this at real
file saves. `document:new`/`document:load` clear the stack.

`history:state` broadcasts after every history-affecting action and carries
an optional `announce { action, label }` when caused by undo/redo; the main
thread renders "Undid Move Rectangle" into a `role="status"` live region in
the StatusBar — the canvas is invisible to screen readers, so this is the
only non-visual evidence an undo happened.

### 6. No-op discard and the stroke-null refinement

Raw inspector patches are normalised by `effectiveNodePatch` (pure, in
`ops.ts`): size floored at 1, corner radius clamped to `min(w, h)/2` with
shrink re-clamp — the Phase 6 derivation extracted so the _forward op
records the clamped values_ (redo must not depend on re-deriving clamps).
A patch that changes nothing is discarded entirely: no entry, no engine
write, no broadcast — no junk "Edit Rectangle" entries on the stack.

`stroke: null` now stores an honest `null` in the document
(`DocumentModel.setStrokeValue`) instead of Phase 6's lossy
transparent-zero-width encoding; only the SceneGraph — which has no
"no stroke" — still receives the zero encoding. Required for exact undo
round-trips (a node born with `stroke: null` must come back as `null`).
`mutate.test.ts` was updated accordingly.

## Deviations from the approved Phase D contract

Flagged for review — each was forced by the codebase audit, not preference:

1. **Op union trimmed to producers.** `node:reparent`/`node:reorder` and the
   `SubtreeSnapshot` type are deferred to the milestone that ships their
   producer (layers drag-reorder). Shipping them now would codify
   z-order-vs-children-order semantics no UI can exercise, and deletion is
   leaf-only (ADR-014), so a subtree snapshot is always a single node —
   replaced by the single-node create op with the two explicit indices,
   which the approved shape lacked and undo fidelity requires.
2. **No `begin/record/commit/abort` transaction API.** Both drag producers
   capture before-state naturally at gesture start and record one entry at
   gesture end (`recordCompletedEdit`); a streaming-coalescing transaction
   API would produce byte-identical entries through more machinery with zero
   current callers. It gets introduced with its first real producer.
3. **History mirror lives in `EngineContext`, not `uiStore`.** `uiStore`
   persists to localStorage; `canUndo` must never survive a reload. The
   mirror follows the exact `selectedIds` pattern (worker broadcast →
   bridge → `useEngine` state → memoised stable context).
4. **E2E scope reduced to enablement gating.** CI Playwright runs without a
   GPU (`helpers.ts` gate-zero contract: the engine settles into its error
   state; no document ever loads), so a real mutate→undo→redo e2e is
   structurally impossible today. `history.spec.ts` asserts the disabled
   commands stay out of the palette and the chords are safe no-ops; full
   behaviour is covered by `undoRedo.test.ts` against a real document,
   history, and selection with only rebuild/messaging mocked. **Getting a
   GPU (or software WebGPU) into CI is now a named M5 prerequisite** — the
   M5 performance e2e cannot exist without solving it.

## Alternatives considered

- **Command pattern (undo objects with `execute()`/`revert()` closures)** —
  rejected: closures aren't serialisable, which forfeits the CRDT alignment
  and makes history entries impossible to persist or inspect.
- **Snapshot-based undo (store full document per entry)** — rejected:
  O(document) memory per entry collapses at the 10k–100k node targets;
  inverse patches are O(change).
- **Op application inside `DocumentModel` methods returning inverses** —
  rejected: spreads inverse-derivation across every setter and couples the
  model to history concerns; a single `applyOp` keeps the model's API flat
  and the reversal logic in one reviewable place.
- **Targeted SceneGraph insertion for create ops** — rejected for now:
  correct only when the op appends at the end; silently wrong paint order
  otherwise. Rebuild is always correct and is already the sanctioned
  structural path until M3.
- **Index-based dirty tracking** — rejected: breaks under eviction (the
  saved index shifts), needing special cases sequence numbers avoid.

## Consequences

- Every mutation now produces exactly one labelled, reversible entry;
  M2's dirty flag and M3's damage marking attach to `commitEdit`/
  `recordCompletedEdit` without touching producers again.
- Undo of structural changes costs a scene rebuild until M3 — acceptable at
  MVP scale, benchmarked in `ops.bench.ts`.
- The funnel is the collaboration seam: Phase 9 maps `HistoryEntry.forward`
  onto CRDT broadcast and remote ops onto `executeOps` with recording
  disabled.
