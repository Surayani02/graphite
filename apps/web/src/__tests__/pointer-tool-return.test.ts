/**
 * BUG-07 integration — the auto-return to select must make the *next*
 * gesture behave as select, not redraw.
 *
 * This drives the real pointer + create worker modules end-to-end (no
 * React, no bridge), because the bug lived entirely worker-side: after a
 * shape committed, `state.activeTool` stayed "rectangle" while the UI was
 * told "select", so the following pointer-down started a new creation.
 * The unit tests in create.test.ts assert the state flips; this asserts
 * the *observable consequence* — a second pointer-down does not begin a
 * creation drag — which is exactly the user-visible symptom.
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

import { handlePointerDown, handlePointerUp } from "../workers/engine/input/pointer";

const NO_MODS = { shift: false, ctrl: false, alt: false, meta: false } as const;

function makeState(): EngineState {
  const doc = new DocumentModel("Test");
  doc.addFrame("f1", 0, 0, 800, 600);

  let nextEngineId = 10;
  const scene = {
    add_rect: vi.fn(() => nextEngineId++),
    add_ellipse: vi.fn(() => nextEngineId++),
    remove_node: vi.fn(() => true),
    set_node_position: vi.fn(),
    set_size: vi.fn(),
    get_node_bounds: vi.fn(() => new Float32Array([0, 0, 40, 40])),
    hit_test: vi.fn(() => undefined),
  };

  return {
    docModel: doc,
    sceneGraph: scene,
    uuidToEngineId: new Map([["f1", 0]]),
    engineIdToUuid: new Map([[0, "f1"]]),
    creation: null,
    dragMode: null,
    isDragging: false,
    selectedId: null,
    selectedUuid: null,
    activeTool: "rectangle",
    camera: { x: 0, y: 0, zoom: 1 },
    vpW: 800,
    vpH: 600,
    dpr: 1,
    moveStartBoundsX: 0,
    moveStartBoundsY: 0,
    history: new History(),
  } as unknown as EngineState;
}

describe("BUG-07: post-creation gesture selects instead of redrawing", () => {
  let state: EngineState;
  beforeEach(() => {
    state = makeState();
  });

  it("draws on the first gesture", () => {
    handlePointerDown(state, 50, 50, 0, NO_MODS);
    expect(state.dragMode).toBe("create");
    handlePointerUp(state, 120, 120, NO_MODS);
    // After commit the worker has switched itself to select.
    expect(state.activeTool).toBe("select");
    const scene = state.sceneGraph as unknown as { add_rect: ReturnType<typeof vi.fn> };
    expect(scene.add_rect).toHaveBeenCalledTimes(1);
  });

  it("does NOT start a new creation on the very next pointer-down", () => {
    // Gesture 1: draw + release → auto-return to select.
    handlePointerDown(state, 50, 50, 0, NO_MODS);
    handlePointerUp(state, 120, 120, NO_MODS);
    const scene = state.sceneGraph as unknown as { add_rect: ReturnType<typeof vi.fn> };
    expect(scene.add_rect).toHaveBeenCalledTimes(1);

    // Gesture 2: a fresh pointer-down on empty canvas. With the bug, this
    // read activeTool === "rectangle" and began another creation drag.
    // Fixed, it is a select gesture: no creation, no second add_rect.
    handlePointerDown(state, 300, 300, 0, NO_MODS);
    expect(state.dragMode).not.toBe("create");
    expect(state.creation).toBeNull();
    expect(scene.add_rect).toHaveBeenCalledTimes(1);
  });

  it("holds for ellipse too", () => {
    state.activeTool = "ellipse";
    handlePointerDown(state, 50, 50, 0, NO_MODS);
    handlePointerUp(state, 120, 120, NO_MODS);
    expect(state.activeTool).toBe("select");

    handlePointerDown(state, 300, 300, 0, NO_MODS);
    expect(state.creation).toBeNull();
    const scene = state.sceneGraph as unknown as { add_ellipse: ReturnType<typeof vi.fn> };
    expect(scene.add_ellipse).toHaveBeenCalledTimes(1); // not twice
  });
});
