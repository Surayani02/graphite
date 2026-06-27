/**
 * Phase 0 smoke tests for apps/web.
 *
 * Validates that:
 *   1. @graphite/protocol is resolvable from apps/web.
 *   2. All constants required by the UI shell are present and correct.
 *   3. ID generation works in this environment.
 *
 * React component tests are added in Phase 6 when the UI shell exists.
 */
import { describe, it, expect } from "vitest";
import {
  createNodeId,
  NODE_TYPES,
  TOOL_TYPES,
  IDENTITY_TRANSFORM,
  TARGET_FPS,
  FRAME_BUDGET_MS,
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_ZOOM,
  MVP_MAX_OBJECTS,
  SYSTEM_MAX_OBJECTS,
} from "@graphite/protocol";

describe("@graphite/protocol is reachable from apps/web", () => {
  it("NODE_TYPES imports correctly", () => {
    expect(NODE_TYPES.RECTANGLE).toBe("rectangle");
    expect(NODE_TYPES.FRAME).toBe("frame");
  });

  it("TOOL_TYPES imports correctly", () => {
    expect(TOOL_TYPES.SELECT).toBe("select");
    expect(TOOL_TYPES.PAN).toBe("pan");
  });

  it("IDENTITY_TRANSFORM imports correctly", () => {
    expect(IDENTITY_TRANSFORM).toEqual({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
    expect(Object.isFrozen(IDENTITY_TRANSFORM)).toBe(true);
  });

  it("createNodeId works in this environment", () => {
    const id = createNodeId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });
});

describe("Performance constants match architecture targets", () => {
  it("TARGET_FPS is 60", () => {
    expect(TARGET_FPS).toBe(60);
  });

  it("FRAME_BUDGET_MS ≈ 16.67 ms", () => {
    expect(FRAME_BUDGET_MS).toBeCloseTo(16.67, 1);
  });

  it("zoom range is valid: MIN < DEFAULT < MAX", () => {
    expect(MIN_ZOOM).toBeLessThan(DEFAULT_ZOOM);
    expect(DEFAULT_ZOOM).toBeLessThan(MAX_ZOOM);
  });

  it("MVP object count < system object count", () => {
    expect(MVP_MAX_OBJECTS).toBeLessThan(SYSTEM_MAX_OBJECTS);
  });
});
