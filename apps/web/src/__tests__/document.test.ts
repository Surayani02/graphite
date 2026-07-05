/**
 * Phase 5 — DocumentModel unit tests.
 * All tests run in Node.js; no DOM or Worker APIs used.
 */
import { describe, expect, it } from "vitest";
import { DocumentModel } from "../document/model";

const FILL = { r: 255, g: 128, b: 0, a: 255 } as const;

// ─── Construction ─────────────────────────────────────────────────────────────

describe("DocumentModel — construction", () => {
  it("starts empty", () => {
    expect(new DocumentModel().nodeCount).toBe(0);
  });
  it("defaults name to 'Untitled'", () => {
    expect(new DocumentModel().name).toBe("Untitled");
  });
  it("accepts a custom name", () => {
    expect(new DocumentModel("My Design").name).toBe("My Design");
  });
});

// ─── addFrame ─────────────────────────────────────────────────────────────────

describe("DocumentModel — addFrame", () => {
  it("increments nodeCount", () => {
    const doc = new DocumentModel();
    doc.addFrame("f1", 0, 0, 800, 600);
    expect(doc.nodeCount).toBe(1);
  });
  it("getNode returns correct geometry", () => {
    const doc = new DocumentModel();
    doc.addFrame("f1", 10, 20, 800, 600);
    const n = doc.getNode("f1");
    expect(n?.kind).toBe("frame");
    expect(n?.x).toBe(10);
    expect(n?.y).toBe(20);
    expect(n?.w).toBe(800);
    expect(n?.h).toBe(600);
  });
  it("has null parent", () => {
    const doc = new DocumentModel();
    doc.addFrame("f1", 0, 0, 100, 100);
    expect(doc.getNode("f1")?.parent).toBeNull();
  });
  // QUAL-07: adding a frame is still a document mutation. Phase 9 CRDT sync
  // needs _version to change on every structural edit, including frames —
  // a collaborator's "add frame" must be detectable as a change.
  it("increments version (a frame addition is still a document mutation)", () => {
    const doc = new DocumentModel("t", 1);
    const before = doc.version;
    doc.addFrame("f1", 0, 0, 800, 600);
    expect(doc.version).toBeGreaterThan(before);
  });
});

// ─── addRect / addEllipse ─────────────────────────────────────────────────────

describe("DocumentModel — addRect", () => {
  it("registers child in parent children list", () => {
    const doc = new DocumentModel();
    doc.addFrame("f1", 0, 0, 800, 600);
    doc.addRect("r1", "f1", 10, 10, 100, 100, FILL);
    expect(doc.getNode("f1")?.children).toContain("r1");
  });
  it("increments version", () => {
    const doc = new DocumentModel("t", 1);
    doc.addFrame("f1", 0, 0, 100, 100);
    const v = doc.version;
    doc.addRect("r1", "f1", 0, 0, 50, 50, FILL);
    expect(doc.version).toBeGreaterThan(v);
  });
});

describe("DocumentModel — addEllipse", () => {
  it("has kind 'ellipse'", () => {
    const doc = new DocumentModel();
    doc.addFrame("f1", 0, 0, 800, 600);
    doc.addEllipse("e1", "f1", 0, 0, 100, 100, FILL);
    expect(doc.getNode("e1")?.kind).toBe("ellipse");
  });
});

// ─── Mutations ────────────────────────────────────────────────────────────────

describe("DocumentModel — setNodePosition", () => {
  it("updates x and y, preserves w and h", () => {
    const doc = new DocumentModel();
    doc.addFrame("f1", 0, 0, 800, 600);
    doc.addRect("r1", "f1", 10, 20, 100, 80, FILL);
    doc.setNodePosition("r1", 300, 400);
    const n = doc.getNode("r1");
    expect(n?.x).toBe(300);
    expect(n?.y).toBe(400);
    expect(n?.w).toBe(100);
    expect(n?.h).toBe(80);
  });
  it("is a no-op for unknown IDs", () => {
    const doc = new DocumentModel();
    doc.setNodePosition("nonexistent", 0, 0); // must not throw
    expect(doc.nodeCount).toBe(0);
  });
});

