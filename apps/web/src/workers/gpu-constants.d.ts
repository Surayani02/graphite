/**
 * WebGPU constant-namespace objects for the Worker scope.
 *
 * lib.webworker.d.ts declares WebGPU interface types but omits the
 * `declare var` forms for constant objects (GPUBufferUsage, GPUShaderStage,
 * etc.) that are globally available at runtime in Web Workers.
 *
 * This shim fills that gap. Phase 3 constants (GPUTextureUsage, GPUColorWrite)
 * are declared here now to avoid another error next phase.
 *
 * Remove this file when TypeScript closes the upstream gap.
 */

declare const GPUBufferUsage: {
  readonly MAP_READ: number;
  readonly MAP_WRITE: number;
  readonly COPY_SRC: number;
  readonly COPY_DST: number;
  readonly INDEX: number;
  readonly VERTEX: number;
  readonly UNIFORM: number;
  readonly STORAGE: number;
  readonly INDIRECT: number;
  readonly QUERY_RESOLVE: number;
};

declare const GPUShaderStage: {
  readonly VERTEX: number;
  readonly FRAGMENT: number;
  readonly COMPUTE: number;
};

declare const GPUTextureUsage: {
  readonly COPY_SRC: number;
  readonly COPY_DST: number;
  readonly TEXTURE_BINDING: number;
  readonly STORAGE_BINDING: number;
  readonly RENDER_ATTACHMENT: number;
};

declare const GPUMapMode: {
  readonly READ: number;
  readonly WRITE: number;
};

declare const GPUColorWrite: {
  readonly RED: number;
  readonly GREEN: number;
  readonly BLUE: number;
  readonly ALPHA: number;
  readonly ALL: number;
};
