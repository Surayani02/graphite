import type { Color, RasterFormat } from "@graphite/protocol";
import type { EngineState } from "../state";
import { contentBounds, fitCamera } from "../../../features/export/bounds";
import { buildPipeline } from "./pipeline";
import { updateCameraUniform, uploadRenderList, rebuildMainBindGroup } from "./buffers";

/**
 * Off-screen raster export — Phase 7 M4b (ADR-026).
 *
 * Reuses the live renderer wholesale: the same shader, the same shape
 * storage buffer, the same camera-uniform and render-list upload paths.
 * Only two things differ from an on-screen frame, and both are contained
 * here — (1) the color target is an owned `rgba8unorm` texture instead of
 * the swap-chain, and (2) the camera is temporarily the fit-to-content
 * export camera instead of the interactive one. Everything else is the
 * frame pipeline the user already sees, which is exactly why the export
 * matches the canvas.
 *
 * Deliberately NOT reusing `renderFrame`: that targets
 * `getCurrentTexture()` (swap-chain, bgra8, opaque) and draws the
 * selection overlay. Export needs a copy-able rgba8 target, a caller-
 * chosen clear color, and no selection chrome — a separate, self-contained
 * encoder is clearer than parameterising the hot-path renderer with export
 * concerns.
 */

const BYTES_PER_PIXEL = 4;
const COPY_ALIGN = 256; // WebGPU: bytesPerRow for copyTextureToBuffer must be 256-aligned.

/** Lazily builds (and caches) an rgba8unorm-targeted pipeline for export. The
 *  live pipeline targets the swap-chain's bgra8 format; convertToBlob wants
 *  straight rgba, and an owned texture is the cleanest way to get it. */
async function exportPipeline(state: EngineState): Promise<GPURenderPipeline> {
  if (state.exportPipeline) return state.exportPipeline;
  if (!state.gpuDevice) throw new Error("Export requires an initialised GPU device");
  state.exportPipeline = await buildPipeline(state.gpuDevice, "rgba8unorm");
  return state.exportPipeline;
}

interface Raster {
  readonly width: number;
  readonly height: number;
  /** Tightly-packed RGBA over a concrete ArrayBuffer (satisfies
   *  ImageDataArray), row stride === width*4 (copy padding removed). */
  readonly rgba: Uint8ClampedArray<ArrayBuffer>;
}

/**
 * Renders the whole document to a tightly-packed RGBA buffer at `scale`
 * device-pixels per world unit. Throws on an empty document (the caller
 * turns that into an export:error) — content bounds are undefined with no
 * nodes.
 */
