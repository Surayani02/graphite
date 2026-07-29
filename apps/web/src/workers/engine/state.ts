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

import type { MsaaTarget } from "./gpu/targets";
import { MeshCache } from "./gpu/meshCache";
import type { SceneGraph } from "@graphite/engine";
import { DEFAULT_CAMERA, type ToolType } from "@graphite/protocol";
import type { DocumentModel } from "@graphite/document-model";
import { History } from "./history";

/**
 * Phase 6 M3: was a locally-narrowed `"select" | "pan"` that the tool:set
 * handler then had to collapse everything else onto — silently discarding
 * "rectangle"/"ellipse" even though the protocol has declared them since
 * Phase 0. `Tool` is now a straight alias of the protocol's own `ToolType`,
 * so the worker can never again disagree with the contract about which
 * tools exist; it only needs to decide which ones it *implements*
 * (see input/pointer.ts).
 */
export type Tool = ToolType;
export type DragMode = "pan" | "move" | "create" | null;

/**
 * In-progress rectangle/ellipse creation drag. `nodeId`/`engineId` are
 * `null` until the pointer crosses the movement threshold (see
 * scene/create.ts) — a plain click never allocates a throwaway node only
 * to resize it once; nothing is created until there's an actual drag, or
 * the drag ends (click = default size at the click point).
 */
export interface CreationDraft {
  readonly tool: "rectangle" | "ellipse";
  readonly frameId: string;
  readonly anchorX: number;
  readonly anchorY: number;
  /** Selection (node UUIDs) at gesture start — becomes the history
   *  entry's `selectionBefore` when the creation commits (Phase 7 M1). */
  readonly selectionBefore: readonly string[];
  nodeId: string | null;
  engineId: number | null;
}

export interface EngineState {
  // ── GPU resources ────────────────────────────────────────────────────────
  gpuCanvas: OffscreenCanvas | null;
  gpuDevice: GPUDevice | null;
  gpuContext: GPUCanvasContext | null;
  gpuPipeline: GPURenderPipeline | null;
  /** Shared multisampled colour target, resolved to the swap chain each
   *  frame; reallocated when the canvas size or format changes
   *  (ADR-032 §2). */
  msaaTarget: MsaaTarget | null;
  /** The frame's culled render list, retained so the draw planner can
   *  read it after upload (ADR-032 Decision 1). One reference, not a
   *  copy: the engine allocates a fresh array per cull. */
  renderList: Float32Array;
  /** Pipeline for tessellated path meshes (ADR-032 §7). */
  meshPipeline: GPURenderPipeline | null;
  /** Bind group serving every path draw, rebound per draw at a dynamic
   *  offset into `meshUniformBuffer`. */
  meshBindGroup: GPUBindGroup | null;
  /** Ring of 256-aligned per-draw uniform records. */
  meshUniformBuffer: GPUBuffer | null;
  /** Tessellated meshes by engine node id (ADR-032 §4). */
  meshCache: MeshCache;
  /** Timestamp of the last pointer or wheel input, for the repair budget. */
  lastInputAt: number;
  /** Dev-only: the scene came from the path fixture corpus, so
   *  scene-mutating input is suppressed (ADR-032 §5). */
  fixtureMode: boolean;
  /** rgba8unorm-targeted pipeline for raster export, built lazily on first
   *  export and cached (Phase 7 M4b) — the live pipeline targets the
   *  swap-chain's bgra8 format, unsuitable for a copyable export texture. */
  exportPipeline: GPURenderPipeline | null;
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
  /** Undo/redo stack — Phase 7 M1. Owned here (worker) because history
   *  entries reference document state the main thread never holds. */
  history: History;

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
  /** Non-null exactly while a rectangle/ellipse drag is in progress. */
  creation: CreationDraft | null;

  // ── Render loop ──────────────────────────────────────────────────────────
  running: boolean;
  /** Damage flag (ADR-025): anything visible changed since the last
   *  rendered frame. The loop pays nothing while this is false — no
   *  render-list fetch, no upload, no GPU submit. Starts true so the
   *  first frame always paints. */
  sceneDirty: boolean;
  /** Edge-trigger latch: whether frame:idle was already posted for the
   *  current clean stretch. Reset by markSceneDirty. */
  idleNotified: boolean;
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
    msaaTarget: null,
    renderList: new Float32Array(0),
    meshPipeline: null,
    meshBindGroup: null,
    meshUniformBuffer: null,
    meshCache: new MeshCache(),
    lastInputAt: 0,
    fixtureMode: false,
    exportPipeline: null,
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
    history: new History(),

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
    creation: null,

    running: false,
    sceneDirty: true,
    idleNotified: false,
    frameNumber: 0,
    lastTick: 0,
  };
}

/**
 * Marks the scene visibly changed (ADR-025). Every seam that mutates what
 * a frame would show calls this: the op funnel, direct drag writes,
 * camera pan/zoom, selection changes, scene rebuilds, creation previews,
 * and viewport resizes. Cheap enough to call redundantly — a spurious
 * mark costs one extra frame, a missing one costs a stale screen.
 */
export function markSceneDirty(state: EngineState): void {
  state.sceneDirty = true;
  state.idleNotified = false;
}
