# ADR-027: Dev-Only Surfaces — the Debug Command Category and the Stress Scene

- **Status:** Accepted
- **Date:** 2026-07-17
- **Phase:** 7, Milestone 5
- **Related:** ADR-015 (command layer — every global action is a command),
  ADR-022 (validation ceilings — `DOCUMENT_LIMITS.maxNodes`), ADR-023
  (spatial-index deferral — the 100k probe feeds its re-adoption trigger),
  ADR-025 (damage model — "M5's stress numbers will be honest"), BLUEPRINT
  line 75 (10k verification is the last Phase-7 item)

## Context

M5 verifies the Phase-7 performance charter against the running
application at the 10k MVP budget and probes the 100k system ceiling. That
requires loading a 10k/100k-object scene on demand — a capability no user
needs and the product must not ship, but developers must reach in one
keystroke. This is the project's first _developer-only surface_, and how
it is built becomes the precedent for every future one (profiling
harnesses, Phase-8+ diagnostics, plugin dev tools).

Three questions had to be settled: where the trigger lives, how "dev-only"
is enforced, and what a "10k scene" even is once the shipped validator
counts nodes.

## Decision 1 — dev tools are commands, in a `Debug` category

The stress triggers are ordinary `CommandDescriptor`s
(`debug.stress10k` / `debug.stress100k`) in a new `Debug` category,
invoked through the command palette like every other action in the app
(ADR-015). No dev HUD, no hidden key chord, no query-param backdoor —
and no `defaultChords`, so the surface is **palette-only** (the same
policy `file.new` already uses). Two consequences fall out for free: the
trigger inherits the palette's full accessibility (a dev tool is still a
tool someone operates), and it has zero visual footprint in the shell.

## Decision 2 — dev-only means compiled out, not hidden

The gate is `import.meta.env.DEV`, applied at **both ends** of the
pipeline:

- `builtinCommands` spreads `debugCommands` behind the flag, so in a
  production build the descriptors are statically unreachable and
  tree-shaken out of the main chunk — the palette has nothing to hide.
- The worker's `debug:load_stress` handler body sits behind the same
  flag, so the case — and, via tree-shaking, the generator module it
  references — is compiled out of the production worker chunk. A
  handcrafted `postMessage` against a production tab is a no-op, not a
  latent 100k-node self-DoS. Assume hostile clients; a removed surface
  cannot be socially-engineered open.

The protocol message type itself is unconditional — types are erased and
Phase 9's wire material must stay whole — only runtime handlers are gated.
Production absence is verified against the built artifacts (release-chunk
greps, recorded in `docs/benchmarks/phase7-stress.md`), because a
dev-mode test runner cannot observe its own absence.

## Decision 3 — the stress scene travels the product pipeline, verbatim

`buildStressScene` constructs a `DocumentModel` exactly as
`buildDemoScene` does, and the worker handler then runs `document:new`'s
sequence unchanged: rebuild, camera, upload, viewport, state broadcast,
nodes broadcast, history reset. No measurement-only side channel — the
cardinal rule that keeps the numbers honest. This has deliberate,
documented sharp edges: loading a stress scene **replaces the current
document** and overwrites the localStorage recovery snapshot, exactly as
File → New does (the 100k snapshot exceeds the quota and is skipped by
the existing guard; the 10k one persists, so a reload measures the real
`document:load` path at scale).

## Decision 4 — `count` is total document nodes, at the validator's ceiling

`validate.ts` counts _nodes_ against `DOCUMENT_LIMITS.maxNodes` (100 000,
inclusive). A "100k" scene of 100 000 shapes plus its root frame would be
100 001 nodes — an illegal document that `document:load` would silently
replace with the demo fallback on the next reload. The stress scene must
be a **legal** document (that legality at the exact ceiling is itself part
of what M5 verifies), so the budget constants are spent as one frame plus
`count − 1` shapes, and the generator clamps into `[1, maxNodes]`. The
grid otherwise mirrors `build_mixed_grid` from the Criterion benches —
same 100-column/110-pitch layout, same kind and colour cycle — so the
Rust micro-bench numbers and the through-worker numbers describe one
workload; the ±1-shape difference is 0.001 % at 100k. Ids are synthetic
and index-derived (`stress-<i>`), so two builds serialise
byte-identically and captures are comparable across sessions and
machines.

## Alternatives considered

- **A dev HUD button.** Faster to hammer while profiling, but it puts
  chrome in the shell for a non-product feature and creates a second
  invocation idiom beside the command layer. Rejected; the palette is one
  keystroke away.
- **Runtime hiding (feature flag, localStorage toggle).** Ships the code
  to every user and trusts a flag to keep it dormant — contradicts the
  hostile-client posture and pays bundle weight for nothing. Rejected for
  compile-time removal.
- **`count` as shape count with a raised validator ceiling.** Bends a
  shipped security ceiling (ADR-022) to fit a synthetic scene — backwards.
  The scene fits the product's rules, not the reverse.
- **`Math.random()` scatter for "realistic" layouts.** Non-reproducible
  runs and numbers that can't be compared machine-to-machine or to the
  Criterion grid. Determinism is the requirement; the grid is the shared
  language.

## Consequences

- The `Debug` category and the compile-out-both-ends pattern are the
  template for all future dev surfaces.
- `MVP_MAX_OBJECTS` / `SYSTEM_MAX_OBJECTS` are now load-bearing at
  runtime (the commands consume them), not just documentation.
- The 100k probe produces exactly the data ADR-023's R-tree re-adoption
  trigger was written to consume.
- The capture procedure and its recorded baseline live in
  `docs/benchmarks/phase7-stress.md`; the reference machine's numbers —
  not container or CI runs — are the ground truth the charter is judged
  against.
