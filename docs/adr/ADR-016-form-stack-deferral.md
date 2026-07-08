# ADR-016: React Hook Form + Zod adoption deferred past M5

**Status**: Accepted — 2026-07-08 · **Context**: Phase 6, Milestone 5 (design)

## Context

The Blueprint gated React Hook Form + Zod on "first submission-style form
(M5 Settings)". The approved M5 design resolved Settings into two surfaces:
the keymap editor — a searchable view over `commandRegistry` and the
persisted `shortcutOverrides`, edited row-by-row through the M4 recorder —
and appearance settings, a theme radio group. Both are instant-apply,
matching the settings UX of VS Code, Figma, and Linear. Neither has a
submit action, a pending-payload lifecycle, or client-side validation of
user-entered data: the trigger the gate was written for does not occur
at M5.

## Decision

The RHF + Zod gate moves to **the first genuine submission-style form** —
concretely forecast as Phase 8 account/authentication (login,
registration, profile), the first UI with a submit action whose payload
must be validated before leaving the client. The gate itself is unchanged;
only its trigger milestone was wrong.

Definition locked for the future maintainer: a _submission-style form_ is
a surface where user-entered data accumulates into a payload that is
validated and then committed as one action — as opposed to instant-apply
controls that write UI intent on interaction.

## Rationale

1. **Three-question test fails at M5.** With no form present, the library
   answers none of: why it exists here, what problem it solves here, why
   existing code is insufficient. Instant-apply controls are `onChange`
   handlers over Zustand actions the codebase already has.
2. **Bundle governance.** M5 carries a 160 kB gzip main-chunk ceiling with
   TanStack Router landing; ~10 kB of unused form machinery spends budget
   on nothing.
3. **Contributor signal.** An adopted-but-unused form stack invites
   cargo-cult usage on non-forms — the opposite of the "every dependency
   answers three questions" culture this repository enforces.
4. **Deferral cost is zero.** Nothing in M5 needs it; versions are
   re-verified at actual adoption per the standing rule (reference points
   recorded 2026-07-08: react-hook-form 7.81.0, zod 4.4.3).

## Consequences

Blueprint §Stack gate line amended in the same commit. The project rule
"React Hook Form with Zod on all user-facing forms" is preserved intact —
its trigger simply had not fired. Independently of RHF, Zod may qualify at
Phase 8 for the client↔server API boundary on its own merits; that is a
separate future decision, and ADR-009 / the hand-rolled `validate.ts` for
internal IPC payloads is unaffected either way.

## Alternatives considered

Adopt at M5 anyway to honour the letter of the gate — rejected: gates
exist to time dependencies to need, not to schedule them regardless of
need. Build a token submission form to justify adoption — rejected
outright: inventing product surface to satisfy a tooling gate inverts the
relationship between the two.