describe("DocumentModel — setCornerRadius", () => {
  it("updates cornerRadius", () => {
    const doc = new DocumentModel();
    doc.addFrame("f1", 0, 0, 800, 600);
    doc.addRect("r1", "f1", 0, 0, 100, 100, FILL);
    doc.setCornerRadius("r1", 20);
    expect(doc.getNode("r1")?.cornerRadius).toBe(20);
  });
});

describe("DocumentModel — setStroke", () => {
  it("stores stroke colour and width", () => {
    const doc = new DocumentModel();
    doc.addFrame("f1", 0, 0, 800, 600);
    doc.addRect("r1", "f1", 0, 0, 100, 100, FILL);
    doc.setStroke("r1", { r: 0, g: 0, b: 255, a: 255 }, 4);
    const s = doc.getNode("r1")?.stroke;
    expect(s?.width).toBe(4);
    expect(s?.color.b).toBe(255);
  });
  it("defaults to null", () => {
    const doc = new DocumentModel();
    doc.addFrame("f1", 0, 0, 800, 600);
    doc.addRect("r1", "f1", 0, 0, 100, 100, FILL);
    expect(doc.getNode("r1")?.stroke).toBeNull();
  });
});

// ─── setSize / setFill (Phase 6 Milestone 2) ─────────────────────────────────

describe("DocumentModel — setSize", () => {
  it("updates width and height", () => {
    const doc = new DocumentModel();
    doc.addFrame("f1", 0, 0, 800, 600);
    doc.addRect("r1", "f1", 0, 0, 100, 100, FILL);
    doc.setSize("r1", 40, 50);
    expect(doc.getNode("r1")).toMatchObject({ w: 40, h: 50 });
  });
  it("is a no-op on a missing id", () => {
    const doc = new DocumentModel();
    const before = doc.version;
    doc.setSize("missing", 40, 50);
    expect(doc.version).toBe(before);
  });
});

describe("DocumentModel — setFill", () => {
  it("updates the fill colour", () => {
    const doc = new DocumentModel();
    doc.addFrame("f1", 0, 0, 800, 600);
    doc.addRect("r1", "f1", 0, 0, 100, 100, FILL);
    doc.setFill("r1", { r: 1, g: 2, b: 3, a: 4 });
    expect(doc.getNode("r1")?.fill).toEqual({ r: 1, g: 2, b: 3, a: 4 });
  });
  it("does not alias the caller's colour object", () => {
    const doc = new DocumentModel();
    doc.addFrame("f1", 0, 0, 800, 600);
    doc.addRect("r1", "f1", 0, 0, 100, 100, FILL);
    const color = { r: 1, g: 2, b: 3, a: 4 };
    doc.setFill("r1", color);
    color.r = 255;
    expect(doc.getNode("r1")?.fill.r).toBe(1);
  });
  it("is a no-op on a missing id", () => {
    const doc = new DocumentModel();
    const before = doc.version;
    doc.setFill("missing", { r: 1, g: 2, b: 3, a: 4 });
    expect(doc.version).toBe(before);
  });
});

// ─── getNodesInOrder ──────────────────────────────────────────────────────────

describe("DocumentModel — getNodesInOrder", () => {
  it("returns nodes in insertion order", () => {
    const doc = new DocumentModel();
    doc.addFrame("f1", 0, 0, 800, 600);
    doc.addRect("r1", "f1", 0, 0, 50, 50, FILL);
    doc.addEllipse("e1", "f1", 0, 0, 50, 50, FILL);
    doc.addRect("r2", "f1", 0, 0, 50, 50, FILL);
    expect(doc.getNodesInOrder().map((n) => n.id)).toEqual(["f1", "r1", "e1", "r2"]);
  });
});

// ─── Serialisation ────────────────────────────────────────────────────────────

