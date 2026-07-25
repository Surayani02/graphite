/**
 * Mesh cache mechanics — ADR-032 Decision 4.
 *
 * Owns the numbers that decision fixed (tolerance buckets, repair
 * budgets, the memory cap) and the policy built on them: when a cached
 * mesh is still valid, which stale meshes to repair first, and what to
 * evict when the cap is reached.
 *
 * Deliberately free of `GPUDevice`: buffers are created by the caller and
 * handed in, and released through the `destroy` callback on each entry.
 * That keeps every decision in this file unit-testable — the whole point
 * of ADR-032's invariant list (§D.5), which is assertions about *when*
 * tessellation happens, not about pixels.
 */

/** Flattening error budget, in device pixels (ADR-032 §4). */
export const TOLERANCE_DEVICE_PX = 0.25;

/** Per-frame re-tessellation budget while input is active, in ms. */
export const RETESS_BUDGET_ACTIVE_MS = 2;

/** Per-frame re-tessellation budget when idle, in ms. */
export const RETESS_BUDGET_IDLE_MS = 8;

/** Hard cap on cached mesh bytes before LRU eviction runs. */
export const MESH_CACHE_MAX_BYTES = 64 * 2 ** 20;

/** Inclusive bucket bounds. Below −4 the document is zoomed so far out
 *  that a coarser mesh is invisible; above 12 the flattening is already
 *  finer than any display can resolve. */
const BUCKET_MIN = -4;
const BUCKET_MAX = 12;

/**
 * Quantises a zoom level to a tolerance bucket. Bucketing is what makes
 * the cache useful: a continuous zoom would otherwise invalidate every
 * mesh on every frame.
 *
 * `dpr` is part of the scale because the tolerance is defined in *device*
 * pixels, not CSS pixels. Error is ≤ ¼ device pixel at a bucket floor and
 * ≤ ½ at its ceiling.
 */
export function toleranceBucket(zoom: number, dpr: number): number {
  const scale = zoom * dpr;
  if (!(scale > 0) || !Number.isFinite(scale)) return BUCKET_MIN;
  const raw = Math.floor(Math.log2(scale));
  return Math.min(BUCKET_MAX, Math.max(BUCKET_MIN, raw));
}

/** World-space flattening tolerance for a bucket. */
export function worldTolerance(bucket: number): number {
  return TOLERANCE_DEVICE_PX / 2 ** bucket;
}

/** GPU buffers for one tessellated part, plus their byte cost. */
export interface GpuMesh {
  readonly vertexBuffer: GPUBuffer;
  readonly indexBuffer: GPUBuffer;
  readonly indexCount: number;
  readonly bytes: number;
}

/** One cached path, both parts. */
export interface MeshCacheEntry {
  /** Geometry version these meshes were built from. */
  version: number;
  /** Tolerance bucket these meshes were built for. */
  bucket: number;
  fill: GpuMesh | null;
  stroke: GpuMesh | null;
  /** Total bytes of both parts. */
  bytes: number;
  /** Frame counter at last use — the LRU key. */
  lastUsedFrame: number;
}

/**
 * `fresh` — draw it; `stale` — draw it *and* queue a repair (the geometry
 * or the bucket moved, but the old mesh is still a better frame than a
 * hole); `missing` — nothing to draw yet.
 */
export type MeshStatus = "fresh" | "stale" | "missing";

/** A path that needs re-tessellation, ranked by on-screen area so the
 *  most visible work happens first. */
export interface RepairCandidate {
  readonly engineId: number;
  readonly version: number;
  readonly bucket: number;
  /** Screen-space area in px², used only for ordering. */
  readonly area: number;
}

/** Injected so the budget scheduler is testable with a stub clock. */
export type Clock = () => number;

/**
 * Cache of tessellated path meshes, keyed by engine node id.
 *
 * Not a `Map` subclass: eviction has to release GPU buffers, and the
 * bookkeeping (byte total, same-frame protection) is the substance.
 */
export class MeshCache {
  private readonly entries = new Map<number, MeshCacheEntry>();
  private totalBytes = 0;

  constructor(private readonly maxBytes: number = MESH_CACHE_MAX_BYTES) {}

  /** Live entry count. */
  get size(): number {
    return this.entries.size;
  }

  /** Total bytes currently held. */
  get bytes(): number {
    return this.totalBytes;
  }

