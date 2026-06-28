/**
 * Engine Worker — Phase 3: Path Rendering
 *
 * Changes from Phase 2:
 *   - SHAPE_STRIDE = 64 bytes (was 32): render list now carries fill, stroke,
 *     stroke_width, corner_radius, shape_type per shape.
 *   - Camera uniform: 32 bytes (was 16) — adds pixel_size for AA width.
 *   - WGSL shader replaced: SDF rounded-rect + ellipse with smoothstep AA
 *     and Porter-Duff stroke-over-fill compositing.
 *   - Demo scene: 4 × 4 grid — plain rects, rounded rects, ellipses, strokes.
 *   - `set_corner_radius` and `set_stroke` called to demonstrate Phase 3 API.
 */

import init, { SceneGraph, version } from "@graphite/engine";
import type { EngineToMainMessage, MainToEngineMessage } from "@graphite/protocol";
import { FRAME_BUDGET_MS } from "@graphite/protocol";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Bytes per shape in the GPU storage buffer: 16 × f32. */
const SHAPE_STRIDE = 64;

// ─── GPU state ────────────────────────────────────────────────────────────────

let gpuCanvas: OffscreenCanvas | null = null;
let gpuDevice: GPUDevice | null = null;
let gpuContext: GPUCanvasContext | null = null;
let gpuPipeline: GPURenderPipeline | null = null;
let cameraBuffer: GPUBuffer | null = null;
let shapeBuffer: GPUBuffer | null = null;
let bindGroup: GPUBindGroup | null = null;
let canvasFormat: GPUTextureFormat = "bgra8unorm";

// ─── Scene state ──────────────────────────────────────────────────────────────

let sceneGraph: SceneGraph | null = null;
let shapeCount = 0;

// ─── Camera (world coords, Y-down, centred on demo grid) ─────────────────────

const camX = 375.0;
const camY = 315.0;
const zoom = 1.0;
let vpW = 800;
let vpH = 600;

// ─── Loop state ───────────────────────────────────────────────────────────────

let running = false;
let frameNumber = 0;
let lastTick = 0;

// ─── WGSL shader ─────────────────────────────────────────────────────────────

/**
 * Unified instanced shape shader — Phase 3.
 *
 * Binding 0 — Camera uniform (32 bytes):
 *   scale.xy    =  (2·zoom/vpW,  −2·zoom/vpH)   world → NDC scale (Y-flip)
 *   offset.xy   =  (−camX·sx,   −camY·sy)       world → NDC offset
 *   params.x    =  1/zoom                        world units per screen pixel (AA width)
 *
 * Binding 1 — Shape storage buffer (64 bytes / instance):
 *   pos          vec2   world top-left
 *   size         vec2   world width, height
 *   fill         vec4   RGBA [0,1]
 *   stroke       vec4   RGBA [0,1]
 *   stroke_width f32    world units
 *   corner_radius f32   world units  (rects only; 0 = sharp)
 *   shape_type   f32    0 = rect,  1 = ellipse
 *   _pad         f32
 *
 * Fragment stage evaluates an SDF, applies smoothstep anti-aliasing,
 * then composites stroke over fill using Porter-Duff src-over.
 */
