# ADR-029: Phase Resequencing for the Parity Programme

- **Status:** Accepted
- **Date:** 2026-07-20
- **Phase:** Programme-level (supersedes the phase table in BLUEPRINT v3)
- **Related:** ADR-011 (TypeScript document model — chosen for Yjs),
  ADR-020 (document ops as wire material), ADR-023 (spatial-index
  deferral), ADR-030 (document-model extraction), ADR-031 (path rendering),
  [PARITY.md](../PARITY.md),
  [INTEGRATION-BLUEPRINT.md](../roadmap/INTEGRATION-BLUEPRINT.md)

## Context

The standing roadmap ran Phase 8 = Backend, Phase 9 = Collaboration,
Phase 10+ = "plugins, components, variables, offline, docking". That
ordering predates the committed Figma-parity feature scope, which adds
seven substantial subsystems — path/glyph rendering, text, layout,
components, variables, prototyping, dev-mode inspection — most of which
expand the document schema.

The question this ADR answers: **does the document model finish expanding
before or after collaboration ships?**

## Decision

Collaboration moves behind the document-model expansion. The new sequence:

| Phase | Scope                                                                     | Epics         |
| ----- | ------------------------------------------------------------------------- | ------------- |
| 7     | MVP (closing — capture outstanding)                                       | —             |
| 8     | **Vector & Text** — path render pipeline, geometry, booleans, text engine | C1, C4        |
| 9     | **Layout** — auto layout, grid, constraints                               | C2            |
| 10    | **Components & Variables**                                                | C3, A2        |
| 11    | **Backend** — Axum, PostgreSQL, Redis, JWT, S3                            | C6 groundwork |
| 12    | **Collaboration** — Yjs, presence, comments, versions, permissions        | C6            |
| 13    | Prototyping runtime                                                       | C5            |
| 14    | Dev mode & handoff                                                        | A3            |
| 15    | Illustration mode                                                         | A1            |
| 16    | Plugins & extensibility                                                   | standing      |
| 17+   | AI layer and remaining gated items                                        | A4            |

**Phases 11 and 12 keep the standing backend and collaboration scope
verbatim.** They change position, not content. ADR-011's choice of a
TypeScript worker document model — made specifically to enable Yjs —
stands unchanged; it simply binds later, against a settled schema.

## Why

**Schema churn is free before multiplayer and expensive after.** A CRDT
binding is a mapping from the document schema onto Yjs types. Shipping
collaboration over today's `frame | rect | ellipse` model means authoring
that mapping, then reauthoring it for paths, then text, then components,
then variables, then layout — five reauthorings, and every one after the
first live document is a migration of concurrently-edited user data.
Sequencing the expansion first means the mapping is authored **once**,
against a schema that has stopped moving.

Migrating live collaborative documents is among the hardest operations
this project will ever perform. Doing five avoidable ones is a
self-inflicted wound.

**Secondary benefit: the largest technical risk moves first.** The
path/glyph render pipeline (ADR-031) is the biggest unknown in the
programme. Phase 8 front-loads it, when a wrong answer is still cheap to
reverse.

## Alternatives considered

- **Keep the standing order (backend and collaboration at 8/9).** Delivers
  sharing and persistence sooner — a real user-facing benefit, and the
  strongest argument against this ADR. Rejected because it buys that
  benefit with five CRDT remappings, each a live-document migration once
  users exist.
- **Ship collaboration early behind aggressive schema versioning.** Keeps
  both orderings' benefits in theory. Rejected: it makes every subsequent
  schema change carry permanent migration and compatibility machinery, and
  pays that complexity tax across the whole programme rather than once.
- **Parallel tracks — collaboration alongside the model expansion.**
  Rejected on capacity, not architecture. Two concurrent tracks touching
  the same document model is exactly the coordination problem a small team
  cannot absorb.

## Consequences

- Sharing, persistence, and multiplayer arrive materially later. Accepted
  deliberately, with the reasoning above on the record.
- Collaboration carries its unknowns longer; the risk is contained by
  ADR-011 and ADR-020 having already fixed the architecture, leaving
  implementation rather than design.
- Phase numbers in `README.md`, `BLUEPRINT.md`, and prose across
  `docs/` refer to the new sequence from this commit forward. Historical
  ADRs keep their original phase references — they were accurate when
  written, and rewriting them would falsify the record.
- Every phase in the new sequence carries the standing exit checklist and
  its own A–H cycle per milestone; resequencing changes order, never
  process.
