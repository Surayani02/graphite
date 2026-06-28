# Graphite

Open-source, browser-based, high-performance collaborative graphics platform.

> **Status**: 🔨 Phase 0 — Foundation (active)

## Prerequisites

| Tool    | Min version | Install               |
|---------|-------------|-----------------------|
| Node.js | 24.0.0      | https://nodejs.org    |
| pnpm    | 11.0.0      | `npm install -g pnpm` |
| Rust    | stable      | https://rustup.rs     |
| Git     | 2.x         | https://git-scm.com   |

After installing Rust:

```sh
rustup target add wasm32-unknown-unknown
```

## Quick start

```sh
pnpm install       # install all Node.js dependencies
pnpm build         # compile all TypeScript packages
cargo build        # compile all Rust crates
pnpm test          # run TypeScript tests
cargo test         # run Rust tests
pnpm dev           # start Vite dev server → http://localhost:5173
```

## Repository layout

```
graphite/
├── apps/web React + Vite browser application
├── apps/server Rust + Axum backend (Phase 8)
├── packages/
│ ├── protocol Shared TypeScript types (IPC + network schema)
│ ├── engine Rust graphics engine → WASM (Phase 1)
│ ├── document Rust document model → WASM (Phase 5)
│ ├── crdt CRDT collaboration (Phase 9)
│ ├── ui-core React UI components (Phase 6)
│ └── plugin-api Plugin system API (Phase 10+)
└── docs/adr Architecture Decision Records
```

## Development phases

| Phase | Milestone                          | Status    |
|-------|------------------------------------|-----------|
| 0     | Foundation (monorepo, tooling, CI) | ✅ Current |
| 1     | Engine shell (WebGPU, Web Worker)  | 🔜 Next   |
| 2     | Scene graph core (Rust/WASM)       | ⏳         |
| 3     | Path rendering (GPU)               | ⏳         |
| 4     | Interaction (select, pan, zoom)    | ⏳         |
| 5     | Document model                     | ⏳         |
| 6     | UI shell                           | ⏳         |
| 7     | **MVP** (export, save/load)        | ⏳         |
| 8     | Backend                            | ⏳         |
| 9     | Collaboration (CRDT + WebSocket)   | ⏳         |
| 10+   | Plugins, components, offline       | ⏳         |

## Architecture

See [Engineering Blueprint](docs/BLUEPRINT.md) and [ADRs](docs/adr/).

## Contributing

See [docs/contributing/](docs/contributing/).

## License

MIT OR Apache-2.0
