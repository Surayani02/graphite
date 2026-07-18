import type { EngineState } from "../state";
import { buildPipeline } from "./pipeline";

const SHAPE_STRIDE = 64; // bytes: 16 × f32 — see graph.rs get_render_list doc comment

/** WebGPU's spec-default `maxTextureDimension2D` — the guaranteed floor
 *  when the device isn't up yet (`engine:resize` can legitimately arrive
 *  mid-`engine:init`). */
export const DEFAULT_MAX_TEXTURE_DIM = 8192;

export interface ClampedSize {
  readonly width: number;
  readonly height: number;
  /** True when either axis was out of the device's allocatable range —
   *  a clamped resize means a shell layout bug upstream, worth a warning. */
  readonly clamped: boolean;
}

/**
 * Clamps an incoming canvas size into what the device can actually
 * allocate as a swap-chain texture: `[1, maxDimension]` per axis,
 * independently (no aspect preservation — the backing store then differs
 * from the CSS box either way, and clamping per-axis keeps the maximum
 * fidelity the hardware allows).
 *
 * M5-FR1: a shell containment bug let a 10k-row Layers panel inflate the
 * canvas to 300,055 device px; the resulting swap-chain exceeded
 * `maxTextureDimension2D` and every subsequent frame was invalid. The
 * layout is fixed at the root (AppShell's definite row), and this guard
 * makes the failure mode of any *future* layout regression a
 * clamped-but-alive canvas instead of a dead pipeline.
 */
export function clampCanvasSize(width: number, height: number, maxDimension: number): ClampedSize {
  const rw = Math.round(width);
  const rh = Math.round(height);
  const w = Math.min(Math.max(rw, 1), maxDimension);
  const h = Math.min(Math.max(rh, 1), maxDimension);
  // Rounding is not clamping: a fractional request (bridge rounds, but be
  // safe) is honoured as closely as integers allow without the warning.
  return { width: w, height: h, clamped: w !== rw || h !== rh };
}

/** (Re-)configures the canvas's WebGPU swap-chain. Safe to call before the
 * device exists — becomes a no-op until both `gpuContext` and `gpuDevice`
 * are set, which matters because `engine:resize` messages can legitimately
 * arrive while `engine:init`'s async setup is still in flight. */
export function configureContext(state: EngineState): void {
  if (!state.gpuContext || !state.gpuDevice) return;
  state.gpuContext.configure({
    device: state.gpuDevice,
    format: state.canvasFormat,
    alphaMode: "opaque",
  });
}

/**
 * Requests a WebGPU adapter/device, obtains the canvas context, and
 * allocates the three GPU buffers (camera uniform, shape storage,
 * selection storage) plus the render pipeline.
 *
 * Mutates `state` in place rather than returning a value: every later GPU
 * call (buffer upload, render) needs the same handles, so storing them on
 * the shared state object is simpler than threading a return value through
 * every subsequent function call.
 */
export async function initWebGPU(state: EngineState, offscreen: OffscreenCanvas): Promise<void> {
  if (!navigator.gpu) {
    throw new Error("WebGPU is not available. Use Chrome 113+ or enable the flag.");
  }

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("No WebGPU adapter found.");

  const device = await adapter.requestDevice({ label: "graphite-device" });
  void device.lost.then((info) => {
    state.running = false;
    self.postMessage({
      type: "engine:error",
      message: `GPU lost (${info.reason}): ${info.message}`,
    });
  });

  state.gpuDevice = device;
  state.gpuContext = offscreen.getContext("webgpu") as GPUCanvasContext | null;
  if (!state.gpuContext) throw new Error("Failed to get WebGPU context.");

  state.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  configureContext(state);

  state.cameraBuffer = device.createBuffer({
    label: "camera-uniform",
    size: 32, // 8 × f32: scale.xy, offset.xy, pixel_size, pad×3
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  state.shapeBuffer = device.createBuffer({
    label: "shape-storage",
    size: 64 * SHAPE_STRIDE, // initial capacity for 64 shapes; grows on demand
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  state.selectionBuffer = device.createBuffer({
    label: "selection-storage",
    size: SHAPE_STRIDE, // always exactly one shape
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  state.gpuPipeline = await buildPipeline(device, state.canvasFormat);
}
