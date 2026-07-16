/**
 * features/export/svg.ts — golden-document serialization (Phase 7 M4,
 * ADR-026). Nodes are hand-built protocol literals: the serializer is
 * tested against the DocNode CONTRACT, not against DocumentModel's
 * construction API.
 */
import { describe, expect, it } from "vitest";
import type { DocNode } from "@graphite/protocol";
import { documentToSvg } from "../features/export/svg";

const GOLDEN: readonly DocNode[] = [
  {
    id: "f1",
    kind: "frame",
    name: "Artboard",
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    fill: { r: 255, g: 255, b: 255, a: 255 },
    stroke: null,
    cornerRadius: 0,
    parent: null,
    children: ["r1", "r2", "e1"],
  },
  {
    id: "r1",
    kind: "rect",
    name: "Plain",
    x: 20,
    y: 30,
    w: 100,
    h: 80,
    fill: { r: 99, g: 179, b: 237, a: 255 },
    stroke: null,
    cornerRadius: 0,
    parent: "f1",
    children: [],
  },
  {
    id: "r2",
    kind: "rect",
    name: "Rounded & stroked",
    x: 150,
    y: 30,
    w: 100,
    h: 80,
    fill: { r: 246, g: 173, b: 85, a: 128 },
    stroke: { color: { r: 40, g: 40, b: 40, a: 255 }, width: 4 },
    cornerRadius: 12,
    parent: "f1",
    children: [],
  },
  {
    id: "e1",
    kind: "ellipse",
    name: "Hollow",
    x: 280,
    y: 40,
    w: 90,
    h: 60,
    fill: { r: 0, g: 0, b: 0, a: 0 },
    stroke: { color: { r: 104, g: 211, b: 145, a: 200 }, width: 2 },
    cornerRadius: 0,
    parent: "f1",
    children: [],
  },
];

describe("documentToSvg", () => {
  it("serializes the golden document exactly — every parity clause pinned", () => {
    // Stroked r2 extends to x∈[148,252]… but the frame [0,400]×[0,300]
    // dominates. Margin = 2% of 400 = 8.
    expect(documentToSvg(GOLDEN, "Golden <doc>")).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 416 316" width="416" height="316">
  <title>Golden &lt;doc&gt;</title>
  <rect x="0" y="0" width="400" height="300" fill="rgb(255,255,255)"/>
  <rect x="20" y="30" width="100" height="80" fill="rgb(99,179,237)"/>
  <rect x="150" y="30" width="100" height="80" rx="12" fill="rgb(246,173,85)" fill-opacity="0.502" stroke="rgb(40,40,40)" stroke-width="4"/>
  <ellipse cx="325" cy="70" rx="45" ry="30" fill="none" stroke="rgb(104,211,145)" stroke-width="2" stroke-opacity="0.784"/>
</svg>
`
    );
  });

  it("throws on an empty document — commands gate on content, so this is a programming error", () => {
    expect(() => documentToSvg([], "Empty")).toThrow(/empty document/);
  });

  it("paint order in the output IS document order — a background-moved node serializes first", () => {
    const reordered = [GOLDEN[1], GOLDEN[0]] as readonly DocNode[]; // r1 before f1
    const svg = documentToSvg(reordered as DocNode[], "Order");
    const r1At = svg.indexOf('x="20"');
    const frameAt = svg.indexOf('width="400"');
    expect(r1At).toBeGreaterThan(-1);
    expect(r1At).toBeLessThan(frameAt);
  });
});
