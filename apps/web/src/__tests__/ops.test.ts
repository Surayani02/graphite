/**
 * document/ops.ts unit tests — op application, exact inverses, error codes,
 * patch normalisation, and a seeded property test asserting that any valid
 * op sequence undone in reverse restores the document byte-for-byte
 * (node list including order; `version` is a counter and excluded).
 */
import { describe, expect, it } from "vitest";
import type { Color, DocNode, DocumentOp, NodePatch } from "@graphite/protocol";
import { DocumentModel } from "../document/model";
import { applyOp, effectiveNodePatch, isEmptyPatch, OpError } from "../document/ops";

const FILL: Color = { r: 255, g: 128, b: 0, a: 255 };
const BLUE: Color = { r: 0, g: 0, b: 255, a: 255 };

function makeDoc(): DocumentModel {
  const doc = new DocumentModel("Test");
  doc.addFrame("f1", 0, 0, 800, 600);
  doc.addRect("r1", "f1", 10, 20, 100, 80, FILL);
  doc.addRect("r2", "f1", 200, 20, 50, 50, FILL);
  doc.addEllipse("e1", "f1", 300, 20, 60, 60, FILL);
  return doc;
}

/** Node list JSON — order-sensitive, `version` excluded (it's a mutation
 *  counter, so round-trips legitimately change it). */
function nodesJson(doc: DocumentModel): string {
  const data = JSON.parse(doc.serialize()) as { nodes: unknown };
  return JSON.stringify(data.nodes);
}

// ─── node:remove / node:create ───────────────────────────────────────────────

