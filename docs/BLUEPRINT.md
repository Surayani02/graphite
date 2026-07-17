# Graphite — Engineering Blueprint (v3)

Condensed architecture reference. Decisions live in [`adr/`](./adr/); this
document is the map. Supersedes v2 (2026-07-08, Phase-6 state) — updated
2026-07-17 for the Phase 7 M5-delivered state (the reference-machine
capture, [benchmarks/phase7-stress.md](./benchmarks/phase7-stress.md), is
the phase exit gate).

## What Graphite is

An open-source, browser-based, high-performance collaborative graphics
platform. The browser is not the rendering model and the DOM is not the
canvas: the document is a custom scene graph, rendering is a GPU pipeline in
a Web Worker, and heavy computation is Rust compiled to WebAssembly. React
owns UI chrome only.

## Runtime architecture

```
Main thread   React 19 shell: AppShell grid → TopToolbar / Layers|Assets /
              Viewport / Inspector / StatusBar (fps · frame-ms · zoom HUD,
              history live-region) · tools rail · context menus · palette
              Zustand uiStore — UI intent only, persisted "graphite-ui-v1"
              EngineContext (stable, memoised) + EngineFrameContext (60 Hz
              stats/viewport; StatusBar only) — ADR-013 §6
              Command registry + ShortcutProvider (ADR-015): palette and
              shortcuts are two views of one command list · Debug category
              is dev-only, compiled out of production builds (ADR-027)
              FilesProvider + FileGateway — FS Access API with download
              fallback, .graphite format (ADR-021) · useExport — SVG built
              on the main thread from the live node snapshot (ADR-026)
              TanStack Router (ADR-017): "/" editor · "/settings" (lazy) ·
              PanelDescriptor registry (ADR-019) · theme = CSS-var swap
              (ADR-018) · useSyncToolWithEngine — the UI→engine crossing
              EngineWorkerBridge — typed senders, FpsTracker, promise-
              correlated save/export requests
      │  @graphite/protocol — versioned, JSON-serialisable IPC contract
Worker        engine.worker.ts orchestrator over one shared EngineState:
              gpu/{shader,pipeline,context,buffers,render,export} ·
              input/{pointer,keyboard} · scene/{create,mutate,remove,
              apply,rebuild,demo,stress} · camera · selection · history
              (op-sourced undo/redo — ADR-020)
              DocumentModel (TypeScript, worker-owned SOURCE OF TRUTH,
              UUID keys, _version, validate.ts ceilings) — ADR-011/022
              Damage-model render loop (ADR-025): MessageChannel+setTimeout
              ~60 fps, parks when idle, wakes on damage · raster export =
              off-screen rgba8 render + GPU readback (ADR-026) ·
              debug:load_stress — dev-only 10k/100k scenes (ADR-027)
              localStorage: graphite-document-v1 (auto-save, quota-guarded)
      │  wasm-bindgen — ADR-004/005
Rust/WASM     @graphite/engine SceneGraph: arena slot-map (ADR-008), ids
              never reused, explicit paint order (order: Vec<NodeId>,
              ADR-025), hit_test → Option<u32> reverse paint-order scan,
              incremental setters, get_render_list → flat 16-f32/shape,
              frustum-culled · Criterion benches with CI-gated ceilings
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

| Package               | Role                                                                | Status                                                                                                                            |
| --------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`            | Editor application (Vite + React)                                   | Active                                                                                                                            |
| `apps/server`         | Backend (Rust + Axum)                                               | Stub, Phase 8                                                                                                                     |
| `packages/protocol`   | IPC + network contracts, `Color`, camera/zoom constants             | Active                                                                                                                            |
| `packages/engine`     | Rust scene graph + geometry, compiled to WASM                       | Active                                                                                                                            |
| `packages/document`   | Placeholder — see [ADR-010](./adr/ADR-010-document-crate-status.md) | Inert                                                                                                                             |
| `packages/crdt`       | CRDT collaboration engine (Yjs)                                     | Stub, Phase 9                                                                                                                     |
| `packages/ui-core`    | Standalone design system: tokens + primitives                       | Live — M2 primitives + Tooltip/ContextMenu (M3) + M4 modal/tabs/palette primitives on react-aria-components (ADR-013 §4, ADR-015) |
| `packages/plugin-api` | Sandboxed plugin system                                             | Stub, Phase 10+                                                                                                                   |

