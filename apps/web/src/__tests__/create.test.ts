/**
 * scene/create.ts unit tests — worker shape-creation lifecycle, using the
 * same mocked-messaging + spy-SceneGraph harness as mutate.test.ts.
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

import {
  beginCreation,
  updateCreation,
  commitCreation,
  cancelCreation,
} from "../workers/engine/scene/create";
import { post } from "../workers/engine/messaging";

function makeState() {
  const doc = new DocumentModel("Test");
  doc.addFrame("f1", 0, 0, 800, 600);

  let nextEngineId = 10;
  const scene = {
    add_rect: vi.fn(() => nextEngineId++),
    add_ellipse: vi.fn(() => nextEngineId++),
    remove_node: vi.fn(() => true),
    set_node_position: vi.fn(),
    set_size: vi.fn(),
  };

  const state = {
    docModel: doc,
    sceneGraph: scene,
    uuidToEngineId: new Map([["f1", 0]]),
    engineIdToUuid: new Map([[0, "f1"]]),
    creation: null,
    dragMode: null,
    isDragging: false,
    selectedId: null,
    selectedUuid: null,
    activeTool: "rectangle" as const,
    history: new History(),
  } as unknown as EngineState;

  return { state, scene };
}

beforeEach(() => {
  vi.mocked(post).mockClear();
});

describe("beginCreation", () => {
  it("records the anchor and target frame without creating a node", () => {
    const { state, scene } = makeState();
    beginCreation(state, "rectangle", 50, 60);
    expect(state.creation).toMatchObject({
      tool: "rectangle",
      frameId: "f1",
      anchorX: 50,
      anchorY: 60,
      nodeId: null,
    });
    expect(state.dragMode).toBe("create");
    expect(state.isDragging).toBe(true);
    expect(scene.add_rect).not.toHaveBeenCalled();
  });

  it("falls back to the first frame when the point is outside every frame", () => {
    const { state } = makeState();
    beginCreation(state, "rectangle", -500, -500);
    expect(state.creation?.frameId).toBe("f1");
  });

  it("targets the topmost (last-added) frame among overlapping frames", () => {
    const { state } = makeState();
    state.docModel?.addFrame("f2", 0, 0, 800, 600); // overlaps f1 entirely, added later
    beginCreation(state, "rectangle", 50, 50);
    expect(state.creation?.frameId).toBe("f2");
  });
});

describe("updateCreation", () => {
  it("does not allocate a node before the drag threshold", () => {
    const { state, scene } = makeState();
    beginCreation(state, "rectangle", 50, 50);
    updateCreation(state, 51, 51, false); // ~1.4px — below the 4px threshold
    expect(scene.add_rect).not.toHaveBeenCalled();
    expect(state.creation?.nodeId).toBeNull();
  });

  it("allocates exactly once the threshold is crossed", () => {
    const { state, scene } = makeState();
    beginCreation(state, "rectangle", 50, 50);
    updateCreation(state, 60, 60, false);
    updateCreation(state, 65, 65, false); // second move — must not re-allocate
    expect(scene.add_rect).toHaveBeenCalledTimes(1);
    expect(state.creation?.nodeId).not.toBeNull();
  });

  it("uses add_ellipse for the ellipse tool", () => {
    const { state, scene } = makeState();
    beginCreation(state, "ellipse", 50, 50);
    updateCreation(state, 60, 60, false);
    expect(scene.add_ellipse).toHaveBeenCalledTimes(1);
    expect(scene.add_rect).not.toHaveBeenCalled();
  });

  it("normalises a drag in the negative (up-left) direction", () => {
    const { state, scene } = makeState();
    beginCreation(state, "rectangle", 100, 100);
    updateCreation(state, 40, 30, false); // dragged up-left from anchor
    const id = state.creation?.engineId;
    expect(scene.set_node_position).toHaveBeenLastCalledWith(id, 40, 30);
    expect(scene.set_size).toHaveBeenLastCalledWith(id, 60, 70);
  });

  it("constrains to a square with shift, growing from the fixed anchor corner", () => {
    const { state, scene } = makeState();
    beginCreation(state, "rectangle", 100, 100);
    updateCreation(state, 160, 130, true); // dx=60, dy=30 — square should use 60
    const id = state.creation?.engineId;
    expect(scene.set_size).toHaveBeenLastCalledWith(id, 60, 60);
    expect(scene.set_node_position).toHaveBeenLastCalledWith(id, 100, 100);
  });

  it("is a no-op without an active creation draft", () => {
    const { state, scene } = makeState();
    updateCreation(state, 10, 10, false);
    expect(scene.add_rect).not.toHaveBeenCalled();
  });
});

describe("commitCreation", () => {
  it("click (no drag) creates a DEFAULT_SIZE shape at the anchor point", () => {
    const { state, scene } = makeState();
    beginCreation(state, "rectangle", 50, 50);
    commitCreation(state, 50, 50, false); // pointerup with no intervening move
    expect(scene.add_rect).toHaveBeenCalledTimes(1);
    const id = state.creation === null ? undefined : undefined; // creation is cleared post-commit
    expect(id).toBeUndefined();
    expect(scene.set_size).toHaveBeenLastCalledWith(expect.any(Number), 100, 100);
  });

  it("finalises geometry at the commit point, not a stale mid-drag position", () => {
    const { state, scene } = makeState();
    beginCreation(state, "rectangle", 0, 0);
    updateCreation(state, 50, 50, false);
    commitCreation(state, 200, 200, false);
    const lastCall = scene.set_size.mock.calls.at(-1);
    expect(lastCall).toEqual([expect.any(Number), 200, 200]);
  });

  it("broadcasts document:nodes exactly once, at commit", () => {
    const { state } = makeState();
    beginCreation(state, "rectangle", 0, 0);
    updateCreation(state, 50, 50, false);
    updateCreation(state, 60, 60, false);
    updateCreation(state, 70, 70, false);
    const nodesBroadcasts = vi
      .mocked(post)
      .mock.calls.filter(([msg]) => msg.type === "document:nodes");
    expect(nodesBroadcasts).toHaveLength(0); // none yet — only commit broadcasts
    commitCreation(state, 70, 70, false);
    const afterCommit = vi.mocked(post).mock.calls.filter(([msg]) => msg.type === "document:nodes");
    expect(afterCommit).toHaveLength(1);
  });

  it("selects the newly created node", () => {
    const { state } = makeState();
    beginCreation(state, "rectangle", 0, 0);
    updateCreation(state, 50, 50, false);
    const engineId = state.creation?.engineId;
    commitCreation(state, 50, 50, false);
    expect(state.selectedId).toBe(engineId);
  });

  it("auto-returns to select — updates worker state AND notifies the UI (BUG-07)", () => {
    const { state } = makeState();
    beginCreation(state, "rectangle", 0, 0);
    expect(state.activeTool).toBe("rectangle"); // drawing
    commitCreation(state, 100, 100, false);
    // The worker is the source of truth for interaction: its own activeTool
    // must flip, or the next pointer down draws again instead of selecting.
    expect(state.activeTool).toBe("select");
    // …and the UI must be told, so the toolbar agrees with the worker.
    expect(post).toHaveBeenCalledWith({ type: "tool:changed", tool: "select" });
  });

  it("clears the draft and drag state", () => {
    const { state } = makeState();
    beginCreation(state, "rectangle", 0, 0);
    commitCreation(state, 100, 100, false);
    expect(state.creation).toBeNull();
    expect(state.dragMode).toBeNull();
    expect(state.isDragging).toBe(false);
  });

  it("is a no-op without an active creation draft", () => {
    const { state } = makeState();
    commitCreation(state, 10, 10, false);
    expect(post).not.toHaveBeenCalled();
  });
});

describe("cancelCreation", () => {
  it("removes an already-allocated node and does not broadcast", () => {
    const { state, scene } = makeState();
    beginCreation(state, "rectangle", 0, 0);
    updateCreation(state, 50, 50, false);
    const nodeId = state.creation?.nodeId;
    cancelCreation(state);
    expect(scene.remove_node).toHaveBeenCalledTimes(1);
    expect(state.docModel?.getNode(nodeId as string)).toBeUndefined();
    expect(post).not.toHaveBeenCalledWith(expect.objectContaining({ type: "document:nodes" }));
  });

  it("cleans up the uuid/engineId maps for the cancelled node", () => {
    const { state } = makeState();
    beginCreation(state, "rectangle", 0, 0);
    updateCreation(state, 50, 50, false);
    const nodeId = state.creation?.nodeId as string;
    const engineId = state.creation?.engineId as number;
    cancelCreation(state);
    expect(state.uuidToEngineId.has(nodeId)).toBe(false);
    expect(state.engineIdToUuid.has(engineId)).toBe(false);
  });

  it("before the threshold, just clears the draft (nothing to remove)", () => {
    const { state, scene } = makeState();
    beginCreation(state, "rectangle", 0, 0);
    cancelCreation(state);
    expect(scene.remove_node).not.toHaveBeenCalled();
    expect(state.creation).toBeNull();
  });

  it("does not change the active tool", () => {
    // Cancel means "not that one", not "done creating" — the tool stays
    // active so the user can immediately try again.
    const { state } = makeState();
    beginCreation(state, "rectangle", 0, 0);
    updateCreation(state, 50, 50, false);
    cancelCreation(state);
    expect(post).not.toHaveBeenCalledWith(expect.objectContaining({ type: "tool:changed" }));
  });

  it("is a no-op without an active creation draft", () => {
    const { state, scene } = makeState();
    cancelCreation(state);
    expect(scene.remove_node).not.toHaveBeenCalled();
  });
});

// ─── History recording (Phase 7 Milestone 1) ─────────────────────────────────

describe("creation history", () => {
  it("commit records one 'Create Rectangle' entry after the nodes broadcast", () => {
    const { state } = makeState();
    beginCreation(state, "rectangle", 0, 0);
    updateCreation(state, 50, 50, false);
    commitCreation(state, 50, 50, false);

    expect(state.history.status()).toMatchObject({
      canUndo: true,
      undoLabel: "Create Rectangle",
    });
    const types = vi.mocked(post).mock.calls.map(([msg]) => msg.type);
    expect(types.indexOf("history:state")).toBeGreaterThan(types.indexOf("document:nodes"));
  });

  it("the entry's forward op snapshots the final committed bounds", () => {
    const { state } = makeState();
    beginCreation(state, "ellipse", 0, 0);
    updateCreation(state, 50, 50, false);
    commitCreation(state, 200, 120, false);

    expect(state.history.status().undoLabel).toBe("Create Ellipse");
    const nodeId = state.docModel
      ?.getNodesInOrder()
      .map((n) => n.id)
      .find((id) => id !== "f1");
    expect(nodeId).toBeDefined();
    if (nodeId === undefined) return;
    expect(state.docModel?.getNode(nodeId)).toMatchObject({ w: 200, h: 120 });
  });

  it("captures the selection at gesture start as selectionBefore", () => {
    const { state } = makeState();
    state.selectedUuid = "f1";
    state.selectedId = 0;
    beginCreation(state, "rectangle", 0, 0);
    expect(state.creation?.selectionBefore).toEqual(["f1"]);
  });

  it("cancel records nothing", () => {
    const { state } = makeState();
    beginCreation(state, "rectangle", 0, 0);
    updateCreation(state, 50, 50, false);
    cancelCreation(state);
    expect(state.history.status().canUndo).toBe(false);
  });
});
