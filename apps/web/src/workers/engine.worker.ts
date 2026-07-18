/**
 * Engine Worker — entry point.
 *
 * ARCH-03: this file used to be a single 719-line module mixing WebGPU
 * setup, shader source, the render loop, camera math, scene/document
 * management, and input handling. It has been split into focused modules
 * under `engine/` (each under ~150 lines, single responsibility); this
 * file is now only the IPC message switch and the top-level sequencing of
 * "what happens on engine:init" / "what happens on document:load" — the
 * orchestration, not the implementation.
 *
 * All mutable engine state lives in one `EngineState` object (`engine/state.ts`),
 * passed by reference into each extracted module's functions. See that
 * file's doc comment for why this shape was chosen over a class or an
 * event bus.
 */

import init, { version } from "@graphite/engine";
import type { MainToEngineMessage } from "@graphite/protocol";
import { DocumentModel } from "../document/model";
import { createInitialState } from "./engine/state";
import { post, toErrorMsg } from "./engine/messaging";
import {
  DEFAULT_MAX_TEXTURE_DIM,
  clampCanvasSize,
  configureContext,
  initWebGPU,
} from "./engine/gpu/context";
import {
  rebuildMainBindGroup,
  rebuildSelectionBindGroup,
  updateCameraUniform,
  uploadRenderList,
} from "./engine/gpu/buffers";
import { startRenderLoop } from "./engine/gpu/render";
import { exportRaster } from "./engine/gpu/export";
import { buildDemoScene } from "./engine/scene/demo";
import { buildStressScene } from "./engine/scene/stress";
import { rebuildSceneFromDocument } from "./engine/scene/rebuild";
import { postDocumentNodes } from "./engine/scene/mutate";
import {
  applyNodePatch,
  markHistorySaved,
  redoEdit,
  resetHistory,
  undoEdit,
} from "./engine/scene/apply";
import { handleWheel, notifyViewport } from "./engine/camera";
import { handlePointerDown, handlePointerMove, handlePointerUp } from "./engine/input/pointer";
import { handleKeyDown } from "./engine/input/keyboard";
import { setSelection } from "./engine/selection";
import { deleteSelection } from "./engine/scene/remove";
import { markSceneDirty } from "./engine/state";

const state = createInitialState();

// M5-FR1: one warning per worker lifetime — a clamped resize repeats on
// every observer tick while the layout bug persists; the first is signal,
// the rest are noise.
let resizeClampWarned = false;

/** Serialises the current document and posts it, if one exists. Used by
 * document:new / document:load / document:request_save — all three end
 * with "tell the main thread the canonical document state". A request_save
 * passes its `requestId` through so the main thread can correlate the
 * answer with the file save that asked for it (Phase 7 M2). */
function postDocumentState(requestId?: string): void {
  if (!state.docModel) return;
  if (requestId !== undefined) {
    post({ type: "document:state", json: state.docModel.serialize(), requestId });
  } else {
    post({ type: "document:state", json: state.docModel.serialize() });
  }
}

