/**
 * Mesh pipeline contracts (ADR-032 §7). The pipeline object itself needs
 * a device, but three things that break silently on a real GPU are pure
 * data and tested here: the uniform record's layout, its alignment, and
 * the WGSL's agreement with both.
 */
import { describe, expect, it } from "vitest";
import { MESH_SHADER_WGSL } from "../workers/engine/gpu/meshShader";
import {
  MESH_UNIFORM_FLOATS,
  MESH_UNIFORM_INITIAL_SLOTS,
  MESH_UNIFORM_STRIDE,
  writeMeshUniform,
} from "../workers/engine/gpu/meshPipeline";

describe("mesh uniform layout", () => {
  it("keeps the stride at WebGPU's dynamic-offset alignment", () => {
    expect(MESH_UNIFORM_STRIDE % 256).toBe(0);
    expect(MESH_UNIFORM_FLOATS * 4).toBeLessThanOrEqual(MESH_UNIFORM_STRIDE);
  });

  it("writes transform, translate, and colour in the shader's field order", () => {
    const buffer = new Float32Array((MESH_UNIFORM_STRIDE / 4) * 2);
    writeMeshUniform(buffer, 0, [12, -34], [0.25, 0.5, 0.75, 1]);
    expect([...buffer.subarray(0, MESH_UNIFORM_FLOATS)]).toEqual([
      1,
      0,
      0,
      1, // 2×2 identity — M1 places paths by translation alone
      12,
      -34, // translate
      0,
      0, // pad
      0.25,
      0.5,
      0.75,
      1, // colour
    ]);
  });

  it("writes each slot at its own aligned offset without touching neighbours", () => {
    const buffer = new Float32Array((MESH_UNIFORM_STRIDE / 4) * 3);
    writeMeshUniform(buffer, 1, [5, 6], [1, 1, 1, 1]);
    const floatsPerSlot = MESH_UNIFORM_STRIDE / 4;
    expect(buffer[floatsPerSlot + 4]).toBe(5);
    expect(buffer[floatsPerSlot + 5]).toBe(6);
    expect(buffer.subarray(0, floatsPerSlot).every((v) => v === 0)).toBe(true);
    expect(buffer.subarray(floatsPerSlot * 2).every((v) => v === 0)).toBe(true);
  });

  it("sizes the initial ring generously but boundedly", () => {
    expect(MESH_UNIFORM_INITIAL_SLOTS * MESH_UNIFORM_STRIDE).toBe(256 * 1024);
  });
});

describe("mesh WGSL", () => {
  it("declares the camera at the same binding as the SDF shader", () => {
    expect(MESH_SHADER_WGSL).toContain("@group(0) @binding(0) var<uniform> camera : Camera");
  });

  it("takes the per-draw record as a uniform at binding 1", () => {
    expect(MESH_SHADER_WGSL).toContain("@group(0) @binding(1) var<uniform> draw   : DrawData");
  });

  it("declares DrawData fields in the order writeMeshUniform writes them", () => {
    const struct = /struct DrawData \{([^}]*)\}/.exec(MESH_SHADER_WGSL)?.[1] ?? "";
    const fields = [...struct.matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
    expect(fields).toEqual(["transform", "translate", "_pad", "color"]);
  });

  it("consumes a single vec2 vertex attribute at location 0", () => {
    expect(MESH_SHADER_WGSL).toContain("@location(0) local : vec2<f32>");
  });

  it("emits straight alpha, matching the SDF shader's convention", () => {
    expect(MESH_SHADER_WGSL).toContain("return draw.color;");
  });
});
