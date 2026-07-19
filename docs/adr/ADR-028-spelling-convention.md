# ADR-028: Spelling Convention — US for Identifiers, UK for Prose

- **Status:** Accepted
- **Date:** 2026-07-19
- **Phase:** 7 (post-M5 hardening)
- **Related:** ADR-007 (colour representation — the `Color` type this
  convention deliberately keeps US-spelled), ADR-009 (protocol-first IPC —
  the wire contract whose field names must not churn)

## Context

The project's prose (comments, ADRs, docs, UI copy) is written in UK
English. The temptation follows to "make everything consistent" by also
spelling identifiers the British way — `colour`, `centre`, `normalise`.
That temptation is a trap, and this ADR records the boundary so nobody
re-litigates it or "fixes" the mixed convention later.

The word that forces the decision is **colour**. It appears as an
identifier across every layer: the `Color` type and `COLOR_TRANSPARENT`
constant in `@graphite/protocol`, the `--color-*` design tokens (135+
references), the Rust engine's `set_fill(r,g,b,a)` colour parameters, the
`color.ts` modules, and hundreds of call sites spanning the Rust↔TS WASM
boundary. It is also HTML/CSS/DOM API surface we don't own: `type="color"`
on inputs, the CSS `color` property, `--color-*` following the Tailwind
convention.

## Decision

**Identifiers are US English. Prose is UK English.**

- **US (do not convert):** all code identifiers — variable, function,
  type, and property names; CSS custom-property names (`--color-*`);
  Tailwind utility classes (`justify-center`, `text-gray-500`); HTML/DOM
  API values (`type="color"`); protocol field names; Rust↔TS boundary
  symbols; test fixture strings that stand in for machine input
  (`"not-a-color"`).
- **UK (convert / author this way):** code comments, ADRs, Markdown docs,
  commit messages, and **user-visible strings** — button labels,
  tooltips, `aria-label`s, placeholders, error and empty-state copy
  ("No document colours").

The dividing line is simple: **if a machine reads it, US; if a human
reads it, UK.** A `title="No document colours"` is UK because the user
reads it; the `useDocumentColors` hook backing it stays US because the
compiler reads it. The two coexisting on adjacent lines is correct, not
an inconsistency.

## Why

- **Identifiers are API, and this is an open-source project.** Hundreds of
  contributors, published module contracts, and a Rust↔TS boundary mean a
  rename like `Color → Colour` is a breaking change to every layer at
  once — for zero functional gain. US English is the near-universal
  convention for programming identifiers; React (`color`), CSS
  (`color`), and WebGPU all spell it the American way, so US identifiers
  are what any contributor already expects.
- **Prose is read by people, and the project's voice is UK English.**
  Comments and docs carry no compatibility surface, so they follow the
  house style freely.
- **User-visible strings side with prose, not code.** They're read by
  humans and carry no API contract, so they're UK — even though they live
  in `.tsx` files next to US identifiers. When a UI string changes, its
  assertions in component tests change in lockstep (the test is checking
  human-facing copy, so it's UK too).

## Alternatives considered

- **UK everywhere, identifiers included.** Rejected: a breaking rename of
  `Color`, `--color-*`, `set_fill`'s params, and the protocol across the
  WASM boundary, buying nothing, and colliding head-on with HTML/CSS/DOM
  API surface we can't rename anyway (`type="color"`, the CSS `color`
  property). It would also churn exactly the files a size/optimisation
  pass wants to leave stable.
- **US everywhere, prose included.** Rejected: abandons the project's
  established UK voice in comments and docs for no benefit, and would
  itself be a large, pointless diff.
- **No policy (let it drift).** Rejected: guarantees a future contributor
  "corrects" a `colour` comment to match a `color` identifier, or vice
  versa, in an endless low-value churn. A recorded boundary ends the
  argument.

## Consequences

- The spelling sweep converts only prose and user-visible copy; a `color`
  identifier or a `-center` Tailwind class appearing in a diff is left
  untouched, on purpose.
- `dist/` build artifacts may lag prose changes until rebuilt — they're
  generated, not authored, and not a source of truth.
- Reviewers apply the human/machine test rather than a blanket
  find-replace; a linter rule could enforce it later, but the boundary is
  a judgement call (a string literal can be either), so it stays a
  documented convention rather than an automated gate for now.
