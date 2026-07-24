# Graphite

Open-source, browser-based, high-performance collaborative graphics platform.

> **Status**: ✅ Phase 7 (MVP) complete — undo/redo (ADR-020), `.graphite` save/load with autosave (ADR-021), damage-model rendering + honest hit-test benches with CI-gated Criterion ceilings (ADR-025), SVG + PNG/JPEG export (ADR-026), the deterministic 10k/100k stress probe (ADR-027), and the reference-machine capture whose 100k hit-test basis is recorded in [benchmarks/ceilings.json](benchmarks/ceilings.json). 🔨 Phase 8 (Vector & Text, ADR-029) is open at **M1 — the path render pipeline**: design and contracts committed ([docs/design/phase8-m1-path-pipeline.md](docs/design/phase8-m1-path-pipeline.md), ADR-031/032); implementation opens with the ADR-030 `document-model` extraction and the code-splitting precondition commits. Phase 6 (UI shell) and everything before it: ✅ complete.
>
> **Next**: Phase 8 M1 Phase E — precondition commits (extraction; code splitting + budgets), then the geometry crate. Programme scope and per-item status: [docs/PARITY.md](docs/PARITY.md); architecture and sequencing: [docs/roadmap/INTEGRATION-BLUEPRINT.md](docs/roadmap/INTEGRATION-BLUEPRINT.md) — backend and collaboration keep their scope at Phases 11 and 12 so the document schema settles before the CRDT binding is authored (ADR-029).

## Prerequisites

| Tool        | Min version | Install                   |
| ----------- | ----------- | ------------------------- |
| Node.js     | 24.0.0      | https://nodejs.org        |
| pnpm        | 11.0.0      | `npm install -g pnpm`     |
| Rust        | stable      | https://rustup.rs         |
| `wasm-pack` | latest      | `cargo install wasm-pack` |
| Git         | 2.x         | https://git-scm.com       |

After installing Rust:

```sh
rustup target add wasm32-unknown-unknown
```

## Quick start

```sh
pnpm install        # install all Node.js dependencies
pnpm dev            # start Vite dev server → http://localhost:5173
                    # (builds the @graphite/engine WASM module first,
                    # automatically, via Turborepo's task graph)
```

Other useful commands:

```sh
pnpm build         # compile all TypeScript packages (+ WASM, via the same graph)
pnpm test          # run TypeScript tests
cargo test         # run Rust tests
cargo bench        # run Rust benchmarks (Criterion)
```

See [docs/contributing/getting-started.md](docs/contributing/getting-started.md)
for the full pre-PR checklist.

## Repository layout

```
graphite/
├── apps/
│   ├── web            React + Vite browser application
│   └── server         Rust + Axum backend (Phase 11)
├── packages/
│   ├── protocol       Shared TypeScript types (IPC + network schema)
│   ├── engine         Rust graphics engine → WASM
│   ├── document       Placeholder — see docs/adr/ADR-010
│   ├── document-model Document model + .graphite format (ADR-030)
│   ├── crdt           CRDT collaboration (Phase 12)
│   ├── ui-core        Design tokens + React primitives (Phase 6+)
│   └── plugin-api     Plugin system API (Phase 16)
└── docs/
    ├── BLUEPRINT.md   Engineering blueprint — the map
    ├── adr/           Architecture Decision Records
    └── benchmarks/    Recorded baselines + capture procedures
```

## Development phases

| Phase | Milestone                          | Status      |
| ----- | ---------------------------------- | ----------- |
| 0     | Foundation (monorepo, tooling, CI) | ✅ Complete |
| 1     | Engine shell (WebGPU, Web Worker)  | ✅ Complete |
| 2     | Scene graph core (Rust/WASM)       | ✅ Complete |
| 3     | Path rendering (GPU)               | ✅ Complete |
| 4     | Interaction (select, pan, zoom)    | ✅ Complete |
| 5     | Document model                     | ✅ Complete |
| 6     | UI shell                           | ✅ Complete |
| 7     | **MVP** (export, save/load)        | ⏳          |
| 8     | Backend                            | ⏳          |
| 9     | Collaboration (CRDT + WebSocket)   | ⏳          |
| 10+   | Plugins, components, offline       | ⏳          |

## Architecture

See [Engineering Blueprint](docs/BLUEPRINT.md) and [ADRs](docs/adr/).

## Contributing

See [docs/contributing/getting-started.md](docs/contributing/getting-started.md).

## License

MIT OR Apache-2.0
