/**
 * Draw-plan batching (ADR-032 Decision 1) — the contract is that paint
 * order survives batching and that SDF runs collapse to the fewest
 * possible instanced draws.
 */
import { describe, expect, it } from "vitest";
import {
  buildDrawPlan,
  pathTranslate,
  readColor,
  RECORD,
  RECORD_FLOATS,
  SHAPE_TYPE_PATH,
  type DrawItem,
} from "../workers/engine/gpu/drawPlan";

/** Builds a render list from a shape-type sequence: 0/1 = SDF, 2 = path. */
function listOf(types: readonly number[]): Float32Array {
  const list = new Float32Array(types.length * RECORD_FLOATS);
  types.forEach((type, index) => {
    const base = index * RECORD_FLOATS;
    list[base + RECORD.shapeType] = type;
    if (type === SHAPE_TYPE_PATH) {
      list[base + RECORD.radiusOrId] = 100 + index; // engine id
      list[base + RECORD.padOrVersion] = 1;
      list[base + RECORD.x] = index * 10;
      list[base + RECORD.y] = index * 20;
    }
  });
  return list;
}

const kinds = (plan: readonly DrawItem[]) => plan.map((item) => item.kind);

describe("buildDrawPlan", () => {
  it("returns nothing for an empty list", () => {
    expect(buildDrawPlan(new Float32Array(0))).toEqual([]);
  });

  it("collapses an all-SDF list into a single instanced draw", () => {
    const plan = buildDrawPlan(listOf([0, 1, 0, 1, 0]));
    expect(plan).toEqual([{ kind: "sdf", start: 0, count: 5 }]);
  });

  it("emits one path draw per path record", () => {
    const plan = buildDrawPlan(listOf([2, 2, 2]));
    expect(kinds(plan)).toEqual(["path", "path", "path"]);
    expect(plan.map((item) => (item.kind === "path" ? item.engineId : -1))).toEqual([
      100, 101, 102,
    ]);
  });

  it("splits SDF runs around paths, preserving paint order", () => {
    const plan = buildDrawPlan(listOf([0, 0, 2, 1, 1, 1, 2, 0]));
    expect(plan).toEqual([
      { kind: "sdf", start: 0, count: 2 },
      { kind: "path", engineId: 102, version: 1, recordIndex: 2 },
      { kind: "sdf", start: 3, count: 3 },
      { kind: "path", engineId: 106, version: 1, recordIndex: 6 },
      { kind: "sdf", start: 7, count: 1 },
    ]);
  });

  it("handles the alternating worst case as one draw per record", () => {
    const plan = buildDrawPlan(listOf([0, 2, 0, 2, 0, 2]));
    expect(kinds(plan)).toEqual(["sdf", "path", "sdf", "path", "sdf", "path"]);
    expect(plan.filter((item) => item.kind === "sdf")).toHaveLength(3);
  });

  it("keeps leading and trailing runs distinct", () => {
    expect(buildDrawPlan(listOf([2, 0, 0]))).toEqual([
      { kind: "path", engineId: 100, version: 1, recordIndex: 0 },
      { kind: "sdf", start: 1, count: 2 },
    ]);
    expect(buildDrawPlan(listOf([0, 0, 2]))).toEqual([
      { kind: "sdf", start: 0, count: 2 },
      { kind: "path", engineId: 102, version: 1, recordIndex: 2 },
    ]);
  });

  it("ignores a trailing partial record rather than throwing", () => {
    const list = new Float32Array(RECORD_FLOATS + 3);
    expect(buildDrawPlan(list)).toEqual([{ kind: "sdf", start: 0, count: 1 }]);
  });

  it("reads the translate and colours back out of a path record", () => {
    const list = listOf([0, 2]);
    const base = RECORD_FLOATS + RECORD.fillR;
    // Exactly-representable f32 values: a literal like 0.1 would fail the
    // comparison on the Float32Array round-trip, not on the logic.
    list.set([0.25, 0.5, 0.75, 1], base);
    expect(pathTranslate(list, 1)).toEqual([10, 20]);
    expect(readColor(list, 1, RECORD.fillR)).toEqual([0.25, 0.5, 0.75, 1]);
  });
});
