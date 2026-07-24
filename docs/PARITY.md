# Parity Matrix

Living record of every item in the committed FEATURE SCOPE, audited against
the codebase. **Updated at the close of every milestone.** Changing the
scope itself requires an ADR; changing a _status_ does not.

- **Audited:** 2026-07-20, against `main` (Phase 7 M5 delivered).
- **Companion:** [Integration Blueprint](./roadmap/INTEGRATION-BLUEPRINT.md)
  — deltas, module map, sequencing, targets, gate recommendations.

## Status vocabulary

`Not Started` · `In Progress` · `Shipped` · `Gated` · `Deferred`

Plus one addition to the prescribed set, used deliberately:

- **`Partial`** — some sub-capability ships today, the item as written does
  not, and _no one is working on it_. "In Progress" would falsely imply
  active work; "Not Started" would falsely deny shipped behaviour. Roughly
  a fifth of Tier 1 is in this state, so collapsing it either way would
  misreport the baseline. Every `Partial` row states exactly what exists.

## Baseline in one line

Phases 0–6 complete, Phase 7 (MVP) delivered pending its capture. The
editor draws, selects, moves, and edits **rectangles and ellipses inside
frames**, with undo/redo, `.graphite` save/load, SVG/PNG/JPEG export, a
command palette, remappable shortcuts, theming, and a damage-model render
loop. Everything else below is delta.

---

## Tier 1 — Core

### EPIC C1 — Vector editing & object model

| #     | Item                                                               | Status      | Notes                                                                                                                                                                     |
| ----- | ------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1.1  | Pen tool, vector networks                                          | Not Started | Needs the path render path (P8) and a path data type in `DocNode`.                                                                                                        |
| C1.2  | Primitive shapes (rect, ellipse, line, polygon, star)              | Partial     | Rect + ellipse shipped as SDF primitives. Line, polygon, star absent; "live-editable geometry" (corner count, point ratio) has no model field.                            |
| C1.3  | Boolean operations (union/subtract/intersect/exclude), live groups | Not Started | Largest geometry delta after paths. Needs non-destructive boolean group semantics in the document model.                                                                  |
| C1.4  | Path operations (flatten, outline stroke, join, split)             | Not Started | Depends on C1.1.                                                                                                                                                          |
| C1.5  | Per-vertex corner radius + superellipse smoothing                  | Partial     | `cornerRadius` is a single scalar applied uniformly; shader supports one radius. Per-vertex and smoothing absent.                                                         |
| C1.6  | Snapping & smart guides (pixel grid, object, spacing overlays)     | Not Started | No snapping subsystem. Overlay rendering surface also absent.                                                                                                             |
| C1.7  | Layout guides (uniform / column / row)                             | Not Started | Distinct from C2 grid layout.                                                                                                                                             |
| C1.8  | Rulers + draggable lockable guides                                 | Not Started |                                                                                                                                                                           |
| C1.9  | Transform tools (move, rotate, scale, flip, skew)                  | Partial     | Move (drag) shipped. No rotation/skew — `DocNode` has no transform, only x/y/w/h. Adding rotation touches the render instance format, hit-testing, and bounds.            |
| C1.10 | Groups vs frames, arbitrary nesting                                | Partial     | Frames shipped with nesting. No group container semantics.                                                                                                                |
| C1.11 | Align, distribute, tidy-up                                         | Not Started | Pure document-model operation; cheap once multi-select ops exist.                                                                                                         |
| C1.12 | Blend modes (full standard set)                                    | Not Started | Requires per-layer compositing; current pipeline is one flat instanced pass.                                                                                              |
| C1.13 | Opacity (per layer, per fill/stroke/effect)                        | Partial     | Colour carries alpha; no independent layer opacity.                                                                                                                       |
| C1.14 | Effects (drop/inner shadow, layer & background blur, grain)        | Not Started | Needs offscreen render targets and a post-effect pass.                                                                                                                    |
| C1.15 | Stroke controls (dash, alignment, caps, joins)                     | Partial     | Centre-aligned solid stroke of uniform width only (`DocStroke = {color,width}`).                                                                                          |
| C1.16 | Fill types (solid, 4 gradient types, image, video)                 | Partial     | Solid only. Gradients/image/video need texture + paint infrastructure.                                                                                                    |
| C1.17 | Masks (any shape or text as clipping mask)                         | Not Started | Needs stencil or clip-stack support in the pipeline.                                                                                                                      |
| C1.18 | Native table object                                                | Not Started | Depends on C2 layout and C4 text.                                                                                                                                         |
| C1.19 | Layers panel (reorder, hide, lock, rename, multi-select, search)   | Partial     | Hide, lock, rename, multi-select, search shipped. **Drag-to-reorder absent** — `node:reparent` / `node:reorder` deliberately not yet in the `DocumentOp` union (ADR-020). |

