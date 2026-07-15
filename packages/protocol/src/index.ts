/**
 * @graphite/protocol
 *
 * Shared type definitions, IPC message schemas, and network protocol types.
 * Zero runtime dependencies. Importable in any JS environment.
 */

// ─── Branded primitives ──────────────────────────────────────────────────────

export type NodeId = string & { readonly __brand: "NodeId" };
export type DocumentId = string & { readonly __brand: "DocumentId" };
export type UserId = string & { readonly __brand: "UserId" };

export function createNodeId(): NodeId {
  return crypto.randomUUID() as NodeId;
}
export function createDocumentId(): DocumentId {
  return crypto.randomUUID() as DocumentId;
}

// ─── Node types ───────────────────────────────────────────────────────────────

export const NODE_TYPES = {
  FRAME: "frame",
  RECTANGLE: "rectangle",
  ELLIPSE: "ellipse",
  TEXT: "text",
  GROUP: "group",
  IMAGE: "image",
  VECTOR: "vector",
  COMPONENT: "component",
  COMPONENT_INSTANCE: "component_instance",
} as const;

export type NodeType = (typeof NODE_TYPES)[keyof typeof NODE_TYPES];

// ─── Tool types ───────────────────────────────────────────────────────────────

export const TOOL_TYPES = {
  SELECT: "select",
  PAN: "pan",
  RECTANGLE: "rectangle",
  ELLIPSE: "ellipse",
  TEXT: "text",
  PEN: "pen",
} as const;

export type ToolType = (typeof TOOL_TYPES)[keyof typeof TOOL_TYPES];

// ─── Color ────────────────────────────────────────────────────────────────────

/**
 * sRGB colour with straight alpha, each channel an integer in `[0, 255]`.
 * `255` is fully opaque / full intensity; `0` is fully transparent / none.
 *
 * This is the single canonical colour representation for the whole system —
 * it matches the `u8` representation the Rust engine uses at the WASM
 * boundary (`graphite-engine`'s `Color`) and the values the document model
 * stores and serialises. Do not introduce a second `Color`-shaped type with
 * a different scale (e.g. normalised `[0.0, 1.0]` floats); if a 0–1 float
 * tuple is ever needed for a specific GPU/shader call site, convert at that
 * call site rather than propagating a second ambiguous type through the
 * codebase.
 */
export interface Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export const COLOR_BLACK: Color = Object.freeze({ r: 0, g: 0, b: 0, a: 255 });
export const COLOR_WHITE: Color = Object.freeze({ r: 255, g: 255, b: 255, a: 255 });
export const COLOR_TRANSPARENT: Color = Object.freeze({ r: 0, g: 0, b: 0, a: 0 });

// ─── Transform ────────────────────────────────────────────────────────────────

export interface Transform {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
}

export const IDENTITY_TRANSFORM: Transform = Object.freeze({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  tx: 0,
  ty: 0,
});

// ─── Geometry ─────────────────────────────────────────────────────────────────

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}
export interface Size {
  readonly width: number;
  readonly height: number;
}
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// ─── Input modifiers ─────────────────────────────────────────────────────────

export interface PointerModifiers {
  readonly shift: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
}
export interface KeyboardModifiers {
  readonly shift: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
}

// ─── Document node model (Phase 6 M2) ────────────────────────────────────────
//
// Relocated here from apps/web/src/document/model.ts. The document:nodes IPC
// message (below) needs to carry this shape, and packages/protocol cannot
// depend on apps/web — that would invert the intended dependency direction
// (protocol is the thing other packages import, never the reverse), the
// exact boundary violation BUG-01 already found once with Color/DocColor.
// model.ts re-exports all five names so nothing importing from "./model"
// (validate.ts, document.test.ts) needs to change.
//
// id/parent/children stay plain `string`, not the branded NodeId above —
// upgrading them isn't needed for Milestone 2 and would ripple into
// scene/demo.ts's id generation for no functional gain.

export type DocNodeKind = "frame" | "rect" | "ellipse";

/** Centre-aligned stroke style. */
export interface DocStroke {
  color: Color;
  width: number;
}

/**
 * One node in the document graph.
 *
 * `id`     — UUID v4, stable across sessions.
 * `x`, `y` — world-space top-left, Y-down.
 * `parent` — `null` for root nodes (frames).
 */
export interface DocNode {
  readonly id: string;
  kind: DocNodeKind;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: Color;
  stroke: DocStroke | null;
  cornerRadius: number;
  parent: string | null;
  children: string[];
}

export interface DocumentData {
  /** Mutation counter — incremented on every write. */
  version: number;
  name: string;
  nodes: DocNode[];
}

