/**
 * @graphite/protocol
 *
 * Shared type definitions, IPC message schemas, and network protocol types.
 *
 * Rules — this package MUST:
 *   - Have zero runtime dependencies.
 *   - Be importable in any JS environment (browser, Web Worker, Node.js).
 *   - Export only JSON-serialisable types — no class instances, no closures.
 *   - Have no side effects at module evaluation time (except Object.freeze).
 */

// ─── Branded primitives ────────────────────────────────────────────────────

/**
 * Opaque node identifier. Always a UUID v4 string.
 * The brand ensures you cannot accidentally pass a raw string where a NodeId
 * is required. Use `createNodeId()` to create one.
 */
export type NodeId = string & { readonly __brand: "NodeId" };

/** Opaque document identifier. Always a UUID v4 string. */
export type DocumentId = string & { readonly __brand: "DocumentId" };

/** Opaque user identifier. Always a UUID v4 string. */
export type UserId = string & { readonly __brand: "UserId" };

/**
 * Creates a new, globally unique node ID.
 * Delegates to `crypto.randomUUID()`, which is available in:
 *   - Chrome 92+, Firefox 95+, Safari 15.4+
 *   - Web Workers (all modern browsers)
 *   - Node.js 14.17+
 */
export function createNodeId(): NodeId {
  return crypto.randomUUID() as NodeId;
}

/** Creates a new, globally unique document ID. */
export function createDocumentId(): DocumentId {
  return crypto.randomUUID() as DocumentId;
}

// ─── Node types ────────────────────────────────────────────────────────────

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

// ─── Color ─────────────────────────────────────────────────────────────────

/** sRGB colour. All channels in the range [0, 1]. Alpha is NOT premultiplied. */
export interface Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export const COLOR_BLACK: Color = Object.freeze({ r: 0, g: 0, b: 0, a: 1 });
export const COLOR_WHITE: Color = Object.freeze({ r: 1, g: 1, b: 1, a: 1 });
export const COLOR_TRANSPARENT: Color = Object.freeze({ r: 0, g: 0, b: 0, a: 0 });

// ─── 2D Transform ──────────────────────────────────────────────────────────

/**
 * 2D affine transform stored as a column-major 3×3 matrix
 * (with the implicit bottom row [0, 0, 1]):
 *
 *   | a  c  tx |
 *   | b  d  ty |
 *   | 0  0   1 |
 *
 * This representation is identical to the CSS / Canvas2D matrix convention.
 */
export interface Transform {
  /** X scale / cos(rotation) */
  readonly a: number;
  /** Y skew  / sin(rotation) */
  readonly b: number;
  /** X skew  / -sin(rotation) */
  readonly c: number;
  /** Y scale / cos(rotation) */
  readonly d: number;
  /** Translation X (canvas units) */
  readonly tx: number;
  /** Translation Y (canvas units) */
  readonly ty: number;
}

/** The identity transform — no scale, skew, rotation, or translation. */
export const IDENTITY_TRANSFORM: Transform = Object.freeze({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  tx: 0,
  ty: 0,
});

// ─── Geometry ──────────────────────────────────────────────────────────────

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

// ─── Tool types ────────────────────────────────────────────────────────────

export const TOOL_TYPES = {
  SELECT: "select",
  PAN: "pan",
  RECTANGLE: "rectangle",
  ELLIPSE: "ellipse",
  TEXT: "text",
  PEN: "pen",
} as const;

export type ToolType = (typeof TOOL_TYPES)[keyof typeof TOOL_TYPES];

// ─── Input modifiers ───────────────────────────────────────────────────────

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

// ─── IPC — Engine Worker → Main thread ────────────────────────────────────

/**
 * Messages the engine Worker sends TO the main (UI) thread.
 *
 * All payloads must be structurally cloneable (no class instances, no
 * functions, no Symbols). Transferable objects are listed in the transfer
 * array of the `postMessage` call, never embedded in the message itself.
 */
export type EngineToMainMessage =
  | {
      readonly type: "engine:ready";
    }
  | {
      readonly type: "engine:error";
      readonly message: string;
      readonly stack?: string | undefined;
    }
  | {
      readonly type: "frame:rendered";
      /** Monotonically increasing frame counter. */
      readonly frameNumber: number;
      /** performance.now() timestamp when the frame completed. */
      readonly timestamp: number;
      /** GPU + JS time for this frame in milliseconds. */
      readonly renderTimeMs: number;
    }
  | {
      readonly type: "selection:changed";
      readonly nodeIds: readonly NodeId[];
    }
  | {
      readonly type: "viewport:changed";
      readonly x: number;
      readonly y: number;
      readonly zoom: number;
    };

// ─── IPC — Main thread → Engine Worker ────────────────────────────────────

/**
 * Messages the main (UI) thread sends TO the engine Worker.
 *
 * When a message contains a Transferable (e.g., `OffscreenCanvas`),
 * pass it in the `transfer` array of `postMessage` — do NOT read it back
 * from the message on the main thread after posting.
 */
export type MainToEngineMessage =
  | {
      readonly type: "engine:init";
      /** Transferred — main thread loses access after posting. */
      readonly canvas: OffscreenCanvas;
      readonly devicePixelRatio: number;
    }
  | {
      readonly type: "engine:resize";
      readonly width: number;
      readonly height: number;
      readonly devicePixelRatio: number;
    }
  | {
      readonly type: "tool:set";
      readonly tool: ToolType;
    }
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
  | {
      readonly type: "key:down";
      readonly key: string;
      readonly modifiers: KeyboardModifiers;
    };

// ─── Performance constants ─────────────────────────────────────────────────

/** Minimum canvas zoom level (10 %). */
export const MIN_ZOOM = 0.1 as const;

/** Maximum canvas zoom level (512×). */
export const MAX_ZOOM = 512 as const;

/** Default canvas zoom level (100 %). */
export const DEFAULT_ZOOM = 1 as const;

/** Rendering target: 60 frames per second. */
export const TARGET_FPS = 60 as const;

/** Time budget per frame in milliseconds at TARGET_FPS (≈ 16.67 ms). */
export const FRAME_BUDGET_MS = 1000 / TARGET_FPS;

/** Maximum object count for the MVP (Phase 7). */
export const MVP_MAX_OBJECTS = 10_000 as const;

/** Design target for the full system (Phase 10+). */
export const SYSTEM_MAX_OBJECTS = 100_000 as const;
