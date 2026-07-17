/**
 * EngineWorkerBridge — Phase 5, extended Phase 6 Milestones 2–3.
 *
 * Additions over Phase 4:
 *   - onDocumentState event
 *   - loadDocument(), newDocument(), requestSave() methods
 * Additions over Phase 5 (Phase 6 M2):
 *   - onDocumentNodes event
 *   - setSelection(), updateNode() methods
 * Additions over M2 (Phase 6 M3):
 *   - onToolChanged event (worker-initiated tool change, e.g. auto-return
 *     to "select" after a shape commits)
 *   - deleteSelection() method
 * Additions over M3 (Phase 7 M1):
 *   - onHistoryStatus event
 *   - undo(), redo() methods
 * Additions over M1 (Phase 7 M2):
 *   - requestSave() takes an optional correlation id, echoed by
 *     onDocumentState
 *   - markSaved() method (confirmed durable write)
 */

import type {
  EngineToMainMessage,
  MainToEngineMessage,
  ToolType,
  PointerModifiers,
  KeyboardModifiers,
  DocNode,
  HistoryAnnounce,
  HistoryStatus,
  NodeId,
  NodePatch,
  RasterFormat,
  Color,
} from "@graphite/protocol";
import { FpsTracker } from "./fps";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface EngineStats {
  /** True while the damage model has the render loop parked — no GPU
   *  submits since the last frame:rendered (Phase 7 M3, ADR-025). */
  idle: boolean;
  frameNumber: number;
  renderTimeMs: number;
  fps: number;
}

