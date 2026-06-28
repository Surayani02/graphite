/**
 * Engine Worker — Phase 2: Scene Graph Core
 *
 * Changes from Phase 1:
 *   - Initialises the Rust/WASM scene graph before WebGPU.
 *   - Builds a 6 × 5 grid of coloured rectangles as the demo scene.
 *   - Replaces the hardcoded triangle shader with instanced rect rendering.
 *   - Uses a GPU storage buffer fed by `SceneGraph.get_render_list()`.
 *   - Camera uniform (4 × f32) drives world → NDC in the vertex shader.
 *   - Rect buffer grows dynamically; bind group is rebuilt when it does.
 */

import init, { SceneGraph, version } from "@graphite/engine";
import type { EngineToMainMessage, MainToEngineMessage } from "@graphite/protocol";
import { FRAME_BUDGET_MS } from "@graphite/protocol";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Bytes per rect in the GPU storage buffer: 8 × f32. */
const RECT_STRIDE = 32;

// ─── GPU state ────────────────────────────────────────────────────────────────

let gpuCanvas:    OffscreenCanvas   | null = null;
let gpuDevice:    GPUDevice         | null = null;
let gpuContext:   GPUCanvasContext  | null = null;
let gpuPipeline:  GPURenderPipeline | null = null;
let cameraBuffer: GPUBuffer         | null = null;
let rectBuffer:   GPUBuffer         | null = null;
let bindGroup:    GPUBindGroup      | null = null;
let canvasFormat: GPUTextureFormat        = "bgra8unorm";

// ─── Scene state ──────────────────────────────────────────────────────────────

let sceneGraph: SceneGraph | null = null;
let rectCount               = 0;

// ─── Camera state (world coordinates, Y-down) ─────────────────────────────────
// Centre of the demo grid: grid spans x:[50,990] y:[80,760]
// → centre ≈ (520, 420)

let camX = 520.0;
let camY = 420.0;
let zoom = 1.0;
let vpW  = 800;   // updated on engine:resize
let vpH  = 600;

// ─── Loop state ───────────────────────────────────────────────────────────────

let running     = false;
let frameNumber = 0;
let lastTick    = 0;

// ─── WGSL shader ─────────────────────────────────────────────────────────────

/**
 * Instanced rectangle shader.
 *
 * Binding 0 — camera uniform (16 bytes):
 *   scale.x  =  2 × zoom / viewport_w
 *   scale.y  = -2 × zoom / viewport_h   (Y-flip: world Y-down → NDC Y-up)
 *   offset.x = -cam_x × scale.x
 *   offset.y = -cam_y × scale.y
 *
 * Binding 1 — rect storage buffer (32 bytes / rect):
 *   pos:   vec2<f32>   world position (x, y)
 *   size:  vec2<f32>   world size    (w, h)
 *   color: vec4<f32>   RGBA [0, 1]
 *
 * The vertex shader expands each instance into 6 vertices (2 triangles).
 */
