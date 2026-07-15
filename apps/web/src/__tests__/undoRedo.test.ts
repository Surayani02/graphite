/**
 * scene/apply.ts integration tests — the mutation funnel end-to-end
 * against a real DocumentModel and History, with the messaging layer and
 * scene rebuild mocked (the established worker-test harness; rebuild's
 * value-import of @graphite/engine must never load under Node).
 *
 * Since Phase 7 M3 no funnel success path rebuilds — creates go through
 * the targeted append-then-move (`insertNodeIntoScene`), which registers
 * the uuid↔arena maps itself, so the fake scene's `add_*` return real
 * incrementing ids. The rebuild mock stays wired (the rollback path still
 * imports it, and any *unexpected* rebuild would trip the not-called
 * assertions below); `fakeRebuild` keeps honouring the real contract for
 * that eventuality.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { EngineToMainMessage } from "@graphite/protocol";
import type { EngineState } from "../workers/engine/state";
import { DocumentModel } from "../document/model";
import { History } from "../workers/engine/history";

const { rebuildSpy } = vi.hoisted(() => ({ rebuildSpy: vi.fn() }));

vi.mock("../workers/engine/messaging", () => ({
  post: vi.fn(),
  toErrorMsg: (raw: unknown): EngineToMainMessage => ({
    type: "engine:error",
    message: raw instanceof Error ? raw.message : String(raw),
  }),
}));
vi.mock("../workers/engine/scene/rebuild", () => ({ rebuildSceneFromDocument: rebuildSpy }));

import {
  applyNodePatch,
  commitEdit,
  recordCompletedEdit,
  redoEdit,
  resetHistory,
  undoEdit,
} from "../workers/engine/scene/apply";
import { deleteSelection } from "../workers/engine/scene/remove";
import { post } from "../workers/engine/messaging";

const FILL = { r: 255, g: 128, b: 0, a: 255 } as const;

function makeState(selectedUuid: string | null = null) {
  const doc = new DocumentModel("Test");
  doc.addFrame("f1", 0, 0, 800, 600);
  doc.addRect("r1", "f1", 10, 20, 100, 80, FILL);
  doc.addRect("r2", "f1", 200, 20, 50, 50, FILL);

  let nextEngineId = 3; // f1=0, r1=1, r2=2 are pre-seeded below
  const scene = {
    add_frame: vi.fn(() => nextEngineId++),
    add_rect: vi.fn(() => nextEngineId++),
    add_ellipse: vi.fn(() => nextEngineId++),
    move_node_to_index: vi.fn(),
    remove_node: vi.fn(() => true),
    set_node_position: vi.fn(),
    set_size: vi.fn(),
    set_fill: vi.fn(),
    set_stroke: vi.fn(),
    set_corner_radius: vi.fn(),
  };

  const state = {
    docModel: doc,
    sceneGraph: scene,
    uuidToEngineId: new Map([
      ["f1", 0],
      ["r1", 1],
      ["r2", 2],
    ]),
    engineIdToUuid: new Map([
      [0, "f1"],
      [1, "r1"],
      [2, "r2"],
    ]),
    history: new History(),
    selectedId: selectedUuid === "r1" ? 1 : selectedUuid === "r2" ? 2 : null,
    selectedUuid,
  } as unknown as EngineState;

  return { state, scene, doc };
}

/** Mirrors rebuildSceneFromDocument's observable contract for tests. */
function fakeRebuild(state: EngineState): void {
  state.uuidToEngineId.clear();
  state.engineIdToUuid.clear();
  let nextId = 100;
  for (const node of state.docModel?.getNodesInOrder() ?? []) {
    state.uuidToEngineId.set(node.id, nextId);
    state.engineIdToUuid.set(nextId, node.id);
    nextId += 1;
  }
  state.selectedId = null;
  state.selectedUuid = null;
}

function postedTypes(): string[] {
  return vi.mocked(post).mock.calls.map(([msg]) => msg.type);
}

function lastMessageOfType<T extends EngineToMainMessage["type"]>(
  type: T
): Extract<EngineToMainMessage, { type: T }> | undefined {
  const calls = vi.mocked(post).mock.calls;
  for (let i = calls.length - 1; i >= 0; i--) {
    const call = calls[i];
    const msg = call?.[0];
    if (msg !== undefined && msg.type === type) {
      return msg as Extract<EngineToMainMessage, { type: T }>;
    }
  }
  return undefined;
}

