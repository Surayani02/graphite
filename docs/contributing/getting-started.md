# Contributing to Graphite

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

Run the full validation suite locally. This list is enumerated from
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) — **if this
file and `ci.yml` ever disagree, `ci.yml` wins** and this file has a bug
(a manually-recalled gate list has caused a CI failure before; the
workflow file is the only source of truth):

```sh
# TypeScript job (CI order)
pnpm install --frozen-lockfile         # the lockfile is the contract
pnpm audit --prod --audit-level=high   # advisory gate (ADR-022)
pnpm build
pnpm check:bundle                      # 190 kB main-chunk ceiling (ADR-024), enforced (ADR-022)
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test                              # includes coverage floors (ADR-022)
pnpm --filter @graphite/web exec tsc --noEmit -p tsconfig.e2e.json

# E2E job (production build + preview; Chromium)
pnpm --filter @graphite/web run e2e

# Rust job
cargo audit                            # RustSec advisories (CI uses rustsec/audit-check)
cargo fmt --all --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets
cargo check --all-targets
cargo check --target wasm32-unknown-unknown -p graphite-engine
cargo bench --no-run
cargo bench -p graphite-engine --bench engine -- --warm-up-time 0.5 --measurement-time 1 --sample-size 10
node scripts/check-bench-ceilings.mjs  # absolute Criterion ceilings (ADR-023, benchmarks/ceilings.json)
```

Everything must pass with zero errors and zero warnings before requesting
review.

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
