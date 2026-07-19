# Bundle Composition Analysis — Phase 7

**Date:** 2026-07-19 · **Main chunk:** 177.66 kB gzip (571.8 kB raw)
against the 190 kB ceiling (ADR-024). This records what the bundle is
_made of_ and why every dependency in it stays — so a future "reduce
bundle size" pass starts from measurement, not guesswork.

## Method

Attribution from the production source map (`vite build` emits
`sourcemap: true`), bucketing each source by its package. Sizes are
pre-minify source bytes — a proxy for contribution, not the final gzipped
footprint, but accurate for _relative_ weight. Tree-shaking was verified
empirically: a sample of unused `lucide-react` icons (Airplay, Rocket,
Umbrella, …) are confirmed **absent** from the built chunk.

## Composition (source-byte share of the main chunk)

| Share | Package                                                  | Removable?                                             |
| ----- | -------------------------------------------------------- | ------------------------------------------------------ |
| 25.6% | `react-aria`                                             | No — a11y engine behind Dialog/Tabs/RadioGroup/ListBox |
| 25.1% | `react-dom`                                              | No — the renderer                                      |
| 9.1%  | **application code** (`app` + `@graphite/*` + `ui-core`) | — it's already small                                   |
| 8.6%  | `@floating-ui/react`                                     | No — Tooltip + ContextMenu positioning                 |
| 6.6%  | `@tanstack/router-core`                                  | No — routing (ADR-017)                                 |
| 6.4%  | `react-aria-components`                                  | No — same a11y stack                                   |
| 3.3%  | `react-stately`                                          | No — react-aria's state layer                          |
| 3.2%  | `@tanstack/react-router`                                 | No — routing                                           |
| ~4.7% | `@floating-ui/{core,dom}`, `tabbable`                    | No — transitive a11y/positioning                       |
| 1.4%  | `@graphite/ui-core`                                      | — our primitives                                       |
| 0.7%  | `lucide-react`                                           | No — 15 named icons, tree-shaken                       |
| 0.8%  | `zustand`                                                | No — UI state (already minimal)                        |

## The headline

**The framework/library layer is ~89% of the bundle; first-party code is
~11%.** There is nothing to trim in application code — it is already
lean. The only levers that would move the number are architectural
dependency swaps, each with a real cost:

- **`react-aria` family (~36% combined)** is the single largest block. It
  backs four `ui-core` primitives — `Dialog`, `Tabs`, `RadioGroup`,
  `SearchableListBox` — which the command palette, settings page, and
  export dialog depend on. It provides focus-trapping, ARIA wiring, and
  keyboard navigation. Replacing it means hand-rolling that behaviour and
  re-passing the axe audit (Phase 6) — trading a known-correct 36% for an
  unknown-correctness smaller number. **Not worth it at MVP.** Revisit
  only if the ceiling is threatened and a specific primitive is the
  cheapest thing to inline.
- **`@floating-ui` (~12%)** backs Tooltip and ContextMenu. Same logic:
  correct positioning/collision handling is not free to reimplement.
- **`@tanstack/router` (~13%)** is the routing choice of record
  (ADR-017), sized as expected for a typed router.

## Dependency audit (this pass)

`depcheck`-style cross-check: **every declared dependency is imported;
every import resolves to a declared dependency.** Zero unused, zero
phantom. No dependency was removed because none is removable without
reimplementing accessibility-critical behaviour or the renderer/router
themselves.

## Recommendation

The bundle is healthy and well under ceiling. The productive future lever
is **not** dependency removal but, if ever needed, **route-level code
splitting** — the settings page already lazy-loads (ADR-017); the export
dialog and command palette are candidates to split out of the initial
chunk, deferring a slice of the react-aria weight until first use.
Recorded here as the _first_ thing to try if the ceiling is ever
pressured, ahead of any dependency swap.
