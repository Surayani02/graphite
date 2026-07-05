# ADR-013: Phase 6 M2 — UI Data Flow, Form Strategy, and Primitive Placement

**Date**: 2026-07-05
**Status**: Accepted
**Deciders**: Surajit (Project Lead)

## Context

Milestone 2 (Layers + Inspector) shipped with four architecture-relevant
choices that were made in code but never recorded, and the M2 closeout audit
added two more that needed a decision. This ADR records all six so the
deviation-without-documentation gap is closed.

## Decisions

1. **Panel data flow — `document:nodes` full-list snapshot.** The worker
   pushes the complete node list after load/new, after every applied
   `node:update`, and once at drag-end — never per pointermove. The
   originally sketched alternative (single-node `node:changed` payloads) is
   deferred, not rejected: one message shape serves load, edit, and drag
   with one code path, and consumers are memoised (`useMemo(buildTree)`,
   memoised selected-node lookup). Recorded ceiling: acceptable through the
   MVP object budget (10k); **must be revisited at Phase 7 together with
   dirty flags**, where single-node or dirty-set pushes become the natural
   shape.
2. **Selection has one authority.** `selection:set` (Layers click/keyboard)
   resolves UUID → arena id in the orchestrator and funnels into the same
   worker `setSelection()` the canvas pointer path uses. No second selection
   store can exist.
3. **Inspector fields are hand-rolled draft/commit primitives — a scoped
   exception to the charter's React Hook Form + Zod mandate.** Three-question
   test: RHF exists to orchestrate multi-field form state and submission; the
   Inspector has no submission — each field commits independently on
   blur/Enter against a live document. Zod validates structured payloads;
   each field needs a parse-or-revert and a clamp, which is five lines at the
   choke-point. RHF + Zod remain **required** for submission-style forms:
   Settings (M5), dialogs, and every Phase 8 auth/account surface.
4. **Primitive placement.** `NumberField`/`ColorField` live in
   `apps/web/src/components/inspector/` for M2 and migrate to
   `packages/ui-core` at M3 entry, when the tools rail, icon set, and
   menu/tooltip primitives force ui-core's React + RTL harness to be built
   anyway — one package build-out instead of two. Blueprint updated to match.
5. **Corner radius is clamped at one choke-point** —
   `applyNodePatch` (worker) clamps to `min(w, h) / 2` and writes the same
   value to SceneGraph and DocumentModel, including re-clamping when a size
   patch shrinks a node below its stored radius. UI and Rust deliberately do
   not duplicate the clamp.
6. **Engine context is split by update frequency.** `EngineContext` carries
   interaction-rate state and stable senders (memoised); `EngineFrameContext`
   carries `stats` + `viewport` at frame cadence. Only components whose job
   is displaying per-frame numbers (StatusBar) may subscribe to the frame
   context. This is the re-render containment contract the shell relies on.

## Consequences

**Positive**: panels stay dumb views over one pushed snapshot; selection
cannot desync; the form-stack rule is now explicit instead of violated;
radius invariants hold no matter who writes; frame-cadence work is confined
to one component.

**Negative**: full-list pushes carry O(n) serialisation per edit (bounded by
decision 1's review gate); primitives move packages at M3 (small, planned
churn); two contexts are marginally more ceremony than one.

## Review Criteria

Decision 1 re-opens at Phase 7 (dirty flags / 10k verification). Decision 4
executes at M3 entry. Decision 3 re-opens if the Inspector ever gains
submission semantics (multi-field apply, validation across fields).
