/**
 * Frame-rate tracking over a sliding 1-second window (QUAL-01).
 *
 * Extracted from EngineWorkerBridge as a pure module so the cold-start
 * behaviour is unit-testable with synthetic clocks — the bridge itself
 * needs a live worker and can't run under Node.
 *
 * Cold-start: the previous inline implementation reported 0 fps until the
 * first full window elapsed (~1s of a visibly wrong HUD on every launch).
 * Until the first window completes, `record()` now returns a provisional
 * estimate computed from the frames seen so far — once at least
 * `MIN_SAMPLE_FRAMES` frames and `MIN_SAMPLE_MS` have accumulated, so a
 * single early frame can't produce a wild number. After the first window,
 * behaviour is identical to before: one locked reading per second.
 */

const WINDOW_MS = 1_000;
const MIN_SAMPLE_FRAMES = 3;
const MIN_SAMPLE_MS = 100;

export class FpsTracker {
  private windowStart: number | null = null;
  private frames = 0;
  private locked: number | null = null;

  /**
   * Records one rendered frame at time `now` (caller's clock — the bridge
   * passes `performance.now()`) and returns the fps value to display.
   */
  record(now: number): number {
    if (this.windowStart === null) {
      // The frame that opens the window marks t=0 — it is the fencepost,
      // not a sample: N later frames over `elapsed` ms is the true rate.
      this.windowStart = now;
      this.frames = 0;
      return this.locked ?? 0;
    }

    this.frames += 1;
    const elapsed = now - this.windowStart;

    if (elapsed >= WINDOW_MS) {
      this.locked = Math.round((this.frames / elapsed) * 1_000);
      this.frames = 0;
      this.windowStart = now;
      return this.locked;
    }

    if (this.locked === null && this.frames >= MIN_SAMPLE_FRAMES && elapsed >= MIN_SAMPLE_MS) {
      // Provisional cold-start estimate — recomputed each frame, replaced
      // by the locked windowed value after the first full second.
      return Math.round((this.frames / elapsed) * 1_000);
    }

    return this.locked ?? 0;
  }
}
