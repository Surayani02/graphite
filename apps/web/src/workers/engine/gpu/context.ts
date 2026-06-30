import type { EngineState } from "../state";
import { buildPipeline } from "./pipeline";

const SHAPE_STRIDE = 64; // bytes: 16 × f32 — see graph.rs get_render_list doc comment

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
