# ADR-018: Theming via CSS-variable token blocks

**Status**: Accepted — 2026-07-08 · **Context**: Phase 6, Milestone 5

## Context

Light theme and high-contrast support are the last design-system
deliverables seeded at M1, and Phase 6 cannot close without them (the a11y
audit requires `forced-colors`). The token system built at M1 — every
semantic colour as a Tailwind v4 `@theme` variable — was chosen partly to
make this a data change rather than a component change.

## Decision

**Runtime theming is pure CSS-variable swapping.** Tailwind v4 compiles
every colour utility to `var(--color-*)`, so a theme is just which value
block those variables resolve to. No component branches on theme. Three
blocks in `packages/ui-core/src/tokens.css`:

- **Dark** — the bare `@theme` default (emitted as `:root` custom
  properties). Carries no attribute, so "no attribute" unambiguously means
  dark.
- **Light** — `[data-theme="light"]`, the same semantic token names
  re-valued. An ordinary attribute-scoped block overrides the `:root`
  defaults at equal specificity by source order — no `!important`, no layer
  juggling. Only colour tokens are re-valued; fonts/radii are
  theme-invariant.
- **Forced colours** — `@media (forced-colors: active)` mapping semantic
  tokens to system colour keywords (`Canvas`, `CanvasText`, `Highlight`,
  `GrayText`), overriding _both_ value blocks because it is a system state,
  not a user preference. The browser forces most colours regardless;
  mapping the tokens keeps surface/text/border pairings coherent rather than
  left to per-property guesswork.

**Preference → resolved theme → one DOM write**, in `features/theme`.
`ThemePreference` is `dark | light | system`; `resolveTheme` turns `system`
into a concrete theme against `prefers-color-scheme`; `applyTheme` writes
(or clears) `document.documentElement.dataset.theme`. `useApplyTheme`,
mounted once at the router root (ADR-017), re-applies on preference change
and — while on `system` — on live OS scheme flips via a `matchMedia`
listener. Preference persists in the store (`themePreference`), instant-apply
from the appearance radio group — no form, no save (see ADR-016).

**Token fix folded in.** The M4 `AssetsPanel` referenced
`border-border-strong`, which had no token — Tailwind v4 silently drops
unknown utilities, so that hover border rendered nothing. `--color-border-
strong` is now defined in both value blocks; the M5 forced-colors block maps
it too.

## Consequences

**Positive.** Zero runtime theming dependency; the M1 token indirection pays
off exactly as intended; a new theme is a value block, not a code change;
high-contrast is honoured for the Phase 6 audit. No layout shift on switch —
only colours change.

**Costs.** Small CSS growth (measured +0.78 kB gzip for the two added
blocks). Every _new_ semantic colour token must now be given a value in all
three blocks, not one — enforced by review, not tooling.

## Alternatives considered

CSS-in-JS or duplicate stylesheets per theme — rejected: token-var swap is
zero-runtime and already the architecture. A `next-themes`-style dependency
— rejected: the resolve-and-apply effect is ~30 lines (three-question fail).
A `--spacing-*`-style parallel scale to also theme dimensions — out of
scope: only colours differ between themes.