/**
 * Partial edit applied to one node via the Inspector panel (Phase 6 M2).
 * `stroke: null` explicitly removes the stroke; `stroke` simply absent
 * (`undefined`) means "leave the stroke unchanged" — this is why every
 * field here is optional rather than `DocStroke | null` being forced.
 */
export interface NodePatch {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  fill?: Color;
  stroke?: DocStroke | null;
  cornerRadius?: number;
}

// ─── Document operations (Phase 7 Milestone 1) ───────────────────────────────

/**
 * One reversible document mutation — the unit the worker's history stack
 * records and replays. Kept in the protocol package because ops are wire
 * material: Phase 9's op-based CRDT ships exactly these shapes between
 * peers, so they must never depend back on apps/web.
 *
 * The union deliberately covers only mutations the editor can currently
 * produce (create, remove, set-props). `node:reparent` / `node:reorder`
 * join it in the same milestone that ships their producer (layers-panel
 * drag-reorder) — shipping them earlier would mean codifying z-order
 * semantics no UI can yet exercise. See ADR-020.
 */
export type DocumentOp =
  | {
      readonly op: "node:create";
      /** Complete node to (re)insert — a leaf, or a childless frame. */
      readonly node: DocNode;
      /**
       * Position to splice into the parent's `children` array, as that
       * array stands when this op is applied. `-1` for parentless roots.
       */
      readonly childIndex: number;
      /**
       * Position to splice into the document's insertion order (paint /
       * rebuild order), as it stands when this op is applied. Without it,
       * undoing a delete would re-add the node at the end and silently
       * change its z-order.
       */
      readonly orderIndex: number;
    }
  | { readonly op: "node:remove"; readonly nodeId: string }
  | { readonly op: "node:set-props"; readonly nodeId: string; readonly patch: NodePatch };

/** Undo/redo availability snapshot, broadcast by the worker after every
 *  history-affecting action (`history:state` below). `dirty` is true when
 *  the document has changed since the last save — derived from history
 *  position, not from `DocumentData.version`. */
export interface HistoryStatus {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Label of the entry `history:undo` would revert — e.g. "Move Rectangle". */
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
  readonly dirty: boolean;
}

/** Attached to a `history:state` broadcast caused by an undo/redo, so the
 *  main thread can announce it ("Undid Move Rectangle") in a live region. */
export interface HistoryAnnounce {
  readonly action: "undo" | "redo";
  readonly label: string;
}

// ─── IPC — Engine Worker → Main thread ───────────────────────────────────────

export type EngineToMainMessage =
  | { readonly type: "engine:ready" }
  | { readonly type: "engine:error"; readonly message: string; readonly stack?: string | undefined }
  | {
      readonly type: "frame:rendered";
      readonly frameNumber: number;
      readonly timestamp: number;
      readonly renderTimeMs: number;
    }
  | { readonly type: "selection:changed"; readonly nodeIds: readonly NodeId[] }
  | {
      readonly type: "viewport:changed";
      readonly x: number;
      readonly y: number;
      readonly zoom: number;
    }
  // ── Phase 5 ─────────────────────────────────────────────────────────────────
  | {
      readonly type: "document:state";
      /** Complete document serialised as JSON. Always written to the
       *  localStorage recovery snapshot by the main thread; when
       *  `requestId` is present it additionally answers the matching
       *  `document:request_save` (Phase 7 M2 — file saves await a fresh
       *  serialisation, correlated by id so a spontaneous state broadcast
       *  from document:new/load can never be mistaken for it). */
      readonly json: string;
      readonly requestId?: string | undefined;
    }
  // ── Phase 7 Milestone 3 ─────────────────────────────────────────────────────
  | {
      /** Edge-triggered idle notice (damage model, ADR-025): the render
       *  loop entered its clean state and stopped fetching, uploading, and
       *  submitting. Sent once per transition — never per skipped slot —
       *  so an idle editor generates zero message traffic; the next
       *  `frame:rendered` is the implicit wake signal. */
      readonly type: "frame:idle";
    }
  // ── Phase 6 Milestone 2 ─────────────────────────────────────────────────────
  | {
      /** Full node list, pushed after document load/new and after every
       *  node edit (see LayersPanel / InspectorPanel). */
      readonly type: "document:nodes";
      readonly nodes: readonly DocNode[];
    }
  // ── Phase 6 Milestone 3 ─────────────────────────────────────────────────────
  | {
      /** Worker-initiated tool change — e.g. auto-return to "select" after
       *  a shape-creation drag commits. Distinct from tool:set (below),
       *  which is the main→worker direction: this exists so
       *  useSyncToolWithEngine can keep the Zustand store's activeTool in
       *  sync with a decision the *engine* made, not the user. */
      readonly type: "tool:changed";
      readonly tool: ToolType;
    }
  // ── Phase 7 Milestone 1 ─────────────────────────────────────────────────────
  | {
      /** Broadcast after every history-affecting action: commit, undo,
       *  redo, clear (document:new / document:load), and mark-saved.
       *  `announce` is present only when the cause was an undo/redo. */
      readonly type: "history:state";
      readonly status: HistoryStatus;
      readonly announce?: HistoryAnnounce | undefined;
    };