beforeEach(() => {
  vi.mocked(post).mockClear();
  rebuildSpy.mockReset();
  rebuildSpy.mockImplementation(fakeRebuild);
});

// ─── commitEdit / applyNodePatch ─────────────────────────────────────────────

describe("applyNodePatch through the funnel", () => {
  it("records one labelled, undoable entry and broadcasts nodes + history", () => {
    const { state } = makeState();
    applyNodePatch(state, "r1", { x: 300 });

    expect(state.history.status()).toMatchObject({ canUndo: true, undoLabel: "Edit Rectangle" });
    expect(postedTypes()).toEqual(["document:nodes", "history:state"]);
  });

  it("discards a no-op patch entirely — no entry, no engine call, no broadcast", () => {
    const { state, scene } = makeState();
    applyNodePatch(state, "r1", { x: 10, cornerRadius: -5 }); // x unchanged; -5 clamps to current 0

    expect(state.history.status().canUndo).toBe(false);
    expect(scene.set_node_position).not.toHaveBeenCalled();
    expect(scene.set_corner_radius).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("undo restores the prior value with a targeted engine write — no rebuild", () => {
    const { state, scene, doc } = makeState();
    applyNodePatch(state, "r1", { x: 300, y: 400 });
    scene.set_node_position.mockClear();

    undoEdit(state);

    expect(doc.getNode("r1")).toMatchObject({ x: 10, y: 20 });
    expect(scene.set_node_position).toHaveBeenCalledWith(1, 10, 20);
    expect(rebuildSpy).not.toHaveBeenCalled();

    const historyMsg = lastMessageOfType("history:state");
    expect(historyMsg?.announce).toEqual({ action: "undo", label: "Edit Rectangle" });
    expect(historyMsg?.status).toMatchObject({ canUndo: false, canRedo: true });
  });

  it("undo restores a cleared stroke to null in the document, zeros in the engine", () => {
    const { state, scene, doc } = makeState();
    applyNodePatch(state, "r1", { stroke: { color: { r: 0, g: 0, b: 255, a: 255 }, width: 4 } });
    undoEdit(state);

    expect(doc.getNode("r1")?.stroke).toBeNull();
    expect(scene.set_stroke).toHaveBeenLastCalledWith(1, 0, 0, 0, 0, 0);
  });
});

// ─── Deletion round-trip ─────────────────────────────────────────────────────

describe("deleteSelection → undo → redo", () => {
  it("undo restores the node at its original position in both orders — no rebuild (M3)", () => {
    const { state, doc, scene } = makeState("r1");
    deleteSelection(state);
    expect(doc.getNode("r1")).toBeUndefined();
    expect(state.history.status()).toMatchObject({ undoLabel: "Delete Rectangle" });

    undoEdit(state);

    expect(doc.getNode("f1")?.children).toEqual(["r1", "r2"]);
    expect(doc.getNodesInOrder().map((n) => n.id)).toEqual(["f1", "r1", "r2"]);
    // Phase 7 M3: the create op is a targeted append-then-move, never a
    // rebuild — the SceneGraph's explicit paint order exists for exactly
    // this splice.
    expect(rebuildSpy).not.toHaveBeenCalled();
    expect(scene.add_rect).toHaveBeenCalledTimes(1);
    expect(scene.add_rect).toHaveBeenCalledWith(0, 10, 20, 100, 80, 255, 128, 0, 255);
    // New arena id 3, spliced back to r1's original paint slot (index 1).
    expect(scene.move_node_to_index).toHaveBeenCalledWith(3, 1);
    // Selection restored through the maps insertNodeIntoScene registered.
    expect(state.selectedUuid).toBe("r1");
    const selectionMsg = lastMessageOfType("selection:changed");
    expect(selectionMsg?.nodeIds).toEqual(["r1"]);
  });

  it("redo removes it again with a targeted engine call — never a rebuild", () => {
    const { state, doc } = makeState("r1");
    deleteSelection(state);
    undoEdit(state);
    rebuildSpy.mockClear();

    redoEdit(state);

    expect(doc.getNode("r1")).toBeUndefined();
    expect(rebuildSpy).not.toHaveBeenCalled();
    expect(state.selectedUuid).toBeNull(); // delete's selectionAfter was []
    const historyMsg = lastMessageOfType("history:state");
    expect(historyMsg?.announce).toEqual({ action: "redo", label: "Delete Rectangle" });
  });
});

// ─── recordCompletedEdit (drag / creation producers) ─────────────────────────

describe("recordCompletedEdit", () => {
  it("records without re-applying or re-broadcasting document:nodes", () => {
    const { state, doc } = makeState("r1");
    // Simulate a completed move-drag: the drag already wrote the document.
    doc.setNodePosition("r1", 555, 666);
    recordCompletedEdit(
      state,
      "Move Rectangle",
      [
        {
          forward: { op: "node:set-props", nodeId: "r1", patch: { x: 555, y: 666 } },
          inverse: { op: "node:set-props", nodeId: "r1", patch: { x: 10, y: 20 } },
        },
      ],
      ["r1"]
    );

    expect(postedTypes()).toEqual(["history:state"]);
    expect(doc.getNode("r1")).toMatchObject({ x: 555, y: 666 });

    undoEdit(state);
    expect(doc.getNode("r1")).toMatchObject({ x: 10, y: 20 });
    expect(rebuildSpy).not.toHaveBeenCalled();
  });

  it("a creation-style entry undoes with a targeted remove, redoes with a targeted insert (M3)", () => {
    const { state, scene, doc } = makeState();
    // Simulate commitCreation's end state: node already in doc + maps.
    doc.addRect("new1", "f1", 0, 0, 100, 100, FILL);
    state.uuidToEngineId.set("new1", 3);
    state.engineIdToUuid.set(3, "new1");
    const node = doc.getNode("new1");
    const indices = doc.getNodeIndices("new1");
    expect(node).toBeDefined();
    expect(indices).toBeDefined();
    if (!node || !indices) return;

    recordCompletedEdit(
      state,
      "Create Rectangle",
      [
        {
          forward: { op: "node:create", node, ...indices },
          inverse: { op: "node:remove", nodeId: "new1" },
        },
      ],
      []
    );

    undoEdit(state);
    expect(doc.getNode("new1")).toBeUndefined();
    expect(scene.remove_node).toHaveBeenCalledWith(3);
    expect(rebuildSpy).not.toHaveBeenCalled();

    redoEdit(state);
    expect(doc.getNode("new1")).toBeDefined();
    // M3: replaying the create is append-then-move, never a rebuild. The
    // fake's id counter was untouched by the manual map seeding above, so
    // the re-created node lands on arena id 3 again; its paint slot is the
    // recorded orderIndex (f1, r1, r2 precede it → 3).
    expect(rebuildSpy).not.toHaveBeenCalled();
    expect(scene.add_rect).toHaveBeenCalledWith(0, 0, 0, 100, 100, 255, 128, 0, 255);
    expect(scene.move_node_to_index).toHaveBeenCalledWith(3, 3);
    expect(state.uuidToEngineId.get("new1")).toBe(3);
  });
});

// ─── Edges ───────────────────────────────────────────────────────────────────

describe("edges", () => {
  it("undo/redo with an empty history post nothing", () => {
    const { state } = makeState();
    undoEdit(state);
    redoEdit(state);
    expect(post).not.toHaveBeenCalled();
  });

  it("commitEdit refuses an op batch that cannot apply, rolls back, posts engine:error", () => {
    const { state, doc } = makeState();
    // Compare node lists, not full DocumentData: `version` is a mutation
    // counter that legitimately advances through an apply + rollback —
    // rollback restores values, not the counter.
    const nodesBefore = (JSON.parse(doc.serialize()) as { nodes: unknown }).nodes;
    const ok = commitEdit(state, "Broken", [
      { op: "node:set-props", nodeId: "r1", patch: { x: 999 } },
      { op: "node:remove", nodeId: "ghost" },
    ]);

    expect(ok).toBe(false);
    expect(state.history.status().canUndo).toBe(false);
    expect((JSON.parse(doc.serialize()) as { nodes: unknown }).nodes).toEqual(nodesBefore);
    expect(doc.getNode("r1")?.x).toBe(10);
    expect(postedTypes()).toContain("engine:error");
    expect(postedTypes()).not.toContain("document:nodes");
  });

  it("resetHistory clears the stack and broadcasts a clean status", () => {
    const { state } = makeState();
    applyNodePatch(state, "r1", { x: 300 });
    vi.mocked(post).mockClear();

    resetHistory(state);

    const historyMsg = lastMessageOfType("history:state");
    expect(historyMsg?.status).toEqual({
      canUndo: false,
      canRedo: false,
      undoLabel: null,
      redoLabel: null,
      dirty: false,
    });
  });
});
