/**
 * EngineWorkerBridge — Phase 5
 *
 * Additions over Phase 4:
 *   - onDocumentState event
 *   - loadDocument(), newDocument(), requestSave() methods
 */

import type {
  EngineToMainMessage,
  MainToEngineMessage,
  ToolType,
  PointerModifiers,
  KeyboardModifiers,
} from "@graphite/protocol";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface EngineStats {
  frameNumber: number;
  renderTimeMs: number;
  fps: number;
}

export interface EngineBridgeEvents {
  onReady: () => void;
  onStats: (stats: EngineStats) => void;
  onError: (message: string) => void;
  onSelectionChanged: (nodeIds: readonly string[]) => void;
  onViewportChanged: (x: number, y: number, zoom: number) => void;
  // Phase 5
  onDocumentState: (json: string) => void;
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class EngineWorkerBridge {
  private readonly worker: Worker;
  private readonly handlers: Partial<EngineBridgeEvents> = {};
  private initialized = false;
  private frameCount = 0;
  private fpsWindowStart = performance.now();
  private currentFps = 0;

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

  /** Request the worker to serialise and return the current document. */
  requestSave(): void {
    const msg: MainToEngineMessage = { type: "document:request_save" };
    this.worker.postMessage(msg);
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

  // ── Incoming messages ─────────────────────────────────────────────────────

  private handleWorkerMessage(msg: EngineToMainMessage): void {
    switch (msg.type) {
      case "engine:ready": {
        this.handlers.onReady?.();
        break;
      }
      case "frame:rendered": {
        this.frameCount += 1;
        const now = performance.now();
        const elapsed = now - this.fpsWindowStart;
        if (elapsed >= 1_000) {
          this.currentFps = Math.round((this.frameCount / elapsed) * 1_000);
          this.frameCount = 0;
          this.fpsWindowStart = now;
        }
        this.handlers.onStats?.({
          frameNumber: msg.frameNumber,
          renderTimeMs: msg.renderTimeMs,
          fps: this.currentFps,
        });
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
        this.handlers.onDocumentState?.(msg.json);
        break;
      }
      default:
        break;
    }
  }
}