export interface EngineBridgeEvents {
  onReady: () => void;
  onStats: (stats: EngineStats) => void;
  // Phase 7 M3 — edge-triggered damage-model idle notice
  onFrameIdle: () => void;
  onError: (message: string) => void;
  onSelectionChanged: (nodeIds: readonly string[]) => void;
  onViewportChanged: (x: number, y: number, zoom: number) => void;
  // Phase 5; requestId added Phase 7 M2 (null for spontaneous broadcasts)
  onDocumentState: (json: string, requestId: string | null) => void;
  // Phase 6 Milestone 2
  onDocumentNodes: (nodes: readonly DocNode[]) => void;
  // Phase 6 Milestone 3
  onToolChanged: (tool: ToolType) => void;
  // Phase 7 Milestone 1
  onHistoryStatus: (status: HistoryStatus, announce: HistoryAnnounce | null) => void;
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class EngineWorkerBridge {
  private readonly worker: Worker;
  private readonly handlers: Partial<EngineBridgeEvents> = {};
  private initialized = false;
  private readonly fps = new FpsTracker();
  // Phase 7 M4b: raster export is request->result/error correlated by id. A
  // promise map fits better than the event surface -- the caller awaits bytes.
  private readonly pendingExports = new Map<
    string,
    { resolve: (bytes: Uint8Array) => void; reject: (err: Error) => void }
  >();
  private exportSeq = 0;

  constructor() {
    this.worker = new Worker(new URL("../workers/engine.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (e: MessageEvent<EngineToMainMessage>) => {
      this.handleWorkerMessage(e.data);
    };
    this.worker.onerror = (e: ErrorEvent) => {
      // QUAL-05: e.message can be undefined (CSP violation, module load
      // failure) — falling through to the bare template literal would
      // produce the unhelpful "Worker uncaught error: undefined". Include
      // filename/line when present so there's something to act on.
      const detail = [e.message, e.filename, e.lineno].filter(Boolean).join(" @ ");
      this.handlers.onError?.(`Worker uncaught error: ${detail || "no detail available"}`);
    };
  }

  on<K extends keyof EngineBridgeEvents>(event: K, handler: EngineBridgeEvents[K]): this {
    this.handlers[event] = handler;
    return this;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  init(canvas: HTMLCanvasElement): void {
    if (this.initialized) return;
    this.initialized = true;
    const dpr = window.devicePixelRatio;
    const rect = canvas.getBoundingClientRect();
    const offscreen = canvas.transferControlToOffscreen();
    const initMsg: MainToEngineMessage = {
      type: "engine:init",
      canvas: offscreen,
      devicePixelRatio: dpr,
    };
    this.worker.postMessage(initMsg, [offscreen]);

    // QUAL-08: getBoundingClientRect() can return 0×0 if called before
    // layout has settled. Skipping a 0×0 resize here is purely defensive —
    // the caller's ResizeObserver (see useEngine.ts) is guaranteed to fire
    // at least once with the real size immediately after `observe()`, so
    // this only avoids one redundant zero-size round-trip, not a visible bug.
    if (rect.width > 0 && rect.height > 0) {
      this.resize(rect.width, rect.height);
    }
  }

  resize(cssWidth: number, cssHeight: number): void {
    if (!this.initialized) return;
    const dpr = window.devicePixelRatio;
    const msg: MainToEngineMessage = {
      type: "engine:resize",
      width: Math.round(cssWidth * dpr),
      height: Math.round(cssHeight * dpr),
      devicePixelRatio: dpr,
    };
    this.worker.postMessage(msg);
  }

  destroy(): void {
    this.initialized = false;
    this.worker.terminate();
  }

  // ── Document (Phase 5) ────────────────────────────────────────────────────

  /** Load a document from its serialised JSON representation. */
  loadDocument(json: string): void {
    const msg: MainToEngineMessage = { type: "document:load", json };
    this.worker.postMessage(msg);
  }

  /** Start a fresh default scene (no saved document). */
  newDocument(): void {
    const msg: MainToEngineMessage = { type: "document:new" };
    this.worker.postMessage(msg);
  }

  /** Request the worker to serialise and return the current document.
   *  `requestId` is echoed on the answering onDocumentState. */
  requestSave(requestId?: string): void {
    const msg: MainToEngineMessage =
      requestId !== undefined
        ? { type: "document:request_save", requestId }
        : { type: "document:request_save" };
    this.worker.postMessage(msg);
  }

  /** Confirms a durable write of the last serialised state (Phase 7 M2) —
   *  clears the worker-side dirty flag. Call only after the write succeeded. */
  markSaved(): void {
    this.worker.postMessage({ type: "document:mark_saved" } satisfies MainToEngineMessage);
  }

  /** Requests an off-screen raster export (Phase 7 M4b). Resolves with the
   *  encoded PNG/JPEG bytes, or rejects if the worker reports export:error.
   *  Each call gets a fresh correlation id so a slow export finishing after
   *  a newer one starts still settles its own promise. */
  exportRaster(
    format: RasterFormat,
    scale: number,
    quality: number,
    background: Color
  ): Promise<Uint8Array> {
    this.exportSeq += 1;
    const requestId = `export-${String(this.exportSeq)}`;
    return new Promise<Uint8Array>((resolve, reject) => {
      this.pendingExports.set(requestId, { resolve, reject });
      this.worker.postMessage({
        type: "export:raster:request",
        requestId,
        format,
        scale,
        quality,
        background,
      } satisfies MainToEngineMessage);
    });
  }

  // ── Interaction (Phase 4) ─────────────────────────────────────────────────

  setTool(tool: ToolType): void {
    this.worker.postMessage({ type: "tool:set", tool } satisfies MainToEngineMessage);
  }

  sendPointerDown(x: number, y: number, button: number, modifiers: PointerModifiers): void {
    this.worker.postMessage({
      type: "pointer:down",
      x,
      y,
      button,
      modifiers,
    } satisfies MainToEngineMessage);
  }

  sendPointerMove(x: number, y: number, modifiers: PointerModifiers): void {
    this.worker.postMessage({
      type: "pointer:move",
      x,
      y,
      modifiers,
    } satisfies MainToEngineMessage);
  }

  sendPointerUp(x: number, y: number, button: number, modifiers: PointerModifiers): void {
    this.worker.postMessage({
      type: "pointer:up",
      x,
      y,
      button,
      modifiers,
    } satisfies MainToEngineMessage);
  }

  sendWheel(
    deltaX: number,
    deltaY: number,
    x: number,
    y: number,
    modifiers: PointerModifiers
  ): void {
    this.worker.postMessage({
      type: "wheel:scroll",
      deltaX,
      deltaY,
      x,
      y,
      modifiers,
    } satisfies MainToEngineMessage);
  }

  sendKeyDown(key: string, modifiers: KeyboardModifiers): void {
    this.worker.postMessage({ type: "key:down", key, modifiers } satisfies MainToEngineMessage);
  }

  // ── Layers / Inspector (Phase 6 Milestone 2) ──────────────────────────────

  /** Layers-panel click-to-select. Empty array clears selection. */
  setSelection(nodeIds: readonly string[]): void {
    this.worker.postMessage({
      type: "selection:set",
      nodeIds: nodeIds as readonly NodeId[],
    } satisfies MainToEngineMessage);
  }

  /** Inspector edit — position, size, fill, stroke, or corner radius. */
  updateNode(nodeId: string, patch: NodePatch): void {
    this.worker.postMessage({
      type: "node:update",
      nodeId,
      patch,
    } satisfies MainToEngineMessage);
  }

  // ── Tools & deletion (Phase 6 Milestone 3) ────────────────────────────────

  /** Canvas/Layers-row context-menu "Delete". The keyboard Delete/Backspace
   *  path goes through sendKeyDown instead — see keyboard.ts. */
  deleteSelection(): void {
    this.worker.postMessage({ type: "document:delete_selection" } satisfies MainToEngineMessage);
  }

  // ── History (Phase 7 Milestone 1) ──────────────────────────────────────────

  undo(): void {
    this.worker.postMessage({ type: "history:undo" } satisfies MainToEngineMessage);
  }

  redo(): void {
    this.worker.postMessage({ type: "history:redo" } satisfies MainToEngineMessage);
  }

  // ── Debug (Phase 7 Milestone 5) ────────────────────────────────────────────

  /** Dev-only stress trigger (ADR-027): asks the worker to replace the
   *  current document with the deterministic `count`-node stress scene.
   *  In production builds the worker compiles the handler out, so this is
   *  a no-op there — the sending command never registers outside dev
   *  either (see features/commands/builtin). */
  loadStress(count: number): void {
    this.worker.postMessage({ type: "debug:load_stress", count } satisfies MainToEngineMessage);
  }

  // ── Incoming messages ─────────────────────────────────────────────────────

  private handleWorkerMessage(msg: EngineToMainMessage): void {
    switch (msg.type) {
      case "engine:ready": {
        this.handlers.onReady?.();
        break;
      }
      case "frame:rendered": {
        this.handlers.onStats?.({
          idle: false,
          frameNumber: msg.frameNumber,
          renderTimeMs: msg.renderTimeMs,
          // QUAL-01: FpsTracker returns a provisional estimate during the
          // first second instead of the old hard 0 — see engine/fps.ts.
          fps: this.fps.record(performance.now()),
        });
        break;
      }
      case "frame:idle": {
        this.handlers.onFrameIdle?.();
        break;
      }
      case "engine:error": {
        this.handlers.onError?.(msg.message);
        break;
      }
      case "selection:changed": {
        this.handlers.onSelectionChanged?.(msg.nodeIds as readonly string[]);
        break;
      }
      case "viewport:changed": {
        this.handlers.onViewportChanged?.(msg.x, msg.y, msg.zoom);
        break;
      }
      case "document:state": {
        this.handlers.onDocumentState?.(msg.json, msg.requestId ?? null);
        break;
      }
      case "export:raster:result": {
        const pending = this.pendingExports.get(msg.requestId);
        if (pending) {
          this.pendingExports.delete(msg.requestId);
          pending.resolve(msg.bytes);
        }
        break;
      }
      case "export:error": {
        const pending = this.pendingExports.get(msg.requestId);
        if (pending) {
          this.pendingExports.delete(msg.requestId);
          pending.reject(new Error(msg.message));
        }
        break;
      }
      case "document:nodes": {
        this.handlers.onDocumentNodes?.(msg.nodes);
        break;
      }
      case "tool:changed": {
        this.handlers.onToolChanged?.(msg.tool);
        break;
      }
      case "history:state": {
        this.handlers.onHistoryStatus?.(msg.status, msg.announce ?? null);
        break;
      }
      default:
        break;
    }
  }
}