describe("applyOp — node:remove", () => {
  it("removes the node and returns a create inverse with exact indices", () => {
    const doc = makeDoc();
    const { inverse } = applyOp(doc, { op: "node:remove", nodeId: "r2" });

    expect(doc.getNode("r2")).toBeUndefined();
    expect(doc.getNode("f1")?.children).toEqual(["r1", "e1"]);

    expect(inverse.op).toBe("node:create");
    if (inverse.op === "node:create") {
      expect(inverse.node.id).toBe("r2");
      expect(inverse.childIndex).toBe(1); // was second child of f1
      expect(inverse.orderIndex).toBe(2); // was third in insertion order (f1, r1, r2, e1)
    }
  });

  it("its inverse restores the node at the original position in BOTH orders", () => {
    const doc = makeDoc();
    const before = nodesJson(doc);

    const { inverse } = applyOp(doc, { op: "node:remove", nodeId: "r2" });
    applyOp(doc, inverse);

    expect(nodesJson(doc)).toBe(before);
    expect(doc.getNode("f1")?.children).toEqual(["r1", "r2", "e1"]);
    expect(doc.getNodesInOrder().map((n) => n.id)).toEqual(["f1", "r1", "r2", "e1"]);
  });

  it("throws missing-node for an unknown id, leaving the document untouched", () => {
    const doc = makeDoc();
    const versionBefore = doc.version;
    expect(() => applyOp(doc, { op: "node:remove", nodeId: "ghost" })).toThrowError(OpError);
    try {
      applyOp(doc, { op: "node:remove", nodeId: "ghost" });
    } catch (err) {
      expect(err).toBeInstanceOf(OpError);
      if (err instanceof OpError) expect(err.code).toBe("missing-node");
    }
    expect(doc.version).toBe(versionBefore);
  });

  it("throws has-children for a frame with children", () => {
    const doc = makeDoc();
    try {
      applyOp(doc, { op: "node:remove", nodeId: "f1" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(OpError);
      if (err instanceof OpError) expect(err.code).toBe("has-children");
    }
    expect(doc.getNode("f1")).toBeDefined();
  });
});

describe("applyOp — node:create", () => {
  it("inserts at the given indices and returns a remove inverse", () => {
    const doc = makeDoc();
    const node: DocNode = {
      id: "new1",
      kind: "rect",
      name: "New",
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      fill: { ...FILL },
      stroke: null,
      cornerRadius: 0,
      parent: "f1",
      children: [],
    };

    const { inverse } = applyOp(doc, { op: "node:create", node, childIndex: 1, orderIndex: 2 });

    expect(doc.getNode("f1")?.children).toEqual(["r1", "new1", "r2", "e1"]);
    expect(doc.getNodesInOrder().map((n) => n.id)).toEqual(["f1", "r1", "new1", "r2", "e1"]);
    expect(inverse).toEqual({ op: "node:remove", nodeId: "new1" });
  });

  it("throws duplicate-node when the id already exists", () => {
    const doc = makeDoc();
    const existing = doc.getNode("r1");
    expect(existing).toBeDefined();
    if (!existing) return;
    try {
      applyOp(doc, { op: "node:create", node: existing, childIndex: 0, orderIndex: 1 });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(OpError);
      if (err instanceof OpError) expect(err.code).toBe("duplicate-node");
    }
  });

  it("throws missing-parent when the parent does not exist", () => {
    const doc = makeDoc();
    const node = doc.getNode("r1");
    expect(node).toBeDefined();
    if (!node) return;
    const orphan: DocNode = { ...node, id: "orphan", parent: "ghost-frame" };
    try {
      applyOp(doc, { op: "node:create", node: orphan, childIndex: 0, orderIndex: 1 });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(OpError);
      if (err instanceof OpError) expect(err.code).toBe("missing-parent");
    }
  });
});

// ─── node:set-props ──────────────────────────────────────────────────────────

describe("applyOp — node:set-props", () => {
  it("applies the patch and captures prior values for exactly the patched keys", () => {
    const doc = makeDoc();
    const { inverse } = applyOp(doc, {
      op: "node:set-props",
      nodeId: "r1",
      patch: { x: 500, fill: BLUE },
    });

    expect(doc.getNode("r1")).toMatchObject({ x: 500, y: 20, fill: BLUE });
    expect(inverse.op).toBe("node:set-props");
    if (inverse.op === "node:set-props") {
      expect(inverse.patch).toEqual({ x: 10, fill: FILL });
    }
  });

  it("round-trips a stroke through null exactly (null stays null)", () => {
    const doc = makeDoc();
    expect(doc.getNode("r1")?.stroke).toBeNull();

    const stroke = { color: { ...BLUE }, width: 4 };
    const first = applyOp(doc, { op: "node:set-props", nodeId: "r1", patch: { stroke } });
    expect(doc.getNode("r1")?.stroke).toEqual(stroke);
    if (first.inverse.op === "node:set-props") {
      expect(first.inverse.patch.stroke).toBeNull();
    }

    applyOp(doc, first.inverse);
    expect(doc.getNode("r1")?.stroke).toBeNull();
  });

  it("throws missing-node for an unknown id", () => {
    const doc = makeDoc();
    try {
      applyOp(doc, { op: "node:set-props", nodeId: "ghost", patch: { x: 1 } });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(OpError);
      if (err instanceof OpError) expect(err.code).toBe("missing-node");
    }
  });
});

// ─── effectiveNodePatch ──────────────────────────────────────────────────────

describe("effectiveNodePatch", () => {
  function r1(doc = makeDoc()): Readonly<DocNode> {
    const node = doc.getNode("r1");
    if (!node) throw new Error("fixture missing r1");
    return node; // 10, 20, 100×80, FILL, stroke null, radius 0
  }

  it("drops keys whose value equals the current one", () => {
    expect(effectiveNodePatch(r1(), { x: 10, y: 99 })).toEqual({ y: 99 });
  });

  it("returns {} for a patch that changes nothing", () => {
    const patch = effectiveNodePatch(r1(), { x: 10, w: 100, fill: FILL, stroke: null });
    expect(isEmptyPatch(patch)).toBe(true);
  });

  it("floors size at 1", () => {
    expect(effectiveNodePatch(r1(), { w: -10, h: 0 })).toEqual({ w: 1, h: 1 });
  });

  it("clamps corner radius to min(w, h) / 2", () => {
    expect(effectiveNodePatch(r1(), { cornerRadius: 500 })).toEqual({ cornerRadius: 40 });
  });

  it("re-clamps the stored radius when a size patch shrinks the node", () => {
    const doc = makeDoc();
    doc.setCornerRadius("r1", 40);
    expect(effectiveNodePatch(r1(doc), { w: 20, h: 20 })).toEqual({
      w: 20,
      h: 20,
      cornerRadius: 10,
    });
  });

  it("drops a negative radius that clamps back to the current value", () => {
    // radius is 0; clamp(-5) = 0 = unchanged → nothing to do.
    expect(isEmptyPatch(effectiveNodePatch(r1(), { cornerRadius: -5 }))).toBe(true);
  });

  it("keeps a stroke change and drops an equal stroke", () => {
    const doc = makeDoc();
    doc.setStroke("r1", BLUE, 4);
    const same: NodePatch = { stroke: { color: { ...BLUE }, width: 4 } };
    expect(isEmptyPatch(effectiveNodePatch(r1(doc), same))).toBe(true);
    expect(effectiveNodePatch(r1(doc), { stroke: null })).toEqual({ stroke: null });
  });
});

// ─── Property: apply → invert-in-reverse → identical document ────────────────

/** Deterministic 32-bit PRNG — no dependency, reproducible failures. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) | 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("applyOp round-trip property", () => {
  it("40 random ops, inverted in reverse, restore the exact node list (seeds 1–5)", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const rand = mulberry32(seed);
      const randInt = (maxExclusive: number): number => Math.floor(rand() * maxExclusive);

      const doc = makeDoc();
      const before = nodesJson(doc);
      const leaves = ["r1", "r2", "e1"];
      let created = 0;

      const inverses: DocumentOp[] = [];
      for (let i = 0; i < 40; i++) {
        const roll = rand();
        let op: DocumentOp;

        if (roll < 0.2 && leaves.length > 1) {
          const idx = randInt(leaves.length);
          const removed = leaves.splice(idx, 1);
          const nodeId = removed[0];
          if (nodeId === undefined) continue;
          op = { op: "node:remove", nodeId };
        } else if (roll < 0.4) {
          const parent = doc.getNode("f1");
          if (!parent) continue;
          created += 1;
          const id = `gen-${String(seed)}-${String(created)}`;
          const node: DocNode = {
            id,
            kind: rand() < 0.5 ? "rect" : "ellipse",
            name: `Gen ${String(created)}`,
            x: randInt(500),
            y: randInt(500),
            w: 1 + randInt(200),
            h: 1 + randInt(200),
            fill: { r: randInt(256), g: randInt(256), b: randInt(256), a: 255 },
            stroke: rand() < 0.5 ? null : { color: { ...BLUE }, width: 1 + randInt(8) },
            cornerRadius: 0,
            parent: "f1",
            children: [],
          };
          op = {
            op: "node:create",
            node,
            childIndex: randInt(parent.children.length + 1),
            // ≥ 1 keeps parents before children in insertion order.
            orderIndex: 1 + randInt(doc.nodeCount),
          };
          leaves.push(id);
        } else {
          const nodeId = leaves[randInt(leaves.length)];
          if (nodeId === undefined) continue;
          const patch: NodePatch = {};
          if (rand() < 0.6) patch.x = randInt(1000);
          if (rand() < 0.6) patch.y = randInt(1000);
          if (rand() < 0.4) patch.w = 1 + randInt(300);
          if (rand() < 0.3) patch.fill = { r: randInt(256), g: randInt(256), b: 0, a: 255 };
          if (rand() < 0.3) patch.stroke = rand() < 0.5 ? null : { color: BLUE, width: 2 };
          if (rand() < 0.3) patch.cornerRadius = randInt(20);
          op = { op: "node:set-props", nodeId, patch };
        }

        inverses.push(applyOp(doc, op).inverse);
      }

      for (let i = inverses.length - 1; i >= 0; i--) {
        const inverse = inverses[i];
        if (inverse !== undefined) applyOp(doc, inverse);
      }

      expect(nodesJson(doc), `seed ${String(seed)}`).toBe(before);
    }
  });
});