describe("DocumentModel — serialize / fromJson", () => {
  it("round-trips a document with all node types", () => {
    const doc = new DocumentModel("Round-trip Test");
    doc.addFrame("f1", 0, 0, 800, 600, "Page");
    doc.addRect("r1", "f1", 10, 20, 100, 80, FILL, "My Rect");
    doc.setCornerRadius("r1", 12);
    doc.setStroke("r1", { r: 0, g: 0, b: 0, a: 255 }, 2);
    doc.addEllipse("e1", "f1", 200, 50, 100, 80, { r: 0, g: 255, b: 0, a: 128 });

    const loaded = DocumentModel.fromJson(doc.serialize());

    expect(loaded.name).toBe("Round-trip Test");
    expect(loaded.nodeCount).toBe(3);

    const rect = loaded.getNode("r1");
    expect(rect?.kind).toBe("rect");
    expect(rect?.cornerRadius).toBe(12);
    expect(rect?.stroke?.width).toBe(2);
    expect(rect?.fill.r).toBe(255);

    const ell = loaded.getNode("e1");
    expect(ell?.kind).toBe("ellipse");
    expect(ell?.fill.a).toBe(128);
  });

  it("preserves insertion order after round-trip", () => {
    const doc = new DocumentModel();
    ["f1", "r1", "e1", "r2"].forEach((id, i) => {
      if (i === 0) doc.addFrame(id, 0, 0, 800, 600);
      else if (i % 2 === 1) doc.addRect(id, "f1", 0, 0, 50, 50, FILL);
      else doc.addEllipse(id, "f1", 0, 0, 50, 50, FILL);
    });
    const ids = DocumentModel.fromJson(doc.serialize())
      .getNodesInOrder()
      .map((n) => n.id);
    expect(ids).toEqual(["f1", "r1", "e1", "r2"]);
  });

  it("produces valid JSON", () => {
    const doc = new DocumentModel("Valid JSON");
    doc.addFrame("f1", 0, 0, 800, 600);
    expect(() => JSON.parse(doc.serialize())).not.toThrow();
  });

  it("fromJson preserves null stroke", () => {
    const doc = new DocumentModel();
    doc.addFrame("f1", 0, 0, 800, 600);
    doc.addRect("r1", "f1", 0, 0, 100, 100, FILL);
    expect(DocumentModel.fromJson(doc.serialize()).getNode("r1")?.stroke).toBeNull();
  });

  it("fromJson throws on invalid JSON", () => {
    expect(() => DocumentModel.fromJson("not-json")).toThrow();
  });
});

// ─── getNode immutability (BUG-02) ─────────────────────────────────────────────

describe("DocumentModel — getNode returns an immutable snapshot", () => {
  it("mutating the returned node does not affect the document", () => {
    const doc = new DocumentModel();
    doc.addFrame("f1", 0, 0, 800, 600);
    doc.addRect("r1", "f1", 10, 20, 100, 80, FILL);

    const snapshot = doc.getNode("r1");
    if (!snapshot) throw new Error("expected getNode to return a snapshot");
    // @ts-expect-error — DocNode is readonly externally; this test proves
    // that even a forced mutation through the type system doesn't reach
    // the internal document state.
    snapshot.x = 999;

    // The document's own copy must be unaffected.
    expect(doc.getNode("r1")?.x).toBe(10);
  });

  it("mutating a nested field (fill) does not affect the document", () => {
    const doc = new DocumentModel();
    doc.addFrame("f1", 0, 0, 800, 600);
    doc.addRect("r1", "f1", 0, 0, 100, 100, FILL);

    const snapshot = doc.getNode("r1");
    if (!snapshot) throw new Error("expected getNode to return a snapshot");
    // @ts-expect-error — same as above, proving the nested object is cloned too.
    snapshot.fill.r = 0;

    expect(doc.getNode("r1")?.fill.r).toBe(255);
  });

  it("each call to getNode returns a distinct object", () => {
    const doc = new DocumentModel();
    doc.addFrame("f1", 0, 0, 800, 600);
    doc.addRect("r1", "f1", 0, 0, 100, 100, FILL);

    expect(doc.getNode("r1")).not.toBe(doc.getNode("r1"));
  });

  it("returns undefined for a missing id, never throws", () => {
    const doc = new DocumentModel();
    expect(doc.getNode("does-not-exist")).toBeUndefined();
  });
});

// ─── fromJson validation (BUG-03) ──────────────────────────────────────────────

