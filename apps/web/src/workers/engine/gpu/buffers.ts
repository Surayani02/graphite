import type { EngineState } from "../state";

const SHAPE_STRIDE = 64; // bytes: 16 × f32 — see graph.rs get_render_list doc comment

/**
 * Writes the 8-float camera uniform: [scale.x, scale.y, offset.x, offset.y,
 * pixel_size, 0, 0, 0]. `pixel_size = 1/zoom` drives the shader's
 * antialiasing bandwidth so edges stay exactly ~1 screen pixel wide at
 * every zoom level.
 */
export function updateCameraUniform(state: EngineState): void {
  if (!state.cameraBuffer || !state.gpuDevice) return;
  const sx = (2.0 * state.zoom) / state.vpW;
  const sy = -(2.0 * state.zoom) / state.vpH; // Y-flip: world Y-down → NDC Y-up
  state.gpuDevice.queue.writeBuffer(
    state.cameraBuffer,
    0,
    new Float32Array([sx, sy, -state.camX * sx, -state.camY * sy, 1.0 / state.zoom, 0, 0, 0])
  );
}

/** (Re)builds the main shape bind group from the current camera + shape buffers. */
export function rebuildMainBindGroup(state: EngineState): void {
  if (!state.gpuPipeline || !state.cameraBuffer || !state.shapeBuffer || !state.gpuDevice) return;
  state.bindGroup = state.gpuDevice.createBindGroup({
    label: "shape-bg",
    layout: state.gpuPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: state.cameraBuffer } },
      { binding: 1, resource: { buffer: state.shapeBuffer } },
    ],
  });
}

/** Builds the selection-overlay bind group. Called once after `initWebGPU`. */
export function rebuildSelectionBindGroup(state: EngineState): void {
  if (!state.gpuPipeline || !state.cameraBuffer || !state.selectionBuffer || !state.gpuDevice) {
    return;
  }
  state.selectionBG = state.gpuDevice.createBindGroup({
    label: "selection-bg",
    layout: state.gpuPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: state.cameraBuffer } },
      { binding: 1, resource: { buffer: state.selectionBuffer } },
    ],
  });
}

/**
 * Queries the scene graph for shapes visible in the current viewport and
 * uploads them to the GPU storage buffer, growing (doubling) the buffer
 * and rebuilding its bind group if the scene has outgrown the current
 * allocation.
 */
export function uploadRenderList(state: EngineState): void {
  if (!state.sceneGraph || !state.gpuDevice || !state.cameraBuffer || !state.gpuPipeline) return;

  const list = state.sceneGraph.get_render_list(
    state.camX,
    state.camY,
    state.zoom,
    state.vpW,
    state.vpH
  );
  state.shapeCount = list.length / 16;
  if (list.length === 0) return;

  if (!state.shapeBuffer || list.byteLength > state.shapeBuffer.size) {
    // GPUBuffer.destroy() is specified as safe to call multiple times and
    // does not throw on a lost device (device-timeline errors in WebGPU
    // are reported asynchronously via error scopes, not as synchronous
    // exceptions) — no try/catch needed here. Device loss is already
    // handled by `running = false` in context.ts, which stops the render
    // loop (and therefore this function) from being reached at all once
    // the device is gone.
    state.shapeBuffer?.destroy();
    const newSize = Math.max(list.byteLength, (state.shapeBuffer?.size ?? SHAPE_STRIDE) * 2);
    state.shapeBuffer = state.gpuDevice.createBuffer({
      label: "shape-storage",
      size: newSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    rebuildMainBindGroup(state);
  }
  state.gpuDevice.queue.writeBuffer(state.shapeBuffer, 0, list);
}

/** Writes the 1-shape selection overlay buffer (transparent fill, blue stroke). */
export function updateSelectionBuffer(state: EngineState): void {
  if (
    !state.sceneGraph ||
    !state.gpuDevice ||
    !state.selectionBuffer ||
    state.selectedId === null
  ) {
    return;
  }
  const b = state.sceneGraph.get_node_bounds(state.selectedId);

  // Destructure with an explicit guard rather than `b[0]!` etc. — both are
  // equally safe given the length implied by a real bounds array, but the
  // guard reads as an ordinary runtime check instead of a "trust me"
  // assertion, and widens automatically if get_node_bounds's return shape
  // ever changes.
  const [x, y, w, h] = b;
  if (x === undefined || y === undefined || w === undefined || h === undefined) return;

  const strokeWidth = 2.5 / state.zoom; // always 2.5 screen pixels regardless of zoom
  state.gpuDevice.queue.writeBuffer(
    state.selectionBuffer,
    0,
    new Float32Array([
      x,
      y,
      w,
      h,
      0,
      0,
      0,
      0, // fill: transparent
      0.086,
      0.467,
      1.0,
      1.0, // stroke: #1677FF (Figma blue)
      strokeWidth,
      0.0, // corner_radius: bounding rect always
      0.0, // shape_type: rect
      0.0, // _pad
    ])
  );
}
