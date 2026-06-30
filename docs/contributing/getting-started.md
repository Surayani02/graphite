# Contributing to Graphite

## Prerequisites

| Tool        | Min version | Install                   |
|-------------|-------------|---------------------------|
| Node.js     | 24.0.0      | https://nodejs.org        |
| pnpm        | 11.0.0      | `npm install -g pnpm`     |
| Rust        | stable      | https://rustup.rs         |
| `wasm-pack` | latest      | `cargo install wasm-pack` |
| Git         | 2.x         | https://git-scm.com       |

After installing Rust:

```sh
rustup target add wasm32-unknown-unknown
```

## First-time setup

```sh
git clone <repo-url>
cd graphite
pnpm install
```

That's it for a single command — `pnpm dev` (see below) builds the Rust/WASM
engine automatically via Turborepo's task graph before starting Vite,
because `apps/web` depends on `@graphite/engine` and `turbo.json`'s `dev`
task declares `dependsOn: ["^build"]`. You do not need a separate manual
WASM build step. If you want to build it standalone (e.g. to inspect the
generated `pkg/` output), run:

```sh
pnpm build --filter @graphite/engine
```

## Running the project

```sh
pnpm dev           # starts the dev server at http://localhost:5173
                    # (builds @graphite/engine's WASM first, automatically)
```

## Before opening a PR

Run the full validation suite locally — this is exactly what CI runs:

```sh
# TypeScript
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test

# Rust
cargo fmt --all --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets
cargo bench --no-run
```

All eight commands must pass with zero errors and zero warnings before
requesting review.

## Conventions

- **Commits**: imperative mood, conventional-commits-style prefix where it
  fits naturally (`feat:`, `fix:`, `docs:`, `refactor:`) — not strictly
  enforced by tooling yet, but please follow the existing commit history's
  style.
- **File size**: ~250 lines is the ceiling, not a target. If a file is
  approaching it, that's usually a signal it's doing more than one job —
  split it (see `apps/web/src/workers/engine/` for an example of a
  719-line file split into 14 focused modules).
- **No placeholders in committed code.** No `TODO`, no stub
  implementations, no "implement later" comments in anything merged to
  `main`. Open an issue instead if something is genuinely deferred.
- **Module boundaries are deliberate.** React never imports from
  `packages/engine` directly, and the engine worker never imports React.
  If you find yourself wanting to cross one of these boundaries, that's a
  signal to either reconsider the approach or open a discussion first —
  these boundaries are documented in the relevant ADRs, not accidental.

## Writing an ADR

If your change makes (or reverses) an architectural decision — not just
"how this function is implemented," but "why this approach over that
one" — write an ADR in `docs/adr/`, numbered sequentially after the
highest existing number. Use any existing ADR as a template; the required
sections are Context, Decision, Rationale, Alternatives Considered,
Consequences, and Review Criteria. A PR that changes architecture without
an accompanying ADR will be asked to add one before merge.

## Where things live

See [docs/BLUEPRINT.md](../BLUEPRINT.md) for the package map and
[docs/adr/](../adr/) for the reasoning behind specific decisions. The
README's phase table shows current overall project status.