async function renderToRgba(state: EngineState, scale: number): Promise<Raster> {
  const device = state.gpuDevice;
  if (!device || !state.sceneGraph || !state.docModel) {
    throw new Error("Export requires a running engine with a document");
  }

  const bounds = contentBounds(state.docModel.getNodesInOrder());
  if (bounds === null) throw new Error("Nothing to export — the document is empty");

  const cam = fitCamera(bounds, scale);
  const width = Math.max(1, cam.vpW);
  const height = Math.max(1, cam.vpH);

  const pipeline = await exportPipeline(state);

  // Swap the interactive camera for the fit camera, reusing the exact
  // uniform + render-list upload the live frame uses, then restore. The
  // render loop is not running during export (engine is idle when the user
  // triggers it), but restoring keeps this reentrant and side-effect-free.
  const saved = {
    camX: state.camX,
    camY: state.camY,
    zoom: state.zoom,
    vpW: state.vpW,
    vpH: state.vpH,
  };
  state.camX = cam.camX;
  state.camY = cam.camY;
  state.zoom = cam.zoom;
  state.vpW = width;
  state.vpH = height;

  const target = device.createTexture({
    label: "export-target",
    size: { width, height },
    format: "rgba8unorm",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });

  try {
    updateCameraUniform(state);
    uploadRenderList(state);
    // The live bind group references the shape buffer; uploadRenderList may
    // have grown+rebuilt it. Rebuild against the export pipeline's layout so
    // the group is valid for THIS pipeline regardless.
    const bindGroup = device.createBindGroup({
      label: "export-bg",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: mustBuffer(state.cameraBuffer) } },
        { binding: 1, resource: { buffer: mustBuffer(state.shapeBuffer) } },
      ],
    });

    const bytesPerRow = align(width * BYTES_PER_PIXEL, COPY_ALIGN);
    const readback = device.createBuffer({
      label: "export-readback",
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const encoder = device.createCommandEncoder({ label: "export-encoder" });
    const pass = encoder.beginRenderPass({
      label: "export-pass",
      colorAttachments: [
        {
          view: target.createView(),
          // Transparent clear: PNG keeps it; JPEG flattening happens at
          // encode time against the caller's background, so the raster
          // itself is always the honest alpha-correct image.
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6, state.shapeCount);
    pass.end();

    encoder.copyTextureToBuffer(
      { texture: target },
      { buffer: readback, bytesPerRow, rowsPerImage: height },
      { width, height }
    );
    device.queue.submit([encoder.finish()]);

    await readback.mapAsync(GPUMapMode.READ);
    const padded = new Uint8Array(readback.getMappedRange());
    const rgba = unpadRows(padded, width, height, bytesPerRow);
    readback.unmap();
    readback.destroy();
    target.destroy();

    return { width, height, rgba };
  } finally {
    state.camX = saved.camX;
    state.camY = saved.camY;
    state.zoom = saved.zoom;
    state.vpW = saved.vpW;
    state.vpH = saved.vpH;
    updateCameraUniform(state);
    // Restore the interactive bind group (uploadRenderList/grow may have
    // pointed state.bindGroup at a buffer sized for the export frame).
    rebuildMainBindGroup(state);
  }
}

/**
 * Full export: render → encode. Returns the encoded file bytes for
 * `format`. JPEG flattens onto `background` (no alpha channel) at `quality`;
 * PNG ignores both beyond keeping its own alpha.
 */
export async function exportRaster(
  state: EngineState,
  format: RasterFormat,
  scale: number,
  quality: number,
  background: Color
): Promise<Uint8Array> {
  const { width, height, rgba } = await renderToRgba(state, scale);

  // The rendered RGBA goes onto a source canvas via putImageData (which,
  // by spec, replaces pixels wholesale and ignores any prior fill or
  // compositing mode — so background flattening cannot happen on this
  // canvas). PNG encodes it directly, alpha preserved.
  const source = new OffscreenCanvas(width, height);
  const sctx = source.getContext("2d");
  if (!sctx) throw new Error("Failed to get 2D context for export encoding");
  sctx.putImageData(new ImageData(rgba, width, height), 0, 0);

  if (format === "png") {
    const blob = await source.convertToBlob({ type: "image/png" });
    return new Uint8Array(await blob.arrayBuffer());
  }

  // JPEG has no alpha channel. Composite the image over the opaque
  // background on a second canvas using drawImage (which DOES honour the
  // prior fill), so semi-transparent pixels blend onto the chosen colour
  // rather than defaulting to black.
  const flat = new OffscreenCanvas(width, height);
  const fctx = flat.getContext("2d");
  if (!fctx) throw new Error("Failed to get 2D context for JPEG flattening");
  fctx.fillStyle = `rgb(${String(background.r)},${String(background.g)},${String(background.b)})`;
  fctx.fillRect(0, 0, width, height);
  fctx.drawImage(source, 0, 0);
  const blob = await flat.convertToBlob({ type: "image/jpeg", quality });
  return new Uint8Array(await blob.arrayBuffer());
}

function align(n: number, to: number): number {
  return Math.ceil(n / to) * to;
}

function unpadRows(
  padded: Uint8Array,
  width: number,
  height: number,
  bytesPerRow: number
): Uint8ClampedArray<ArrayBuffer> {
  const tight = width * BYTES_PER_PIXEL;
  // Back the result with a concrete ArrayBuffer (not ArrayBufferLike) so the
  // element type satisfies lib.dom's ImageDataArray, which excludes
  // SharedArrayBuffer-backed views (TS 6 narrowing).
  const out = new Uint8ClampedArray(new ArrayBuffer(tight * height));
  for (let row = 0; row < height; row++) {
    out.set(padded.subarray(row * bytesPerRow, row * bytesPerRow + tight), row * tight);
  }
  return out;
}

function mustBuffer(buffer: GPUBuffer | null): GPUBuffer {
  if (!buffer) throw new Error("Export requires initialised GPU buffers");
  return buffer;
}
