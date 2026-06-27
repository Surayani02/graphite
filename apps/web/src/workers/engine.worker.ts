/**
 * Engine Worker — Phase 1: Engine Shell
 *
 * Runs inside a dedicated Web Worker thread. Owns the GPUDevice,
 * GPUCanvasContext, and GPURenderPipeline for the lifetime of this worker.
 *
 * Render loop: self-driven via setTimeout — the main thread is never
 * involved in frame timing. Phase 4 will upgrade to a VSync-aware mechanism.
 */

import type { EngineToMainMessage, MainToEngineMessage } from "@graphite/protocol";
import { FRAME_BUDGET_MS } from "@graphite/protocol";

// ─── GPU state ──────────────────────────────────────────────────────────────

let gpuCanvas: OffscreenCanvas | null = null;
let gpuDevice: GPUDevice | null = null;
let gpuContext: GPUCanvasContext | null = null;
let gpuPipeline: GPURenderPipeline | null = null;
let canvasFormat: GPUTextureFormat = "bgra8unorm";

// ─── Loop state ─────────────────────────────────────────────────────────────

let running = false;
let frameNumber = 0;
let lastTick = 0;

// ─── WGSL shader ────────────────────────────────────────────────────────────

const SHADER_WGSL = /* wgsl */ `
struct VSOut {
  @builtin(position) pos   : vec4<f32>,
  @location(0)       color : vec4<f32>,
}

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>( 0.000,  0.600),
    vec2<f32>(-0.520, -0.300),
    vec2<f32>( 0.520, -0.300),
  );
  var col = array<vec4<f32>, 3>(
    vec4<f32>(0.18, 0.80, 1.00, 1.0),
    vec4<f32>(1.00, 0.18, 0.60, 1.0),
    vec4<f32>(1.00, 0.85, 0.18, 1.0),
  );
  var out: VSOut;
  out.pos   = vec4<f32>(pos[i], 0.0, 1.0);
  out.color = col[i];
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  return in.color;
}
`;

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── WebGPU initialisation ──────────────────────────────────────────────────

async function initWebGPU(offscreen: OffscreenCanvas): Promise<void> {
  if (!navigator.gpu) {
    throw new Error("WebGPU is not available. Use Chrome 113+ or enable the WebGPU flag.");
  }

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) {
    throw new Error("No WebGPU adapter found.");
  }

  const device = await adapter.requestDevice({ label: "graphite-device" });

  void device.lost.then((info) => {
    running = false;
    post({ type: "engine:error", message: `GPU device lost (${info.reason}): ${info.message}` });
  });

  // gpuCanvas is set in the message handler before this function is called.
  // Any engine:resize messages that arrived during the awaits above have
  // already updated gpuCanvas.width / gpuCanvas.height.
  gpuDevice = device;
  gpuContext = offscreen.getContext("webgpu") as GPUCanvasContext | null;

  if (!gpuContext) {
    throw new Error("Failed to get a WebGPU context from the OffscreenCanvas.");
  }

  canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  configureContext();

  gpuPipeline = await buildPipeline(device, canvasFormat);
}

function configureContext(): void {
  if (!gpuContext || !gpuDevice) return;
  gpuContext.configure({
    device: gpuDevice,
    format: canvasFormat,
    alphaMode: "premultiplied",
  });
}

async function buildPipeline(
  device: GPUDevice,
  format: GPUTextureFormat
): Promise<GPURenderPipeline> {
  const shaderModule = device.createShaderModule({ label: "triangle-shader", code: SHADER_WGSL });

  const info = await shaderModule.getCompilationInfo();
  for (const msg of info.messages) {
    if (msg.type === "error") {
      throw new Error(`WGSL compile error at line ${msg.lineNum}: ${msg.message}`);
    }
  }

  return device.createRenderPipeline({
    label: "triangle-pipeline",
    layout: "auto",
    vertex: { module: shaderModule, entryPoint: "vs" },
    fragment: { module: shaderModule, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "none" },
  });
}

// ─── Render ─────────────────────────────────────────────────────────────────

function renderFrame(): number {
  if (!gpuDevice || !gpuContext || !gpuPipeline) return 0;

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

  pass.setPipeline(gpuPipeline);
  pass.draw(3);
  pass.end();
  gpuDevice.queue.submit([encoder.finish()]);

  return performance.now() - t0;
}

// ─── Render loop ─────────────────────────────────────────────────────────────

function tick(): void {
  if (!running) return;

  const now = performance.now();
  const elapsed = now - lastTick;

  if (elapsed >= FRAME_BUDGET_MS) {
    lastTick = now;
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

// ─── Message handling ────────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<MainToEngineMessage>): Promise<void> => {
  const msg = event.data;

  switch (msg.type) {
    case "engine:init": {
      // Set gpuCanvas BEFORE awaiting initWebGPU.
      // The async awaits inside initWebGPU yield to the event loop, allowing
      // engine:resize messages to arrive and update the canvas dimensions
      // before getContext / configure are called.
      gpuCanvas = msg.canvas;

      try {
        await initWebGPU(msg.canvas);
        startRenderLoop();
        post({ type: "engine:ready" });
      } catch (err) {
        post(toErrorMsg(err));
      }
      break;
    }

    case "engine:resize": {
      if (gpuCanvas) {
        gpuCanvas.width = msg.width;
        gpuCanvas.height = msg.height;
        // Re-configure the swap-chain if the device is already ready.
        // If init is still in progress this is a no-op (guard inside configureContext).
        configureContext();
      }
      break;
    }

    default:
      break;
  }
};