## Phases and milestones

| Phase | Scope                                                                                                                                      | Status      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| 0–5   | Foundation → engine → rendering → interaction → document model                                                                             | ✅ Complete |
| 6     | UI shell                                                                                                                                   | ✅ Complete |
| 7     | **MVP**: file save/load, export, undo/redo, damage model (dirty flags), 10k verification — spatial index deferred by measurement (ADR-023) | ⏳          |
| 8     | Backend: Axum, PostgreSQL, Redis, JWT auth, S3                                                                                             | ⏳          |
| 9     | Collaboration: Yjs CRDT + WebSocket sync                                                                                                   | ⏳          |
| 10+   | Plugins, components, variables, offline, docking                                                                                           | ⏳          |

Phase 6 milestones: **M1** design tokens + app shell (✅) · **M2** Layers +
Inspector (✅) · **M3** tools rail, rectangle/ellipse creation tools,
lucide-react icons, Floating UI context menus/tooltips, leaf-shape
deletion (✅) ·
**M4** command registry + palette (mod+K, layer search), remappable
shortcut registry with in-product recorder, tabbed left panel with an
Assets tab (live document colors) (✅ — ADR-015) ·
**M5** TanStack Router (`/settings`, lazy) · theming (light + `forced-colors`,
CSS-var swap) · `PanelDescriptor` registry · Playwright E2E (+ axe per
route×theme) · full a11y audit (✅ — ADR-017/018/019). **Phase 6 complete.**

Phase 7 milestones: **M1** undo/redo — operation-sourced history in the
worker, undoable command surface (✅ — ADR-020) · **M2** file save/load —
`.graphite` format, `FileGateway` (FS Access API + download fallback),
quota-guarded autosave (✅ — ADR-021) · **M3** damage model + explicit
paint order, honest hit-test benches (worst-case miss at 1k/10k/100k),
Criterion ceilings CI-gated (✅ — ADR-025) · **M4** export — SVG on the
main thread, PNG/JPEG via off-screen GPU readback, one shared fit-bounds
rule (✅ — ADR-026) · **M5** scale probe — deterministic 10k/100k stress
scenes through the product pipeline, palette-only dev-gated `Debug`
commands (ADR-027; **delivered — the reference-machine capture,
[benchmarks/phase7-stress.md](./benchmarks/phase7-stress.md), is the
phase exit gate**).

## Performance targets

| Subsystem                      | Target                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Canvas render                  | ≥ 60 fps (≥ 58 on HUD)                                                                                  |
| Selection response             | < 16 ms                                                                                                 |
| Document load (medium file)    | < 1 s                                                                                                   |
| Collaboration propagation (P9) | < 100 ms                                                                                                |
| Hit-test at 10k objects (P7)   | < 1 ms (linear scan measured 17.7 µs worst-case @10k — ADR-023; R-tree deferred pending the 100k probe) |
| Inspector keystroke → frame    | ≤ 2 frames                                                                                              |
| Command palette open (M4)      | < 50 ms                                                                                                 |
| Object budget                  | 10k MVP / 100k system                                                                                   |

Baselines are recorded per milestone under [`benchmarks/`](./benchmarks/).

## Stack and adoption gates

Live: React 19 · TypeScript 6 · Vite 8 · Tailwind v4 (`@theme` tokens) ·
Zustand 5 (UI intent only) · Vitest 4 + RTL · ESLint 10 (`tseslint.strict`,
zero warnings) · Prettier · pnpm 11 + Turborepo · Rust stable → wasm-bindgen
(`wasm-pack --target web`) · Criterion.

