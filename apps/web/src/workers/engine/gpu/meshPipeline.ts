/**
 * Mesh render pipeline (Phase 8 M1, ADR-032 §7).
 *
 * Separate pipeline, shared target: the SDF pipeline draws instanced
 * quads with no vertex buffer, this one draws indexed triangle lists with
 * a `float32x2` vertex buffer, and no amount of shared code makes those
 * one pipeline. What they *do* share is the colour target, the blend
 * state, and the sample count — the three things that must agree for
 * paint-ordered compositing to work across both.
 */
import { MESH_SHADER_WGSL } from "./meshShader";
import { MSAA_SAMPLE_COUNT } from "./targets";

/** Bytes per per-draw uniform record: 4+2+2+4 floats = 48, padded to the
 *  256-byte dynamic-offset alignment WebGPU guarantees. */
export const MESH_UNIFORM_STRIDE = 256;

/** Floats actually written per record (the rest is alignment padding). */
export const MESH_UNIFORM_FLOATS = 12;

/** Maximum path draws per frame before the uniform ring is grown. Sized
 *  so the initial allocation is 256 kB — generous for M1's fixtures, and
 *  the buffer grows on demand rather than clamping the draw list. */
export const MESH_UNIFORM_INITIAL_SLOTS = 1024;

/** Vertex buffer layout: xy positions in the path's local frame, exactly
 *  as `graphite-geometry` emits them — no repacking between crates. */
const VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 8,
  attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
};

/**
 * Compiles the mesh shader and builds its pipeline plus bind-group layout.
 *
 * Throws on WGSL compilation errors, matching `buildPipeline`: the caller
 * lets it propagate to `engine:init`, which reports an `engine:error`
 * rather than leaving a half-initialised device behind.
 */
export async function buildMeshPipeline(
  device: GPUDevice,
  format: GPUTextureFormat
): Promise<{ pipeline: GPURenderPipeline; layout: GPUBindGroupLayout }> {
  const module = device.createShaderModule({ label: "mesh-shader", code: MESH_SHADER_WGSL });
  const info = await module.getCompilationInfo();
  for (const msg of info.messages) {
    if (msg.type === "error") {
      throw new Error(`Mesh WGSL error at ${msg.lineNum}: ${msg.message}`);
    }
  }

  const layout = device.createBindGroupLayout({
    label: "mesh-bgl",
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        // Dynamic offset: one bind group serves every path draw in the
        // frame, rebound at a new offset per draw. The alternative — a
        // bind group per path — would allocate per frame and defeat the
        // cache's purpose of making a steady-state frame allocation-free.
        buffer: { type: "uniform", hasDynamicOffset: true },
      },
    ],
  });

  // Identical to the SDF pipeline's blend state. Paths and shapes
  // composite into the same target in paint order, so a difference here
  // would show up as a seam between the two kinds.
  const blend: GPUBlendState = {
    color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
    alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
  };

  const pipeline = device.createRenderPipeline({
    label: "mesh-pipeline",
    layout: device.createPipelineLayout({ label: "mesh-pl", bindGroupLayouts: [layout] }),
    vertex: { module, entryPoint: "vs", buffers: [VERTEX_LAYOUT] },
    fragment: { module, entryPoint: "fs", targets: [{ format, blend }] },
    // Tessellated output has no consistent winding — lyon emits triangles
    // in whatever order the sweep produced — so culling must stay off.
    primitive: { topology: "triangle-list", cullMode: "none" },
    multisample: { count: MSAA_SAMPLE_COUNT },
  });

  return { pipeline, layout };
}

/** Writes one per-draw uniform record into `target` at `slot`. Exported
 *  for the frame builder and its tests; the layout must match
 *  `DrawData` in the shader exactly. */
export function writeMeshUniform(
  target: Float32Array,
  slot: number,
  translate: readonly [number, number],
  color: readonly [number, number, number, number]
): void {
  const base = slot * (MESH_UNIFORM_STRIDE / 4);
  // 2×2 identity — M1 places paths by translation alone (ADR-032 §7).
  target[base] = 1;
  target[base + 1] = 0;
  target[base + 2] = 0;
  target[base + 3] = 1;
  target[base + 4] = translate[0];
  target[base + 5] = translate[1];
  target[base + 6] = 0;
  target[base + 7] = 0;
  target[base + 8] = color[0];
  target[base + 9] = color[1];
  target[base + 10] = color[2];
  target[base + 11] = color[3];
}
