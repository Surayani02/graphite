# Contributing to Graphite

Thank you for your interest — Graphite is built to be contributor-friendly
from its architecture up.

The full contributor guide lives at
**[docs/contributing/getting-started.md](docs/contributing/getting-started.md)**:
environment setup (Windows/macOS/Linux), the one-command dev loop, the CI
gates every change must pass, code standards, and how architectural
decisions are made (ADRs under [docs/adr/](docs/adr/)).

This root file exists so GitHub's contribution affordances can find the
guide; the guide itself is the source of truth.

Quick orientation:

- **Setup:** `pnpm install && pnpm dev` (Rust stable + wasm-pack required
  for the engine — see the guide).
- **Before pushing:** `pnpm build`, `pnpm turbo run typecheck`, `pnpm lint`,
  `pnpm format:check`, `pnpm turbo run test` — the same gates CI enforces.
- **Decisions:** significant changes need an ADR at decision time, not
  retroactively.

By contributing, you agree that your contributions are licensed under the
same terms as the project: MIT OR Apache-2.0, at your option
([LICENSE-MIT](LICENSE-MIT), [LICENSE-APACHE](LICENSE-APACHE)).