### EPIC C2 — Layout engine

| #    | Item                                                 | Status      | Notes                                                    |
| ---- | ---------------------------------------------------- | ----------- | -------------------------------------------------------- |
| C2.1 | Auto layout (horizontal/vertical/wrap, gap, padding) | Not Started | No layout solver exists.                                 |
| C2.2 | Primary/counter-axis alignment & distribution        | Not Started |                                                          |
| C2.3 | Fixed / Hug / Fill sizing per axis                   | Not Started |                                                          |
| C2.4 | Nested auto layout                                   | Not Started |                                                          |
| C2.5 | Absolute-positioning escape hatch                    | Not Started |                                                          |
| C2.6 | 2D grid layout (tracks, spans, reorder, auto-rows)   | Not Started |                                                          |
| C2.7 | Layout values bound to number variables              | Not Started | Depends on A2.                                           |
| C2.8 | Constraints (pin/scale) for non-layout frames        | Not Started |                                                          |
| C2.9 | Clean mapping onto CSS Flexbox/Grid for handoff      | Not Started | A design constraint on C2, verified by A3 codegen tests. |

### EPIC C3 — Components & design systems

| #    | Item                                                         | Status      | Notes                                                   |
| ---- | ------------------------------------------------------------ | ----------- | ------------------------------------------------------- |
| C3.1 | Components & instances, live propagation                     | Not Started |                                                         |
| C3.2 | Nested components                                            | Not Started |                                                         |
| C3.3 | Variants / component sets                                    | Not Started |                                                         |
| C3.4 | Component properties (boolean, text, instance-swap, variant) | Not Started |                                                         |
| C3.5 | Detach / swap / reset overrides                              | Not Started |                                                         |
| C3.6 | Component & variant descriptions                             | Not Started |                                                         |
| C3.7 | Go to main component                                         | Not Started |                                                         |
| C3.8 | Design-system intelligence                                   | **Gated**   | Go/no-go ADR required. Recommendation in the blueprint. |

### EPIC C4 — Typography & text engine

| #    | Item                                                               | Status      | Notes                                                                                  |
| ---- | ------------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------- |
| C4.1 | Text styles (family, weight, size, line height, tracking, spacing) | Not Started | No text node kind exists.                                                              |
| C4.2 | OpenType feature toggles                                           | Not Started |                                                                                        |
| C4.3 | Variable font axis control                                         | Not Started |                                                                                        |
| C4.4 | Auto-width / auto-height / fixed sizing                            | Not Started |                                                                                        |
| C4.5 | Truncation & line clamping                                         | Not Started |                                                                                        |
| C4.6 | Alignment, lists, paragraph formatting                             | Not Started |                                                                                        |
| C4.7 | Local font access + bundled web-font library                       | Not Started | Local access is a browser-permission surface; bundled library is a licensing decision. |
| C4.8 | Missing-font detection & substitution warnings                     | Not Started |                                                                                        |

### EPIC C5 — Prototyping & interaction runtime

