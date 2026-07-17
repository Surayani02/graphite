# ADR-026: Export Architecture — Vector on the Main Thread, Raster off the GPU

- **Status:** Accepted
- **Date:** 2026-07-16
- **Phase:** 7, Milestone 4
- **Related:** ADR-021 (file layer / FileGateway), ADR-025 (damage model —
  the render pass export reuses), BLUEPRINT line 75 (export is the last
  unbuilt Phase-7 MVP capability)

## Context

Phase 7 is the MVP, and every other line-75 capability had shipped: file
save/load (M2), undo/redo (M1), dirty flags (M3). Export was the gap — a
tool you can draw and save in but cannot get an image out of is a demo, not
an MVP. M4 delivers three formats: **SVG** (vector) and **PNG + JPEG**
(raster).

The audit found the document model unusually well-suited to clean vector
export (a small set of world-space primitives, each mapping to one native
SVG element) and the renderer completely camera-parameterised off
`EngineState` — which decided the architecture.

## Decision 1 — SVG on the main thread, raster in the worker

These two exports are architecturally disjoint and live in different
layers, deliberately:

- **SVG is pure main-thread TypeScript** over the document snapshot the
  main thread already holds (`nodes`, kept live by the worker's
  `document:nodes` broadcasts). It needs no GPU, no engine state, and — the
  point — **no new worker code and no new protocol message.** It is a
  string builder, fully unit-testable, and lands entirely outside GPU-less
  CI's blind spot.
- **Raster is worker-side, because only the worker can touch the GPU.** It
  reuses the live renderer wholesale (same shader, same shape buffer, same
  camera-uniform and render-list upload), differing in exactly two
  contained ways: an owned `rgba8unorm` texture instead of the swap-chain,
  and the fit-to-content export camera instead of the interactive one.
  Readback is `copyTextureToBuffer` → `mapAsync` → `OffscreenCanvas.
convertToBlob`, which encodes **both PNG and JPEG natively in the
  worker** — the finding that made JPEG nearly free (identical readback,
  one `type` string differs).

Putting SVG in the worker "for symmetry" was rejected: it would bury a
CI-testable pure function behind the `@graphite/engine` import barrier that
keeps worker code out of Node tests. Symmetry is not worth losing
testability.

## Decision 2 — one framing rule, two consumers

Both formats frame content identically via `features/export/bounds.ts`:
`contentBounds` (stroke-aware — centre strokes extend the visual rect by
`width/2`, so exports never clip strokes) with a 2 % margin, and
`fitCamera` deriving the raster off-screen camera from the same bounds. A
golden test asserts the SVG `viewBox` and the raster camera frame the same
world rect, so vector and raster exports of one document always show the
same picture. The rule lives in one file precisely so the two paths cannot
drift.

## Decision 3 — reuse the render pass, don't re-implement it

Raster renders through the existing pipeline with the camera temporarily
swapped to the fit camera (restored in a `finally`, keeping export
reentrant and side-effect-free). A separate rgba8-targeted **export
pipeline** is built lazily and cached — the live pipeline targets the
swap-chain's bgra8 format, unsuitable for a copyable texture. What is
NOT reused: `renderFrame` itself, which targets `getCurrentTexture()` and
draws the selection overlay. A dedicated encoder for export (copyable
target, caller-chosen clear, no selection chrome) is clearer than
parameterising the 60 fps hot-path renderer with export concerns.

Re-drawing shapes on a Canvas2D context for raster was rejected outright:
it would mean a _second renderer_ that must match the WebGPU SDF output
pixel-for-pixel — the two-renderer trap. Reading back the real GPU output
guarantees the export matches what the user sees.

## Decision 4 — request/response protocol, promise-correlated

Raster adds one message pair: `export:raster:request { requestId, format,
scale, quality, background }` → `export:raster:result { requestId, format,
bytes }` or `export:error { requestId, message }`. The bytes transfer (not
structured-clone) across the boundary. The bridge models this as an
id-correlated promise map rather than the event surface — the caller
awaits bytes, and a slow export finishing after a newer one starts must
settle its own promise. This mirrors M2's `requestId`-correlated save.
JPEG's `quality` and the flattening `background` (JPEG has no alpha; the
worker composites onto the background, PNG keeps its own alpha) live in the
request.

## Decision 5 — FileGateway extension, not a parallel path

`saveBlobAs(blob, { suggestedName, description, mime, extension })` joins
the gateway interface, implemented in both the FSAA and download backends
(the download path's anchor-click logic, previously inline in `saveAs`, is
extracted to a shared `triggerDownload`). FilesProvider exposes it as
`exportBlob`, so the files domain keeps owning **all** disk I/O and export
failures surface through the same `fileError` channel as saves. A user
cancel at the picker is a normal `false`, not an error.

## Alternatives considered

- **A Rust/WASM PNG encoder** — rejected under the three-question test:
  `convertToBlob` is a built-in encoding both formats; a crate adds wasm
  size and a second code path for no MVP-scale benefit.
- **Viewport-only raster** (export what's on screen) — rejected as the
  default: it surprises users who expect their whole design. Fit-to-content
  is the default; a "current viewport" toggle is a documented future
  extension.
- **JPEG without a quality control** — rejected as a footgun; the control
  is one `convertToBlob` argument.
- **`<g>`-nested SVG mirroring the node tree** — rejected: the engine
  paints a flat explicit paint order that `<g>` nesting cannot always
  interleave; flat element output matches the renderer exactly. Grouping
  is a future extension.

## Consequences

- SVG export is resolution-independent and re-editable (Illustrator,
  Figma import, web embedding); PNG carries transparency; JPEG gives small
  photographic files. The MVP export story is complete.
- The GPU readback path is unit-untestable (no WebGPU in jsdom), exactly
  like every `gpu/**` module — covered by e2e's gate-zero contract and the
  main-thread orchestration tests around it. Correctness of the readback
  itself is verified on real hardware.
- `OffscreenCanvas.convertToBlob` + `ImageData` require a concrete
  `ArrayBuffer`-backed view (TS 6 `lib.dom` narrowing excludes
  `SharedArrayBuffer`); the unpad path allocates accordingly.
- The element-per-node SVG structure is the natural insertion point for
  future groups, text, and images; the bounds function already accepts a
  node subset, enabling future per-frame export.
- The 256-byte `bytesPerRow` alignment WebGPU requires for
  `copyTextureToBuffer` means the readback buffer is row-padded for
  non-multiple-of-64 widths and unpadded after mapping — contained in
  `gpu/export.ts`.
