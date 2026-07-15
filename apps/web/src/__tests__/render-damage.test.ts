/**
 * gpu/render.ts damage-model unit tests (Phase 7 M3, ADR-025) — the
 * runFrameSlot decision seam, with messaging and the GPU buffer layer
 * mocked per the worker-test harness. The self-scheduling loop around it
 * needs live macrotasks and stays e2e territory; every skip/render/latch
 * decision is exercised here.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { EngineState } from "../workers/engine/state";
import { markSceneDirty } from "../workers/engine/state";

const { buffersSpy } = vi.hoisted(() => ({
  buffersSpy: {
    updateCameraUniform: vi.fn(),
    uploadRenderList: vi.fn(),
    updateSelectionBuffer: vi.fn(),
  },
}));

vi.mock("../workers/engine/messaging", () => ({ post: vi.fn() }));
vi.mock("../workers/engine/gpu/buffers", () => buffersSpy);

import { runFrameSlot } from "../workers/engine/gpu/render";
import { post } from "../workers/engine/messaging";

function makeState(overrides: Partial<EngineState> = {}): EngineState {
  return {
    sceneDirty: true,
    idleNotified: false,
    frameNumber: 0,
    selectedId: null,
    // No GPU objects: renderFrame's guard returns 0 without submitting,
    // which is exactly the GPU-less environment every worker test runs in.
    gpuDevice: null,
    gpuContext: null,
    gpuPipeline: null,
    bindGroup: null,
    ...overrides,
  } as unknown as EngineState;
}

beforeEach(() => {
  vi.mocked(post).mockClear();
  buffersSpy.updateCameraUniform.mockClear();
  buffersSpy.uploadRenderList.mockClear();
  buffersSpy.updateSelectionBuffer.mockClear();
});

describe("runFrameSlot", () => {
  it("a dirty slot pays the full pipeline, clears the flag, and reports the frame", () => {
    const state = makeState();
    runFrameSlot(state, 1000);

    expect(state.sceneDirty).toBe(false);
    expect(state.frameNumber).toBe(1);
    expect(buffersSpy.updateCameraUniform).toHaveBeenCalledTimes(1);
    expect(buffersSpy.uploadRenderList).toHaveBeenCalledTimes(1);
    expect(vi.mocked(post)).toHaveBeenCalledWith(
      expect.objectContaining({ type: "frame:rendered", frameNumber: 1 })
    );
  });

  it("a clean slot pays nothing and posts frame:idle exactly once (edge trigger)", () => {
    const state = makeState({ sceneDirty: false });
    runFrameSlot(state, 1000);
    runFrameSlot(state, 1017);
    runFrameSlot(state, 1034);

    expect(buffersSpy.uploadRenderList).not.toHaveBeenCalled();
    expect(state.frameNumber).toBe(0);
    const posts = vi.mocked(post).mock.calls.map((c) => c[0]);
    expect(posts).toEqual([{ type: "frame:idle" }]);
  });

  it("markSceneDirty re-arms both the render and the idle notice", () => {
    const state = makeState({ sceneDirty: false });
    runFrameSlot(state, 1000); // idle posted, latch set

    markSceneDirty(state);
    runFrameSlot(state, 1017); // renders
    runFrameSlot(state, 1034); // idle again — latch was reset

    const types = vi.mocked(post).mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toEqual(["frame:idle", "frame:rendered", "frame:idle"]);
  });

  it("the selection overlay buffer updates only on dirty slots with a selection", () => {
    const state = makeState({ selectedId: 2 } as Partial<EngineState>);
    runFrameSlot(state, 1000);
    expect(buffersSpy.updateSelectionBuffer).toHaveBeenCalledTimes(1);

    runFrameSlot(state, 1017); // now clean
    expect(buffersSpy.updateSelectionBuffer).toHaveBeenCalledTimes(1);
  });
});
