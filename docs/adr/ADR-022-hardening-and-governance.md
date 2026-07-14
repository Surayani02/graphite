# ADR-022: Hardening and Governance (Phase 7 M2.5)

- **Status:** Accepted
- **Date:** 2026-07-14
- **Phase:** 7, Milestone 2.5
- **Related:** ADR-017 (ceiling + contingency), ADR-021 (file layer),
  `docs/architecture/phase-7-review-validation.md` (the external review
  that prompted this milestone)

## Context

An external architecture review (validated Strong — 13/13 findings
substantively confirmed; see the validation doc) surfaced a cluster of
low-effort, high-leverage gaps: no license, no security/conduct policy, no
dependency scanning, budgets and thresholds that existed only as prose, and
a validator with no resource ceilings. Two of its findings were accelerated
by M2 itself: `.graphite` open created a real untrusted-input boundary, and
the bundle ceiling was breached silently (175.48 kB vs 175). M2.5 converts
every paper constraint it can into an enforced one.

## Decisions

### 1. Enforcement over documentation

- **Bundle ceiling**: `scripts/check-bundle-size.mjs` fails CI at ≥175 kB
  gzip on the main chunk, measured the way Vite reports (default-level
  gzip, kB = 1000 B) so the two numbers stay comparable. Runs after Build
  in the `typescript` job; locally via `pnpm check:bundle`.
- **Dependency advisories**: `pnpm audit --prod --audit-level=high` blocks
  the `typescript` job (production deps only — dev-tooling advisories
  arrive as Dependabot PRs rather than blocking every push; the sanctioned
  per-advisory override is pnpm's `auditConfig.ignoreCves`, each use
  requiring a dated comment). `rustsec/audit-check@v2` covers the Cargo
  workspace in the `rust` job. `.github/dependabot.yml` batches weekly
  minor/patch groups per ecosystem to fit a single-maintainer review
  budget.

### 2. Validator resource ceilings — and two closed field gaps

Since M2, `assertValidDocumentData` guards files that arrive from other
people. Shape validation alone accepts shape-perfect hostile input, so
ceilings became part of validity: **100 000 nodes** (the Blueprint system
ceiling), **depth 64**, **name length 512**, plus a **32 M-character
pre-parse ceiling** in `parseGraphiteFile` (new `file-too-large` error
code) so oversized input is rejected before `JSON.parse` allocates.
Limits are injectable (`ValidationLimits`) so tests exercise the mechanism
with tiny values while production uses defaults.

Hardening review of the validator itself found and closed three gaps that
predate this milestone: `name` and `cornerRadius` were never validated
(a nameless node reached the layers panel as `undefined`), and **parent
cycles passed every local link check** — A↔B with mutually consistent
children arrays satisfied id-uniqueness, parent-exists, and backlink
consistency while the renderer silently dropped both nodes. The bounded
depth walk now doubles as cycle detection in O(n).

### 3. Coverage that actually runs

The review credited protocol with a "90 % gated" suite; validation found
the gate had **never executed** — the config existed, but no test script
passed `--coverage` and no package had the provider installed. Config is
not enforcement unless traced to execution. All three TS packages now run
`vitest run --coverage`; the vestigial root `vitest.config.ts` (wired to
nothing) is removed. Floors were set **from measured actuals minus a ~3 pt
churn margin**, never from aspiration:

| Package  | Measured (stmts/branch/func/lines) | Floors                             |
| -------- | ---------------------------------- | ---------------------------------- |
| protocol | 100 / 100 / 100 / 100              | 90 across (pre-existing, now real) |
| ui-core  | 79.3 / 73.1 / 83.6 / 81.0          | 76 / 70 / 80 / 78                  |
| web      | 71.9 / 70.2 / 73.5 / 71.3          | 68 / 67 / 70 / 68                  |

Web excludes, with cause: the GPU pipeline (`workers/engine/gpu/**` —
cannot execute without WebGPU; integration is e2e territory), `main.tsx`
(render bootstrap), test scaffolding, ambient types. The worker
dispatcher, camera, and input handlers stay **in** — they are
unit-testable, and low numbers there are honest signal, not noise to
exclude. Floors ratchet up as coverage rises; lowering one to admit a
regression is not an option this ADR grants.

### 4. Open-source governance surface

Dual license **MIT OR Apache-2.0** (`LICENSE-MIT`, `LICENSE-APACHE`,
Copyright 2026 Surajit Saha — first commit June 2026), root
`CONTRIBUTING.md` pointing at the existing guide, Contributor Covenant
2.1 as `CODE_OF_CONDUCT.md`, and `SECURITY.md` with a private reporting
channel (imsur02@outlook.com) and the current scope: file parsing, the
WASM boundary, supply chain.

## Alternatives considered

- **Gate dev-dependency advisories too** — rejected for now: dev-tooling
  advisories are frequent and rarely exploitable in this project's build
  context; Dependabot still surfaces them. Revisit if a dev-dep advisory
  class proves relevant.
- **Exclude the untested worker dispatcher from coverage** like the GPU
  files — rejected: it is unit-testable; excluding it would manufacture a
  prettier number.
- **Aspirational coverage floors (e.g., 80 everywhere)** — rejected per
  the review's own caution: thresholds above reality get deleted or
  ignored; measured-minus-margin ratchets are the durable form.
- **cargo-audit via cargo install in CI** — rejected: minutes-per-run cost;
  the maintained RustSec action does the same check from a cached binary.

## Consequences

- Every constraint this project states about bundles, advisories, and
  coverage is now machine-checked; the "green pipeline over a breached
  budget" class of failure is closed.
- `pnpm audit` introduces a network-dependent CI step; transient registry
  failures are retriable, and the override path is documented above.
- The 100 k-node validator ceiling implies documents beyond it need a
  format-level story (chunked loading) — recorded as a Phase 8+ planning
  input, consistent with Finding 4's code-splitting horizon.
