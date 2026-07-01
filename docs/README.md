# Engineering Blueprint

Condensed reference. For the full architectural reasoning behind any
individual decision, see [docs/adr/](./adr/) — this document is a map of
_what_ was decided; the ADRs are the _why_.

## Technical philosophy

The browser is not the rendering model. The DOM is not the canvas. The
design document is a custom scene graph; rendering happens through a GPU
pipeline; heavy computation lives in WebAssembly. Layers are strictly
separated: UI ⊥ graphics engine ⊥ collaboration ⊥ persistence. React owns
exactly one thing — panels, dialogs, menus, toolbars, overlays,
inspectors, forms, the viewport container, and UI interactions. It never
owns scene graph, renderer, GPU, networking, or collaboration state.

## Runtime architecture

```
Main thread                     Worker thread                  Backend (Phase 8+)
────────────                    ─────────────                  ───────────────────
React (UI only)                 SceneGraph (Rust/WASM)          Axum (REST + WS)
EngineWorkerBridge   ──IPC──>    DocumentModel (TypeScript)      PostgreSQL
(typed messages,                WebGPU device/pipeline          Redis (presence)
 @graphite/protocol)             Render loop
```

See ADR-002 (WebGPU), ADR-003 (OffscreenCanvas + Worker), ADR-004
(Rust/WASM engine), ADR-009 (protocol-first IPC).

## Package map

| Package               | Role                                                                | Status          |
| --------------------- | ------------------------------------------------------------------- | --------------- |
| `packages/protocol`   | Shared TypeScript types, IPC + network message schemas              | Active          |
| `packages/engine`     | Rust scene graph + WebGPU rendering, compiled to WASM               | Active          |
| `packages/document`   | Placeholder — see [ADR-010](./adr/ADR-010-document-crate-status.md) | Inert           |
| `packages/crdt`       | CRDT collaboration engine                                           | Stub, Phase 9   |
| `packages/ui-core`    | React UI component library                                          | Stub, Phase 6   |
| `packages/plugin-api` | Sandboxed plugin system                                             | Stub, Phase 10+ |
| `apps/web`            | Browser application (Vite + React)                                  | Active          |
| `apps/server`         | Backend (Rust + Axum)                                               | Stub, Phase 8   |

## Performance targets

| Subsystem                         | Target                |
| --------------------------------- | --------------------- |
| Canvas render                     | 60 FPS minimum        |
| Selection response                | < 16ms                |
| Document load                     | < 1s for medium files |
| Collaboration propagation         | < 100ms               |
| Document serialize (1,000 nodes)  | < 10ms                |
| Document `fromJson` (1,000 nodes) | < 15ms                |

Every subsystem defines its targets _before_ implementation, never after
— see each phase's "Benchmarks" section in the phase history.

## Coding standards (enforced, not aspirational)

- TypeScript: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`. ESLint with
  `typescript-eslint/strict`, `consistent-type-imports`.
- Rust: `cargo clippy -D warnings` (zero tolerance), `cargo fmt --check`,
  stable channel only (no nightly features — see `rustfmt.toml`'s history
  for why nightly-only formatting options were removed).
- Maximum file size ~250 lines unless formally justified (see ADR-history
  for the `engine.worker.ts` split that enforced this after it grew to 719
  lines — now 14 files under `apps/web/src/workers/engine/`).
- No placeholders, no `TODO` comments, no stub API calls in production
  paths. Every exported component and public API is documented.

## Testing & benchmarking

- Vitest (unit/integration) + React Testing Library (component) +
  Playwright (E2E, from Phase 6 once there is UI to exercise end-to-end).
- `cargo test` for Rust; Criterion (`cargo bench`) for Rust benchmarks;
  Vitest's `bench` mode for TypeScript benchmarks (`*.bench.ts`).
- GPU-dependent behaviour (actual rendering, WebGPU device behaviour)
  cannot be unit tested in Node.js — it is verified manually against the
  HUD's FPS/render-time counters during development, with Playwright
  picking up end-to-end coverage once Phase 6 adds a UI to drive.

## Security posture

Assume hostile clients always. Validate all network input server-side.
Never trust browser state. Never expose secrets client-side. Applied
today even pre-backend: `DocumentModel.fromJson()` treats its input
(`localStorage`, eventually network) as untrusted and validates its
structure before constructing a model from it (see `document/validate.ts`).

## Roadmap

| Phase | Milestone                                                |
| ----- | -------------------------------------------------------- |
| 0     | Foundation — monorepo, tooling, CI                       |
| 1     | Engine shell — WebGPU, Web Worker, OffscreenCanvas       |
| 2     | Scene graph core — Rust/WASM arena, render list          |
| 3     | Path rendering — SDF shapes, anti-aliasing, stroke       |
| 4     | Interaction — pan, zoom, hit-test, selection, drag       |
| 5     | Document model — TypeScript source of truth, persistence |
| 6     | UI shell — panels, design system, Zustand stores         |
| 7     | **MVP** — export, save/load                              |
| 8     | Backend — Axum, PostgreSQL, auth                         |
| 9     | Collaboration — CRDT (Yjs) + WebSocket sync              |
| 10+   | Plugins, components, offline, multi-window               |
