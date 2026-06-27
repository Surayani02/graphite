/**
 * EngineWorkerBridge
 *
 * Main-thread façade for the engine Web Worker.
 * Handles Worker lifecycle, message routing, and FPS tracking.
 */

import type { EngineToMainMessage, MainToEngineMessage } from "@graphite/protocol";

// ─── Public types ────────────────────────────────────────────────────────────

export interface EngineStats {
  /** Monotonically increasing frame index reported by the worker. */
  frameNumber: number;
  /** GPU encode + submit time for the last frame (milliseconds). */
  renderTimeMs: number;
  /** Frames rendered in the last second (0 until the first full second). */
  fps: number;
}

export interface EngineBridgeEvents {
  onReady: () => void;
  onStats: (stats: EngineStats) => void;
  onError: (message: string) => void;
}

// ─── Class ───────────────────────────────────────────────────────────────────

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

  /**
   * Transfer the canvas to the worker and begin rendering.
   *
   * canvas.width and canvas.height are NOT touched here: writing those
   * properties after transferControlToOffscreen() throws InvalidStateError.
   * The correct physical-pixel dimensions are sent immediately as an
   * engine:resize message so the worker can apply them on the OffscreenCanvas
   * before the first frame is drawn.
   */
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

    // Forward correct physical-pixel dimensions to the worker.
    // The worker will set these on the OffscreenCanvas before the first render.
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
      default:
        break;
    }
  }
}
