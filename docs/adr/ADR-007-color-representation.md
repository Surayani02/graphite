# ADR-007: u8 Straight-Alpha Colour Representation

**Date**: Phase 2 (decision); clarified during the Phase 5 architecture review
**Status**: Accepted
**Deciders**: Engineering Team

## Context

A colour representation is needed at three layers: the Rust engine
(`packages/engine::math::color::Color`), the TypeScript document model
(`apps/web/src/document/model.ts`), and the shared protocol package
(`@graphite/protocol`). These had drifted: the Rust struct's doc comment
incorrectly claimed pre-multiplied alpha, and the protocol package defined
a second, structurally-identical `Color` type on an ambiguous 0–1 float
scale that no application code actually used. Both were corrected as part
of this review (see the review's BUG-01 and BUG-04 entries).

## Decision

One colour representation, used everywhere: **straight alpha**, four `u8`
(Rust) / integer-`number` (TypeScript) channels, range `[0, 255]`. `255` is
fully opaque / full intensity; `0` is fully transparent / none.
`@graphite/protocol`'s `Color` interface is now the single canonical
TypeScript-side definition; the document model's previously-separate
`DocColor` type has been removed in favour of importing `Color` directly.

## Rationale

- **Matches the WASM boundary exactly.** `SceneGraph::add_rect` and
  `add_ellipse` take `r: u8, g: u8, b: u8, a: u8` directly — no
  normalisation step is needed between the document model, the IPC layer,
  and the Rust API.
- **Straight, not pre-multiplied, alpha.** `Color::to_f32_array()` performs
  a plain per-channel division by 255 with no multiplication of RGB by
  alpha, and the WGSL fragment shader composites with straight-alpha
  `smoothstep` blending (`fa = smoothstep(...) * in.fill.a`, not
  `in.fill.rgb` pre-multiplied beforehand). Pre-multiplied alpha is a
  legitimate technique for certain compositing/texture-upload paths, but
  it is not what this codebase currently does, and the Rust doc comment
  claiming otherwise (now fixed) would have actively misled the first
  contributor who tried to write a compositing pass against it.
- **One type, not two.** Maintaining `Color` (protocol) and `DocColor`
  (document model) as separate-but-structurally-identical types with
  different _intended_ scales was an accident of incremental
  development, not a deliberate design — `Color` was scaffolded in Phase 0
  before the engine's actual `u8` convention was established in Phase 2,
  and was never reconciled afterward. There is no use case in this
  codebase for two different colour scales.

## Alternatives Considered

| Alternative                                                          | Reason rejected                                                                                                                                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normalised `[0.0, 1.0]` floats throughout (TS and Rust)              | Adds a conversion step at the WASM boundary for no benefit; `u8` already matches typical colour-picker and CSS `rgb()` conventions a future UI will use                                                       |
| Pre-multiplied alpha throughout                                      | Correct technique for some compositing scenarios, but not needed at current scope, and complicates the straightforward `fill`/`stroke` blending Phase 3 already implements correctly with straight alpha      |
| Keep `Color` and `DocColor` as separate types, just fix their values | Treats the symptom (wrong constant values) without fixing the cause (two types inviting future drift); a future contributor adding a third call site would have no way to know which type was "the right one" |

## Consequences

### Positive

- Single conversion point (`Color::to_f32_array()` in Rust) for the only
  place a 0–1 float representation is actually needed (the GPU shader
  input).
- `packages/protocol`'s `Color` is now genuinely the type a Phase 6 colour
  picker / design-token system would import, rather than a vestigial type
  nothing used.

### Negative

- None identified. This is a consolidation, not a new constraint.

## Review Criteria

If a future GPU/texture pipeline genuinely needs pre-multiplied alpha
(e.g. image compositing, blur passes), introduce a distinct
`PremultipliedColor` newtype with an explicit conversion function rather
than overloading this type's meaning.
