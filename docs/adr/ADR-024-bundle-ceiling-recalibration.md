# ADR-024: Bundle Ceiling Recalibrated Against Measured Composition

- **Status:** Accepted
- **Date:** 2026-07-15
- **Phase:** 7, Milestone 2.5b
- **Related:** ADR-017 (ceiling history + retired contingency), ADR-022
  (enforcement), `docs/benchmarks/phase7-baseline.md`

## Context

M2.5's enforcement gate made the 175 kB ceiling real; M2.5's verification
made it _understood_. Executing ADR-017's modal-layer contingency recovered
0.85 kB against a ~12 kB estimate and cost 257 ms of cold palette open on
the reference machine — retired (ADR-017, update #2). That failure demanded
knowing what the chunk actually contains before choosing any number.
Sourcemap attribution of the eager main chunk (99.8 % of 561 kB minified
bytes assigned; method: direct VLQ decode, reproducible from any build's
`.map`):

|   Raw kB |      Share | Component                                     |
| -------: | ---------: | --------------------------------------------- |
|    189.7 |     33.9 % | react + react-dom                             |
|    158.8 |     28.4 % | react-aria + react-stately constellation      |
|     80.7 |     14.4 % | @tanstack/router                              |
|     57.4 |     10.3 % | @floating-ui                                  |
| **60.3** | **10.8 %** | **Graphite application code (src/**)\*\*      |
|      ~12 |       ~2 % | zustand, lucide (tree-shaken), tabbable, misc |

## The reading

**~89 % of the main chunk is the charter-approved framework stack.** The
175 kB ceiling, set when the app was thinner, was implicitly a budget for
that stack plus ~19 kB gzip of application code — an allowance the product
had already consumed by M2. Every piece of the framework share is
load-bearing eager editor chrome (accessible primitives, overlay
positioning, the shell's router); none is legitimately splittable, and app-
level splitting is measurably incapable of recovering framework weight.
A ceiling that can only be met by removing approved, load-bearing
dependencies is not a budget — it is a standing contradiction.

## Decision

1. **Ceiling: 190 kB gzip**, enforced by the same gate. Composition-derived:
   measured floor 175.5 plus ~14.5 kB — roughly doubling the lifetime
   application-code allowance while remaining far too tight to admit
   another react-aria-scale dependency unnoticed. Its enforcement job is
   therefore exactly what it can do well: **catch new heavy dependencies
   and unbounded app growth the moment they land**, with this table as the
   diagnostic baseline (re-run the attribution on any breach).
2. **Mandatory recalibration checkpoint at Phase 8 planning** — the
   collaboration UI is the next moment framework-scale weight could enter.
   Any milestone that adds a dependency above ~3 kB gzip to the eager
   chunk re-opens this ADR by rule, not by vibes.
3. **Retired instrument, recorded:** eager-chrome code-splitting. The
   sanctioned splitting pattern remains route-level (SettingsPage),
   applied to genuinely separable surfaces only.

## Alternatives considered

- **Keep 175 and remove @floating-ui or slim react-aria usage** —
  rejected: both are charter-approved for cause (ADR-014, ADR-018-era
  primitives) and load-bearing for accessibility; re-implementing them to
  save kilobytes is the definition of misplaced effort at MVP.
- **Two-number gate (total + app-code slice)** — rejected for now: the
  attribution requires sourcemap decoding too slow and fragile for a CI
  gate; one coarse enforced number plus a documented diagnostic method
  achieves the intent. Revisit if breaches become ambiguous.
- **No ceiling (framework dominates anyway)** — rejected: the gate just
  proved its worth twice in one milestone; unenforced budgets are how
  175.48 happened.

## Consequences

- M3–M5 proceed with realistic headroom (~14 kB for what are mostly
  worker-side milestones).
- A future dependency proposal now argues against a measured table, not a
  folk number.
- The palette's <50 ms open contract is restored and remains e2e-enforced.