const SHADER_WGSL = /* wgsl */`
struct Camera {
  scale  : vec2<f32>,
  offset : vec2<f32>,
}

struct RectData {
  pos   : vec2<f32>,
  size  : vec2<f32>,
  color : vec4<f32>,
}

@group(0) @binding(0) var<uniform>          camera : Camera;
@group(0) @binding(1) var<storage, read>    rects  : array<RectData>;

struct VSOut {
  @builtin(position) clip_pos : vec4<f32>,
  @location(0)       color    : vec4<f32>,
}

@vertex
fn vs(
  @builtin(vertex_index)   vi : u32,
  @builtin(instance_index) ii : u32,
) -> VSOut {
  // Unit-square corners for two CCW triangles
  var corners = array<vec2<f32>, 6>(
    vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0),
    vec2(0.0, 1.0), vec2(1.0, 0.0), vec2(1.0, 1.0),
  );

  let r     = rects[ii];
  let world = r.pos + corners[vi] * r.size;
  let ndc   = world * camera.scale + camera.offset;

  var out: VSOut;
  out.clip_pos = vec4(ndc, 0.0, 1.0);
  out.color    = r.color;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  return in.color;
}
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function post(msg: EngineToMainMessage): void {
  self.postMessage(msg);
}

function toErrorMsg(raw: unknown): EngineToMainMessage {
  const e = raw instanceof Error ? raw : new Error(String(raw));
  if (e.stack !== undefined) {
    return { type: "engine:error", message: e.message, stack: e.stack };
  }
  return { type: "engine:error", message: e.message };
}

// ─── Camera uniform ───────────────────────────────────────────────────────────

function updateCameraUniform(): void {
  if (!cameraBuffer || !gpuDevice) return;

  // World → NDC
  //   ndc_x = (world_x - camX) × 2 × zoom / vpW
  //         = world_x × sx + (-camX × sx)
  const sx = (2.0 * zoom) / vpW;
  const sy = -(2.0 * zoom) / vpH;  // negative: Y-flip
  const ox = -camX * sx;
  const oy = -camY * sy;

  gpuDevice.queue.writeBuffer(cameraBuffer, 0, new Float32Array([sx, sy, ox, oy]));
}

// ─── Demo scene ───────────────────────────────────────────────────────────────

function buildDemoScene(): void {
  if (!sceneGraph) return;

  const frame = sceneGraph.add_frame(0.0, 0.0, 1000.0, 800.0);

  // 6 × 5 grid — 30 rectangles in 6 repeating colours
  const palette: ReadonlyArray<readonly [number, number, number, number]> = [
    [ 99, 179, 237, 255],   // sky blue
    [237,  99, 166, 255],   // pink
    [104, 211, 145, 255],   // green
    [246, 173,  85, 255],   // orange
    [159, 122, 234, 255],   // purple
    [237, 211,  99, 255],   // gold
  ];

  let colorIdx = 0;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 6; col++) {
      const c = palette[colorIdx % palette.length];
      if (!c) continue;
      sceneGraph.add_rect(
        frame,
        50 + col * 160,       // x
        80 + row * 140,       // y
        140, 120,             // w, h
        c[0], c[1], c[2], c[3],
      );
      colorIdx++;
    }
  }
}

// ─── Buffer management ────────────────────────────────────────────────────────

/**
 * Query the scene graph for visible rects, upload to the GPU storage buffer.
 * Recreates the buffer and bind group if the scene has grown beyond capacity.
 */
function uploadRenderList(): void {
  if (!sceneGraph || !gpuDevice || !cameraBuffer || !gpuPipeline) return;

  const list = sceneGraph.get_render_list(camX, camY, zoom, vpW, vpH);
  rectCount  = list.length / 8;

  if (list.length === 0) return;

  // Grow the storage buffer when capacity is exceeded (double strategy)
  if (!rectBuffer || list.byteLength > rectBuffer.size) {
    rectBuffer?.destroy();
    const newSize = Math.max(list.byteLength, (rectBuffer?.size ?? RECT_STRIDE) * 2);
    rectBuffer = gpuDevice.createBuffer({
      label: "rect-storage",
      size:  newSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    rebuildBindGroup();
  }

  gpuDevice.queue.writeBuffer(rectBuffer, 0, list);
}

function rebuildBindGroup(): void {
  if (!gpuPipeline || !cameraBuffer || !rectBuffer || !gpuDevice) return;
  bindGroup = gpuDevice.createBindGroup({
    label:   "rect-bg",
    layout:  gpuPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: cameraBuffer } },
      { binding: 1, resource: { buffer: rectBuffer } },
    ],
  });
}

// ─── WebGPU initialisation ────────────────────────────────────────────────────

function configureContext(): void {
  if (!gpuContext || !gpuDevice) return;
  gpuContext.configure({ device: gpuDevice, format: canvasFormat, alphaMode: "premultiplied" });
}

async function initWebGPU(offscreen: OffscreenCanvas): Promise<void> {
  if (!navigator.gpu) {
    throw new Error("WebGPU is not available. Use Chrome 113+ or enable the flag.");
  }

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("No WebGPU adapter found.");

  const device  = await adapter.requestDevice({ label: "graphite-device" });

  void device.lost.then((info) => {
    running = false;
    post({ type: "engine:error", message: `GPU device lost (${info.reason}): ${info.message}` });
  });

  gpuDevice  = device;
  gpuContext = offscreen.getContext("webgpu") as GPUCanvasContext | null;
  if (!gpuContext) throw new Error("Failed to obtain WebGPU context from OffscreenCanvas.");

  canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  configureContext();

  // Camera uniform buffer — 4 × f32 = 16 bytes
  cameraBuffer = device.createBuffer({
    label: "camera-uniform",
    size:  16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Initial rect storage buffer — capacity for 64 rects
  rectBuffer = device.createBuffer({
    label: "rect-storage",
    size:  64 * RECT_STRIDE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  gpuPipeline = await buildPipeline(device, canvasFormat);
  rebuildBindGroup();
}

async function buildPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
): Promise<GPURenderPipeline> {
  const shaderModule = device.createShaderModule({ label: "rect-shader", code: SHADER_WGSL });

  const info = await shaderModule.getCompilationInfo();
  for (const msg of info.messages) {
    if (msg.type === "error") {
      throw new Error(`WGSL compile error at line ${msg.lineNum}: ${msg.message}`);
    }
  }

  const bgl = device.createBindGroupLayout({
    label:   "rect-bgl",
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
    ],
  });

  return device.createRenderPipeline({
    label:    "rect-pipeline",
    layout:   device.createPipelineLayout({ label: "rect-pl", bindGroupLayouts: [bgl] }),
    vertex:   { module: shaderModule, entryPoint: "vs" },
    fragment: { module: shaderModule, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "none" },
  });
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderFrame(): number {
  if (!gpuDevice || !gpuContext || !gpuPipeline || !bindGroup) return 0;

  const t0      = performance.now();
  const encoder = gpuDevice.createCommandEncoder({ label: "frame-encoder" });
  const pass    = encoder.beginRenderPass({
    label: "main-pass",
    colorAttachments: [{
      view:       gpuContext.getCurrentTexture().createView(),
      clearValue: { r: 0.059, g: 0.063, b: 0.086, a: 1.0 },
      loadOp:     "clear",
      storeOp:    "store",
    }],
  });

  pass.setPipeline(gpuPipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(6, rectCount);   // 6 vertices × rectCount instances
  pass.end();

  gpuDevice.queue.submit([encoder.finish()]);
  return performance.now() - t0;
}

// ─── Render loop ──────────────────────────────────────────────────────────────

function tick(): void {
  if (!running) return;

  const now     = performance.now();
  const elapsed = now - lastTick;

  if (elapsed >= FRAME_BUDGET_MS) {
    lastTick = now;

    updateCameraUniform();
    uploadRenderList();

    const renderMs  = renderFrame();
    frameNumber    += 1;

    post({ type: "frame:rendered", frameNumber, timestamp: now, renderTimeMs: renderMs });
    setTimeout(tick, Math.max(0, FRAME_BUDGET_MS - renderMs));
  } else {
    setTimeout(tick, FRAME_BUDGET_MS - elapsed - 1);
  }
}

function startRenderLoop(): void {
  running  = true;
  lastTick = performance.now();
  setTimeout(tick, 0);
}

// ─── Message handling ─────────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<MainToEngineMessage>): Promise<void> => {
  const msg = event.data;

  switch (msg.type) {
    case "engine:init": {
      gpuCanvas = msg.canvas;
      try {
        // 1. Initialise WASM (fetches and compiles graphite_engine_bg.wasm)
        await init();

        // 2. Build the demo scene graph
        sceneGraph = new SceneGraph();
        buildDemoScene();

        // Log version to confirm WASM loaded correctly
        // eslint-disable-next-line no-console
        console.info(`[engine] WASM loaded — graphite-engine v${version()}`);

        // 3. Bring up WebGPU
        await initWebGPU(msg.canvas);

        // 4. Prime the GPU buffers before the first frame
        updateCameraUniform();
        uploadRenderList();

        startRenderLoop();
        post({ type: "engine:ready" });
      } catch (err) {
        post(toErrorMsg(err));
      }
      break;
    }

    case "engine:resize": {
      vpW = msg.width;
      vpH = msg.height;
      if (gpuCanvas) {
        gpuCanvas.width  = msg.width;
        gpuCanvas.height = msg.height;
        configureContext();
      }
      break;
    }

    default:
      break;
  }
};