self.onmessage = async (event: MessageEvent<MainToEngineMessage>): Promise<void> => {
  const msg = event.data;

  switch (msg.type) {
    // ── Lifecycle ──────────────────────────────────────────────────────────

    case "engine:init": {
      state.gpuCanvas = msg.canvas;
      state.dpr = msg.devicePixelRatio;
      try {
        await init();
        // eslint-disable-next-line no-console
        console.info(`[engine] WASM ready — graphite-engine v${version()}`);

        await initWebGPU(state, msg.canvas);
        rebuildMainBindGroup(state);
        rebuildSelectionBindGroup(state);

        updateCameraUniform(state);
        startRenderLoop(state);
        // Scene is intentionally not built here — the main thread responds
        // with document:new or document:load once it has checked localStorage.
        post({ type: "engine:ready" });
      } catch (err) {
        post(toErrorMsg(err));
      }
      break;
    }

    case "engine:resize": {
      markSceneDirty(state); // viewport change moves the cull frustum
      // M5-FR1: never configure a swap-chain the device cannot allocate.
      // The AppShell containment fix removes the layout path that produced
      // a 300k-px canvas; this guard turns any future layout regression
      // into a clamped-but-alive canvas (visually stretched, loudly
      // warned) instead of a dead pipeline spamming validation errors.
      // vpW/vpH take the clamped values too — camera NDC math and the
      // backing store must agree.
      const maxDim = state.gpuDevice?.limits.maxTextureDimension2D ?? DEFAULT_MAX_TEXTURE_DIM;
      const size = clampCanvasSize(msg.width, msg.height, maxDim);
      if (size.clamped && !resizeClampWarned) {
        resizeClampWarned = true;
        console.warn(
          `[graphite] engine:resize ${String(msg.width)}×${String(msg.height)} is outside ` +
            `the device's allocatable range (max ${String(maxDim)} px) — clamped to ` +
            `${String(size.width)}×${String(size.height)}. This indicates a shell layout bug.`
        );
      }
      state.vpW = size.width;
      state.vpH = size.height;
      state.dpr = msg.devicePixelRatio;
      if (state.gpuCanvas) {
        state.gpuCanvas.width = size.width;
        state.gpuCanvas.height = size.height;
        configureContext(state);
      }
      break;
    }

    // ── Document ───────────────────────────────────────────────────────────

    case "document:new": {
      buildDemoScene(state);
      rebuildSceneFromDocument(state);
      updateCameraUniform(state);
      uploadRenderList(state);
      notifyViewport(state);
      postDocumentState();
      postDocumentNodes(state);
      resetHistory(state);
      break;
    }

    case "document:load": {
      try {
        state.docModel = DocumentModel.fromJson(msg.json);
      } catch (err) {
        // Corrupt / structurally-invalid JSON (see document/validate.ts) —
        // fall back to the demo scene rather than leaving the canvas blank.
        console.error("[engine] document:load failed — falling back to demo scene:", err);
        buildDemoScene(state);
      }
      rebuildSceneFromDocument(state);
      updateCameraUniform(state);
      uploadRenderList(state);
      notifyViewport(state);
      // Echo back so the main thread's localStorage copy matches whatever
      // was actually loaded (including the demo-scene fallback above).
      postDocumentState();
      postDocumentNodes(state);
      resetHistory(state);
      break;
    }

    case "document:request_save": {
      // Serialisation only. Marking saved moved behind document:mark_saved
      // in M2: the main thread may be about to show a save picker the user
      // cancels, and a cancelled save must leave the document dirty.
      postDocumentState(msg.requestId);
      break;
    }

    case "export:raster:request": {
      // Async GPU readback: render off-screen, encode, transfer bytes back.
      // Any failure (empty doc, readback, encode) is reported as
      // export:error against the same requestId so the awaiting main-thread
      // promise settles rather than hanging.
      void exportRaster(state, msg.format, msg.scale, msg.quality, msg.background)
        .then((bytes) => {
          post(
            {
              type: "export:raster:result",
              requestId: msg.requestId,
              format: msg.format,
              bytes,
            },
            [bytes.buffer]
          );
        })
        .catch((err: unknown) => {
          post({
            type: "export:error",
            requestId: msg.requestId,
            message: err instanceof Error ? err.message : String(err),
          });
        });
      break;
    }

    // ── Tool ───────────────────────────────────────────────────────────────

    case "tool:set": {
      // Phase 6 M3: was `msg.tool === "pan" ? "pan" : "select"`, silently
      // discarding rectangle/ellipse — Tool is now a straight ToolType
      // alias (state.ts), so there is nothing left to collapse.
      state.activeTool = msg.tool;
      break;
    }

    // ── Pointer ────────────────────────────────────────────────────────────

    case "pointer:down": {
      handlePointerDown(state, msg.x, msg.y, msg.button, msg.modifiers);
      break;
    }

    case "pointer:move": {
      handlePointerMove(state, msg.x, msg.y, msg.modifiers);
      break;
    }

    case "pointer:up": {
      handlePointerUp(state, msg.x, msg.y, msg.modifiers);
      break;
    }

    // ── Wheel ──────────────────────────────────────────────────────────────

    case "wheel:scroll": {
      handleWheel(state, msg.deltaX, msg.deltaY, msg.x, msg.y, msg.modifiers.ctrl);
      break;
    }

    // ── Keyboard ───────────────────────────────────────────────────────────

    case "key:down": {
      handleKeyDown(state, msg.key);
      break;
    }

    // ── Phase 6 Milestone 2 ───────────────────────────────────────────────

    case "selection:set": {
      // Layers-panel click-to-select carries stable document UUIDs; resolve
      // to the ephemeral SceneGraph arena id and hand off to the same
      // setSelection() pointer-driven selection already uses, so both
      // paths update state.selectedId/selectedUuid identically and neither
      // can leave the other out of sync.
      const firstId = msg.nodeIds[0];
      const engineId = firstId !== undefined ? (state.uuidToEngineId.get(firstId) ?? null) : null;
      setSelection(state, engineId);
      break;
    }

    case "node:update": {
      applyNodePatch(state, msg.nodeId, msg.patch);
      break;
    }

    // ── Phase 6 Milestone 3 ───────────────────────────────────────────────

    case "document:delete_selection": {
      deleteSelection(state);
      break;
    }

    // ── Phase 7 Milestone 1 ───────────────────────────────────────────────

    case "history:undo": {
      undoEdit(state);
      break;
    }

    case "history:redo": {
      redoEdit(state);
      break;
    }

    // ── Phase 7 Milestone 2 ───────────────────────────────────────────────

    case "document:mark_saved": {
      markHistorySaved(state);
      break;
    }

    // ── Phase 7 Milestone 5 ───────────────────────────────────────────────

    case "debug:load_stress": {
      // Dev-only surface (ADR-027). `import.meta.env.DEV` is statically
      // false in production builds, so this whole body — and, via
      // tree-shaking, the generator module it references — is compiled
      // out: a handcrafted postMessage against a production tab is a
      // no-op, not a latent 100k-node self-DoS. In dev, the sequence
      // below is `document:new`'s, verbatim — the stress scene must
      // travel the exact pipeline the product uses (build → rebuild →
      // upload → broadcasts → history reset) or its numbers measure a
      // side channel instead of the app.
      if (import.meta.env.DEV) {
        buildStressScene(state, msg.count);
        rebuildSceneFromDocument(state);
        updateCameraUniform(state);
        uploadRenderList(state);
        notifyViewport(state);
        postDocumentState();
        postDocumentNodes(state);
        resetHistory(state);
        // One-line capture aid: the two User Timing measures, surfaced
        // without opening the Performance panel. Same console.info
        // precedent as the engine:init version banner above.
        const buildMs = performance.getEntriesByName("stress-build").at(-1)?.duration ?? 0;
        const rebuildMs = performance.getEntriesByName("scene-rebuild").at(-1)?.duration ?? 0;
        // eslint-disable-next-line no-console
        console.info(
          `[stress] ${String(msg.count)} nodes — build ${buildMs.toFixed(1)} ms, ` +
            `scene rebuild ${rebuildMs.toFixed(1)} ms`
        );
      }
      break;
    }

    default:
      break;
  }
};
