import { SHADER_WGSL } from "./shader";

/**
 * Compiles the shape shader and constructs the render pipeline.
 *
 * Throws if the WGSL fails to compile — the caller (`context.ts`) lets this
 * propagate up to `engine.worker.ts`'s `engine:init` handler, which reports
 * it as an `engine:error` IPC message rather than crashing the worker.
 */
export async function buildPipeline(
  device: GPUDevice,
  format: GPUTextureFormat
): Promise<GPURenderPipeline> {
  const shaderModule = device.createShaderModule({ label: "shape-shader", code: SHADER_WGSL });
  const info = await shaderModule.getCompilationInfo();
  for (const msg of info.messages) {
    if (msg.type === "error") {
      throw new Error(`WGSL error at ${msg.lineNum}: ${msg.message}`);
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

  // Explicit blend state — required for semi-transparent fills and the
  // selection overlay (transparent fill + opaque stroke).
  const blend: GPUBlendState = {
    color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
    alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
  };

  return device.createRenderPipeline({
    label: "shape-pipeline",
    layout: device.createPipelineLayout({ label: "shape-pl", bindGroupLayouts: [bgl] }),
    vertex: { module: shaderModule, entryPoint: "vs" },
    fragment: { module: shaderModule, entryPoint: "fs", targets: [{ format, blend }] },
    primitive: { topology: "triangle-list", cullMode: "none" },
  });
}
