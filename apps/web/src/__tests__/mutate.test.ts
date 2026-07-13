/**
 * applyNodePatch unit tests — worker mutation path with a mocked messaging
 * layer (self.postMessage doesn't exist under Node) and a spy SceneGraph.
 *
 * Phase 7 M1: applyNodePatch moved into the mutation funnel
 * (scene/apply.ts); postDocumentNodes stays in scene/mutate.ts. The
 * funnel's import chain reaches scene/rebuild.ts, whose value-import of
 * @graphite/engine must never load under Node — hence the rebuild mock.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { EngineState } from "../workers/engine/state";
import { DocumentModel } from "../document/model";
import { History } from "../workers/engine/history";

vi.mock("../workers/engine/messaging", () => ({
  post: vi.fn(),
  toErrorMsg: vi.fn((raw: unknown) => ({ type: "engine:error", message: String(raw) })),
}));
vi.mock("../workers/engine/scene/rebuild", () => ({ rebuildSceneFromDocument: vi.fn() }));

import { applyNodePatch } from "../workers/engine/scene/apply";
import { postDocumentNodes } from "../workers/engine/scene/mutate";
import { post } from "../workers/engine/messaging";

const FILL = { r: 255, g: 128, b: 0, a: 255 } as const;

function makeState() {
  const doc = new DocumentModel("Test");
  doc.addFrame("f1", 0, 0, 800, 600);
  doc.addRect("r1", "f1", 10, 20, 100, 80, FILL);

  const scene = {
    set_node_position: vi.fn(),
    set_size: vi.fn(),
    set_fill: vi.fn(),
    set_stroke: vi.fn(),
    set_corner_radius: vi.fn(),
  };

  // Only the fields applyNodePatch touches are needed; the cast documents
  // that this is a deliberate partial double, not a full engine.
  const state = {
    docModel: doc,
    sceneGraph: scene,
    uuidToEngineId: new Map([
      ["f1", 0],
      ["r1", 1],
    ]),
    engineIdToUuid: new Map([
      [0, "f1"],
      [1, "r1"],
    ]),
    history: new History(),
    selectedId: null,
    selectedUuid: null,
  } as unknown as EngineState;

  return { state, scene };
}

beforeEach(() => {
  vi.mocked(post).mockClear();
});

describe("applyNodePatch", () => {
  it("writes position to both SceneGraph and DocumentModel", () => {
    const { state, scene } = makeState();
    applyNodePatch(state, "r1", { x: 300, y: 400 });
    expect(scene.set_node_position).toHaveBeenCalledWith(1, 300, 400);
    expect(state.docModel?.getNode("r1")).toMatchObject({ x: 300, y: 400 });
  });

  it("merges a partial position patch with the node's current values", () => {
    const { state, scene } = makeState();
    applyNodePatch(state, "r1", { x: 55 });
    expect(scene.set_node_position).toHaveBeenCalledWith(1, 55, 20);
  });

  it("floors size at 1", () => {
    const { state, scene } = makeState();
    applyNodePatch(state, "r1", { w: -10, h: 0 });
    expect(scene.set_size).toHaveBeenCalledWith(1, 1, 1);
    expect(state.docModel?.getNode("r1")).toMatchObject({ w: 1, h: 1 });
  });

  it("clamps corner radius to min(w, h) / 2", () => {
    const { state, scene } = makeState();
    applyNodePatch(state, "r1", { cornerRadius: 500 }); // node is 100×80 → max 40
    expect(scene.set_corner_radius).toHaveBeenCalledWith(1, 40);
    expect(state.docModel?.getNode("r1")?.cornerRadius).toBe(40);
  });

  it("re-clamps an existing radius when a size patch shrinks the node", () => {
    const { state, scene } = makeState();
    applyNodePatch(state, "r1", { cornerRadius: 40 });
    scene.set_corner_radius.mockClear();
    applyNodePatch(state, "r1", { w: 20, h: 20 }); // max radius now 10
    expect(scene.set_corner_radius).toHaveBeenCalledWith(1, 10);
    expect(state.docModel?.getNode("r1")?.cornerRadius).toBe(10);
  });

  it("a negative radius clamps to 0 — already 0, so the whole patch is a no-op", () => {
    // Phase 7 M1: no-op patches are discarded before the funnel — no
    // engine write, no broadcast, and (crucially) no junk history entry.
    const { state, scene } = makeState();
    applyNodePatch(state, "r1", { cornerRadius: -5 });
    expect(scene.set_corner_radius).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(state.history.status().canUndo).toBe(false);
  });

  it("stroke: null clears — engine gets transparent zeros, the document stores null", () => {
    // Phase 7 M1 refinement: the document keeps the honest `null` (via
    // setStrokeValue) so undo round-trips exactly; only the SceneGraph —
    // which has no "no stroke" — receives the transparent zero encoding.
    const { state, scene } = makeState();
    applyNodePatch(state, "r1", { stroke: { color: { r: 0, g: 0, b: 255, a: 255 }, width: 4 } });
    applyNodePatch(state, "r1", { stroke: null });
    expect(scene.set_stroke).toHaveBeenLastCalledWith(1, 0, 0, 0, 0, 0);
    expect(state.docModel?.getNode("r1")?.stroke).toBeNull();
  });

  it("is a no-op for an unknown node id", () => {
    const { state, scene } = makeState();
    const versionBefore = state.docModel?.version;
    applyNodePatch(state, "ghost", { x: 1 });
    expect(scene.set_node_position).not.toHaveBeenCalled();
    expect(state.docModel?.version).toBe(versionBefore);
    expect(post).not.toHaveBeenCalled();
  });

  it("still updates the document when the engine-id mapping is missing", () => {
    const { state, scene } = makeState();
    state.uuidToEngineId.delete("r1");
    applyNodePatch(state, "r1", { x: 7 });
    expect(scene.set_node_position).not.toHaveBeenCalled();
    expect(state.docModel?.getNode("r1")?.x).toBe(7);
  });

  it("broadcasts document:nodes once, then history:state, per patch", () => {
    const { state } = makeState();
    applyNodePatch(state, "r1", { x: 1, y: 2, w: 30, h: 30, cornerRadius: 4 });
    expect(post).toHaveBeenCalledTimes(2);
    expect(vi.mocked(post).mock.calls[0]?.[0]).toMatchObject({ type: "document:nodes" });
    expect(vi.mocked(post).mock.calls[1]?.[0]).toMatchObject({ type: "history:state" });
  });

  it("records one undoable entry labelled after the node", () => {
    const { state } = makeState();
    applyNodePatch(state, "r1", { x: 1 });
    expect(state.history.status()).toMatchObject({ canUndo: true, undoLabel: "Edit Rectangle" });
  });
});

describe("postDocumentNodes", () => {
  it("posts the full insertion-ordered node list", () => {
    const { state } = makeState();
    postDocumentNodes(state);
    const msg = vi.mocked(post).mock.calls[0]?.[0];
    expect(msg).toMatchObject({ type: "document:nodes" });
    if (msg?.type === "document:nodes") {
      expect(msg.nodes.map((n) => n.id)).toEqual(["f1", "r1"]);
    }
  });

  it("is a no-op without a document", () => {
    postDocumentNodes({ docModel: null } as unknown as EngineState);
    expect(post).not.toHaveBeenCalled();
  });
});
