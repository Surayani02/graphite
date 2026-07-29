import { FRAME_BUDGET_MS } from "@graphite/protocol";
import type { EngineState } from "../state";
import { post } from "../messaging";
import { updateCameraUniform, uploadRenderList, updateSelectionBuffer } from "./buffers";
import { renderFrame, repairMeshes } from "./frame";

/**
 * QUAL-02: the render loop reschedules itself every frame via a recursive
 * call — `tick()` calls `setTimeout(tick, …)` from inside itself, every
 * ~16.67ms. The HTML spec clamps nested timer delays to a 4ms floor once a
 * call chain is 5+ levels deep, and this applies inside Web Workers too.
 * Once the loop is past that depth (i.e. after the 5th frame, permanently),
 * any requested delay under 4ms gets silently stretched to 4ms — which
 * matters most exactly when the loop is polling close to the next frame's
 * deadline (the most timing-sensitive moment) or trying to catch up after
 * an over-budget frame (the moment it most needs *not* to wait).
 *
 * A `MessageChannel` posts to its own paired port as a macrotask with no
 * minimum delay (it is not a "timer" task source, so the nesting clamp
 * does not apply) — this is the standard browser workaround, used by
 * `setImmediate` polyfills for the same reason. `setTimeout` is kept for
 * waits genuinely longer than the clamp floor, where it is already
 * accurate and cheaper than spinning through extra macrotasks.
 */
const scheduleChannel = new MessageChannel();
let scheduledCallback: (() => void) | null = null;

scheduleChannel.port1.onmessage = () => {
  scheduledCallback?.();
};

/** Runs `cb` on the next macrotask turn, without `setTimeout`'s 4ms nested-timer floor. */
function scheduleImmediate(cb: () => void): void {
  scheduledCallback = cb;
  scheduleChannel.port2.postMessage(undefined);
}

/** Schedules `cb` after `delayMs`, choosing the primitive that is accurate for that delay. */
function scheduleAfter(delayMs: number, cb: () => void): void {
  // 4ms matches the spec's nested-timer clamp threshold — below it,
  // setTimeout cannot be trusted to fire on time once the loop is deep
  // enough into its own recursive call chain (which it always is, after
  // the first few frames).
  if (delayMs > 4) {
    setTimeout(cb, delayMs);
  } else {
    scheduleImmediate(cb);
  }
}

/**
 * One frame slot under the damage model (ADR-025). A dirty scene pays the
 * full pipeline — camera uniform, render-list fetch + upload, selection
 * buffer, GPU submit — and clears the flag; a clean one pays nothing and
 * posts a single edge-triggered `frame:idle` so the main thread can label
 * idleness honestly instead of displaying a stale fps. The flag clears
 * *before* the work (canonical order: a mark landing mid-slot survives
 * into the next one). Exported as the unit-test seam — the self-scheduling
 * loop around it needs live macrotasks; the decision logic doesn't.
 * Returns GPU-submit wall time (0 for skipped slots) for the scheduler.
 */
export function runFrameSlot(state: EngineState, now: number): number {
  if (!state.sceneDirty) {
    if (!state.idleNotified) {
      state.idleNotified = true;
      post({ type: "frame:idle" });
    }
    return 0;
  }
  state.sceneDirty = false;

  updateCameraUniform(state);
  uploadRenderList(state);
  if (state.selectedId !== null) updateSelectionBuffer(state);

  // Bring the mesh cache into step *before* the pass: repair tessellates
  // and uploads buffers, and a render pass that also allocates is the kind
  // of thing that stops being reasonable the moment anything else joins
  // the frame. Must follow uploadRenderList, which is what publishes the
  // culled list the repair queue is derived from.
  repairMeshes(state);

  const renderMs = renderFrame(state);
  state.frameNumber += 1;

  post({
    type: "frame:rendered",
    frameNumber: state.frameNumber,
    timestamp: now,
    renderTimeMs: renderMs,
  });
  return renderMs;
}

function tick(state: EngineState): void {
  if (!state.running) return;

  const now = performance.now();
  const elapsed = now - state.lastTick;

  if (elapsed >= FRAME_BUDGET_MS) {
    state.lastTick = now;
    const renderMs = runFrameSlot(state, now);
    scheduleAfter(Math.max(0, FRAME_BUDGET_MS - renderMs), () => {
      tick(state);
    });
  } else {
    scheduleAfter(FRAME_BUDGET_MS - elapsed - 1, () => {
      tick(state);
    });
  }
}

export function startRenderLoop(state: EngineState): void {
  state.running = true;
  state.lastTick = performance.now();
  scheduleImmediate(() => {
    tick(state);
  });
}
