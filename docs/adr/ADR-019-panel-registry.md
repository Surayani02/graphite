# ADR-019: Panel descriptor registry

**Status**: Accepted — 2026-07-08 · **Context**: Phase 6, Milestone 5

## Context

Through M4, `AppShell` hardcoded which panel component sits in which grid
column. The long-term roadmap includes dockable panels (P10). M5 takes the
first architectural step toward that without building docking itself: making
panels data the shell renders from, rather than names it hardcodes.

## Decision

**Panels become descriptors in a registry** mirroring the command registry
(ADR-015) deliberately — factory + singleton, insertion order preserved,
duplicate-id throw — so a contributor who has seen one registration idiom
has seen both. `PanelDescriptor` is `{ id, title, area, order, component,
isVisible }`; `PanelArea` is `left | right` today (the extension point for
future dock zones). `AppShell` renders each column through a `PanelAreaSlot`
that queries the registry `byArea` and filters on each descriptor's
`isVisible` — the shell now knows _where_ areas go, not _which_ panels exist.

**Visibility stays bound to existing store flags.** `isVisible(state)` reads
the current `layersOpen`/`inspectorOpen` — the persisted flags M2–M4 already
use. No new persistence, no storage migration: this milestone is pure
indirection with zero behaviour change. `LeftPanel` renders its own
collapsed rail internally (driven by `layersOpen`), so it registers as
always-present; the inspector is shown/hidden wholesale by `inspectorOpen`.

## Consequences

**Positive.** `AppShell` no longer imports panel components directly; adding
or reordering a panel is a descriptor change; P10 docking replaces the
`isVisible` bindings with layout state against descriptors that already
exist; plugins (P10) contribute panels through the same idiom as commands.

**Costs.** One layer of indirection between shell and panels — justified by
the docking trajectory, not yet by today's two panels. `PanelAreaSlot`
subscribes to the whole UI store (a descriptor's `isVisible` may read any
field); acceptable because the store is small and the predicate evaluations
are trivial.

## Alternatives considered

Keep panels hardcoded in `AppShell` until P10 — rejected: the registry is
cheap now and establishes the pattern before docking needs it, whereas
retrofitting it under a docking library later is costlier. Adopt a docking
library (dockview / golden-layout) now — rejected: M5 ships the _registry_;
docking is P10, and a library now would dictate the docking model before its
requirements exist.
