/**
 * Engine Worker — Phase 4: Interaction Layer
 *
 * Changes from Phase 3:
 *   - Camera (camX, camY, zoom) is now mutable — pan and zoom update it.
 *   - pointer:down  → hit_test → select / start pan-drag / start move-drag
 *   - pointer:move  → pan camera or set_node_position (absolute move)
 *   - pointer:up    → end all drags
 *   - wheel:scroll  → pan; Ctrl+wheel → zoom centred on cursor
 *   - key:down      → Escape clears selection
 *   - tool:set      → switch between "select" and "pan"
 *   - selection overlay rendered as a second draw call (1-shape buffer)
 *   - Pipeline: alphaMode "opaque" + explicit blend (src-alpha / 1-src-alpha)
 *   - viewport:changed posted on every camera mutation
 *   - selection:changed posted on every selection mutation
 */

import init, { SceneGraph, version } from "@graphite/engine";
import type { EngineToMainMessage, MainToEngineMessage, NodeId } from "@graphite/protocol";
import { FRAME_BUDGET_MS, MIN_ZOOM, MAX_ZOOM } from "@graphite/protocol";

// ─── Constants ────────────────────────────────────────────────────────────────

const SHAPE_STRIDE = 64; // bytes: 16 × f32

// ─── GPU state ────────────────────────────────────────────────────────────────

let gpuCanvas: OffscreenCanvas | null = null;
let gpuDevice: GPUDevice | null = null;
let gpuContext: GPUCanvasContext | null = null;
let gpuPipeline: GPURenderPipeline | null = null;
let cameraBuffer: GPUBuffer | null = null;
let shapeBuffer: GPUBuffer | null = null;
let selectionBuffer: GPUBuffer | null = null;
let bindGroup: GPUBindGroup | null = null;
let selectionBG: GPUBindGroup | null = null;
let canvasFormat: GPUTextureFormat = "bgra8unorm";

// ─── Scene state ──────────────────────────────────────────────────────────────

let sceneGraph: SceneGraph | null = null;
let shapeCount = 0;

// ─── Camera (mutable from Phase 4 onward) ────────────────────────────────────

let camX = 375.0; // centred on demo grid
let camY = 315.0;
let zoom = 1.0;
let vpW = 800; // physical pixels, updated on resize
let vpH = 600;
let dpr = 1.0; // updated on resize

// ─── Interaction state ────────────────────────────────────────────────────────

type Tool = "select" | "pan";
type DragMode = "pan" | "move" | null;

let activeTool: Tool = "select";
let dragMode: DragMode = null;
let isDragging = false;

// Pan-drag start values (canvas CSS pixels → stored for delta)
let panStartCssX = 0;
let panStartCssY = 0;
let panStartCamX = 0;
let panStartCamY = 0;

// Move-drag start values (world space)
let moveStartWorldX = 0;
let moveStartWorldY = 0;
let moveStartBoundsX = 0;
let moveStartBoundsY = 0;

// Selection
let selectedId: number | null = null;

// ─── Loop state ───────────────────────────────────────────────────────────────

let running = false;
let frameNumber = 0;
let lastTick = 0;

// ─── WGSL shader (same as Phase 3) ───────────────────────────────────────────

