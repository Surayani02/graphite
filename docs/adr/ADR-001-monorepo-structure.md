# ADR-001: Monorepo with pnpm Workspaces + Turborepo

**Date**: 26-06-2026
**Status**: Accepted  
**Deciders**: Engineering Team

## Context

We are building a system with components in two languages (TypeScript, Rust)
and multiple deployment targets (browser bundle, Web Worker WASM, backend
binary). We need a strategy for managing these as a single cohesive codebase
while preserving independent build pipelines for each language.

## Decision

Use a **monorepo** managed by **pnpm workspaces** for TypeScript packages and
**Cargo workspaces** for Rust crates. **Turborepo** orchestrates TypeScript
tasks (build, test, lint) with dependency-aware parallelism and remote caching.

### Package layout

| Path                  | Role                                                       |
| --------------------- | ---------------------------------------------------------- |
| `packages/protocol`   | Shared TypeScript types — the only cross-boundary contract |
| `packages/engine`     | Rust graphics engine → WASM                                |
| `packages/document`   | Rust document model → WASM                                 |
| `packages/crdt`       | CRDT collaboration engine (TypeScript bindings)            |
| `packages/ui-core`    | React UI component library                                 |
| `packages/plugin-api` | Plugin system API                                          |
| `apps/web`            | Browser application (Vite + React)                         |
| `apps/server`         | Backend server (Rust + Axum)                               |

## Rationale

- **Atomic commits** across package boundaries — a single PR can update
  protocol types and all consumers simultaneously.
- **Turborepo caching** — unchanged packages skip rebuilds locally and in CI.
- **pnpm** uses a content-addressable store; installs are faster and disk
  usage is minimal compared with npm/yarn.
- **Cargo workspace** keeps all Rust crates on the same dependency versions
  with a single `Cargo.lock`.

## Alternatives Considered

| Alternative           | Reason Rejected                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| Separate repositories | High coordination overhead; breaking changes require synchronised PRs across repos                 |
| NX                    | More powerful but higher initial complexity; Turborepo's simpler model is sufficient at this scale |
| Lerna                 | Largely superseded by Turborepo; adds a third tool to learn                                        |
| npm workspaces        | Slower installs, weaker hoisting control                                                           |
| yarn workspaces       | No meaningful advantage over pnpm for our use case                                                 |

## Consequences

### Positive

- One `git clone`, one `pnpm install`, one `cargo build` sets up the full project.
- Refactoring across package boundaries is trivial.
- CI sees the full dependency graph and skips unaffected packages.

### Negative

- All contributors must install both Node.js/pnpm and Rust/Cargo.
- Repository size grows as WASM blobs are added (mitigated by `.gitignore`).

## Review Criteria

Revisit this decision if:

- Repository exceeds 60 packages.
- CI time exceeds 20 minutes despite Turborepo caching.
- Rust ↔ TypeScript integration requires a build tool NX supports but Turborepo does not.
