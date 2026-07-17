// @vitest-environment jsdom
/**
 * useExport raster orchestration (Phase 7 M4b) — the main-thread path from a
 * confirmed ExportRequest to the files gateway, with the engine's
 * exportRaster (the GPU round-trip) and the files exportBlob both mocked.
 * The GPU readback itself is unit-untestable (no WebGPU in jsdom, exactly
 * like every gpu/** module); this pins the wiring around it.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { EngineContext } from "../contexts/EngineContext";
import { FilesContext, type FilesContextValue } from "../features/files/FilesProvider";
import { ExportProvider, useExport } from "../features/export/useExport";
import type { UseEngineResult } from "../hooks/useEngine";
import type { DocNode } from "@graphite/protocol";

const NODE: DocNode = {
  id: "r1",
  kind: "rect",
  name: "R",
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  fill: { r: 0, g: 0, b: 0, a: 255 },
  stroke: null,
  cornerRadius: 0,
  parent: null,
  children: [],
};

function mockEngine(over: Partial<UseEngineResult> = {}): UseEngineResult {
  return {
    nodes: [NODE],
    exportRaster: vi.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]))),
    // Everything else is unused by useExport; a Proxy keeps the literal small.
    ...over,
  } as unknown as UseEngineResult;
}

function mockFiles(exportBlob = vi.fn(() => Promise.resolve(true))): FilesContextValue {
  return { exportBlob, fileName: "Logo.graphite" } as unknown as FilesContextValue;
}

function wrapper(engine: UseEngineResult, files: FilesContextValue) {
  return ({ children }: { children: ReactNode }) => (
    <EngineContext.Provider value={engine}>
      <FilesContext.Provider value={files}>
        <ExportProvider>{children}</ExportProvider>
      </FilesContext.Provider>
    </EngineContext.Provider>
  );
}

describe("useExport raster orchestration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("PNG: round-trips through exportRaster, then hands PNG bytes to the gateway", async () => {
    const engine = mockEngine();
    const exportBlob = vi.fn(() => Promise.resolve(true));
    const { result } = renderHook(() => useExport(), {
      wrapper: wrapper(engine, mockFiles(exportBlob)),
    });

    act(() => {
      result.current.runExport({ format: "png", scale: 2, quality: 0.92 });
    });

    await waitFor(() => {
      expect(exportBlob).toHaveBeenCalledTimes(1);
    });
    // white background passed for flattening (PNG ignores it, but the
    // orchestration always supplies one)
    expect(engine.exportRaster).toHaveBeenCalledWith("png", 2, 0.92, {
      r: 255,
      g: 255,
      b: 255,
      a: 255,
    });
    const [blob, opts] = exportBlob.mock.calls[0] as unknown as [
      Blob,
      { suggestedName: string; mime: string },
    ];
    expect(blob.type).toBe("image/png");
    expect(opts.suggestedName).toBe("Logo.png"); // session name, extension swapped
    expect(opts.mime).toBe("image/png");
  });

  it("JPEG: names the file .jpg and carries the JPEG mime", async () => {
    const engine = mockEngine();
    const exportBlob = vi.fn(() => Promise.resolve(true));
    const { result } = renderHook(() => useExport(), {
      wrapper: wrapper(engine, mockFiles(exportBlob)),
    });

    act(() => {
      result.current.runExport({ format: "jpeg", scale: 3, quality: 0.7 });
    });

    await waitFor(() => {
      expect(exportBlob).toHaveBeenCalledTimes(1);
    });
    expect(engine.exportRaster).toHaveBeenCalledWith("jpeg", 3, 0.7, expect.anything());
    const [, opts] = exportBlob.mock.calls[0] as unknown as [
      Blob,
      { suggestedName: string; extension: string },
    ];
    expect(opts.suggestedName).toBe("Logo.jpg");
    expect(opts.extension).toBe(".jpg");
  });

  it("a rejected readback never reaches the gateway and does not throw", async () => {
    const engine = mockEngine({
      exportRaster: vi.fn(() => Promise.reject(new Error("readback failed"))),
    });
    const exportBlob = vi.fn(() => Promise.resolve(true));
    const { result } = renderHook(() => useExport(), {
      wrapper: wrapper(engine, mockFiles(exportBlob)),
    });

    act(() => {
      result.current.runExport({ format: "png", scale: 1, quality: 0.92 });
    });

    // Give the rejected promise a microtask to settle.
    await Promise.resolve();
    await Promise.resolve();
    expect(exportBlob).not.toHaveBeenCalled();
  });

  it("SVG path never touches exportRaster (pure main-thread serialize)", () => {
    const engine = mockEngine();
    const exportBlob = vi.fn(() => Promise.resolve(true));
    const { result } = renderHook(() => useExport(), {
      wrapper: wrapper(engine, mockFiles(exportBlob)),
    });

    act(() => {
      result.current.runExport({ format: "svg", scale: 1, quality: 0.92 });
    });

    expect(engine.exportRaster).not.toHaveBeenCalled();
    expect(exportBlob).toHaveBeenCalledTimes(1);
  });

  it("an empty document is a no-op guard even if a request slips through", () => {
    const engine = mockEngine({ nodes: [] });
    const exportBlob = vi.fn(() => Promise.resolve(true));
    const { result } = renderHook(() => useExport(), {
      wrapper: wrapper(engine, mockFiles(exportBlob)),
    });

    expect(result.current.hasContent).toBe(false);
    act(() => {
      result.current.runExport({ format: "png", scale: 2, quality: 0.92 });
    });
    expect(engine.exportRaster).not.toHaveBeenCalled();
    expect(exportBlob).not.toHaveBeenCalled();
  });
});
