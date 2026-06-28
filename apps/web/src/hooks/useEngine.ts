import { useCallback, useRef, useState } from "react";
import { EngineWorkerBridge } from "../engine/bridge";
import type { EngineStats } from "../engine/bridge";
import type { ToolType, PointerModifiers, KeyboardModifiers } from "@graphite/protocol";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EngineStatus = "idle" | "initializing" | "running" | "error";

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface UseEngineResult {
  // Lifecycle
  initEngine: (canvas: HTMLCanvasElement) => () => void;
  status: EngineStatus;
  stats: EngineStats;
  error: string | null;
  // Phase 4
  selectedIds: readonly string[];
  viewport: ViewportState;
  setTool: (tool: ToolType) => void;
  sendPointerDown: (x: number, y: number, button: number, mods: PointerModifiers) => void;
  sendPointerMove: (x: number, y: number, mods: PointerModifiers) => void;
  sendPointerUp: (x: number, y: number, button: number, mods: PointerModifiers) => void;
  sendWheel: (dx: number, dy: number, x: number, y: number, mods: PointerModifiers) => void;
  sendKeyDown: (key: string, mods: KeyboardModifiers) => void;
}

const DEFAULT_STATS: EngineStats = { frameNumber: 0, renderTimeMs: 0, fps: 0 };
const DEFAULT_VIEWPORT: ViewportState = { x: 375, y: 315, zoom: 1 };

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEngine(): UseEngineResult {
  const bridgeRef = useRef<EngineWorkerBridge | null>(null);

  const [status, setStatus] = useState<EngineStatus>("idle");
  const [stats, setStats] = useState<EngineStats>(DEFAULT_STATS);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT);

  // ── Lifecycle ──────────────────────────────────────────────────────────────

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
      })
      .on("onSelectionChanged", (ids) => {
        setSelectedIds(ids);
      })
      .on("onViewportChanged", (x, y, z) => {
        setViewport({ x, y, zoom: z });
      });

    bridge.init(canvas);

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

  // ── Stable interaction callbacks (safe in useEffect deps) ─────────────────

  const setTool = useCallback((tool: ToolType) => {
    bridgeRef.current?.setTool(tool);
  }, []);

  const sendPointerDown = useCallback(
    (x: number, y: number, button: number, mods: PointerModifiers) => {
      bridgeRef.current?.sendPointerDown(x, y, button, mods);
    },
    []
  );

  const sendPointerMove = useCallback((x: number, y: number, mods: PointerModifiers) => {
    bridgeRef.current?.sendPointerMove(x, y, mods);
  }, []);

  const sendPointerUp = useCallback(
    (x: number, y: number, button: number, mods: PointerModifiers) => {
      bridgeRef.current?.sendPointerUp(x, y, button, mods);
    },
    []
  );

  const sendWheel = useCallback(
    (dx: number, dy: number, x: number, y: number, mods: PointerModifiers) => {
      bridgeRef.current?.sendWheel(dx, dy, x, y, mods);
    },
    []
  );

  const sendKeyDown = useCallback((key: string, mods: KeyboardModifiers) => {
    bridgeRef.current?.sendKeyDown(key, mods);
  }, []);

  return {
    initEngine,
    status,
    stats,
    error,
    selectedIds,
    viewport,
    setTool,
    sendPointerDown,
    sendPointerMove,
    sendPointerUp,
    sendWheel,
    sendKeyDown,
  };
}
