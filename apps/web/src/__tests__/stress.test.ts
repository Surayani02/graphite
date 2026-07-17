import { describe, expect, it } from "vitest";
import { MVP_MAX_OBJECTS, SYSTEM_MAX_OBJECTS } from "@graphite/protocol";
import { DOCUMENT_LIMITS, assertValidDocumentData } from "../document/validate";
import type { EngineState } from "../workers/engine/state";
import { STRESS_FRAME_ID, buildStressScene, stressShapeId } from "../workers/engine/scene/stress";

/**
 * Phase 7 M5 — stress-scene generator (ADR-027).
 *
 * The generator is pure document construction (no GPU, no worker
 * lifecycle), so everything it promises is unit-provable: exact node
 * counts at both Blueprint budgets, byte-identical determinism, legality
 * under the shipped validator at the exact ceiling, paint order, parent
 * wiring, and the `build_mixed_grid` geometry parity that makes the
 * Criterion numbers and the through-worker numbers describe one workload.
 */

function freshState(): EngineState {
  return { docModel: null } as unknown as EngineState;
}

function build(count: number): EngineState {
  const state = freshState();
  buildStressScene(state, count);
  return state;
}

describe("buildStressScene", () => {
  it("builds exactly `count` total nodes — one frame plus count−1 shapes", () => {
    const state = build(500);
    expect(state.docModel).not.toBeNull();
    expect(state.docModel?.nodeCount).toBe(500);

    const nodes = state.docModel?.getNodesInOrder() ?? [];
    expect(nodes.filter((n) => n.kind === "frame")).toHaveLength(1);
    expect(nodes.filter((n) => n.kind !== "frame")).toHaveLength(499);
  });

  it("hits the MVP budget exactly at MVP_MAX_OBJECTS", () => {
    const state = build(MVP_MAX_OBJECTS);
    expect(state.docModel?.nodeCount).toBe(10_000);
  });

  it("is deterministic — two builds serialise byte-identically", () => {
    const a = build(500).docModel?.serialize();
    const b = build(500).docModel?.serialize();
    expect(a).toBeDefined();
    expect(a).toBe(b);
  });

  it("produces a legal document at the MVP budget — validator round-trip", () => {
    const json = build(MVP_MAX_OBJECTS).docModel?.serialize() ?? "";
    const data: unknown = JSON.parse(json);
    expect(() => {
      assertValidDocumentData(data);
    }).not.toThrow();
  });

  it("produces a legal document at the exact system ceiling", () => {
    // SYSTEM_MAX_OBJECTS === DOCUMENT_LIMITS.maxNodes: the 100k scene is
    // the largest document the shipped validator accepts, which is why
    // `count` denotes total nodes (frame included) — one node more and
    // document:load would reject the reload with the demo-scene fallback.
    expect(SYSTEM_MAX_OBJECTS).toBe(DOCUMENT_LIMITS.maxNodes);
    const json = build(SYSTEM_MAX_OBJECTS).docModel?.serialize() ?? "";
    const data: unknown = JSON.parse(json);
    expect(() => {
      assertValidDocumentData(data);
    }).not.toThrow();
  });

  it("paints the frame first, then shapes in index order", () => {
    const ids = (build(6).docModel?.getNodesInOrder() ?? []).map((n) => n.id);
    expect(ids).toEqual([
      STRESS_FRAME_ID,
      stressShapeId(0),
      stressShapeId(1),
      stressShapeId(2),
      stressShapeId(3),
      stressShapeId(4),
    ]);
  });

  it("parents every shape to the single root frame", () => {
    const nodes = build(50).docModel?.getNodesInOrder() ?? [];
    const frame = nodes.find((n) => n.kind === "frame");
    expect(frame?.id).toBe(STRESS_FRAME_ID);
    expect(frame?.parent).toBeNull();
    expect(frame?.children).toHaveLength(49);
    for (const shape of nodes.filter((n) => n.kind !== "frame")) {
      expect(shape.parent).toBe(STRESS_FRAME_ID);
    }
  });

  it("mirrors build_mixed_grid — kind/colour cycle and 110-unit pitch", () => {
    const state = build(200);
    const doc = state.docModel;

    // i % 3 === 0: plain sky-blue rect at the grid origin.
    const n0 = doc?.getNode(stressShapeId(0));
    expect(n0?.kind).toBe("rect");
    expect(n0?.fill).toEqual({ r: 99, g: 179, b: 237, a: 255 });
    expect(n0?.cornerRadius).toBe(0);
    expect([n0?.x, n0?.y, n0?.w, n0?.h]).toEqual([0, 0, 100, 100]);

    // i % 3 === 1: amber rect with corner radius 12.
    const n1 = doc?.getNode(stressShapeId(1));
    expect(n1?.kind).toBe("rect");
    expect(n1?.fill).toEqual({ r: 246, g: 173, b: 85, a: 255 });
    expect(n1?.cornerRadius).toBe(12);
    expect(n1?.x).toBe(110);

    // i % 3 === 2: mint ellipse.
    const n2 = doc?.getNode(stressShapeId(2));
    expect(n2?.kind).toBe("ellipse");
    expect(n2?.fill).toEqual({ r: 104, g: 211, b: 145, a: 255 });
    expect(n2?.x).toBe(220);

    // Column wrap: shape 100 starts row two at x = 0, y = 110.
    const n100 = doc?.getNode(stressShapeId(100));
    expect([n100?.x, n100?.y]).toEqual([0, 110]);

    // No stroke anywhere — build_mixed_grid sets none.
    expect(n0?.stroke).toBeNull();
    expect(n2?.stroke).toBeNull();
  });

  it("clamps the count into the legal document range", () => {
    // Above the ceiling: clamps to the largest legal document.
    expect(build(DOCUMENT_LIMITS.maxNodes + 5_000).docModel?.nodeCount).toBe(
      DOCUMENT_LIMITS.maxNodes
    );
    // Zero / negative: degenerates to the empty frame, never an invalid doc.
    expect(build(0).docModel?.nodeCount).toBe(1);
    expect(build(-10).docModel?.nodeCount).toBe(1);
    // Fractional: truncated, not rounded up past the request.
    expect(build(10.9).docModel?.nodeCount).toBe(10);
  });

  it("replaces any existing document model", () => {
    const state = build(5);
    const first = state.docModel;
    buildStressScene(state, 7);
    expect(state.docModel).not.toBe(first);
    expect(state.docModel?.nodeCount).toBe(7);
  });
});
