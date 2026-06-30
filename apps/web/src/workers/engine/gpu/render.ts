import { FRAME_BUDGET_MS } from "@graphite/protocol";
import type { EngineState } from "../state";
import { post } from "../messaging";
import { updateCameraUniform, uploadRenderList, updateSelectionBuffer } from "./buffers";

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

/** Encodes and submits one frame. Returns wall-clock GPU-submit time in ms. */
export function renderFrame(state: EngineState): number {
  if (!state.gpuDevice || !state.gpuContext || !state.gpuPipeline || !state.bindGroup) return 0;

  const t0 = performance.now();
  const encoder = state.gpuDevice.createCommandEncoder({ label: "frame-encoder" });
  const pass = encoder.beginRenderPass({
    label: "main-pass",
    colorAttachments: [
      {
        view: state.gpuContext.getCurrentTexture().createView(),
        clearValue: { r: 0.059, g: 0.063, b: 0.086, a: 1.0 }, // #0f1016
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });

  pass.setPipeline(state.gpuPipeline);
  pass.setBindGroup(0, state.bindGroup);
  pass.draw(6, state.shapeCount); // 6 verts × N instances

  if (state.selectedId !== null && state.selectionBG) {
    pass.setBindGroup(0, state.selectionBG);
    pass.draw(6, 1);
  }

  pass.end();
  state.gpuDevice.queue.submit([encoder.finish()]);
  return performance.now() - t0;
}

function tick(state: EngineState): void {
  if (!state.running) return;

  const now = performance.now();
  const elapsed = now - state.lastTick;

  if (elapsed >= FRAME_BUDGET_MS) {
    state.lastTick = now;

    updateCameraUniform(state);
    uploadRenderList(state);
    if (state.selectedId !== null) updateSelectionBuffer(state);

    const renderMs = renderFrame(state);
    state.frameNumber += 1;

    post({
      type: "frame:rendered",
      frameNumber: state.frameNumber,
      timestamp: now,
      renderTimeMs: renderMs,
    });

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