const SHADER_WGSL = /* wgsl */ `
struct Camera {
  scale  : vec2<f32>,
  offset : vec2<f32>,
  params : vec4<f32>,   // params.x = pixel_size (1/zoom)
}

struct ShapeData {
  pos          : vec2<f32>,
  size         : vec2<f32>,
  fill         : vec4<f32>,
  stroke       : vec4<f32>,
  stroke_width : f32,
  corner_radius: f32,
  shape_type   : f32,
  _pad         : f32,
}

@group(0) @binding(0) var<uniform>       camera : Camera;
@group(0) @binding(1) var<storage, read> shapes : array<ShapeData>;

struct VSOut {
  @builtin(position) clip_pos  : vec4<f32>,
  @location(0)       uv        : vec2<f32>,
  @location(1)       half_size : vec2<f32>,
  @location(2)       fill      : vec4<f32>,
  @location(3)       stroke    : vec4<f32>,
  @location(4)       params    : vec4<f32>,
}

@vertex
fn vs(
  @builtin(vertex_index)   vi : u32,
  @builtin(instance_index) ii : u32,
) -> VSOut {
  var corners = array<vec2<f32>, 6>(
    vec2(-0.5, -0.5), vec2( 0.5, -0.5), vec2(-0.5,  0.5),
    vec2(-0.5,  0.5), vec2( 0.5, -0.5), vec2( 0.5,  0.5),
  );
  let s       = shapes[ii];
  let uv      = corners[vi];
  let world   = s.pos + (uv + vec2(0.5)) * s.size;
  let ndc     = world * camera.scale + camera.offset;
  var out: VSOut;
  out.clip_pos  = vec4(ndc, 0.0, 1.0);
  out.uv        = uv;
  out.half_size = s.size * 0.5;
  out.fill      = s.fill;
  out.stroke    = s.stroke;
  out.params    = vec4(s.stroke_width, s.corner_radius, s.shape_type, camera.params.x);
  return out;
}

fn sdf_round_rect(p: vec2<f32>, half_size: vec2<f32>, r: f32) -> f32 {
  let q = abs(p) - half_size + vec2(r);
  return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

fn sdf_ellipse(p: vec2<f32>, ab: vec2<f32>) -> f32 {
  let k1 = length(p / ab);
  return (k1 - 1.0) * min(ab.x, ab.y);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let stroke_width  = in.params.x;
  let corner_radius = in.params.y;
  let shape_type    = in.params.z;
  let pixel_size    = in.params.w;
  let local         = in.uv * 2.0 * in.half_size;

  let sdf = select(
    sdf_round_rect(local, in.half_size, corner_radius),
    sdf_ellipse(local, in.half_size),
    shape_type > 0.5,
  );

  let aa          = pixel_size;
  let fill_alpha  = smoothstep(aa, -aa, sdf) * in.fill.a;
  let half_sw     = stroke_width * 0.5;
  let stroke_alpha = select(
    0.0,
    smoothstep(aa, -aa, abs(sdf) - half_sw) * in.stroke.a,
    stroke_width > 0.0 && in.stroke.a > 0.0,
  );

  let out_a = stroke_alpha + fill_alpha * (1.0 - stroke_alpha);
  if out_a < 0.0001 { discard; }

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

// ─── Coordinate helpers ───────────────────────────────────────────────────────

/** CSS pixel → world space using current camera. */
function cssToWorld(cssX: number, cssY: number): [number, number] {
  const physX = cssX * dpr;
  const physY = cssY * dpr;
  return [(physX - vpW / 2) / zoom + camX, (physY - vpH / 2) / zoom + camY];
}

/** Zoom centred on a CSS pixel pivot. */
function zoomOnCursor(factor: number, pivotCssX: number, pivotCssY: number): void {
  const [worldPivotX, worldPivotY] = cssToWorld(pivotCssX, pivotCssY);
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
  const physPivotX = pivotCssX * dpr;
  const physPivotY = pivotCssY * dpr;
  camX = worldPivotX - (physPivotX - vpW / 2) / newZoom;
  camY = worldPivotY - (physPivotY - vpH / 2) / newZoom;
  zoom = newZoom;
}

// ─── Camera uniform ───────────────────────────────────────────────────────────

function updateCameraUniform(): void {
  if (!cameraBuffer || !gpuDevice) return;
  const sx = (2.0 * zoom) / vpW;
  const sy = -(2.0 * zoom) / vpH;
  gpuDevice.queue.writeBuffer(
    cameraBuffer,
    0,
    new Float32Array([sx, sy, -camX * sx, -camY * sy, 1.0 / zoom, 0, 0, 0])
  );
}

// ─── Camera change notification ───────────────────────────────────────────────

function notifyViewport(): void {
  post({ type: "viewport:changed", x: camX, y: camY, zoom });
}

// ─── Selection ────────────────────────────────────────────────────────────────

function setSelection(id: number | null): void {
  selectedId = id;
  const nodeIds: readonly NodeId[] = id !== null ? [String(id) as NodeId] : [];
  post({ type: "selection:changed", nodeIds });
}

/** Writes the 1-shape selection overlay buffer (transparent fill, blue stroke). */
function updateSelectionBuffer(): void {
  if (!sceneGraph || !gpuDevice || selectedId === null) return;
  const b = sceneGraph.get_node_bounds(selectedId);
  if (b.length < 4) return;

  const strokeW = 2.5 / zoom; // always 2.5 screen pixels regardless of zoom
  const data = new Float32Array([
    b[0],
    b[1],
    b[2],
    b[3], // x, y, w, h
    0,
    0,
    0,
    0, // fill: transparent
    0.086,
    0.467,
    1.0,
    1.0, // stroke: #1677FF (Figma blue)
    strokeW, // stroke_width
    0.0, // corner_radius: bounding rect always
    0.0, // shape_type: rect
    0.0, // _pad
  ]);
  gpuDevice.queue.writeBuffer(selectionBuffer!, 0, data);
}

// ─── Demo scene (4 × 4 grid — same as Phase 3) ───────────────────────────────

function buildDemoScene(): void {
  if (!sceneGraph) return;
  const frame = sceneGraph.add_frame(0.0, 0.0, 800.0, 700.0);

  type RGBA = readonly [number, number, number, number];
  const rowColors: ReadonlyArray<RGBA> = [
    [99, 179, 237, 255],
    [246, 173, 85, 255],
    [104, 211, 145, 255],
    [159, 122, 234, 255],
  ];
  const colX = [40, 220, 400, 580] as const;
  const rowY = [40, 190, 340, 490] as const;
  const radii = [12, 25, 38, 50] as const;

  for (let row = 0; row < 4; row++) {
    const c = rowColors[row]!;
    const y = rowY[row]!;
    const rad = radii[row]!;

    sceneGraph.add_rect(frame, colX[0]!, y, 130, 100, c[0], c[1], c[2], c[3]);

    const rr = sceneGraph.add_rect(frame, colX[1]!, y, 130, 100, c[0], c[1], c[2], c[3]);
    sceneGraph.set_corner_radius(rr, rad);

    const isCircle = row === 1;
    sceneGraph.add_ellipse(
      frame,
      isCircle ? colX[2]! + 15 : colX[2]!,
      y,
      isCircle ? 100 : 130,
      100,
      c[0],
      c[1],
      c[2],
      c[3]
    );

    const halfA = Math.round(c[3] * 0.28);
    const isEven = row % 2 === 0;
    const sid = isEven
      ? sceneGraph.add_ellipse(frame, colX[3]!, y, 130, 100, c[0], c[1], c[2], halfA)
      : sceneGraph.add_rect(frame, colX[3]!, y, 130, 100, c[0], c[1], c[2], halfA);
    if (!isEven) sceneGraph.set_corner_radius(sid, rad);
    sceneGraph.set_stroke(sid, c[0], c[1], c[2], 255, 5);
  }
}

// ─── Buffer management ────────────────────────────────────────────────────────

function uploadRenderList(): void {
  if (!sceneGraph || !gpuDevice || !cameraBuffer || !gpuPipeline) return;
  const list = sceneGraph.get_render_list(camX, camY, zoom, vpW, vpH);
  shapeCount = list.length / 16;
  if (list.length === 0) return;

  if (!shapeBuffer || list.byteLength > shapeBuffer.size) {
    shapeBuffer?.destroy();
    const newSize = Math.max(list.byteLength, (shapeBuffer?.size ?? SHAPE_STRIDE) * 2);
    shapeBuffer = gpuDevice.createBuffer({
      label: "shape-storage",
      size: newSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    rebuildMainBindGroup();
  }
  gpuDevice.queue.writeBuffer(shapeBuffer, 0, list);
}

function rebuildMainBindGroup(): void {
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
  gpuContext.configure({
    device: gpuDevice,
    format: canvasFormat,
    alphaMode: "opaque", // Phase 4: blend is handled in the pipeline, not by the compositor
  });
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

  cameraBuffer = device.createBuffer({
    label: "camera-uniform",
    size: 32, // 8 × f32: scale.xy, offset.xy, pixel_size, pad×3
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  shapeBuffer = device.createBuffer({
    label: "shape-storage",
    size: 64 * SHAPE_STRIDE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Selection buffer: always exactly 1 shape
  selectionBuffer = device.createBuffer({
    label: "selection-storage",
    size: SHAPE_STRIDE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  gpuPipeline = await buildPipeline(device, canvasFormat);

  rebuildMainBindGroup();

  selectionBG = device.createBindGroup({
    label: "selection-bg",
    layout: gpuPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: cameraBuffer } },
      { binding: 1, resource: { buffer: selectionBuffer } },
    ],
  });
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

  // Phase 4: explicit blend — required for semi-transparent fills and
  // the selection overlay (transparent fill + opaque stroke).
  const blendState: GPUBlendState = {
    color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
    alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
  };

  return device.createRenderPipeline({
    label: "shape-pipeline",
    layout: device.createPipelineLayout({ label: "shape-pl", bindGroupLayouts: [bgl] }),
    vertex: { module: shaderModule, entryPoint: "vs" },
    fragment: { module: shaderModule, entryPoint: "fs", targets: [{ format, blend: blendState }] },
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
        clearValue: { r: 0.059, g: 0.063, b: 0.086, a: 1.0 },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });

  // Draw all shapes
  pass.setPipeline(gpuPipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(6, shapeCount);

  // Draw selection overlay (1 instance) when something is selected
  if (selectedId !== null && selectionBG) {
    pass.setBindGroup(0, selectionBG);
    pass.draw(6, 1);
  }

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
    if (selectedId !== null) updateSelectionBuffer();

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
      dpr = msg.devicePixelRatio;
      try {
        await init();
        // eslint-disable-next-line no-console
        console.info(`[engine] WASM ready — graphite-engine v${version()} | Phase 4: Interaction`);

        sceneGraph = new SceneGraph();
        buildDemoScene();

        await initWebGPU(msg.canvas);
        updateCameraUniform();
        uploadRenderList();
        notifyViewport();
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
      dpr = msg.devicePixelRatio;
      if (gpuCanvas) {
        gpuCanvas.width = msg.width;
        gpuCanvas.height = msg.height;
        configureContext();
      }
      break;
    }

    // ── Tool ────────────────────────────────────────────────────────────────

    case "tool:set": {
      activeTool = msg.tool === "pan" ? "pan" : "select";
      break;
    }

    // ── Pointer ─────────────────────────────────────────────────────────────

    case "pointer:down": {
      const effectiveTool = activeTool;

      if (effectiveTool === "pan" || msg.button === 1) {
        // Middle-button drag is always pan
        dragMode = "pan";
        isDragging = true;
        panStartCssX = msg.x;
        panStartCssY = msg.y;
        panStartCamX = camX;
        panStartCamY = camY;
        break;
      }

      // Select tool: hit-test at pointer position
      if (sceneGraph) {
        const [wx, wy] = cssToWorld(msg.x, msg.y);
        const hitId = sceneGraph.hit_test(wx, wy);

        if (hitId >= 0) {
          setSelection(hitId);
          const bounds = sceneGraph.get_node_bounds(hitId);
          if (bounds.length >= 4) {
            dragMode = "move";
            isDragging = true;
            moveStartWorldX = wx;
            moveStartWorldY = wy;
            moveStartBoundsX = bounds[0];
            moveStartBoundsY = bounds[1];
          }
        } else {
          setSelection(null);
          dragMode = null;
          isDragging = false;
        }
      }
      break;
    }

    case "pointer:move": {
      if (!isDragging || dragMode === null) break;

      if (dragMode === "pan") {
        // Camera moves opposite to drag direction
        const physDx = (msg.x - panStartCssX) * dpr;
        const physDy = (msg.y - panStartCssY) * dpr;
        camX = panStartCamX - physDx / zoom;
        camY = panStartCamY - physDy / zoom;
        notifyViewport();
        break;
      }

      if (dragMode === "move" && sceneGraph && selectedId !== null) {
        const [wx, wy] = cssToWorld(msg.x, msg.y);
        sceneGraph.set_node_position(
          selectedId,
          moveStartBoundsX + (wx - moveStartWorldX),
          moveStartBoundsY + (wy - moveStartWorldY)
        );
        break;
      }
      break;
    }

    case "pointer:up": {
      isDragging = false;
      dragMode = null;
      break;
    }

    // ── Wheel ────────────────────────────────────────────────────────────────

    case "wheel:scroll": {
      if (msg.modifiers.ctrl) {
        // Ctrl+scroll → zoom centred on cursor
        // deltaY: negative = scroll up = zoom in (positive factor > 1)
        const factor = Math.exp(-msg.deltaY * 0.001);
        zoomOnCursor(factor, msg.x, msg.y);
      } else {
        // Bare scroll → pan (world units proportional to 1/zoom)
        const speed = 1.0 / zoom;
        camX += msg.deltaX * speed;
        camY += msg.deltaY * speed;
      }
      notifyViewport();
      break;
    }

    // ── Keyboard ─────────────────────────────────────────────────────────────

    case "key:down": {
      if (msg.key === "Escape") {
        setSelection(null);
      }
      break;
    }

    default:
      break;
  }
};
