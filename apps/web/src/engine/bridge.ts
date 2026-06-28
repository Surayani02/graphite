/**
 * EngineWorkerBridge — Phase 4
 *
 * Additions:
 *   - onSelectionChanged / onViewportChanged events
 *   - setTool, sendPointerDown/Move/Up, sendWheel, sendKeyDown methods
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
      this.handlers.onError?.(`Worker uncaught error: ${e.message}`);
    };
  }

  on<K extends keyof EngineBridgeEvents>(event: K, handler: EngineBridgeEvents[K]): this {
    this.handlers[event] = handler;
    return this;
  }

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
    this.resize(rect.width, rect.height);
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

  // ── Interaction ───────────────────────────────────────────────────────────

  setTool(tool: ToolType): void {
    const msg: MainToEngineMessage = { type: "tool:set", tool };
    this.worker.postMessage(msg);
  }

  sendPointerDown(x: number, y: number, button: number, modifiers: PointerModifiers): void {
    const msg: MainToEngineMessage = { type: "pointer:down", x, y, button, modifiers };
    this.worker.postMessage(msg);
  }

  sendPointerMove(x: number, y: number, modifiers: PointerModifiers): void {
    const msg: MainToEngineMessage = { type: "pointer:move", x, y, modifiers };
    this.worker.postMessage(msg);
  }

  sendPointerUp(x: number, y: number, button: number, modifiers: PointerModifiers): void {
    const msg: MainToEngineMessage = { type: "pointer:up", x, y, button, modifiers };
    this.worker.postMessage(msg);
  }

  sendWheel(
    deltaX: number,
    deltaY: number,
    x: number,
    y: number,
    modifiers: PointerModifiers
  ): void {
    const msg: MainToEngineMessage = {
      type: "wheel:scroll",
      deltaX,
      deltaY,
      x,
      y,
      modifiers,
    };
    this.worker.postMessage(msg);
  }

  sendKeyDown(key: string, modifiers: KeyboardModifiers): void {
    const msg: MainToEngineMessage = { type: "key:down", key, modifiers };
    this.worker.postMessage(msg);
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
      default:
        break;
    }
  }
}
