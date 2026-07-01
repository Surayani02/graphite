# ADR-009: Protocol-First Message Typing for Worker IPC

**Date**: Phase 0–1
**Status**: Accepted
**Deciders**: Engineering Team

## Context

The main thread and the engine worker (ADR-003) communicate exclusively
via `postMessage`, which is untyped at the JavaScript level — any value
can be posted, and `MessageEvent.data` is `any` by default. Without a
shared contract, the two sides can drift silently: a renamed field on one
side becomes a runtime `undefined` on the other, discovered only by
testing (or not at all).

## Decision

Every message in both directions is a member of one of two discriminated
unions defined once in `@graphite/protocol`: `MainToEngineMessage` and
`EngineToMainMessage`. Both the main-thread bridge (`engine/bridge.ts`)
and the worker (`workers/engine.worker.ts` and its submodules) import
these types and `switch` on `message.type`.

## Rationale

- **Compile-time exhaustiveness.** Adding a new message variant to either
  union and handling it in only one of the two `switch` statements is a
  type error the moment the other side's `switch` is missing a case
  (combined with `noFallthroughCasesInSwitch`), not a runtime surprise.
- **Single source of truth, zero runtime cost.** `@graphite/protocol` has
  no runtime dependencies and the message types themselves are pure
  TypeScript interfaces — there is no serialisation/validation overhead on
  the hot path (every `pointer:move` and `frame:rendered` message), unlike
  a runtime-validated-schema approach.
- **`Transferable` objects are explicit.** `engine:init`'s `canvas` field
  is typed as `OffscreenCanvas` directly in the union, making it visible
  at the type level that this field must be passed in `postMessage`'s
  transfer-list argument — the type doesn't prevent the mistake of
  forgetting the transfer list, but it does make the field's special
  handling discoverable by anyone reading the type.

## Alternatives Considered

| Alternative                                                                       | Reason rejected                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Untyped `postMessage` with manual field access                                    | Exactly the silent-drift failure mode this ADR exists to prevent; not a real alternative for a codebase intended for long-term multi-contributor maintenance                                                                                                                                                                                                                     |
| Runtime schema validation (zod) on every IPC message                              | Adds parsing overhead to the highest-frequency code path in the application (every pointer move, every rendered frame); the worker and main thread are the _same trust boundary_ (no untrusted network input crosses this channel, unlike `DocumentModel.fromJson`'s localStorage input — see this review's BUG-03), so compile-time typing is sufficient without a runtime cost |
| A class-based message system (e.g. one class per message type, instanceof checks) | More boilerplate than a discriminated union for no behavioural benefit; discriminated unions are the idiomatic TypeScript pattern for this exact "tagged variant" shape                                                                                                                                                                                                          |

## Consequences

### Positive

- Renaming or restructuring a message field is caught by `pnpm typecheck`
  at every call site, in both the worker and the main thread, before any
  manual testing.
- New contributors can read `@graphite/protocol/src/index.ts` as the
  single, complete specification of what can cross the worker boundary.

### Negative

- The protocol package must be kept narrowly scoped — message types only,
  zero runtime logic — or it risks becoming a dumping ground that couples
  the worker and main thread more tightly than intended. This discipline
  is a convention, not something the type system enforces on its own.

## Review Criteria

Revisit runtime validation (zod) specifically if a future phase introduces
a _third_ party able to post messages into this channel that isn't
trusted application code (e.g. a sandboxed plugin, per the
`packages/plugin-api` roadmap) — at that point the trust-boundary
assumption underlying "compile-time typing is sufficient" no longer holds.