// ─── IPC — Main thread → Engine Worker ───────────────────────────────────────

export type MainToEngineMessage =
  | {
      readonly type: "engine:init";
      readonly canvas: OffscreenCanvas;
      readonly devicePixelRatio: number;
    }
  | {
      readonly type: "engine:resize";
      readonly width: number;
      readonly height: number;
      readonly devicePixelRatio: number;
    }
  | { readonly type: "tool:set"; readonly tool: ToolType }
  | {
      readonly type: "pointer:move";
      readonly x: number;
      readonly y: number;
      readonly modifiers: PointerModifiers;
    }
  | {
      readonly type: "pointer:down";
      readonly x: number;
      readonly y: number;
      readonly button: number;
      readonly modifiers: PointerModifiers;
    }
  | {
      readonly type: "pointer:up";
      readonly x: number;
      readonly y: number;
      readonly button: number;
      readonly modifiers: PointerModifiers;
    }
  | {
      readonly type: "wheel:scroll";
      readonly deltaX: number;
      readonly deltaY: number;
      readonly x: number;
      readonly y: number;
      readonly modifiers: PointerModifiers;
    }
  | { readonly type: "key:down"; readonly key: string; readonly modifiers: KeyboardModifiers }
  // ── Phase 5 ─────────────────────────────────────────────────────────────────
  | {
      readonly type: "document:load";
      /** Complete document JSON from localStorage. */
      readonly json: string;
    }
  | {
      /** Start a fresh demo scene (no saved document found). */
      readonly type: "document:new";
    }
  | {
      /** Request the worker to serialise the current document and send it
       *  back. `requestId`, when present, is echoed on the answering
       *  `document:state` (Phase 7 M2). Serialisation only — since M2 this
       *  no longer marks the history saved; see document:mark_saved. */
      readonly type: "document:request_save";
      readonly requestId?: string | undefined;
    }
  // ── Phase 6 Milestone 2 ─────────────────────────────────────────────────────
  | {
      /** Layers-panel click-to-select. Same payload shape as
       *  selection:changed so both selection paths funnel through the
       *  worker's one existing setSelection() function. */
      readonly type: "selection:set";
      readonly nodeIds: readonly NodeId[];
    }
  | {
      /** Inspector edit — position, size, fill, stroke, or corner radius. */
      readonly type: "node:update";
      readonly nodeId: string;
      readonly patch: NodePatch;
    }
  // ── Phase 6 Milestone 3 ─────────────────────────────────────────────────────
  | {
      /** Deletes the worker's current selection (leaf shapes only — a
       *  frame with children is refused; see DocumentModel.removeNode).
       *  Triggered by the canvas/Layers-row context menu. The keyboard
       *  Delete/Backspace path reuses the existing key:down message
       *  instead — see workers/engine/input/keyboard.ts. */
      readonly type: "document:delete_selection";
    }
  // ── Phase 7 Milestone 1 ─────────────────────────────────────────────────────
  | { readonly type: "history:undo" }
  | { readonly type: "history:redo" }
  // ── Phase 7 Milestone 2 ─────────────────────────────────────────────────────
  | {
      /** The main thread confirmed a durable write (file, or fallback
       *  download) of the most recent document:state — the history's
       *  current position becomes the saved state and `dirty` clears.
       *  Sent only on confirmed success: a cancelled picker or a failed
       *  write must leave the document dirty, which is exactly why M1's
       *  mark-on-request behaviour moved out of the worker. */
      readonly type: "document:mark_saved";
    };

// ─── Performance constants ────────────────────────────────────────────────────

export const MIN_ZOOM = 0.1 as const;
export const MAX_ZOOM = 512 as const;
export const DEFAULT_ZOOM = 1 as const;
export const TARGET_FPS = 60 as const;
export const FRAME_BUDGET_MS = 1000 / TARGET_FPS;
export const MVP_MAX_OBJECTS = 10_000 as const;
export const SYSTEM_MAX_OBJECTS = 100_000 as const;

/**
 * Default camera position and zoom for a freshly-initialised viewport,
 * centred on the Phase 2–5 demo scene's bounding box.
 *
 * Single source of truth — import this in both `useEngine.ts` (initial
 * React state, before any `viewport:changed` message has arrived) and
 * `engine.worker.ts` (initial `camX`/`camY`/`zoom` module state) instead of
 * duplicating the literals in both places.
 */
export const DEFAULT_CAMERA = Object.freeze({ x: 375, y: 315, zoom: 1 });