describe("DocumentModel.fromJson — structural validation", () => {
  it("throws when the root value is not an object", () => {
    expect(() => DocumentModel.fromJson("42")).toThrow(/not an object/);
  });

  it("throws when nodes is missing entirely", () => {
    expect(() => DocumentModel.fromJson(JSON.stringify({ version: 1, name: "x" }))).toThrow(
      /missing nodes array/
    );
  });

  it("throws when a node has an unrecognised kind", () => {
    const malformed = {
      version: 1,
      name: "x",
      nodes: [
        {
          id: "n1",
          kind: "triangle", // not a valid DocNodeKind
          name: "n",
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          fill: FILL,
          stroke: null,
          cornerRadius: 0,
          parent: null,
          children: [],
        },
      ],
    };
    expect(() => DocumentModel.fromJson(JSON.stringify(malformed))).toThrow(/unknown kind/);
  });

  it("throws when a node references a missing child", () => {
    const malformed = {
      version: 1,
      name: "x",
      nodes: [
        {
          id: "f1",
          kind: "frame",
          name: "Frame",
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          fill: { r: 0, g: 0, b: 0, a: 0 },
          stroke: null,
          cornerRadius: 0,
          parent: null,
          children: ["ghost-child"], // does not exist in nodes[]
        },
      ],
    };
    expect(() => DocumentModel.fromJson(JSON.stringify(malformed))).toThrow(/missing child/);
  });

  it("throws when a child's parent field doesn't point back", () => {
    const malformed = {
      version: 1,
      name: "x",
      nodes: [
        {
          id: "f1",
          kind: "frame",
          name: "Frame",
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          fill: { r: 0, g: 0, b: 0, a: 0 },
          stroke: null,
          cornerRadius: 0,
          parent: null,
          children: ["r1"],
        },
        {
          id: "f2",
          kind: "frame",
          name: "Other frame",
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          fill: { r: 0, g: 0, b: 0, a: 0 },
          stroke: null,
          cornerRadius: 0,
          parent: null,
          children: [],
        },
        {
          id: "r1",
          kind: "rect",
          name: "Rect",
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          fill: FILL,
          stroke: null,
          cornerRadius: 0,
          // "f2" exists (so the missing-parent check passes) but does not
          // list r1 as a child — this is what the backlink check catches.
          parent: "f2",
          children: [],
        },
      ],
    };
    expect(() => DocumentModel.fromJson(JSON.stringify(malformed))).toThrow(/parent mismatch/);
  });

  it("accepts a minimal, valid, empty document", () => {
    const doc = DocumentModel.fromJson(JSON.stringify({ version: 1, name: "Empty", nodes: [] }));
    expect(doc.nodeCount).toBe(0);
    expect(doc.name).toBe("Empty");
  });
});

// ─── fromJson structural validation (Phase 6 M2 closeout) ────────────────────

describe("DocumentModel.fromJson — structural validation", () => {
  const frame = {
    id: "f1",
    kind: "frame",
    name: "Frame",
    x: 0,
    y: 0,
    w: 800,
    h: 600,
    fill: { r: 0, g: 0, b: 0, a: 0 },
    stroke: null,
    cornerRadius: 0,
    parent: null,
    children: ["r1"],
  };
  const rect = {
    id: "r1",
    kind: "rect",
    name: "Rect",
    x: 10,
    y: 10,
    w: 100,
    h: 100,
    fill: { r: 255, g: 0, b: 0, a: 255 },
    stroke: null,
    cornerRadius: 0,
    parent: "f1",
    children: [],
  };
  const json = (nodes: readonly unknown[]) => JSON.stringify({ version: 1, name: "T", nodes });

  it("rejects duplicate node ids", () => {
    // A duplicate would silently overwrite its predecessor in the node map
    // while insertionOrder kept both — one node rendered twice.
    expect(() => DocumentModel.fromJson(json([frame, rect, { ...rect }]))).toThrow(
      /duplicate node id/
    );
  });

  it("rejects a node whose parent does not exist", () => {
    expect(() => DocumentModel.fromJson(json([frame, { ...rect, parent: "ghost" }]))).toThrow(
      /missing parent/
    );
  });
});
