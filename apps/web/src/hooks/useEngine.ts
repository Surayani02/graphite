import { useCallback, useRef, useState } from "react";
import { EngineWorkerBridge } from "../engine/bridge";
import type { EngineStats } from "../engine/bridge";

// ─── Types ───────────────────────────────────────────────────────────────────

export type EngineStatus = "idle" | "initializing" | "running" | "error";

export interface UseEngineResult {
  /**
   * Call with the canvas element to start the engine.
   * Returns a cleanup function — pass it directly to `useEffect`.
   */
  initEngine: (canvas: HTMLCanvasElement) => () => void;
  status: EngineStatus;
  stats: EngineStats;
  error: string | null;
}

const DEFAULT_STATS: EngineStats = { frameNumber: 0, renderTimeMs: 0, fps: 0 };

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useEngine(): UseEngineResult {
  const bridgeRef = useRef<EngineWorkerBridge | null>(null);

  const [status, setStatus] = useState<EngineStatus>("idle");
  const [stats, setStats] = useState<EngineStats>(DEFAULT_STATS);
  const [error, setError] = useState<string | null>(null);

  /**
   * Stable across renders — empty dep array is correct because the
   * function captures only React state setters (which never change).
   */
  const initEngine = useCallback((canvas: HTMLCanvasElement): (() => void) => {
    setStatus("initializing");
    setError(null);

    const bridge = new EngineWorkerBridge();
    bridgeRef.current = bridge;

    bridge
      .on("onReady", () => {
        setStatus("running");
      })
      .on("onStats", (s) => {
        setStats(s);
      })
      .on("onError", (msg) => {
        setError(msg);
        setStatus("error");
      });

    bridge.init(canvas);

    // Forward CSS-size changes to the worker as physical-pixel resize commands
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      bridge.resize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      bridge.destroy();
      bridgeRef.current = null;
      setStatus("idle");
    };
  }, []);

  return { initEngine, status, stats, error };
}
