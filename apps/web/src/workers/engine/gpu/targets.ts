/**
 * Multisampled render-target lifecycle — ADR-032 Decision 2.
 *
 * Both pipelines render into one shared 4× MSAA colour target which is
 * resolved to the destination (swap chain on screen, `rgba8unorm` texture
 * on export). The SDF pass keeps its analytic anti-aliasing and simply
 * renders multisampled; mesh edges get their anti-aliasing from MSAA,
 * since a tessellated triangle boundary has no analytic coverage to
 * compute.
 *
 * Sample count 4 is the tier WebGPU guarantees. `storeOp: "discard"` is
 * deliberate: the multisampled contents are consumed by the resolve, so
 * writing them back to memory would be pure bandwidth spent on data
 * nothing reads.
 */

import type { EngineState } from "../state";

/** WebGPU's guaranteed multisample tier. */
export const MSAA_SAMPLE_COUNT = 4;

/** Bytes per device pixel at this sample count, assuming a 4-byte format. */
const BYTES_PER_SAMPLE = 4;

/** A multisampled colour target sized to a particular destination. */
export interface MsaaTarget {
  readonly texture: GPUTexture;
  readonly view: GPUTextureView;
  readonly width: number;
  readonly height: number;
  readonly format: GPUTextureFormat;
}

/**
 * Memory cost of a target, for the ADR-032 budget line: ~16.8 MiB at the
 * reference machine's 1366×768 viewport, ~33 MiB at 1080p. Exported so
 * diagnostics can report it rather than the number living only in prose.
 */
export function msaaBytes(width: number, height: number): number {
  return width * height * MSAA_SAMPLE_COUNT * BYTES_PER_SAMPLE;
}

/** Allocates a multisampled colour target. */
export function createMsaaTarget(
  device: GPUDevice,
  format: GPUTextureFormat,
  width: number,
  height: number,
  label: string
): MsaaTarget {
  const texture = device.createTexture({
    label,
    size: { width, height },
    format,
    sampleCount: MSAA_SAMPLE_COUNT,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  return { texture, view: texture.createView(), width, height, format };
}

/** Releases the live target, if any. Safe to call repeatedly. */
export function destroyMsaaTarget(state: EngineState): void {
  state.msaaTarget?.texture.destroy();
  state.msaaTarget = null;
}

/**
 * Returns the live screen target, reallocating it when the canvas size or
 * format has changed since the last frame.
 *
 * Checked per frame rather than wired into the resize handler: the canvas
 * backing size is the single authority, `engine:resize` can arrive before
 * the device exists, and a stale target is a validation error rather than
 * a cosmetic bug. One integer comparison per frame buys immunity from
 * every ordering question.
 *
 * Returns `null` when the device or canvas is not ready — the caller
 * skips the frame, exactly as it already does for a missing pipeline.
 */
export function ensureMsaaTarget(state: EngineState): MsaaTarget | null {
  const device = state.gpuDevice;
  const canvas = state.gpuCanvas;
  if (!device || !canvas) return null;

  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  const format = state.canvasFormat;

  const current = state.msaaTarget;
  if (
    current !== null &&
    current.width === width &&
    current.height === height &&
    current.format === format
  ) {
    return current;
  }

  current?.texture.destroy();
  const target = createMsaaTarget(device, format, width, height, "msaa-color");
  state.msaaTarget = target;
  return target;
}

/**
 * Builds the colour attachment that renders into `target` and resolves
 * into `resolveView`. The only place these four fields are set, so screen
 * and export cannot drift apart — the reason ADR-032 put export through
 * the same target configuration in the first place.
 */
export function msaaAttachment(
  target: MsaaTarget,
  resolveView: GPUTextureView,
  clearValue: GPUColor
): GPURenderPassColorAttachment {
  return {
    view: target.view,
    resolveTarget: resolveView,
    clearValue,
    loadOp: "clear",
    storeOp: "discard",
  };
}
