/**
 * FpsTracker unit tests — synthetic clock, no timers.
 */
import { describe, expect, it } from "vitest";
import { FpsTracker } from "../engine/fps";

/** Feeds `count` frames at a fixed interval, returning the last reading. */
function run(tracker: FpsTracker, start: number, count: number, intervalMs: number): number {
  let last = 0;
  for (let i = 0; i < count; i++) {
    last = tracker.record(start + i * intervalMs);
  }
  return last;
}

describe("FpsTracker", () => {
  it("returns 0 for the very first frame", () => {
    expect(new FpsTracker().record(0)).toBe(0);
  });

  it("does not report a provisional value from too small a sample", () => {
    const t = new FpsTracker();
    t.record(0);
    expect(t.record(16.67)).toBe(0); // 2 frames / 17ms — below both floors
  });

  it("reports a provisional ~60fps estimate during the cold-start window", () => {
    const t = new FpsTracker();
    // 10 frames at 16.67ms spacing ≈ 150ms elapsed — past both floors,
    // well before the 1s window completes.
    const reading = run(t, 0, 10, 16.67);
    expect(reading).toBeGreaterThanOrEqual(55);
    expect(reading).toBeLessThanOrEqual(65);
  });

  it("locks to the windowed value after one full second", () => {
    const t = new FpsTracker();
    const reading = run(t, 0, 62, 16.67); // ~1.017s of 60fps frames
    expect(reading).toBeGreaterThanOrEqual(58);
    expect(reading).toBeLessThanOrEqual(62);
  });

  it("keeps returning the locked value between window boundaries", () => {
    const t = new FpsTracker();
    run(t, 0, 62, 16.67); // completes first window
    const locked = t.record(62 * 16.67);
    expect(t.record(62 * 16.67 + 5)).toBe(locked); // mid-window read
  });

  it("tracks a frame-rate drop at the next window", () => {
    const t = new FpsTracker();
    run(t, 0, 62, 16.67); // first window ≈ 60fps
    // Second window: 30fps frames for a bit over a second.
    const start = 62 * 16.67;
    const reading = run(t, start + 33.33, 32, 33.33);
    expect(reading).toBeGreaterThanOrEqual(28);
    expect(reading).toBeLessThanOrEqual(32);
  });
});
