/**
 * scene/remove.ts (deleteSelection) unit tests.
 *
 * Phase 7 M1: deletion routes through the funnel (scene/apply.ts) — same
 * targeted engine removal and broadcasts as before, now also recorded as
 * an undoable entry. The rebuild mock keeps @graphite/engine's WASM out
 * of the Node test environment (funnel import chain).
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

import { deleteSelection } from "../workers/engine/scene/remove";
import { post } from "../workers/engine/messaging";

const FILL = { r: 200, g: 0, b: 0, a: 255 } as const;

function makeState(selectedUuid: string | null) {
  const doc = new DocumentModel("Test");
  doc.addFrame("f1", 0, 0, 800, 600);
  doc.addRect("r1", "f1", 0, 0, 10, 10, FILL);

  const scene = { remove_node: vi.fn(() => true) };
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
    selectedId: selectedUuid === "r1" ? 1 : selectedUuid === "f1" ? 0 : null,
    selectedUuid,
    history: new History(),
  } as unknown as EngineState;

  return { state, scene };
}

beforeEach(() => {
  vi.mocked(post).mockClear();
});

describe("deleteSelection", () => {
  it("removes the selected leaf node", () => {
    const { state, scene } = makeState("r1");
    deleteSelection(state);
    expect(state.docModel?.getNode("r1")).toBeUndefined();
    expect(scene.remove_node).toHaveBeenCalledWith(1);
  });

  it("clears the selection after a successful delete", () => {
    const { state } = makeState("r1");
    deleteSelection(state);
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ type: "selection:changed", nodeIds: [] })
    );
  });

  it("broadcasts document:nodes after a successful delete", () => {
    const { state } = makeState("r1");
    deleteSelection(state);
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "document:nodes" }));
  });

  it("cleans up the uuid/engineId maps for the removed node", () => {
    const { state } = makeState("r1");
    deleteSelection(state);
    expect(state.uuidToEngineId.has("r1")).toBe(false);
    expect(state.engineIdToUuid.has(1)).toBe(false);
  });

  it("is a no-op when nothing is selected", () => {
    const { state, scene } = makeState(null);
    deleteSelection(state);
    expect(scene.remove_node).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("refuses a frame with children and leaves selection untouched", () => {
    const { state, scene } = makeState("f1");
    deleteSelection(state);
    expect(state.docModel?.getNode("f1")).toBeDefined(); // still there
    expect(scene.remove_node).not.toHaveBeenCalled(); // engine never touched
    expect(post).not.toHaveBeenCalled(); // selection not cleared, nothing to broadcast
  });

  it("is a no-op without a document", () => {
    const scene = { remove_node: vi.fn() };
    const state = {
      docModel: null,
      sceneGraph: scene,
      selectedUuid: "r1",
    } as unknown as EngineState;
    deleteSelection(state);
    expect(scene.remove_node).not.toHaveBeenCalled();
  });

  it("records one undoable entry labelled after the deleted node (Phase 7 M1)", () => {
    const { state } = makeState("r1");
    deleteSelection(state);
    expect(state.history.status()).toMatchObject({
      canUndo: true,
      undoLabel: "Delete Rectangle",
    });
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "history:state" }));
  });
});
