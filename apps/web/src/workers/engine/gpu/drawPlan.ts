/**
 * Draw planning — the pure half of the frame graph (ADR-032 Decision 1).
 *
 * The engine hands the worker one culled, paint-ordered render list in
 * which SDF shapes and path references are interleaved. This module turns
 * that flat `Float32Array` into a plan: maximal contiguous runs of SDF
 * records become single instanced draws through `firstInstance`, and each
 * path reference becomes its own mesh draw, **in place**. Paint order is
 * never reordered — alpha compositing requires it (ADR-032 rejected
 * depth-buffer reordering for exactly this reason).
 *
 * Kept separate from `frame.ts` (which owns pass assembly and touches the
 * GPU) so the batching logic is unit-testable without a device. That is a
 * refinement of the §C file map, which sketched both in one file; the
 * ~250-line file law and the testability both point this way.
 */

/** Floats per render record — mirrors `graph.rs::get_render_list`. */
export const RECORD_FLOATS = 16;

/** Offsets within a record. Shared by both record shapes where the slot
 *  means the same thing; see `push_path` in `graph.rs` for the divergences
 *  (slots 0–1 carry the path origin, 13 the node id, 15 the version). */
export const RECORD = {
  /** SDF: bounds x · Path: origin x (the draw translate). */
  x: 0,
  /** SDF: bounds y · Path: origin y. */
  y: 1,
  fillR: 4,
  strokeR: 8,
  strokeWidth: 12,
  /** SDF: corner radius · Path: engine node id. */
  radiusOrId: 13,
  /** 0 = rect, 1 = ellipse, 2 = path reference. */
  shapeType: 14,
  /** SDF: pad · Path: geometry version. */
  padOrVersion: 15,
} as const;

/** `shape_type` value marking a path-reference record. */
export const SHAPE_TYPE_PATH = 2;

/** A maximal run of consecutive SDF records, drawn as one instanced call
 *  with `firstInstance = start`. */
export interface SdfRun {
  readonly kind: "sdf";
  /** Index of the first record in the run (instance index). */
  readonly start: number;
  /** Number of records in the run. Always ≥ 1. */
  readonly count: number;
}

/** One path reference, drawn from its cached mesh. */
export interface PathDraw {
  readonly kind: "path";
  /** Engine node id — the mesh-cache key. */
  readonly engineId: number;
  /** Geometry version at cull time — the cache validity check. */
  readonly version: number;
  /** Record index, for reading the origin and colours back out. */
  readonly recordIndex: number;
}

export type DrawItem = SdfRun | PathDraw;

/**
 * Splits a render list into its draw plan.
 *
 * Linear in the number of records, allocation-light (one array, one object
 * per item), and called once per frame — the interleaving worst case is a
 * document alternating shape/path, which degrades to one draw per record.
 * That case is a recorded bench fixture rather than a blocker (ADR-032
 * Decision 1).
 *
 * A trailing partial record is ignored: the engine never emits one, and
 * silently dropping it beats throwing inside the render loop.
 */
export function buildDrawPlan(list: Float32Array): readonly DrawItem[] {
  const plan: DrawItem[] = [];
  const records = Math.floor(list.length / RECORD_FLOATS);

  let runStart = -1;
  for (let index = 0; index < records; index += 1) {
    const base = index * RECORD_FLOATS;
    if (list[base + RECORD.shapeType] === SHAPE_TYPE_PATH) {
      if (runStart >= 0) {
        plan.push({ kind: "sdf", start: runStart, count: index - runStart });
        runStart = -1;
      }
      plan.push({
        kind: "path",
        engineId: list[base + RECORD.radiusOrId] ?? 0,
        version: list[base + RECORD.padOrVersion] ?? 0,
        recordIndex: index,
      });
      continue;
    }
    if (runStart < 0) runStart = index;
  }
  if (runStart >= 0) {
    plan.push({ kind: "sdf", start: runStart, count: records - runStart });
  }
  return plan;
}

/** Reads a path record's world-space draw translate. */
export function pathTranslate(list: Float32Array, recordIndex: number): readonly [number, number] {
  const base = recordIndex * RECORD_FLOATS;
  return [list[base + RECORD.x] ?? 0, list[base + RECORD.y] ?? 0];
}

/** Reads four consecutive floats as an RGBA colour (already 0–1: the
 *  engine converts from u8 sRGB when it builds the record). */
export function readColor(
  list: Float32Array,
  recordIndex: number,
  offset: number
): readonly [number, number, number, number] {
  const base = recordIndex * RECORD_FLOATS + offset;
  return [list[base] ?? 0, list[base + 1] ?? 0, list[base + 2] ?? 0, list[base + 3] ?? 0];
}
