# Graphite — Engineering Blueprint (v2)

Condensed architecture reference. Decisions live in [`adr/`](./adr/); this
document is the map. Supersedes the v1 blueprint (2026-06-30) — updated
2026-07-06 for the Phase 6 M3 state.

## What Graphite is

An open-source, browser-based, high-performance collaborative graphics
platform. The browser is not the rendering model and the DOM is not the
canvas: the document is a custom scene graph, rendering is a GPU pipeline in
a Web Worker, and heavy computation is Rust compiled to WebAssembly. React
owns UI chrome only.

## Runtime architecture

```
Main thread   React 19 shell: AppShell grid → TopToolbar / Layers / Viewport /
              Inspector / StatusBar  (M3+: tools rail, menus, palette)
              Zustand uiStore — UI intent only, persisted "graphite-ui-v1"
              EngineContext (stable, memoised) + EngineFrameContext (60Hz
              stats/viewport; StatusBar only) — ADR-013 §6
              useSyncToolWithEngine — the only UI→engine crossing
              EngineWorkerBridge — typed senders + FpsTracker
      │  @graphite/protocol — versioned, JSON-serialisable IPC contract
Worker        engine.worker.ts orchestrator over one shared EngineState:
              gpu/{shader,pipeline,context,buffers,render} · input/{pointer,
              keyboard} · scene/{demo,rebuild,mutate} · camera · selection
              DocumentModel (TypeScript, worker-owned SOURCE OF TRUTH,
              UUID keys, _version, validate.ts) — ADR-011
              Hybrid MessageChannel+setTimeout render loop (~60 fps)
              localStorage: graphite-document-v1 (auto-save + Ctrl+S)
      │  wasm-bindgen — ADR-004/005
Rust/WASM     @graphite/engine SceneGraph: arena slot-map (ADR-008), ids
              never reused, hit_test → Option<u32>, incremental setters,
              get_render_list → flat 16-f32/shape, frustum-culled
      │  Float32Array → storage buffer (destroy + double on overflow)
WebGPU        One instanced SDF draw (rect/round-rect/ellipse, 1-px AA via
              pixel_size, centre strokes, Porter-Duff) + selection overlay
```

**Layer ownership (non-negotiable):** React owns panels, dialogs, menus,
toolbars, overlays, inspectors, forms, the viewport container. The worker
owns the render loop, GPU state, interaction hot path, and the document.
Rust owns the scene graph and geometry. `@graphite/protocol` is the only
crossing. The main thread never participates in frame timing. StrictMode
stays off (ADR-003).

## Packages

