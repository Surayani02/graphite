import { describe, it, expect } from "vitest";
import {
  createNodeId,
  createDocumentId,
  NODE_TYPES,
  TOOL_TYPES,
  IDENTITY_TRANSFORM,
  COLOR_BLACK,
  COLOR_WHITE,
  COLOR_TRANSPARENT,
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_ZOOM,
  TARGET_FPS,
  FRAME_BUDGET_MS,
  MVP_MAX_OBJECTS,
  SYSTEM_MAX_OBJECTS,
} from "../index";

// ─── IDs ───────────────────────────────────────────────────────────────────

describe("createNodeId", () => {
  it("returns a non-empty string", () => {
    expect(typeof createNodeId()).toBe("string");
    expect(createNodeId().length).toBeGreaterThan(0);
  });

  it("produces UUID v4 format (8-4-4-4-12 hex)", () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(createNodeId()).toMatch(uuid);
  });

  it("generates unique values across 1 000 calls", () => {
    const ids = new Set(Array.from({ length: 1_000 }, () => createNodeId()));
    expect(ids.size).toBe(1_000);
  });
});

describe("createDocumentId", () => {
  it("returns a non-empty string", () => {
    expect(typeof createDocumentId()).toBe("string");
    expect(createDocumentId().length).toBeGreaterThan(0);
  });

  it("never collides with a node ID in the same call", () => {
    expect(createDocumentId()).not.toBe(createNodeId());
  });
});

// ─── NODE_TYPES ────────────────────────────────────────────────────────────

describe("NODE_TYPES", () => {
  it("contains every expected type", () => {
    expect(NODE_TYPES.FRAME).toBe("frame");
    expect(NODE_TYPES.RECTANGLE).toBe("rectangle");
    expect(NODE_TYPES.ELLIPSE).toBe("ellipse");
    expect(NODE_TYPES.TEXT).toBe("text");
    expect(NODE_TYPES.GROUP).toBe("group");
    expect(NODE_TYPES.IMAGE).toBe("image");
    expect(NODE_TYPES.VECTOR).toBe("vector");
    expect(NODE_TYPES.COMPONENT).toBe("component");
    expect(NODE_TYPES.COMPONENT_INSTANCE).toBe("component_instance");
  });

  it("has no duplicate values", () => {
    const values = Object.values(NODE_TYPES);
    expect(new Set(values).size).toBe(values.length);
  });

  it("all values are non-empty strings", () => {
    for (const v of Object.values(NODE_TYPES)) {
      expect(typeof v).toBe("string");
      expect((v as string).length).toBeGreaterThan(0);
    }
  });
});

// ─── TOOL_TYPES ────────────────────────────────────────────────────────────

describe("TOOL_TYPES", () => {
  it("contains every expected tool", () => {
    expect(TOOL_TYPES.SELECT).toBe("select");
    expect(TOOL_TYPES.PAN).toBe("pan");
    expect(TOOL_TYPES.RECTANGLE).toBe("rectangle");
    expect(TOOL_TYPES.ELLIPSE).toBe("ellipse");
    expect(TOOL_TYPES.TEXT).toBe("text");
    expect(TOOL_TYPES.PEN).toBe("pen");
  });

  it("has no duplicate values", () => {
    const values = Object.values(TOOL_TYPES);
    expect(new Set(values).size).toBe(values.length);
  });
});

// ─── IDENTITY_TRANSFORM ────────────────────────────────────────────────────

describe("IDENTITY_TRANSFORM", () => {
  it("represents the identity matrix", () => {
    expect(IDENTITY_TRANSFORM).toEqual({
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      tx: 0,
      ty: 0,
    });
  });

  it("is deeply frozen", () => {
    expect(Object.isFrozen(IDENTITY_TRANSFORM)).toBe(true);
  });

  it("throws when mutated (strict mode enforcement)", () => {
    expect(() => {
      // @ts-expect-error — intentional runtime mutation test
      (IDENTITY_TRANSFORM as Record<string, number>)["a"] = 99;
    }).toThrow();
  });
});

// ─── Colors ────────────────────────────────────────────────────────────────

describe("Colors", () => {
  it("COLOR_BLACK has correct channel values", () => {
    expect(COLOR_BLACK).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(Object.isFrozen(COLOR_BLACK)).toBe(true);
  });

  it("COLOR_WHITE has correct channel values", () => {
    expect(COLOR_WHITE).toEqual({ r: 1, g: 1, b: 1, a: 1 });
  });

  it("COLOR_TRANSPARENT has zero alpha", () => {
    expect(COLOR_TRANSPARENT.a).toBe(0);
    expect(Object.isFrozen(COLOR_TRANSPARENT)).toBe(true);
  });
});

// ─── Performance constants ─────────────────────────────────────────────────

describe("Performance constants", () => {
  it("MIN_ZOOM < DEFAULT_ZOOM < MAX_ZOOM", () => {
    expect(MIN_ZOOM).toBeLessThan(DEFAULT_ZOOM);
    expect(DEFAULT_ZOOM).toBeLessThan(MAX_ZOOM);
  });

  it("TARGET_FPS is 60", () => {
    expect(TARGET_FPS).toBe(60);
  });

  it("FRAME_BUDGET_MS ≈ 16.67 ms at 60 fps", () => {
    expect(FRAME_BUDGET_MS).toBeCloseTo(16.67, 1);
  });

  it("FRAME_BUDGET_MS = 1000 / TARGET_FPS", () => {
    expect(FRAME_BUDGET_MS).toBe(1000 / TARGET_FPS);
  });

  it("MVP_MAX_OBJECTS < SYSTEM_MAX_OBJECTS", () => {
    expect(MVP_MAX_OBJECTS).toBeLessThan(SYSTEM_MAX_OBJECTS);
  });
});
