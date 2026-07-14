# Phase 7 External Review — Validation

- **Date:** 2026-07-14
- **Reviewed artifact:** an independent architecture review of the tree at
  `9fb89c8` (Phase 7 M1) — received one commit behind `main` (M2,
  `f94d1c5`, was already pushed)
- **Method:** every checkable claim verified against the actual repository
  before any finding influenced the roadmap — the standing protocol since
  the Phase 5 external report, whose three Critical findings all proved
  fabricated or false (see `phase-5-review.md`, ARCH-09)

## Verdict: **Strong — accepted with corrections**

All **13 findings substantively confirmed.** Every absence claim tested was
exact (no license anywhere, no `license` field in any package.json, no
dependency scanning, `ubuntu-24.04` across all three CI jobs, no
root-discoverable governance files, no coverage configuration in web or
ui-core, a root `vitest.config.ts` wired to nothing). Every load-bearing
number was exact: `graph.rs` 827 lines with `mod tests` at 416,
`engine.worker.ts` 222 lines at M1, the 171.99 / 175 kB bundle figures,
protocol's 90 % threshold, the a11y placeholder rows, the benchmarks
README's empty table, protocol's `text`/`group`/`pen` forward vocabulary.
Characterisations of the M1 funnel (effective-patch capture, rollback,
create-rebuild asymmetry) were accurate to authorial intent. Zero
fabrications.

### Corrections (four, all minor)

1. The fabricated-quote record it cites as "ADR-010" actually lives in
   `phase-5-review.md` (ADR-010 was created _because of_ that finding) —
   a citation slip inside the section about citation rigor.
2. `graph.rs` holds **41** `#[test]` cases, not "50+".
3. The server stub is 24 lines, not 12.
4. "44 test files" is 43 by the most generous count (36 unit+bench,
   7 e2e specs).

Pattern: qualitative claims verified perfectly; the impressiveness-adjacent
counts drifted upward.

### One category the review missed: config is not execution

The review credited protocol with an "enforced 90 %" coverage gate.
Validation traced the execution path: the threshold config existed, but no
test script passed `--coverage` and no package had the provider installed —
**the gate had never run.** Reading configuration without tracing it to an
execution path is the gap; ADR-022 wires coverage for real in all three
packages, floors set from measured actuals (protocol measured 100 %
across the board once its gate finally executed).

### Two findings accelerated by M2 (which the review could not see)

- **F13 (validator limits)** stopped being a Phase 9 concern the moment M2
  shipped `.graphite` open: parsed files now arrive from other people.
  Resolved in M2.5 (ADR-022 §2) — node/depth/name ceilings, a pre-parse
  size gate, and, found during that hardening, three validator gaps the
  review also missed: unvalidated `name`, unvalidated `cornerRadius`, and
  **parent cycles passing every local link check**.
- **F4 (bundle ceiling)** fired: M2's eager additions reached
  **175.48 kB gzip** with a green pipeline, because the ceiling was
  prose-only. Resolved in M2.5 by enforcing the ceiling in CI (ADR-022 §1)
  and — after ADR-017's pre-committed contingency was executed, measured
  at 0.85 kB recovered for 257 ms of cold-open cost, and retired —
  recalibrating the ceiling against the measured chunk composition
  (ADR-024): ~89 % framework floor, 190 kB, Phase 8 checkpoint.

### One finding corrected by measurement

**F2's severity claim** ("a naive scan is very unlikely to fit inside a
sub-millisecond budget at 100 k on typical hardware") was reasonable
a priori and is contradicted by the first reference-machine baseline: the
linear hit-test extrapolates to ~13–30 µs at 10 k and ~0.3–0.6 ms at
100 k on a floor-spec 2-core i3, and per-frame culling is output-bound
regardless of index. Consequence: `rstar` is deferred with a measured
re-adoption trigger — **ADR-023**, which reverses the blueprint's
pre-measurement approval. F1 (rebuild-on-create) stands and remains M3
scope.

## Disposition

| Findings                      | Disposition                                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F4, F5, F6, F7, F8¹, F12, F13 | **Resolved in M2.5** (split + CI gzip gate; coverage wired with measured floors + root config removed; dual license; audits + Dependabot; governance files; validator ceilings) |
| F1, F3                        | **M3 scope** (damage model + `insert_node_at`; bench-semantics fix + CI Criterion ceilings from the recorded baseline)                                                          |
| F2                            | **Superseded by ADR-023** (deferral with trigger)                                                                                                                               |
| F9, F10, F11                  | **Deferred with the review's own triggers** (contributor growth; CI-matrix cost decision pending; Phase 8 design deliverable)                                                   |

¹ F8's reference run is the one M2.5 item requiring the reference machine
(Playwright a11y pass); the doc structure awaits its numbers.

## Comparison record

Phase 5 external report: Weak — 3/3 Critical findings false or fabricated.
Phase 7 external review: Strong — 13/13 confirmed, 0 fabricated, 4 minor
numeric/citation slips, honest scoping, severities framed correctly as
future-milestone risks. External review of this codebase is now a
demonstrated net positive when — and only when — validated empirically.
