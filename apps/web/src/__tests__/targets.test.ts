/**
 * MSAA target lifecycle (ADR-032 Decision 2). The reallocation decision
 * and the attachment shape are pure logic over a device handle, so both
 * are testable against a stub — what cannot be tested here is what the
 * resolve looks like, which is Net 2's job.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createMsaaTarget,
  destroyMsaaTarget,
  ensureMsaaTarget,
  msaaAttachment,
  msaaBytes,
  MSAA_SAMPLE_COUNT,
} from "../workers/engine/gpu/targets";
import type { EngineState } from "../workers/engine/state";

// `GPUTextureUsage` is a browser global with no jsdom equivalent. Stubbed
// here rather than in the shared test setup: only GPU-resource tests need
// it, and a local stub keeps the flag values visible next to the
// assertions that read them.
vi.stubGlobal("GPUTextureUsage", { RENDER_ATTACHMENT: 0x10, COPY_SRC: 0x01 });

function stubDevice() {
  const created: GPUTextureDescriptor[] = [];
  const destroy = vi.fn();
  const device = {
    createTexture: (descriptor: GPUTextureDescriptor) => {
      created.push(descriptor);
      return { destroy, createView: () => ({ __view: true }) } as unknown as GPUTexture;
    },
  } as unknown as GPUDevice;
  return { device, created, destroy };
}

function stubState(device: GPUDevice, width: number, height: number): EngineState {
  return {
    gpuDevice: device,
    gpuCanvas: { width, height } as OffscreenCanvas,
    canvasFormat: "bgra8unorm",
    msaaTarget: null,
  } as unknown as EngineState;
}

describe("msaaBytes", () => {
  it("reports four samples of four bytes per device pixel", () => {
    expect(msaaBytes(1366, 768)).toBe(1366 * 768 * 4 * 4);
    expect(msaaBytes(1920, 1080) / 2 ** 20).toBeCloseTo(31.64, 1);
  });
});

describe("createMsaaTarget", () => {
  it("requests a multisampled render attachment", () => {
    const { device, created } = stubDevice();
    const target = createMsaaTarget(device, "bgra8unorm", 800, 600, "t");
    expect(created[0]).toMatchObject({
      size: { width: 800, height: 600 },
      format: "bgra8unorm",
      sampleCount: MSAA_SAMPLE_COUNT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    expect(target.width).toBe(800);
    expect(target.height).toBe(600);
  });
});

describe("ensureMsaaTarget", () => {
  it("allocates once and reuses while the canvas is unchanged", () => {
    const { device, created } = stubDevice();
    const state = stubState(device, 800, 600);
    const first = ensureMsaaTarget(state);
    const second = ensureMsaaTarget(state);
    expect(first).toBe(second);
    expect(created).toHaveLength(1);
  });

  it("reallocates and releases the old texture when the canvas resizes", () => {
    const { device, created, destroy } = stubDevice();
    const state = stubState(device, 800, 600);
    ensureMsaaTarget(state);
    (state.gpuCanvas as OffscreenCanvas).width = 1200;
    const next = ensureMsaaTarget(state);
    expect(created).toHaveLength(2);
    expect(destroy).toHaveBeenCalledOnce();
    expect(next?.width).toBe(1200);
  });

  it("reallocates when the swap-chain format changes", () => {
    const { device, created } = stubDevice();
    const state = stubState(device, 800, 600);
    ensureMsaaTarget(state);
    state.canvasFormat = "rgba8unorm";
    expect(ensureMsaaTarget(state)?.format).toBe("rgba8unorm");
    expect(created).toHaveLength(2);
  });

  it("clamps a zero-sized canvas rather than requesting an invalid texture", () => {
    const { device, created } = stubDevice();
    const state = stubState(device, 0, 0);
    ensureMsaaTarget(state);
    expect(created[0]?.size).toEqual({ width: 1, height: 1 });
  });

  it("returns null before the device or canvas exists", () => {
    const { device } = stubDevice();
    const noDevice = stubState(device, 800, 600);
    noDevice.gpuDevice = null;
    expect(ensureMsaaTarget(noDevice)).toBeNull();

    const noCanvas = stubState(device, 800, 600);
    noCanvas.gpuCanvas = null;
    expect(ensureMsaaTarget(noCanvas)).toBeNull();
  });

  it("destroyMsaaTarget releases and clears, and tolerates repeats", () => {
    const { device, destroy } = stubDevice();
    const state = stubState(device, 800, 600);
    ensureMsaaTarget(state);
    destroyMsaaTarget(state);
    expect(destroy).toHaveBeenCalledOnce();
    expect(state.msaaTarget).toBeNull();
    expect(() => {
      destroyMsaaTarget(state);
    }).not.toThrow();
  });
});

describe("msaaAttachment", () => {
  it("resolves to the destination and discards the multisampled contents", () => {
    const { device } = stubDevice();
    const target = createMsaaTarget(device, "bgra8unorm", 4, 4, "t");
    const resolveView = { __resolve: true } as unknown as GPUTextureView;
    const attachment = msaaAttachment(target, resolveView, { r: 0, g: 0, b: 0, a: 0 });
    expect(attachment.view).toBe(target.view);
    expect(attachment.resolveTarget).toBe(resolveView);
    expect(attachment.loadOp).toBe("clear");
    expect(attachment.storeOp).toBe("discard");
  });
});
