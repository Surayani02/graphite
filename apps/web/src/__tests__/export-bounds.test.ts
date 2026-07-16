/**
 * features/export/bounds.ts — content bounds, margin, stroke extent, and
 * the SVG↔raster frame-agreement guarantee (Phase 7 M4, ADR-026).
 */
import { describe, expect, it } from "vitest";
import type { DocNode } from "@graphite/protocol";
import { contentBounds, fitCamera, EXPORT_MARGIN_RATIO } from "../features/export/bounds";

function rawNode(overrides: Partial<DocNode> & Pick<DocNode, "id">): DocNode {
  return {
    kind: "rect",
    name: overrides.id,
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    fill: { r: 10, g: 20, b: 30, a: 255 },
    stroke: null,
    cornerRadius: 0,
    parent: null,
    children: [],
    ...overrides,
  };
}

describe("contentBounds", () => {
  it("returns null for an empty document — 'nothing to export', not an error", () => {
    expect(contentBounds([])).toBeNull();
  });

  it("a single node gets a 2% margin of its larger dimension on every side", () => {
    const b = contentBounds([rawNode({ id: "a", x: 10, y: 20, w: 200, h: 100 })]);
    // larger dimension = 200 → margin = 4
    expect(b).toEqual({ x: 6, y: 16, w: 208, h: 108 });
  });

  it("unions multiple nodes, including negative world coordinates", () => {
    const b = contentBounds(
      [
        rawNode({ id: "a", x: -50, y: -50, w: 100, h: 100 }),
        rawNode({ id: "b", x: 100, y: 0, w: 100, h: 50 }),
      ],
      0 // margin off: pure union under test
    );
    // a spans y∈[-50,50], b spans y∈[0,50] → union height 100.
    expect(b).toEqual({ x: -50, y: -50, w: 250, h: 100 });
  });

  it("a visible centre stroke extends bounds by half its width — the engine paints there", () => {
    const b = contentBounds(
      [
        rawNode({
          id: "a",
          x: 0,
          y: 0,
          w: 100,
          h: 100,
          stroke: { color: { r: 0, g: 0, b: 0, a: 255 }, width: 10 },
        }),
      ],
      0
    );
    expect(b).toEqual({ x: -5, y: -5, w: 110, h: 110 });
  });

  it("a cleared stroke ({transparent, 0-alpha}) adds nothing — mirrors the engine threshold", () => {
    const b = contentBounds(
      [
        rawNode({
          id: "a",
          stroke: { color: { r: 0, g: 0, b: 0, a: 0 }, width: 10 },
        }),
      ],
      0
    );
    expect(b).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  it("uses the default 2% ratio when none is given", () => {
    const b = contentBounds([rawNode({ id: "a", w: 100, h: 100 })]);
    const margin = 100 * EXPORT_MARGIN_RATIO;
    expect(b?.x).toBe(-margin);
    expect(b?.w).toBe(100 + margin * 2);
  });
});

describe("fitCamera — the raster half of the frame-agreement guarantee", () => {
  it("centres on the bounds midpoint with zoom = scale and a ceil'd pixel viewport", () => {
    const cam = fitCamera({ x: 6, y: 16, w: 208.4, h: 108.4 }, 2);
    expect(cam.camX).toBeCloseTo(6 + 208.4 / 2);
    expect(cam.camY).toBeCloseTo(16 + 108.4 / 2);
    expect(cam.zoom).toBe(2);
    expect(cam.vpW).toBe(Math.ceil(208.4 * 2));
    expect(cam.vpH).toBe(Math.ceil(108.4 * 2));
  });

  it("SVG viewBox and raster camera frame the SAME world rect from one document", () => {
    const nodes = [
      rawNode({ id: "a", x: -30, y: 10, w: 120, h: 80 }),
      rawNode({ id: "b", x: 100, y: -40, w: 60, h: 200 }),
    ];
    const bounds = contentBounds(nodes);
    expect(bounds).not.toBeNull();
    if (bounds === null) return;
    const cam = fitCamera(bounds, 3);
    // The engine's frustum is cam ± (vp / 2·zoom): recover the world rect
    // the raster camera would render and assert it covers exactly the
    // viewBox rect (ceil'ing can only ADD sub-pixel coverage, never crop).
    const worldW = cam.vpW / cam.zoom;
    const worldH = cam.vpH / cam.zoom;
    expect(cam.camX - worldW / 2).toBeLessThanOrEqual(bounds.x);
    expect(cam.camY - worldH / 2).toBeLessThanOrEqual(bounds.y);
    expect(cam.camX + worldW / 2).toBeGreaterThanOrEqual(bounds.x + bounds.w);
    expect(cam.camY + worldH / 2).toBeGreaterThanOrEqual(bounds.y + bounds.h);
    expect(worldW - bounds.w).toBeLessThan(1 / cam.zoom); // within one pixel
    expect(worldH - bounds.h).toBeLessThan(1 / cam.zoom);
  });
});
