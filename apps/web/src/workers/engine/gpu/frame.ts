/**
 * Frame assembly — the pass half of the frame graph (ADR-032 Decision 2).
 *
 * ADR-031 called out that "the frame graph — pass ordering, shared target,
 * resolve — becomes a real component and needs its own design", and the
 * accretion it warned against was pass setup living inline in the render
 * loop. This module owns encoding one frame; `render.ts` owns *when*
 * frames happen. Mesh draws join the pass here once the mesh pipeline
 * lands, which is precisely why the seam exists before they do.
 */

import type { EngineState } from "../state";
import { ensureMsaaTarget, msaaAttachment } from "./targets";

/** Editor canvas background — #0f1016. */
const CLEAR_COLOR: GPUColor = { r: 0.059, g: 0.063, b: 0.086, a: 1.0 };

/**
 * Encodes and submits one frame. Returns wall-clock submit time in ms, or
 * 0 when the device is not ready.
 *
 * Everything renders into the shared multisampled target and resolves to
 * the swap chain in a single pass — one pass, not two, so the SDF and mesh
 * pipelines share depth-free paint-ordered compositing without an
 * intermediate copy.
 */
export function renderFrame(state: EngineState): number {
  if (!state.gpuDevice || !state.gpuContext || !state.gpuPipeline || !state.bindGroup) return 0;
  const target = ensureMsaaTarget(state);
  if (target === null) return 0;

  const t0 = performance.now();
  const encoder = state.gpuDevice.createCommandEncoder({ label: "frame-encoder" });
  const pass = encoder.beginRenderPass({
    label: "main-pass",
    colorAttachments: [
      msaaAttachment(target, state.gpuContext.getCurrentTexture().createView(), CLEAR_COLOR),
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
