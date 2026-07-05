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
import { configureContext, initWebGPU } from "./engine/gpu/context";
import {
  rebuildMainBindGroup,
  rebuildSelectionBindGroup,
  updateCameraUniform,
  uploadRenderList,
} from "./engine/gpu/buffers";
import { startRenderLoop } from "./engine/gpu/render";
import { buildDemoScene } from "./engine/scene/demo";
import { rebuildSceneFromDocument } from "./engine/scene/rebuild";
import { applyNodePatch, postDocumentNodes } from "./engine/scene/mutate";
import { handleWheel, notifyViewport } from "./engine/camera";
import { handlePointerDown, handlePointerMove, handlePointerUp } from "./engine/input/pointer";
import { handleKeyDown } from "./engine/input/keyboard";
import { setSelection } from "./engine/selection";

const state = createInitialState();

/** Serialises the current document and posts it, if one exists. Used by
 * document:new / document:load / document:request_save — all three end
 * with "tell the main thread the canonical document state". */
function postDocumentState(): void {
  if (state.docModel) post({ type: "document:state", json: state.docModel.serialize() });
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
      state.vpW = msg.width;
      state.vpH = msg.height;
      state.dpr = msg.devicePixelRatio;
      if (state.gpuCanvas) {
        state.gpuCanvas.width = msg.width;
        state.gpuCanvas.height = msg.height;
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
      break;
    }

    case "document:request_save": {
      postDocumentState();
      break;
    }

    // ── Tool ───────────────────────────────────────────────────────────────

    case "tool:set": {
      state.activeTool = msg.tool === "pan" ? "pan" : "select";
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
      handlePointerUp(state);
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

    default:
      break;
  }
};
