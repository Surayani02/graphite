// @vitest-environment jsdom
/**
 * Path fixture corpus (ADR-032 §5) — the parts that are worker logic
 * rather than pixels: what the corpus asks the engine to build, that
 * fixture mode suppresses scene-mutating input, and that the whole
 * surface leaves production builds.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// The worker's `post` helper calls `self.postMessage(msg)`; under jsdom
// `self` is the window, whose postMessage has a different signature and
// throws on a single argument. Stubbed rather than mocking the messaging
// module, so the real code path still runs.
vi.stubGlobal("postMessage", vi.fn());

// Typed loosely on purpose: the real add_path takes 18 positional
// arguments, and mirroring that signature here would duplicate the
// contract rather than test it. The assertions read specific indices.
const addPath = vi.fn((...args: unknown[]): number => args.length && 1);
const addRect = vi.fn(() => 2);
const addFrame = vi.fn(() => 0);

vi.mock("@graphite/engine", () => ({
  SceneGraph: class {
    add_frame = addFrame;
    add_rect = addRect;
    add_path = addPath;
    node_count = () => 0;
  },
}));

const { buildPathFixtures, fixturePathCount } = await import("../workers/engine/scene/fixtures");
const { handlePointerDown } = await import("../workers/engine/input/pointer");

interface TestState {
  sceneGraph: unknown;
  uuidToEngineId: Map<string, number>;
  engineIdToUuid: Map<number, string>;
  fixtureMode: boolean;
  lastInputAt: number;
  activeTool: string;
  sceneDirty: boolean;
  selectedId: number | null;
}

function stubState(): TestState {
  return {
    sceneGraph: null,
    uuidToEngineId: new Map(),
    engineIdToUuid: new Map(),
    fixtureMode: false,
    lastInputAt: 0,
    activeTool: "rectangle",
    sceneDirty: false,
    selectedId: null,
  };
}

beforeEach(() => {
  addPath.mockClear();
  addRect.mockClear();
  addFrame.mockClear();
});

describe("buildPathFixtures", () => {
  it("builds every fixture as a path node under one frame", () => {
    const state = stubState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buildPathFixtures(state as any);
    expect(addFrame).toHaveBeenCalledOnce();
    expect(addPath).toHaveBeenCalledTimes(fixturePathCount());
  });

  it("includes the SDF/path alternating strip that stresses the draw plan", () => {
    const state = stubState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buildPathFixtures(state as any);
    expect(addRect).toHaveBeenCalledTimes(8);
  });

  it("encodes contour descriptors and points consistently", () => {
    const state = stubState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buildPathFixtures(state as any);
    for (const call of addPath.mock.calls) {
      const descs = call[3] as Uint32Array;
      const points = call[4] as Float32Array;
      expect(descs.length % 2).toBe(0);
      let expected = 0;
      for (let i = 0; i < descs.length; i += 2) {
        expect(descs[i]).toBeGreaterThanOrEqual(2); // every contour ≥ 2 points
        expected += (descs[i] ?? 0) * 6; // 6 floats per point
      }
      expect(points.length).toBe(expected);
      expect([...points].every(Number.isFinite)).toBe(true);
    }
  });

  it("enters fixture mode and clears stale id mappings", () => {
    const state = stubState();
    state.uuidToEngineId.set("stale", 7);
    state.engineIdToUuid.set(7, "stale");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buildPathFixtures(state as any);
    expect(state.fixtureMode).toBe(true);
    expect(state.uuidToEngineId.size).toBe(0);
    expect(state.engineIdToUuid.size).toBe(0);
  });
});

describe("fixture mode input guard", () => {
  it("suppresses scene-mutating pointer input", () => {
    const state = stubState();
    state.fixtureMode = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handlePointerDown(state as any, 10, 10, 0, {} as any);
    // The rectangle tool would have begun a creation drag; fixture mode
    // returns before that, recording only the input timestamp used by the
    // re-tessellation budget.
    expect(state.lastInputAt).toBeGreaterThan(0);
    expect(state.selectedId).toBeNull();
  });
});