| #    | Item                                                                                           | Status      | Notes                                                          |
| ---- | ---------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------- |
| C5.1 | Interactive flows, multiple start points                                                       | Not Started |                                                                |
| C5.2 | Triggers (click, hover, press, key/gamepad, enter/leave, delay)                                | Not Started |                                                                |
| C5.3 | Actions (navigate, variant, overlay, back, scroll, URL, set variable/mode, conditionals, loop) | Not Started | Variable actions depend on A2.                                 |
| C5.4 | Smart animate (matched-layer tweening)                                                         | Not Started |                                                                |
| C5.5 | Transition styles + easing (cubic-bezier, spring)                                              | Not Started |                                                                |
| C5.6 | Overlay positioning (manual & automatic)                                                       | Not Started |                                                                |
| C5.7 | Device previews, presentation mode, shareable links                                            | Not Started | Share links need backend (P11) + unguessable/revocable tokens. |
| C5.8 | Observation mode                                                                               | Not Started | Depends on collaboration presence (P12).                       |
| C5.9 | Prototype settings (hotspot hints, looping, arrow-key nav)                                     | Not Started |                                                                |

### EPIC C6 — Real-time collaboration

| #    | Item                                                    | Status       | Notes                                                                                         |
| ---- | ------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------- |
| C6.1 | Live multiplayer cursors                                | Not Started  | `packages/crdt` is a 15-line stub.                                                            |
| C6.2 | Cursor chat                                             | Not Started  |                                                                                               |
| C6.3 | Follow mode                                             | Not Started  |                                                                                               |
| C6.4 | Pinned comments (threads, mentions, reactions, resolve) | Not Started  |                                                                                               |
| C6.5 | Activity feed & notifications                           | Not Started  |                                                                                               |
| C6.6 | Version history (auto + named checkpoints, restore)     | Partial      | In-session undo/redo shipped (ADR-020); durable, named, restorable versions need the backend. |
| C6.7 | Sharing & permissions (+ minimal identity/auth)         | Not Started  | Server-enforced; client role state advisory only.                                             |
| C6.8 | Branch & merge                                          | **Deferred** | Untouchable without a new ADR.                                                                |

### EPIC C7 — Platform & app shell

| #    | Item                                               | Status      | Notes                                                                                                                                                                                              |
| ---- | -------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C7.1 | Browser support (Chromium, Firefox, Safari)        | Partial     | Runs where WebGPU is available — effectively Chromium today. Firefox/Safari WebGPU maturity is a tracked external dependency, not our code. **No WebGL fallback, by standing decision (ADR-002).** |
| C7.2 | GPU-accelerated rendering on very large documents  | Partial     | Shipped and damage-tracked (ADR-025); verified to 10k, 100k probed. Must not regress as the pipeline generalises.                                                                                  |
| C7.3 | Comprehensive keyboard shortcuts                   | Shipped     | Registry + remapping + recorder (ADR-015). New surfaces must register into it.                                                                                                                     |
| C7.4 | Global fuzzy command palette                       | Shipped     | Covers registered commands; every new subsystem registers its actions.                                                                                                                             |
| C7.5 | Localization-ready UI (i18n from the string layer) | Not Started | Strings are inline literals today. Cheapest to fix _before_ Tier 1 surface area triples.                                                                                                           |
| C7.6 | Desktop wrapper                                    | **Gated**   |                                                                                                                                                                                                    |
| C7.7 | Mobile viewer                                      | **Gated**   |                                                                                                                                                                                                    |
| C7.8 | Live device mirror                                 | **Gated**   |                                                                                                                                                                                                    |

---

## Tier 2 — Advanced

### EPIC A1 — Illustration mode

| #    | Item                                           | Status      | Notes                     |
| ---- | ---------------------------------------------- | ----------- | ------------------------- |
| A1.1 | Pencil & brush, freehand → fitted vector paths | Not Started | Depends on C1.1.          |
| A1.2 | Shape Builder                                  | Not Started | Depends on C1.3 booleans. |
| A1.3 | Lasso point/segment selection                  | Not Started |                           |
| A1.4 | Multi-edit of points and paths                 | Not Started |                           |
| A1.5 | Text on a path                                 | Not Started | Depends on C1.1 + C4.     |
| A1.6 | Pattern fills                                  | Not Started |                           |
| A1.7 | Dynamic variable-width strokes                 | Not Started |                           |
| A1.8 | Custom brushes from closed vector shapes       | Not Started |                           |
| A1.9 | Stylus/tablet pressure + second screen         | **Gated**   |                           |