  /** Validity of the cached meshes for a path at a given version and
   *  bucket. A version change invalidates both parts; a bucket change
   *  invalidates the flattening. Either way the old mesh stays drawable. */
  status(engineId: number, version: number, bucket: number): MeshStatus {
    const entry = this.entries.get(engineId);
    if (entry === undefined) return "missing";
    if (entry.version !== version || entry.bucket !== bucket) return "stale";
    return "fresh";
  }

  /** Borrows an entry without marking it used. */
  peek(engineId: number): MeshCacheEntry | undefined {
    return this.entries.get(engineId);
  }

  /** Marks an entry as drawn this frame — LRU input, and the same-frame
   *  eviction guard. */
  touch(engineId: number, frame: number): MeshCacheEntry | undefined {
    const entry = this.entries.get(engineId);
    if (entry !== undefined) entry.lastUsedFrame = frame;
    return entry;
  }

  /** Inserts or replaces an entry, releasing whatever it displaces. */
  set(engineId: number, entry: MeshCacheEntry): void {
    this.delete(engineId);
    this.entries.set(engineId, entry);
    this.totalBytes += entry.bytes;
  }

  /** Removes an entry and destroys its buffers. */
  delete(engineId: number): boolean {
    const existing = this.entries.get(engineId);
    if (existing === undefined) return false;
    destroyEntry(existing);
    this.totalBytes -= existing.bytes;
    this.entries.delete(engineId);
    return true;
  }

  /** Drops everything — document load, or context loss. */
  clear(): void {
    for (const entry of this.entries.values()) destroyEntry(entry);
    this.entries.clear();
    this.totalBytes = 0;
  }

  /**
   * Evicts least-recently-used entries until the cap is satisfied.
   *
   * Entries drawn on `currentFrame` are never evicted (ADR-032 §D.5-4):
   * evicting one would guarantee a re-tessellation of something visible
   * right now, which is the opposite of the cache's job. If only
   * same-frame entries remain, this returns having freed less than asked
   * — a breach that persists across frames is one of ADR-031's recorded
   * triggers to reconsider the whole approach, so it must stay visible
   * rather than being forced away.
   */
  evictToFit(currentFrame: number): number {
    if (this.totalBytes <= this.maxBytes) return 0;
    const candidates = [...this.entries.entries()]
      .filter(([, entry]) => entry.lastUsedFrame !== currentFrame)
      .sort((a, b) => a[1].lastUsedFrame - b[1].lastUsedFrame);

    let evicted = 0;
    for (const [engineId] of candidates) {
      if (this.totalBytes <= this.maxBytes) break;
      this.delete(engineId);
      evicted += 1;
    }
    return evicted;
  }
}

function destroyEntry(entry: MeshCacheEntry): void {
  entry.fill?.vertexBuffer.destroy();
  entry.fill?.indexBuffer.destroy();
  entry.stroke?.vertexBuffer.destroy();
  entry.stroke?.indexBuffer.destroy();
}

/** Budget for this frame: tighter while the user is actively interacting,
 *  looser once input has stopped. */
export function repairBudgetMs(now: number, lastInputAt: number, idleAfterMs = 250): number {
  return now - lastInputAt < idleAfterMs ? RETESS_BUDGET_ACTIVE_MS : RETESS_BUDGET_IDLE_MS;
}

/**
 * Repairs stale and missing meshes largest-first until the frame's budget
 * is spent, leaving the rest for later frames — a bucket-crossing zoom
 * therefore never stalls a frame, and quality converges over the next
 * few (ADR-032 §4).
 *
 * The budget is checked *after* each repair rather than before: skipping
 * a repair because it *might* overrun would starve large paths forever,
 * since the largest candidate is also the most expensive. One overrun per
 * frame is bounded and visible; starvation is neither.
 *
 * Returns the candidates actually repaired, in the order attempted.
 */
export function repairWithinBudget(
  candidates: readonly RepairCandidate[],
  budgetMs: number,
  clock: Clock,
  repair: (candidate: RepairCandidate) => void
): readonly RepairCandidate[] {
  if (candidates.length === 0 || budgetMs <= 0) return [];
  const ordered = [...candidates].sort((a, b) => b.area - a.area);
  const started = clock();
  const done: RepairCandidate[] = [];
  for (const candidate of ordered) {
    repair(candidate);
    done.push(candidate);
    if (clock() - started >= budgetMs) break;
  }
  return done;
}
