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
import { buildDrawPlan, pathTranslate, readColor, RECORD } from "./drawPlan";
import { MESH_UNIFORM_STRIDE, writeMeshUniform } from "./meshPipeline";
import {
  repairBudgetMs,
  repairWithinBudget,
  toleranceBucket,
  worldTolerance,
  type GpuMesh,
  type RepairCandidate,
} from "./meshCache";
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

  const plan = buildDrawPlan(state.renderList);
  const uniforms = new Float32Array((MESH_UNIFORM_STRIDE / 4) * countPathDraws(plan));
  let slot = 0;

  for (const item of plan) {
    if (item.kind === "sdf") {
      pass.setPipeline(state.gpuPipeline);
      pass.setBindGroup(0, state.bindGroup);
      // firstInstance offsets WGSL's instance_index, so a run draws its
      // own slice of the shape buffer with the shader untouched
      // (ADR-032 Decision 1).
      pass.draw(6, item.count, 0, item.start);
      continue;
    }

    const entry = state.meshCache.touch(item.engineId, state.frameNumber);
    const parts = [entry?.fill, entry?.stroke];
    if (!entry || (!parts[0] && !parts[1])) continue; // missing: skip the draw

    writeMeshUniform(
      uniforms,
      slot,
      pathTranslate(state.renderList, item.recordIndex),
      readColor(state.renderList, item.recordIndex, RECORD.fillR)
    );
    drawMesh(state, pass, parts[0], slot);
    slot += 1;

    if (parts[1]) {
      writeMeshUniform(
        uniforms,
        slot,
        pathTranslate(state.renderList, item.recordIndex),
        readColor(state.renderList, item.recordIndex, RECORD.strokeR)
      );
      drawMesh(state, pass, parts[1], slot);
      slot += 1;
    }
  }

  if (state.selectedId !== null && state.selectionBG) {
    pass.setPipeline(state.gpuPipeline);
    pass.setBindGroup(0, state.selectionBG);
    pass.draw(6, 1);
  }

  pass.end();
  // Uniforms are written before submit but after the pass records its
  // draws: WebGPU resolves buffer contents at submit, not at encode, so
  // one write of the whole ring is correct and cheaper than one per draw.
  if (slot > 0 && state.meshUniformBuffer) {
    state.gpuDevice.queue.writeBuffer(
      state.meshUniformBuffer,
      0,
      uniforms,
      0,
      slot * (MESH_UNIFORM_STRIDE / 4)
    );
  }
  state.gpuDevice.queue.submit([encoder.finish()]);
  state.frameNumber += 1;
  state.meshCache.evictToFit(state.frameNumber);
  return performance.now() - t0;
}

/** Path draws in a plan, each needing up to two uniform slots. */
function countPathDraws(plan: readonly { kind: string }[]): number {
  return plan.filter((item) => item.kind === "path").length * 2;
}

/** Binds one mesh part at its uniform slot and draws it. */
function drawMesh(
  state: EngineState,
  pass: GPURenderPassEncoder,
  mesh: GpuMesh | null | undefined,
  slot: number
): void {
  if (!mesh || !state.meshPipeline || !state.meshBindGroup) return;
  pass.setPipeline(state.meshPipeline);
  pass.setBindGroup(0, state.meshBindGroup, [slot * MESH_UNIFORM_STRIDE]);
  pass.setVertexBuffer(0, mesh.vertexBuffer);
  pass.setIndexBuffer(mesh.indexBuffer, "uint32");
  pass.drawIndexed(mesh.indexCount);
}

/**
 * Brings the mesh cache into step with the frame's paths: tessellates
 * what is missing or stale, largest-on-screen first, within the frame's
 * budget (ADR-032 §4). Stale entries stay drawable meanwhile, so a
 * bucket-crossing zoom degrades in quality for a frame or two rather than
 * stalling one.
 *
 * Called before `renderFrame` rather than inside it: repair uploads
 * buffers and calls into WASM, and a render pass that also allocates is
 * the kind of thing that becomes hard to reason about the moment anything
 * else is added to the frame.
 */
export function repairMeshes(state: EngineState): void {
  const graph = state.sceneGraph;
  const device = state.gpuDevice;
  if (!graph || !device) return;

  const bucket = toleranceBucket(state.zoom, state.dpr);
  const candidates: RepairCandidate[] = [];
  for (const item of buildDrawPlan(state.renderList)) {
    if (item.kind !== "path") continue;
    const status = state.meshCache.status(item.engineId, item.version, bucket);
    if (status === "fresh") continue;
    const base = item.recordIndex * 16;
    const w = state.renderList[base + 2] ?? 0;
    const h = state.renderList[base + 3] ?? 0;
    candidates.push({
      engineId: item.engineId,
      version: item.version,
      bucket,
      area: w * h * state.zoom * state.zoom,
    });
  }
  if (candidates.length === 0) return;

  const budget = repairBudgetMs(performance.now(), state.lastInputAt);
  repairWithinBudget(
    candidates,
    budget,
    () => performance.now(),
    (candidate) => {
      const tolerance = worldTolerance(candidate.bucket);
      const fill = uploadPart(state, candidate.engineId, 0, tolerance);
      const stroke = uploadPart(state, candidate.engineId, 1, tolerance);
      if (!fill && !stroke) return;
      state.meshCache.set(candidate.engineId, {
        version: candidate.version,
        bucket: candidate.bucket,
        fill,
        stroke,
        bytes: (fill?.bytes ?? 0) + (stroke?.bytes ?? 0),
        lastUsedFrame: state.frameNumber,
      });
    }
  );
}

/**
 * Tessellates one part and uploads it. Returns `null` when the part is
 * degenerate — an unstroked path, a zero-area fill — which is a
 * classification from the geometry crate, not an error: the caller simply
 * has nothing to draw for that part.
 *
 * The handle is freed in a `finally`, so a throw between tessellation and
 * upload cannot leak WASM-side memory.
 */
function uploadPart(
  state: EngineState,
  engineId: number,
  part: number,
  tolerance: number
): GpuMesh | null {
  const graph = state.sceneGraph;
  const device = state.gpuDevice;
  if (!graph || !device) return null;

  const handle = graph.tessellate_path(engineId, part, tolerance);
  if (handle === INVALID_HANDLE) return null;
  try {
    const positions = graph.mesh_positions(handle);
    const indices = graph.mesh_indices(handle);
    if (indices.length === 0) return null;

    const vertexBuffer = device.createBuffer({
      label: `mesh-v${String(engineId)}-${String(part)}`,
      size: positions.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    const indexBuffer = device.createBuffer({
      label: `mesh-i${String(engineId)}-${String(part)}`,
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, positions);
    device.queue.writeBuffer(indexBuffer, 0, indices);
    return {
      vertexBuffer,
      indexBuffer,
      indexCount: indices.length,
      bytes: positions.byteLength + indices.byteLength,
    };
  } finally {
    graph.mesh_free(handle);
  }
}

/** `u32::MAX` — the engine's "no handle" sentinel (mesh_store.rs). */
const INVALID_HANDLE = 0xffff_ffff;
