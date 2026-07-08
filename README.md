# Graphite

Open-source, browser-based, high-performance collaborative graphics platform.

> **Status**: 🔨 Phase 6 — UI Shell in progress. Milestones 1–3 complete (design tokens, app shell, Layers + Inspector panels, tools rail with shape creation, leaf-shape deletion, context menus); Milestones 4–5 (command palette, routing/theming, a11y + E2E exit gate) remaining.

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
├── apps/web React + Vite browser application
├── apps/server Rust + Axum backend (Phase 8)
├── packages/
│ ├── protocol Shared TypeScript types (IPC + network schema)
│ ├── engine Rust graphics engine → WASM
│ ├── document Placeholder — see docs/adr/ADR-010
│ ├── crdt CRDT collaboration (Phase 9)
│ ├── ui-core React UI components (Phase 6)
│ └── plugin-api Plugin system API (Phase 10+)
└── docs/adr Architecture Decision Records
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
| 6     | UI shell                           | 🔨 M1–M3 ✅ |
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
