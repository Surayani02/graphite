/**
 * Mesh-cache mechanics (ADR-032 Decision 4) — bucket quantisation, the
 * validity decision matrix, LRU eviction under the cap, and the budgeted
 * repair scheduler. These are the §D.5 invariants that can be asserted
 * without a GPU: *when* tessellation happens, not what it looks like.
 */
import { describe, expect, it, vi } from "vitest";
import {
  MeshCache,
  MESH_CACHE_MAX_BYTES,
  RETESS_BUDGET_ACTIVE_MS,
  RETESS_BUDGET_IDLE_MS,
  repairBudgetMs,
  repairWithinBudget,
  toleranceBucket,
  TOLERANCE_DEVICE_PX,
  worldTolerance,
  type GpuMesh,
  type MeshCacheEntry,
  type RepairCandidate,
} from "../workers/engine/gpu/meshCache";

function gpuMesh(bytes: number): GpuMesh {
  return {
    vertexBuffer: { destroy: vi.fn() } as unknown as GPUBuffer,
    indexBuffer: { destroy: vi.fn() } as unknown as GPUBuffer,
    indexCount: 3,
    bytes,
  };
}

function entry(overrides: Partial<MeshCacheEntry> = {}): MeshCacheEntry {
  return {
    version: 1,
    bucket: 0,
    fill: gpuMesh(1_000),
    stroke: null,
    bytes: 1_000,
    lastUsedFrame: 0,
    ...overrides,
  };
}

describe("toleranceBucket", () => {
  it("quantises zoom × dpr to a power-of-two bucket", () => {
    expect(toleranceBucket(1, 1)).toBe(0);
    expect(toleranceBucket(1.9, 1)).toBe(0);
    expect(toleranceBucket(2, 1)).toBe(1);
    expect(toleranceBucket(4, 1)).toBe(2);
    expect(toleranceBucket(0.5, 1)).toBe(-1);
  });

  it("counts device pixel ratio as part of the scale", () => {
    expect(toleranceBucket(1, 2)).toBe(1);
    expect(toleranceBucket(0.5, 2)).toBe(0);
    expect(toleranceBucket(1, 1)).not.toBe(toleranceBucket(1, 2));
  });

  it("clamps at both ends", () => {
    expect(toleranceBucket(2 ** -20, 1)).toBe(-4);
    expect(toleranceBucket(2 ** 20, 1)).toBe(12);
  });

  it("survives degenerate input rather than returning NaN", () => {
    for (const zoom of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(Number.isFinite(toleranceBucket(zoom, 1))).toBe(true);
    }
  });

  it("derives a world tolerance that halves per bucket", () => {
    expect(worldTolerance(0)).toBe(TOLERANCE_DEVICE_PX);
    expect(worldTolerance(1)).toBe(TOLERANCE_DEVICE_PX / 2);
    expect(worldTolerance(-1)).toBe(TOLERANCE_DEVICE_PX * 2);
  });
});

describe("MeshCache.status", () => {
  it("reports the decision matrix over version × bucket × presence", () => {
    const cache = new MeshCache();
    expect(cache.status(1, 1, 0)).toBe("missing");
    cache.set(1, entry({ version: 1, bucket: 0 }));
    expect(cache.status(1, 1, 0)).toBe("fresh");
    expect(cache.status(1, 2, 0)).toBe("stale"); // geometry edited
    expect(cache.status(1, 1, 3)).toBe("stale"); // zoom crossed a bucket
    expect(cache.status(1, 2, 3)).toBe("stale");
    expect(cache.status(99, 1, 0)).toBe("missing");
  });

  it("keeps a stale mesh drawable rather than dropping it", () => {
    const cache = new MeshCache();
    cache.set(1, entry({ version: 1 }));
    expect(cache.status(1, 5, 0)).toBe("stale");
    expect(cache.peek(1)?.fill).not.toBeNull();
  });
});

