/**
 * buildTree unit tests — pure document→tree transformation.
 */
import { describe, expect, it } from "vitest";
import type { DocNode } from "@graphite/protocol";
import { buildTree } from "../document/tree";

function node(overrides: Partial<DocNode>): DocNode {
  return {
    id: "n",
    kind: "rect",
    name: "Node",
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    stroke: null,
    cornerRadius: 0,
    parent: null,
    children: [],
    ...overrides,
  };
}

describe("buildTree", () => {
  it("returns an empty forest for an empty list", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("nests children under their parent in child-list order", () => {
    const forest = buildTree([
      node({ id: "f1", kind: "frame", parent: null, children: ["r1", "e1"] }),
      node({ id: "r1", parent: "f1" }),
      node({ id: "e1", kind: "ellipse", parent: "f1" }),
    ]);
    expect(forest).toHaveLength(1);
    expect(forest[0]?.node.id).toBe("f1");
    expect(forest[0]?.children.map((c) => c.node.id)).toEqual(["r1", "e1"]);
  });

  it("supports multiple root frames", () => {
    const forest = buildTree([
      node({ id: "f1", kind: "frame", parent: null }),
      node({ id: "f2", kind: "frame", parent: null }),
    ]);
    expect(forest.map((t) => t.node.id)).toEqual(["f1", "f2"]);
  });

  it("drops a stale child reference instead of throwing", () => {
    const forest = buildTree([
      node({ id: "f1", kind: "frame", parent: null, children: ["ghost", "r1"] }),
      node({ id: "r1", parent: "f1" }),
    ]);
    expect(forest[0]?.children.map((c) => c.node.id)).toEqual(["r1"]);
  });

  it("handles nested frames recursively", () => {
    const forest = buildTree([
      node({ id: "f1", kind: "frame", parent: null, children: ["f2"] }),
      node({ id: "f2", kind: "frame", parent: "f1", children: ["r1"] }),
      node({ id: "r1", parent: "f2" }),
    ]);
    expect(forest[0]?.children[0]?.children[0]?.node.id).toBe("r1");
  });
});
