import type { Color } from "@graphite/protocol";
import { DocumentModel } from "../../../document/model";
import { DOCUMENT_LIMITS } from "../../../document/validate";
import type { EngineState } from "../state";

/**
 * Phase 7 M5 — deterministic stress-scene generator (ADR-027).
 *
 * Builds a `count`-node document into `state.docModel`, exactly as
 * `buildDemoScene` does, so the unchanged `rebuildSceneFromDocument` path
 * carries it to the GPU — what M5 measures is the product pipeline, never
 * a measurement-only side channel.
 *
 * **Geometry mirrors the Criterion workload.** The grid is
 * `build_mixed_grid` from `packages/engine/benches/engine.rs`: 100
 * columns at a 110-unit pitch, 100 × 100 shapes, kind and colour cycling
 * `i % 3` (plain sky-blue rect → amber rect with corner radius 12 →
 * mint ellipse), all inside one 100 000 × 100 000 root frame. The Rust
 * micro-benches and this through-worker scene therefore describe the same
 * workload at the same scale, so their numbers compose.
 *
 * **`count` is total document nodes, not shapes.** `validate.ts` counts
 * nodes against `DOCUMENT_LIMITS.maxNodes` (100 000, inclusive), so a
 * "100k" scene of 100 000 *shapes* plus its frame would be 100 001 nodes —
 * an illegal document that `document:load` would reject on the next
 * reload, silently replacing the stress scene with the demo fallback. The
 * scene must be a *legal* document (that legality is itself part of what
 * M5 verifies), so the budget constants (`MVP_MAX_OBJECTS`,
 * `SYSTEM_MAX_OBJECTS`) are spent as 1 frame + `count − 1` shapes. The
 * one-shape difference from `build_mixed_grid(count)` is 0.001 % at 100k —
 * immaterial to any measurement; the shared grid pitch, kind cycle, and
 * colours are what make the numbers comparable.
 *
 * **Determinism without randomness-in-disguise.** Ids are synthetic
 * (`"stress-frame"`, `"stress-<i>"`) and every field is computed from the
 * index, so two builds at the same `count` produce byte-identical
 * serialisations — runs are comparable across sessions and machines, and
 * the determinism test can assert exact equality rather than "looks
 * similar". Synthetic ids cannot collide with user content: every id the
 * editor itself mints is a `crypto.randomUUID()`.
 *
 * The build is wrapped in a `"stress-build"` User Timing measure — the
 * document-construction half of the load cost, beside `rebuildSceneFromDocument`'s
 * existing `"scene-rebuild"` measure for the WASM/scene half. Both appear
 * on the worker track of a DevTools Performance recording; the capture
 * procedure lives in `docs/benchmarks/phase7-stress.md`.
 */

/** `build_mixed_grid` constants — keep in lockstep with
 *  `packages/engine/benches/engine.rs`. */
const GRID_COLS = 100;
const GRID_PITCH = 110;
const SHAPE_SIZE = 100;
const FRAME_SIZE = 100_000;
const ROUNDED_RADIUS = 12;

const SKY_BLUE: Color = { r: 99, g: 179, b: 237, a: 255 };
const AMBER: Color = { r: 246, g: 173, b: 85, a: 255 };
const MINT: Color = { r: 104, g: 211, b: 145, a: 255 };

export const STRESS_FRAME_ID = "stress-frame";

/** The id of shape `i` (0-based) in the stress grid. */
export function stressShapeId(index: number): string {
  return `stress-${String(index)}`;
}

/**
 * Replaces `state.docModel` with the `count`-node stress scene.
 *
 * `count` is clamped to `[1, DOCUMENT_LIMITS.maxNodes]` and truncated to
 * an integer, so the generator can never produce an illegal document
 * whatever a future caller passes; `1` degenerates to the empty frame.
 * Callers then run the standard `document:new` sequence (rebuild, upload,
 * broadcasts, history reset) — see `engine.worker.ts`.
 */
export function buildStressScene(state: EngineState, count: number): void {
  const total = Math.min(Math.max(Math.trunc(count), 1), DOCUMENT_LIMITS.maxNodes);
  const shapes = total - 1;

  const buildStart = performance.now();

  state.docModel = new DocumentModel(`Stress Scene (${String(total)} nodes)`);
  const doc = state.docModel;
  doc.addFrame(STRESS_FRAME_ID, 0, 0, FRAME_SIZE, FRAME_SIZE, "Stress Grid");

  for (let i = 0; i < shapes; i++) {
    const id = stressShapeId(i);
    const x = (i % GRID_COLS) * GRID_PITCH;
    const y = Math.floor(i / GRID_COLS) * GRID_PITCH;
    const variant = i % 3;

    if (variant === 0) {
      doc.addRect(id, STRESS_FRAME_ID, x, y, SHAPE_SIZE, SHAPE_SIZE, SKY_BLUE);
    } else if (variant === 1) {
      doc.addRect(id, STRESS_FRAME_ID, x, y, SHAPE_SIZE, SHAPE_SIZE, AMBER);
      doc.setCornerRadius(id, ROUNDED_RADIUS);
    } else {
      doc.addEllipse(id, STRESS_FRAME_ID, x, y, SHAPE_SIZE, SHAPE_SIZE, MINT);
    }
  }

  performance.measure("stress-build", { start: buildStart, end: performance.now() });
}