const SHADER_WGSL = /* wgsl */ `
struct Camera {
  scale  : vec2<f32>,   //  8 bytes
  offset : vec2<f32>,   //  8 bytes
  params : vec4<f32>,   // 16 bytes  params.x = pixel_size (1/zoom)
}                       // = 32 bytes

struct ShapeData {
  pos          : vec2<f32>,  //  0
  size         : vec2<f32>,  //  8
  fill         : vec4<f32>,  // 16
  stroke       : vec4<f32>,  // 32
  stroke_width : f32,        // 48
  corner_radius: f32,        // 52
  shape_type   : f32,        // 56   0.0 = rect, 1.0 = ellipse
  _pad         : f32,        // 60
}                            // = 64 bytes

@group(0) @binding(0) var<uniform>       camera : Camera;
@group(0) @binding(1) var<storage, read> shapes : array<ShapeData>;

struct VSOut {
  @builtin(position) clip_pos  : vec4<f32>,
  @location(0)       uv        : vec2<f32>,   // [-0.5, 0.5] within shape
  @location(1)       half_size : vec2<f32>,   // world half-extents
  @location(2)       fill      : vec4<f32>,
  @location(3)       stroke    : vec4<f32>,
  @location(4)       params    : vec4<f32>,   // stroke_width, corner_radius, shape_type, pixel_size
}

@vertex
fn vs(
  @builtin(vertex_index)   vi : u32,
  @builtin(instance_index) ii : u32,
) -> VSOut {
  // Two CCW triangles → unit quad in UV space [-0.5, 0.5]
  var corners = array<vec2<f32>, 6>(
    vec2(-0.5, -0.5), vec2( 0.5, -0.5), vec2(-0.5,  0.5),
    vec2(-0.5,  0.5), vec2( 0.5, -0.5), vec2( 0.5,  0.5),
  );

  let s      = shapes[ii];
  let uv     = corners[vi];
  // World position: top-left at s.pos, bottom-right at s.pos + s.size
  let world  = s.pos + (uv + vec2(0.5)) * s.size;
  let ndc    = world * camera.scale + camera.offset;

  var out: VSOut;
  out.clip_pos  = vec4(ndc, 0.0, 1.0);
  out.uv        = uv;
  out.half_size = s.size * 0.5;
  out.fill      = s.fill;
  out.stroke    = s.stroke;
  out.params    = vec4(s.stroke_width, s.corner_radius, s.shape_type, camera.params.x);
  return out;
}

// ── Signed distance functions ──────────────────────────────────────────────────

// Rounded-rectangle SDF.
// p         — position relative to shape centre (world units)
// half_size — (w/2, h/2)
// r         — corner radius
fn sdf_round_rect(p: vec2<f32>, half_size: vec2<f32>, r: f32) -> f32 {
  let q = abs(p) - half_size + vec2(r);
  return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

// Ellipse SDF — k1-method (exact for circles; quality approximation otherwise).
// p  — position relative to ellipse centre
// ab — semi-axes (half-width, half-height)
fn sdf_ellipse(p: vec2<f32>, ab: vec2<f32>) -> f32 {
  let k1 = length(p / ab);
  return (k1 - 1.0) * min(ab.x, ab.y);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let stroke_width  = in.params.x;
  let corner_radius = in.params.y;
  let shape_type    = in.params.z;
  let pixel_size    = in.params.w;   // 1 world unit per screen pixel at current zoom

  // World-space position relative to shape centre
  let local = in.uv * 2.0 * in.half_size;

  // Evaluate SDF (negative = inside shape, 0 = on boundary, positive = outside)
  let sdf = select(
    sdf_round_rect(local, in.half_size, corner_radius),
    sdf_ellipse(local, in.half_size),
    shape_type > 0.5,
  );

  // Anti-aliasing band: smoothstep over ±pixel_size around the boundary
  let aa = pixel_size;

  // ── Fill ──────────────────────────────────────────────────────────────────
  let fill_alpha = smoothstep(aa, -aa, sdf) * in.fill.a;

  // ── Stroke (centre-aligned: ±stroke_width/2 around SDF = 0) ──────────────
  let half_sw     = stroke_width * 0.5;
  let stroke_alpha = select(
    0.0,
    smoothstep(aa, -aa, abs(sdf) - half_sw) * in.stroke.a,
    stroke_width > 0.0 && in.stroke.a > 0.0,
  );

  // ── Porter-Duff: stroke over fill ────────────────────────────────────────
  //   out_a   = stroke_a + fill_a × (1 − stroke_a)
  //   out_rgb = (stroke_rgb × stroke_a + fill_rgb × fill_a × (1 − stroke_a)) / out_a
  let out_a = stroke_alpha + fill_alpha * (1.0 - stroke_alpha);

  if (out_a < 0.0001) {
    discard;
  }

  let out_rgb =
    (in.stroke.rgb * stroke_alpha + in.fill.rgb * fill_alpha * (1.0 - stroke_alpha))
    / out_a;

  return vec4(out_rgb, out_a);
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

/**
 * Writes the 8-float camera uniform to the GPU.
 *
 * Layout (32 bytes):
 *   [scale.x, scale.y, offset.x, offset.y, pixel_size, 0, 0, 0]
 */
function updateCameraUniform(): void {
  if (!cameraBuffer || !gpuDevice) return;

  const sx = (2.0 * zoom) / vpW;
  const sy = -(2.0 * zoom) / vpH; // negative: Y-flip (world Y-down → NDC Y-up)
  const ox = -camX * sx;
  const oy = -camY * sy;
  const pixelSize = 1.0 / zoom; // world units per screen pixel

  gpuDevice.queue.writeBuffer(
    cameraBuffer,
    0,
    new Float32Array([sx, sy, ox, oy, pixelSize, 0, 0, 0])
  );
}

// ─── Demo scene ───────────────────────────────────────────────────────────────

/**
 * Builds a 4 × 4 grid demonstrating all Phase 3 primitives:
 *
 *  Col 0  Plain filled rect
 *  Col 1  Rounded rect (corner radius varies by row)
 *  Col 2  Ellipse (row 1 = circle, others = horizontal ellipse)
 *  Col 3  Semi-transparent fill + full-opacity stroke
 *         (alternating: ellipse on even rows, rounded rect on odd rows)
 *
 * Camera is centred on the grid at (375, 315).
 */
function buildDemoScene(): void {
  if (!sceneGraph) return;

  const frame = sceneGraph.add_frame(0.0, 0.0, 800.0, 700.0);

  type RGBA = readonly [number, number, number, number];

  const rowColors: ReadonlyArray<RGBA> = [
    [99, 179, 237, 255], // sky blue
    [246, 173, 85, 255], // amber
    [104, 211, 145, 255], // mint
    [159, 122, 234, 255], // lavender
  ];

  // Column x positions (left edge of each shape)
  const colX = [40, 220, 400, 580] as const;
  // Row y positions (top edge of each shape)
  const rowY = [40, 190, 340, 490] as const;
  // Corner radius per row for rounded rects
  const radii = [12, 25, 38, 50] as const;

  for (let row = 0; row < 4; row++) {
    const c = rowColors[row]!;
    const y = rowY[row]!;
    const rad = radii[row]!;

    // Col 0: Plain filled rect (sharp corners, no stroke)
    sceneGraph.add_rect(frame, colX[0]!, y, 130, 100, c[0], c[1], c[2], c[3]);

    // Col 1: Rounded rect — corner radius increases each row
    const rr = sceneGraph.add_rect(frame, colX[1]!, y, 130, 100, c[0], c[1], c[2], c[3]);
    sceneGraph.set_corner_radius(rr, rad);

    // Col 2: Ellipse — row 1 is a perfect circle (100 × 100)
    const isCircle = row === 1;
    const ew = isCircle ? 100 : 130;
    const ex = isCircle ? colX[2]! + 15 : colX[2]!; // centre the circle
    sceneGraph.add_ellipse(frame, ex, y, ew, 100, c[0], c[1], c[2], c[3]);

    // Col 3: Semi-transparent fill + opaque stroke
    //   Even rows → ellipse,  odd rows → rounded rect
    const halfA = Math.round(c[3] * 0.28); // ≈ 71 — semi-transparent
    const isEven = row % 2 === 0;
    const sid = isEven
      ? sceneGraph.add_ellipse(frame, colX[3]!, y, 130, 100, c[0], c[1], c[2], halfA)
      : sceneGraph.add_rect(frame, colX[3]!, y, 130, 100, c[0], c[1], c[2], halfA);
    if (!isEven) sceneGraph.set_corner_radius(sid, rad);
    sceneGraph.set_stroke(sid, c[0], c[1], c[2], 255, 5);
  }
}

// ─── Buffer management ────────────────────────────────────────────────────────

/**
 * Queries the scene graph, uploads visible shapes to the GPU storage buffer.
 * Recreates the buffer (and bind group) if the scene has grown past capacity.
 */
function uploadRenderList(): void {
  if (!sceneGraph || !gpuDevice || !cameraBuffer || !gpuPipeline) return;

  const list = sceneGraph.get_render_list(camX, camY, zoom, vpW, vpH);
  shapeCount = list.length / 16;

  if (list.length === 0) return;

  // Grow storage buffer on demand (double-capacity strategy)
  if (!shapeBuffer || list.byteLength > shapeBuffer.size) {
    shapeBuffer?.destroy();
    const newSize = Math.max(list.byteLength, (shapeBuffer?.size ?? SHAPE_STRIDE) * 2);
    shapeBuffer = gpuDevice.createBuffer({
      label: "shape-storage",
      size: newSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    rebuildBindGroup();
  }

  gpuDevice.queue.writeBuffer(shapeBuffer, 0, list);
}

function rebuildBindGroup(): void {
  if (!gpuPipeline || !cameraBuffer || !shapeBuffer || !gpuDevice) return;
  bindGroup = gpuDevice.createBindGroup({
    label: "shape-bg",
    layout: gpuPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: cameraBuffer } },
      { binding: 1, resource: { buffer: shapeBuffer } },
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

  const device = await adapter.requestDevice({ label: "graphite-device" });

  void device.lost.then((info) => {
    running = false;
    post({ type: "engine:error", message: `GPU device lost (${info.reason}): ${info.message}` });
  });

  gpuDevice = device;
  gpuContext = offscreen.getContext("webgpu") as GPUCanvasContext | null;
  if (!gpuContext) throw new Error("Failed to get WebGPU context from OffscreenCanvas.");

  canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  configureContext();

  // Camera uniform — 32 bytes (8 × f32): scale, offset, pixel_size + 3 pad
  cameraBuffer = device.createBuffer({
    label: "camera-uniform",
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Shape storage buffer — initial capacity for 64 shapes
  shapeBuffer = device.createBuffer({
    label: "shape-storage",
    size: 64 * SHAPE_STRIDE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  gpuPipeline = await buildPipeline(device, canvasFormat);
  rebuildBindGroup();
}

async function buildPipeline(
  device: GPUDevice,
  format: GPUTextureFormat
): Promise<GPURenderPipeline> {
  const shaderModule = device.createShaderModule({ label: "shape-shader", code: SHADER_WGSL });

  const info = await shaderModule.getCompilationInfo();
  for (const msg of info.messages) {
    if (msg.type === "error") {
      throw new Error(`WGSL compile error at line ${msg.lineNum}: ${msg.message}`);
    }
  }

  const bgl = device.createBindGroupLayout({
    label: "shape-bgl",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
    ],
  });

  return device.createRenderPipeline({
    label: "shape-pipeline",
    layout: device.createPipelineLayout({ label: "shape-pl", bindGroupLayouts: [bgl] }),
    vertex: { module: shaderModule, entryPoint: "vs" },
    fragment: { module: shaderModule, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "none" },
  });
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderFrame(): number {
  if (!gpuDevice || !gpuContext || !gpuPipeline || !bindGroup) return 0;

  const t0 = performance.now();
  const encoder = gpuDevice.createCommandEncoder({ label: "frame-encoder" });
  const pass = encoder.beginRenderPass({
    label: "main-pass",
    colorAttachments: [
      {
        view: gpuContext.getCurrentTexture().createView(),
        clearValue: { r: 0.059, g: 0.063, b: 0.086, a: 1.0 }, // #0f1016
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });

  pass.setPipeline(gpuPipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(6, shapeCount); // 6 verts × N instances
  pass.end();

  gpuDevice.queue.submit([encoder.finish()]);
  return performance.now() - t0;
}

// ─── Render loop ──────────────────────────────────────────────────────────────

function tick(): void {
  if (!running) return;

  const now = performance.now();
  const elapsed = now - lastTick;

  if (elapsed >= FRAME_BUDGET_MS) {
    lastTick = now;

    updateCameraUniform();
    uploadRenderList();

    const renderMs = renderFrame();
    frameNumber += 1;

    post({ type: "frame:rendered", frameNumber, timestamp: now, renderTimeMs: renderMs });
    setTimeout(tick, Math.max(0, FRAME_BUDGET_MS - renderMs));
  } else {
    setTimeout(tick, FRAME_BUDGET_MS - elapsed - 1);
  }
}

function startRenderLoop(): void {
  running = true;
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
        // 1. Load and compile the WASM module
        await init();
        // eslint-disable-next-line no-console
        console.info(
          `[engine] WASM ready — graphite-engine v${version()} | Phase 3: Path Rendering`
        );

        // 2. Build the demo scene graph
        sceneGraph = new SceneGraph();
        buildDemoScene();

        // 3. Bring up WebGPU
        await initWebGPU(msg.canvas);

        // 4. Prime GPU buffers before the first frame
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
        gpuCanvas.width = msg.width;
        gpuCanvas.height = msg.height;
        configureContext();
      }
      break;
    }

    default:
      break;
  }
};