Live (added M3): lucide-react, `@floating-ui/react` (ADR-014). Live (added
M4): react-aria-components 1.19 — ui-core-scoped modal/tabs/combobox
semantics, the adoption ADR-014 deferred to exactly this milestone
(ADR-015); `@testing-library/user-event` (dev — realistic pointer sequences
for React Aria press events). Live (added M5): TanStack Router 1.170
(ADR-017); Playwright + @axe-core/playwright (dev, E2E + a11y gate).
Gated (latest versions verified at adoption):
React Hook Form + Zod → first genuine submission-style form (deferred past
M5 — Settings is instant-apply; expected P8 account/auth; ADR-016) · TanStack Query, Axum, PostgreSQL, Redis, JWT → **Phase 8** ·
Yjs → **Phase 9**. Rejected: Next.js / any meta-framework for the editor
([ADR-012](./adr/ADR-012-no-meta-framework.md)); nightly Rust; Zod for
internal payloads (hand-rolled `validate.ts`).

Every dependency answers the three-question test before it lands.

## Frontend architecture

**Design system.** Tailwind v4 `@theme` tokens — semantic layer
(`surface-*`, `content-*`, `border-*`, `accent`, `danger`) seeded at M1;
typography/elevation/motion scales land M3+; the light + `forced-colors`
themes shipped M5 as CSS-variable token blocks (ADR-018); tokens and
primitives moved to `packages/ui-core` at M3 (ADR-013 §4).
No arbitrary utility scatter: features consume primitives and semantic
tokens.

**State contract.** Zustand = UI intent exclusively (tool, panel layout,
dialog state — persisted selectively). Engine-derived state flows through
the split contexts (ADR-013 §6). Scene, GPU, document, and collaboration
state never enter React. Crossings are named hooks only.

**Command layer (M4).** Every global action is a registered command; the
palette and the shortcut system are two views of one registry (ADR-015).
Global keys have a single owner (`ShortcutProvider`); chords are canonical
platform-portable strings; user remaps persist as `shortcutOverrides` and
shadow defaults at resolve time — the UI never advertises a chord that
runs something else.

**Routing.** TanStack Router (M5, ADR-017), code-based tree. Shipped: `/`
editor · `/settings` (lazy). Reserved: `/plugins` (P10) · `/account` (P8) ·
`/docs/*`. Engine worker + global shortcuts are editor-route-scoped;
unknown paths redirect to the editor. Main-chunk ceiling 190 kB gzip
(recalibrated from 175 kB — ADR-024).

**File organization.** Feature folders adopted M3 (`features/tools`,
`features/layers`, `features/inspector`); `contexts/` renamed from
`context/` in the same milestone. M4 adds `features/commands`,
`features/shortcuts`, `features/palette`, `features/assets`, and
`layouts/LeftPanel` — the Layers|Assets tab host that M5's PanelDescriptor
registry will absorb as its first docking site. More folders (`providers/`, `routes/`)
materialise with their first M5 occupant. Phase 7 adds `features/files`
(ADR-021), `features/export` (ADR-026), the worker's `engine/history.ts`
and the `scene/{create,mutate,remove,apply,stress}` splits, and the first
dev-only surface (`commands/builtin/debugCommands.ts`, ADR-027).
~250-line file budget, unchanged.

**Accessibility.** Keyboard-first: every interactive element reachable and
operable (the Layers tree is the accessible representation of the canvas —
`aria-activedescendant` pattern); visible focus rings, never suppressed;
`prefers-reduced-motion` honoured by motion tokens; `forced-colors` theme
shipped M5; the a11y audit (axe in CI per route×theme + manual protocol,
docs/architecture/phase-6-a11y-audit.md) gated Phase 6 exit.

## Process

Every milestone runs Phases A–H (requirements → architecture → file
structure → contracts → interfaces → implementation → tests → benchmarks)
and ships with its exit-criteria checklist: `pnpm build · typecheck · lint ·
format:check · test`, `cargo test · clippy -D warnings · fmt --check`,
manual browser verification, benchmarks recorded, README/BLUEPRINT status
rows flipped **in the same commit**, ADRs written at decision time,
conventional commit per milestone, CI green before proceeding.