### EPIC A2 — Styles, variables & design tokens

| #    | Item                                                       | Status      | Notes                                                                                                                                         |
| ---- | ---------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| A2.1 | Static styles (colour, text, effect)                       | Partial     | Assets panel surfaces live _document colours_; these are derived, not authored reusable styles.                                               |
| A2.2 | Variables (Colour, Number, String, Boolean) in collections | Not Started |                                                                                                                                               |
| A2.3 | Multiple modes per collection                              | Not Started |                                                                                                                                               |
| A2.4 | Variable aliasing                                          | Not Started |                                                                                                                                               |
| A2.5 | Scoping                                                    | Not Started |                                                                                                                                               |
| A2.6 | Typography bound to variables                              | Not Started | Depends on C4.                                                                                                                                |
| A2.7 | Variables driving prototype logic                          | Not Started | Depends on C5.                                                                                                                                |
| A2.8 | DTCG import/export                                         | Not Started |                                                                                                                                               |
| A2.9 | **Inheritable base values across modes**                   | Not Started | The committed differentiator — the audit flags this as an open Figma gap. Design it into the model from the first line, not as a later patch. |

### EPIC A3 — Dev mode & code handoff

| #    | Item                                                   | Status      | Notes                                                  |
| ---- | ------------------------------------------------------ | ----------- | ------------------------------------------------------ |
| A3.1 | Inspect panel (CSS, Swift, Compose snippets)           | Not Started | Quality depends on C2 mapping cleanly to Flexbox/Grid. |
| A3.2 | Measurement redlines                                   | Not Started |                                                        |
| A3.3 | Ready-for-dev status flags                             | Not Started |                                                        |
| A3.4 | Visual diff between versions                           | Not Started | Depends on C6.6 durable versions.                      |
| A3.5 | Attachable dev resources                               | Not Started |                                                        |
| A3.6 | Production component mapping (Code Connect equivalent) | **Gated**   |                                                        |
| A3.7 | MCP server                                             | **Gated**   |                                                        |
| A3.8 | Bidirectional code-to-canvas                           | **Gated**   |                                                        |
| A3.9 | Packaged agent skills                                  | **Gated**   |                                                        |

### EPIC A4 — AI & generative tooling

Every item is **Gated**. The core must build, run, and pass its full suite
with zero AI providers configured — a CI-enforced invariant, not a promise.

| #     | Item                                                      | Status    |
| ----- | --------------------------------------------------------- | --------- |
| A4.1  | Design-system-constrained UI generation                   | **Gated** |
| A4.2  | Code layers (React-backed, AI-editable)                   | **Gated** |
| A4.3  | Motion timeline + multi-format export                     | **Gated** |
| A4.4  | Prompt-generated WebGPU shaders/fills                     | **Gated** |
| A4.5  | Prompt-generated plugins                                  | **Gated** |
| A4.6  | Agent connectors + user-defined skills                    | **Gated** |
| A4.7  | Content replacement                                       | **Gated** |
| A4.8  | AI-suggested auto layout                                  | **Gated** |
| A4.9  | Bulk semantic layer renaming                              | **Gated** |
| A4.10 | Image editing (background removal, prompt edits, upscale) | **Gated** |
| A4.11 | Instance & admin AI kill switches                         | **Gated** |

---

## Rollup

| Tier    | Shipped | Partial | Not Started | Gated  | Deferred | Total   |
| ------- | ------- | ------- | ----------- | ------ | -------- | ------- |
| Tier 1  | 2       | 11      | 47          | 4      | 1        | 65      |
| Tier 2  | 0       | 1       | 21          | 15     | 0        | 37      |
| **All** | **2**   | **12**  | **68**      | **19** | **1**    | **102** |

Read honestly: the MVP is a strong, well-tested **foundation** — roughly
14% of the committed surface is shipped or partly shipped, and none of the
five largest subsystems (paths, text, layout, components, collaboration)
exists yet. The engineering ahead is a multiple of the engineering behind.
That is not a problem with the baseline; it is the correct reading of a
parity programme scoped against a decade-old product line.