describe("MeshCache accounting and eviction", () => {
  it("tracks bytes across set, replace, and delete", () => {
    const cache = new MeshCache();
    cache.set(1, entry({ bytes: 1_000 }));
    cache.set(2, entry({ bytes: 2_500 }));
    expect(cache.bytes).toBe(3_500);
    cache.set(1, entry({ bytes: 500 }));
    expect(cache.bytes).toBe(3_000);
    cache.delete(2);
    expect(cache.bytes).toBe(500);
    cache.clear();
    expect(cache.bytes).toBe(0);
    expect(cache.size).toBe(0);
  });

  it("destroys GPU buffers on eviction, replacement, and clear", () => {
    const cache = new MeshCache();
    const mesh = gpuMesh(1_000);
    cache.set(1, entry({ fill: mesh }));
    cache.delete(1);
    expect(mesh.vertexBuffer.destroy).toHaveBeenCalledOnce();
    expect(mesh.indexBuffer.destroy).toHaveBeenCalledOnce();
  });

  it("evicts least-recently-used first until the cap is met", () => {
    const cache = new MeshCache(2_500);
    cache.set(1, entry({ bytes: 1_000, lastUsedFrame: 1 }));
    cache.set(2, entry({ bytes: 1_000, lastUsedFrame: 5 }));
    cache.set(3, entry({ bytes: 1_000, lastUsedFrame: 3 }));
    expect(cache.bytes).toBe(3_000);

    expect(cache.evictToFit(9)).toBe(1);
    expect(cache.peek(1)).toBeUndefined(); // oldest went
    expect(cache.peek(2)).toBeDefined();
    expect(cache.peek(3)).toBeDefined();
    expect(cache.bytes).toBeLessThanOrEqual(2_500);
  });

  it("never evicts an entry drawn this frame (§D.5-4)", () => {
    const cache = new MeshCache(1_000);
    cache.set(1, entry({ bytes: 1_000, lastUsedFrame: 7 }));
    cache.set(2, entry({ bytes: 1_000, lastUsedFrame: 7 }));
    expect(cache.evictToFit(7)).toBe(0);
    expect(cache.size).toBe(2);
    expect(cache.bytes).toBeGreaterThan(1_000); // breach stays visible
  });

  it("does nothing when already under the cap", () => {
    const cache = new MeshCache();
    cache.set(1, entry({ bytes: 10 }));
    expect(cache.evictToFit(1)).toBe(0);
    expect(MESH_CACHE_MAX_BYTES).toBe(64 * 2 ** 20);
  });

  it("touch updates the LRU key only for known ids", () => {
    const cache = new MeshCache();
    cache.set(1, entry({ lastUsedFrame: 0 }));
    expect(cache.touch(1, 42)?.lastUsedFrame).toBe(42);
    expect(cache.touch(2, 42)).toBeUndefined();
  });
});

describe("repair scheduling", () => {
  const candidate = (engineId: number, area: number): RepairCandidate => ({
    engineId,
    version: 1,
    bucket: 0,
    area,
  });

  it("picks the budget from input recency", () => {
    expect(repairBudgetMs(1_000, 950)).toBe(RETESS_BUDGET_ACTIVE_MS);
    expect(repairBudgetMs(1_000, 100)).toBe(RETESS_BUDGET_IDLE_MS);
  });

  it("repairs largest-on-screen first", () => {
    let now = 0;
    const done = repairWithinBudget(
      [candidate(1, 10), candidate(2, 900), candidate(3, 50)],
      100,
      () => now,
      () => {
        now += 1;
      }
    );
    expect(done.map((c) => c.engineId)).toEqual([2, 3, 1]);
  });

  it("stops once the budget is spent, leaving the rest for later frames", () => {
    let now = 0;
    const repaired: number[] = [];
    const done = repairWithinBudget(
      [candidate(1, 400), candidate(2, 300), candidate(3, 200), candidate(4, 100)],
      2,
      () => now,
      (c) => {
        repaired.push(c.engineId);
        now += 1;
      }
    );
    expect(repaired).toEqual([1, 2]);
    expect(done).toHaveLength(2);
  });

  it("always repairs at least one candidate so large paths cannot starve", () => {
    let now = 0;
    const repaired: number[] = [];
    const done = repairWithinBudget(
      [candidate(1, 999)],
      2,
      () => now,
      (c) => {
        repaired.push(c.engineId);
        now += 50; // one very expensive repair, far over budget
      }
    );
    expect(repaired).toEqual([1]);
    expect(done).toHaveLength(1);
  });

  it("does no work with an empty queue or a spent budget", () => {
    const repair = vi.fn();
    expect(repairWithinBudget([], 5, () => 0, repair)).toEqual([]);
    expect(repairWithinBudget([candidate(1, 1)], 0, () => 0, repair)).toEqual([]);
    expect(repair).not.toHaveBeenCalled();
  });
});