| Package               | Role                                                                | Status                                                          |
| --------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/web`            | Editor application (Vite + React)                                   | Active                                                          |
| `apps/server`         | Backend (Rust + Axum)                                               | Stub, Phase 8                                                   |
| `packages/protocol`   | IPC + network contracts, `Color`, camera/zoom constants             | Active                                                          |
| `packages/engine`     | Rust scene graph + geometry, compiled to WASM                       | Active                                                          |
| `packages/document`   | Placeholder — see [ADR-010](./adr/ADR-010-document-crate-status.md) | Inert                                                           |
| `packages/crdt`       | CRDT collaboration engine (Yjs)                                     | Stub, Phase 9                                                   |
| `packages/ui-core`    | Standalone design system: tokens + primitives                       | Live — M2 primitives + Tooltip/ContextMenu (M3), per ADR-013 §4 |
| `packages/plugin-api` | Sandboxed plugin system                                             | Stub, Phase 10+                                                 |

## Phases and milestones

| Phase | Scope                                                                              | Status         |
| ----- | ---------------------------------------------------------------------------------- | -------------- |
| 0–5   | Foundation → engine → rendering → interaction → document model                     | ✅ Complete    |
| 6     | UI shell                                                                           | 🔨 In progress |
| 7     | **MVP**: file save/load, export, undo/redo, R-tree + dirty flags, 10k verification | ⏳             |
| 8     | Backend: Axum, PostgreSQL, Redis, JWT auth, S3                                     | ⏳             |
| 9     | Collaboration: Yjs CRDT + WebSocket sync                                           | ⏳             |
| 10+   | Plugins, components, variables, offline, docking                                   | ⏳             |

Phase 6 milestones: **M1** design tokens + app shell (✅) · **M2** Layers +
Inspector (✅) · **M3** tools rail, rectangle/ellipse creation tools,
lucide-react icons, Floating UI context menus/tooltips, leaf-shape
deletion (✅) ·
**M4** command palette, remappable shortcut registry, search, assets tab ·
**M5** TanStack Router (`/settings`), theming (light + `forced-colors`),
`PanelDescriptor` registry, Playwright E2E, full a11y audit — **M5 is the
phase exit gate**.

## Performance targets

| Subsystem                      | Target                 |
| ------------------------------ | ---------------------- |
| Canvas render                  | ≥ 60 fps (≥ 58 on HUD) |
| Selection response             | < 16 ms                |
| Document load (medium file)    | < 1 s                  |
| Collaboration propagation (P9) | < 100 ms               |
| Hit-test at 10k objects (P7)   | < 1 ms (R-tree)        |
| Inspector keystroke → frame    | ≤ 2 frames             |
| Command palette open (M4)      | < 50 ms                |
| Object budget                  | 10k MVP / 100k system  |

Baselines are recorded per milestone under [`benchmarks/`](./benchmarks/).

## Stack and adoption gates

Live: React 19 · TypeScript 6 · Vite 8 · Tailwind v4 (`@theme` tokens) ·
Zustand 5 (UI intent only) · Vitest 4 + RTL · ESLint 10 (`tseslint.strict`,
zero warnings) · Prettier · pnpm 11 + Turborepo · Rust stable → wasm-bindgen
(`wasm-pack --target web`) · Criterion.

Live (added M3): lucide-react, `@floating-ui/react` (ADR-014 — the sole
floating-layer dependency this milestone; React Aria deferred to M4's
command-palette combobox). Gated (latest versions verified at adoption):
TanStack Router, Playwright → **M5** ·
React Hook Form + Zod → first submission-style form (M5 Settings; scope per
ADR-013 §3) · TanStack Query, Axum, PostgreSQL, Redis, JWT → **Phase 8** ·
Yjs → **Phase 9**. Rejected: Next.js / any meta-framework for the editor
([ADR-012](./adr/ADR-012-no-meta-framework.md)); nightly Rust; Zod for
internal payloads (hand-rolled `validate.ts`).

Every dependency answers the three-question test before it lands.

## Frontend architecture

**Design system.** Tailwind v4 `@theme` tokens — semantic layer
(`surface-*`, `content-*`, `border-*`, `accent`, `danger`) seeded at M1;
typography/elevation/motion scales and the light + high-contrast themes land
M3–M5; tokens and primitives move to `packages/ui-core` at M3 (ADR-013 §4).
No arbitrary utility scatter: features consume primitives and semantic
tokens.

**State contract.** Zustand = UI intent exclusively (tool, panel layout,
dialog state — persisted selectively). Engine-derived state flows through
the split contexts (ADR-013 §6). Scene, GPU, document, and collaboration
state never enter React. Crossings are named hooks only.

**Routing.** TanStack Router at M5 with the second route. Fixed route tree:
`/` editor · `/settings` (M5) · `/plugins` (P10) · `/account` (P8) ·
`/docs/*` (future).

**File organization.** Feature folders adopted M3 (`features/tools`,
`features/layers`, `features/inspector`); `contexts/` renamed from
`context/` in the same milestone. More folders (`providers/`, `routes/`)
materialise with their first M5 occupant. ~250-line file budget, unchanged.

**Accessibility.** Keyboard-first: every interactive element reachable and
operable (the Layers tree is the accessible representation of the canvas —
`aria-activedescendant` pattern); visible focus rings, never suppressed;
`prefers-reduced-motion` honoured by motion tokens; `forced-colors` theme at
M5; a11y audit gates Phase 6 exit.

## Process

Every milestone runs Phases A–H (requirements → architecture → file
structure → contracts → implementation → tests → benchmarks → refactor) and
ships with its exit-criteria checklist: `pnpm build · typecheck · lint ·
format:check · test`, `cargo test · clippy -D warnings · fmt --check`,
manual browser verification, benchmarks recorded, README/BLUEPRINT status
rows flipped **in the same commit**, ADRs written at decision time,
conventional commit per milestone, CI green before proceeding.
