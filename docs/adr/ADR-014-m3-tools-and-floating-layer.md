# ADR-014: Phase 6 M3 — Tools, Deletion, and the Floating-Layer Dependency

**Date**: 2026-07-06
**Status**: Accepted
**Deciders**: Surajit (project lead), Claude (principal architect)

## Context

Milestone 3 gives the editor its first creation and deletion capability
(rectangle/ellipse tools, leaf-shape delete) and its first floating UI
(tooltips, context menus). Two decisions from the M3 blueprint needed a
recorded rationale once actually implemented: which floating-layer
dependency to bring in, and how tool-state ownership splits between the
Zustand store and the worker now that the worker can change tools on its
own.

## Decisions

1. **`@floating-ui/react` only — React Aria does not enter this
   milestone.** The blueprint's "React Aria (where appropriate)" slot
   moves to M4, where `useComboBox` genuinely earns it for the command
   palette. For M3's actual surface — a tooltip and a context menu —
   Floating UI's own interaction hooks (`useHover`, `useFocus`,
   `useDismiss`, `useRole`, `useListNavigation`, `useTypeahead`,
   `FloatingFocusManager`) are a complete, ARIA-correct toolkit. Adding
   React Aria on top for the same job fails the three-question dependency
   test outright: it would exist to duplicate capability already present,
   not to solve a problem Floating UI leaves unsolved.
2. **Tool state ownership**: the Zustand store remains the single source
   of "what tool is the user in," but the _engine_ can now override it —
   specifically, auto-returning to `select` once a shape-creation drag
   commits (the Figma convention). This is a genuine second writer to a
   piece of UI state, which the architecture's "Zustand is UI-only, engine
   never touches it" framing didn't anticipate. Resolved via a new
   outbound `tool:changed` protocol message and a two-way
   `useSyncToolWithEngine`, rather than by giving the worker direct store
   access (which would violate the React/worker boundary) or by having
   every panel poll the worker for tool state (which would duplicate the
   store's job). The store is still the only thing components read from;
   the worker's opinion reaches it through the one designated crossing
   point, same as every other engine→UI signal.
3. **Deletion is leaf-scoped, not cascading.** Frames refuse deletion while
   they have children, at both the Rust and TypeScript layers
   independently (neither trusts the other to have checked first).
   Cascading a frame's contents is a data-loss operation with no undo
   system yet to protect it — Phase 7 introduces the operation log;
   cascading delete is revisited there, wrapped in undo, not before.
4. **Creation defers node allocation until the drag threshold.** A plain
   click never allocates-then-immediately-resizes a throwaway node; it
   takes a separate, simpler "default size at the click point" path.
   Escape while dragging cancels the shape but deliberately does _not_
   also return the tool to `select` (asymmetric with a successful commit,
   which does) — cancelling means "not that one," not "done creating."

## Consequences

**Positive**: one floating-layer dependency instead of two overlapping
ones; tool-state ownership stays centralized in the store despite gaining
a second writer; deletion can't corrupt the scene graph or the document
independently of each other; creation never litters the document with
throwaway nodes from accidental single-pixel drags.

**Negative**: the two-way tool sync is more subtle than the one-way
version it replaces — an initial two-effect, flag-based implementation
looked correct but had a real timing bug (the store write it makes
retriggers the send-effect on the _next_ render with the flag already
consumed, so the echo it was meant to suppress fired one render late
anyway); the shipped version compares against a remembered last-synced
_value_ instead, which is immune to how many renders the reconciliation
takes. Recorded here since it's exactly the kind of bug that looks fixed
until a test forces the actual render sequence.

## Review Criteria

Decision 1 re-opens at M4, when the command palette's combobox needs React
Aria on its own merits. Decision 3 re-opens at Phase 7 alongside the
operation log.
