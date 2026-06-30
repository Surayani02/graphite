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
      /** Complete document serialised as JSON — write to localStorage. */
      readonly json: string;
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
      /** Request the worker to serialise the current document and send it back. */
      readonly type: "document:request_save";
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
