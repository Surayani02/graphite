# Architecture Decision Records

Every significant decision, written **at the time it was made**. ADRs are
not edited to match later reality — a superseding ADR is written instead,
and the original keeps its record. Phase numbers inside historical ADRs
refer to the sequence in force when they were written (see ADR-029).

Start here: [BLUEPRINT.md](../BLUEPRINT.md) is the architecture map,
[PARITY.md](../PARITY.md) the capability matrix, and
[roadmap/INTEGRATION-BLUEPRINT.md](../roadmap/INTEGRATION-BLUEPRINT.md) the
implementation plan for the parity programme.

## Foundation and governance

| ADR                                              | Decision                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| [001](./ADR-001-monorepo-structure.md)           | pnpm workspace + Turborepo; package layout and build graph           |
| [012](./ADR-012-no-meta-framework.md)            | No meta-framework for the editor — Vite + TanStack Router            |
| [022](./ADR-022-hardening-and-governance.md)     | Validation ceilings, coverage floors, CI gates, dependency policy    |
| [024](./ADR-024-bundle-ceiling-recalibration.md) | Main-chunk gzip ceiling raised to 190 kB with measured justification |
| [028](./ADR-028-spelling-convention.md)          | US English for identifiers, UK English for prose and UI copy         |
| [029](./ADR-029-phase-resequencing.md)           | Document-model expansion sequenced ahead of collaboration            |

## Engine, rendering, and performance

| ADR                                        | Decision                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| [002](./ADR-002-webgpu-rendering-api.md)   | WebGPU as the rendering API; no WebGL fallback                                             |
| [004](./ADR-004-rust-wasm-engine.md)       | Rust compiled to WebAssembly for the graphics engine                                       |
| [005](./ADR-005-wasm-bindgen.md)           | wasm-bindgen for the JS↔WASM boundary                                                      |
| [006](./ADR-006-sdf-shape-rendering.md)    | Signed-distance-field rendering for primitive shapes                                       |
| [008](./ADR-008-slot-map-scene-storage.md) | Arena slot-map scene storage; ids never reused                                             |
| [023](./ADR-023-spatial-index-deferral.md) | Spatial index deferred — linear hit-test measured sufficient; re-adoption trigger recorded |
| [025](./ADR-025-damage-model.md)           | Damage-tracked render loop with explicit paint order; parks when idle                      |
| [031](./ADR-031-general-path-rendering.md) | Hybrid pipeline — SDF fast path retained, lyon tessellation added for paths and glyphs     |

## Worker boundary and IPC

| ADR                                        | Decision                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| [003](./ADR-003-offscreencanvas-worker.md) | OffscreenCanvas transferred to a Web Worker; main thread never times frames |
| [009](./ADR-009-protocol-first-ipc.md)     | A versioned protocol package is the only layer crossing                     |
| [027](./ADR-027-dev-only-surfaces.md)      | Dev-only surfaces compiled out at both ends, not hidden                     |

## Document model and persistence

| ADR                                                     | Decision                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [007](./ADR-007-color-representation.md)                | Colour representation across the engine and document                                        |
| [010](./ADR-010-document-crate-status.md)               | The Rust `document` crate remains a placeholder                                             |
| [011](./ADR-011-typescript-document-model.md)           | The document model is TypeScript, worker-owned — chosen for Yjs                             |
| [020](./ADR-020-document-operations-and-history.md)     | Operation-sourced undo/redo; ops are wire material                                          |
| [021](./ADR-021-graphite-file-format-and-file-layer.md) | `.graphite` format, File System Access with download fallback                               |
| [026](./ADR-026-export-architecture.md)                 | SVG on the main thread, raster via off-screen GPU readback                                  |
| [030](./ADR-030-document-model-package.md)              | Extract the model to `@graphite/document-model`; boundaries, API, serialisation, migrations |

## UI architecture

| ADR                                                   | Decision                                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| [013](./ADR-013-m2-ui-data-flow.md)                   | Stable/frame context split; UI data flow from the engine                      |
| [014](./ADR-014-m3-tools-and-floating-layer.md)       | Tool model and the floating overlay layer                                     |
| [015](./ADR-015-command-and-shortcut-architecture.md) | One command registry behind both the palette and shortcuts                    |
| [016](./ADR-016-form-stack-deferral.md)               | Form stack deferred; Zod rejected for internal payloads                       |
| [017](./ADR-017-routing.md)                           | TanStack Router; lazy settings route; bundle ceiling introduced               |
| [018](./ADR-018-theming.md)                           | Theming as a CSS-variable swap with a single DOM writer                       |
| [019](./ADR-019-panel-registry.md)                    | Panel descriptor registry; the shell places areas, the registry places panels |

## Numbering

Sequential, never reused. The next free number is **032**. Reserve it in
your working branch before writing, so two parallel efforts do not collide.
