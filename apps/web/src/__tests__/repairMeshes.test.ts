// @vitest-environment jsdom
/**
 * Tessellation call counts — invariants D.5-1 and D.5-2, which are the
 * whole justification for the mesh cache: an unchanged frame, a pan, and a
 * zoom within one tolerance bucket must all cost **zero** tessellations,
 * and crossing a bucket boundary must cost at most one per visible path.
 *
 * Asserted here against the real `repairMeshes` with a stubbed engine and
 * device, because the claim is about *when* work happens, not about
 * pixels. Nothing in the previous suite tested this: the cache's own unit
 * tests prove `status()` returns "fresh", which is a different statement
 * from "the loop therefore does not tessellate".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("GPUBufferUsage", { VERTEX: 32, INDEX: 16, COPY_DST: 8 });

const { repairMeshes } = await import("../workers/engine/gpu/frame");
const { MeshCache } = await import("../workers/engine/gpu/meshCache");
const { RECORD, RECORD_FLOATS, SHAPE_TYPE_PATH } = await import("../workers/engine/gpu/drawPlan");

const tessellate = vi.fn(() => 1);

/** One path record: engine id 100, geometry version 1, 200×200 bounds. */
function pathList(): Float32Array {
  const list = new Float32Array(RECORD_FLOATS);
  list[RECORD.shapeType] = SHAPE_TYPE_PATH;
  list[RECORD.radiusOrId] = 100;
  list[RECORD.padOrVersion] = 1;
  list[2] = 200;
  list[3] = 200;
  return list;
}

function stubState() {
  return {
    sceneGraph: {
      tessellate_path: tessellate,
      mesh_positions: () => new Float32Array([0, 0, 1, 0, 0, 1]),
      mesh_indices: () => new Uint32Array([0, 1, 2]),
      mesh_free: vi.fn(),
    },
    gpuDevice: {
      createBuffer: () => ({ destroy: vi.fn() }),
      queue: { writeBuffer: vi.fn() },
    },
    renderList: pathList(),
    meshCache: new MeshCache(),
    frameNumber: 1,
    lastInputAt: 0,
    zoom: 1,
    dpr: 1,
  } as unknown as Parameters<typeof repairMeshes>[0];
}

describe("repairMeshes — D.5-1 and D.5-2", () => {
  beforeEach(() => {
    tessellate.mockClear();
  });

  it("tessellates a path once when it is first seen", () => {
    const state = stubState();
    repairMeshes(state);
    // Fill and stroke are separate parts of one path.
    expect(tessellate).toHaveBeenCalledTimes(2);
  });

  it("D.5-1: an unchanged scene and camera issues zero calls", () => {
    const state = stubState();
    repairMeshes(state);
    tessellate.mockClear();

    repairMeshes(state);
    repairMeshes(state);
    expect(tessellate).not.toHaveBeenCalled();
  });

  it("D.5-2: a camera pan issues zero calls", () => {
    const state = stubState();
    repairMeshes(state);
    tessellate.mockClear();

    // A pan changes the culled list's contents, never the tolerance
    // bucket — the mesh is in the path's local frame, so it survives.
    const panned = pathList();
    panned[RECORD.x] = 640;
    panned[RECORD.y] = -480;
    (state as { renderList: Float32Array }).renderList = panned;
    repairMeshes(state);
    expect(tessellate).not.toHaveBeenCalled();
  });

  it("D.5-2: a zoom within one bucket issues zero calls", () => {
    const state = stubState();
    repairMeshes(state);
    tessellate.mockClear();

    // bucket = floor(log2(zoom × dpr)); 1 → 1.9 stays in bucket 0.
    (state as { zoom: number }).zoom = 1.9;
    repairMeshes(state);
    expect(tessellate).not.toHaveBeenCalled();
  });

  it("D.5-2: crossing a bucket boundary re-tessellates each path at most once", () => {
    const state = stubState();
    repairMeshes(state);
    tessellate.mockClear();

    (state as { zoom: number }).zoom = 2; // bucket 0 → 1
    repairMeshes(state);
    expect(tessellate).toHaveBeenCalledTimes(2); // fill + stroke, once each

    tessellate.mockClear();
    repairMeshes(state); // settled at the new bucket
    expect(tessellate).not.toHaveBeenCalled();
  });

  it("a geometry edit invalidates, a repeat does not", () => {
    const state = stubState();
    repairMeshes(state);
    tessellate.mockClear();

    const edited = pathList();
    edited[RECORD.padOrVersion] = 2;
    (state as { renderList: Float32Array }).renderList = edited;
    repairMeshes(state);
    expect(tessellate).toHaveBeenCalledTimes(2);

    tessellate.mockClear();
    repairMeshes(state);
    expect(tessellate).not.toHaveBeenCalled();
  });
});
