/**
 * Shared mutable state for the engine worker.
 *
 * ARCH-03: `engine.worker.ts` was a single 719-line file mixing GPU setup,
 * the render loop, camera math, scene/document management, and input
 * handling — all coordinated through ~25 module-level `let` bindings.
 * That made the file impossible to review as independent units and meant
 * every new feature grew the same file further.
 *
 * The split keeps the *coordination* model simple rather than introducing
 * getters/setters or an event bus: `EngineState` is one mutable object,
 * passed by reference into each extracted module's functions. JS objects
 * are reference types, so `state.camX = ...` inside `camera.ts` is visible
 * to every other module holding the same `state` — there is no behavioural
 * difference from the original module-level `let`s, only a difference in
 * *where the declarations live*. This matches the report's own correct
 * recommendation: "None share mutable state directly — pass state through
 * typed function parameters."
 */

import type { SceneGraph } from "@graphite/engine";
import { DEFAULT_CAMERA } from "@graphite/protocol";
import type { DocumentModel } from "../../document/model";

export type Tool = "select" | "pan";
export type DragMode = "pan" | "move" | null;

export interface EngineState {
  // ── GPU resources ────────────────────────────────────────────────────────
  gpuCanvas: OffscreenCanvas | null;
  gpuDevice: GPUDevice | null;
  gpuContext: GPUCanvasContext | null;
  gpuPipeline: GPURenderPipeline | null;
  cameraBuffer: GPUBuffer | null;
  shapeBuffer: GPUBuffer | null;
  selectionBuffer: GPUBuffer | null;
  bindGroup: GPUBindGroup | null;
  selectionBG: GPUBindGroup | null;
  canvasFormat: GPUTextureFormat;

  // ── Scene / document ─────────────────────────────────────────────────────
  sceneGraph: SceneGraph | null;
  docModel: DocumentModel | null;
  shapeCount: number;
  /** Bidirectional UUID ↔ arena-ID mapping, rebuilt on every scene rebuild. */
  uuidToEngineId: Map<string, number>;
  engineIdToUuid: Map<number, string>;

  // ── Camera (world coordinates, Y-down) ──────────────────────────────────
  camX: number;
  camY: number;
  zoom: number;
  /** Physical pixels — updated on engine:resize. */
  vpW: number;
  vpH: number;
  dpr: number;

  // ── Interaction ──────────────────────────────────────────────────────────
  activeTool: Tool;
  dragMode: DragMode;
  isDragging: boolean;
  panStartCssX: number;
  panStartCssY: number;
  panStartCamX: number;
  panStartCamY: number;
  moveStartWorldX: number;
  moveStartWorldY: number;
  moveStartBoundsX: number;
  moveStartBoundsY: number;
  /** SceneGraph arena id of the selected node, or `null` if none. */
  selectedId: number | null;
  /** Document UUID of the selected node, or `null` if none. */
  selectedUuid: string | null;

  // ── Render loop ──────────────────────────────────────────────────────────
  running: boolean;
  frameNumber: number;
  lastTick: number;
}

/** Constructs the worker's initial state. Camera defaults come from the
 * single source of truth in `@graphite/protocol` (BUG-06) rather than a
 * locally duplicated literal. */
export function createInitialState(): EngineState {
  return {
    gpuCanvas: null,
    gpuDevice: null,
    gpuContext: null,
    gpuPipeline: null,
    cameraBuffer: null,
    shapeBuffer: null,
    selectionBuffer: null,
    bindGroup: null,
    selectionBG: null,
    canvasFormat: "bgra8unorm",

    sceneGraph: null,
    docModel: null,
    shapeCount: 0,
    uuidToEngineId: new Map(),
    engineIdToUuid: new Map(),

    camX: DEFAULT_CAMERA.x,
    camY: DEFAULT_CAMERA.y,
    zoom: DEFAULT_CAMERA.zoom,
    vpW: 800,
    vpH: 600,
    dpr: 1.0,

    activeTool: "select",
    dragMode: null,
    isDragging: false,
    panStartCssX: 0,
    panStartCssY: 0,
    panStartCamX: 0,
    panStartCamY: 0,
    moveStartWorldX: 0,
    moveStartWorldY: 0,
    moveStartBoundsX: 0,
    moveStartBoundsY: 0,
    selectedId: null,
    selectedUuid: null,

    running: false,
    frameNumber: 0,
    lastTick: 0,
  };
}
