import { useCallback, useRef, useState } from "react";
import { EngineWorkerBridge } from "../engine/bridge";
import type { EngineStats } from "../engine/bridge";
import type {
  ToolType,
  PointerModifiers,
  KeyboardModifiers,
  DocNode,
  NodePatch,
} from "@graphite/protocol";
import { DEFAULT_CAMERA } from "@graphite/protocol";

// ─── Constants ────────────────────────────────────────────────────────────────

/** localStorage key.  Versioned to allow future format migrations. */
const STORAGE_KEY = "graphite-document-v1";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EngineStatus = "idle" | "initializing" | "running" | "error";

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface UseEngineResult {
  initEngine: (canvas: HTMLCanvasElement) => () => void;
  status: EngineStatus;
  stats: EngineStats;
  error: string | null;
  selectedIds: readonly string[];
  viewport: ViewportState;
  lastSaved: Date | null;
  // Interaction
  setTool: (tool: ToolType) => void;
  sendPointerDown: (x: number, y: number, button: number, mods: PointerModifiers) => void;
  sendPointerMove: (x: number, y: number, mods: PointerModifiers) => void;
  sendPointerUp: (x: number, y: number, button: number, mods: PointerModifiers) => void;
  sendWheel: (dx: number, dy: number, x: number, y: number, mods: PointerModifiers) => void;
  sendKeyDown: (key: string, mods: KeyboardModifiers) => void;
  // Document (Phase 5)
  requestSave: () => void;
  // Layers / Inspector (Phase 6 Milestone 2)
  nodes: readonly DocNode[];
  setSelection: (nodeIds: readonly string[]) => void;
  updateNode: (nodeId: string, patch: NodePatch) => void;
}

const DEFAULT_STATS: EngineStats = { frameNumber: 0, renderTimeMs: 0, fps: 0 };
// BUG-06: was a locally-duplicated { x: 375, y: 315, zoom: 1 } literal that
// had to be kept in sync by hand with the worker's initial camera state.
// Both now read from the same protocol-level constant.
const DEFAULT_VIEWPORT: ViewportState = DEFAULT_CAMERA;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEngine(): UseEngineResult {
  const bridgeRef = useRef<EngineWorkerBridge | null>(null);

  const [status, setStatus] = useState<EngineStatus>("idle");
  const [stats, setStats] = useState<EngineStats>(DEFAULT_STATS);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [nodes, setNodes] = useState<readonly DocNode[]>([]);

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  const initEngine = useCallback((canvas: HTMLCanvasElement): (() => void) => {
    setStatus("initializing");
    setError(null);

    const bridge = new EngineWorkerBridge();
    bridgeRef.current = bridge;

    bridge
      .on("onReady", () => {
        setStatus("running");

        // Attempt to restore a previously saved document.
        // Fall back to the default demo scene if nothing is stored or the JSON
        // is malformed (malformed JSON is removed to avoid a persistent crash).
        const savedJson = localStorage.getItem(STORAGE_KEY);
        if (savedJson) {
          try {
            JSON.parse(savedJson); // Validate before sending to the worker
            bridge.loadDocument(savedJson);
          } catch {
            localStorage.removeItem(STORAGE_KEY);
            bridge.newDocument();
          }
        } else {
          bridge.newDocument();
        }
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
      })
      .on("onDocumentState", (json) => {
        // Worker has serialised the document; persist it locally.
        // setItem throws (QuotaExceededError) once the document outgrows
        // the ~5MB localStorage budget — without the guard that exception
        // escapes into the bridge's message handler and every subsequent
        // save dies silently. lastSaved is deliberately NOT updated on
        // failure: the HUD keeps showing the last save that actually stuck.
        try {
          localStorage.setItem(STORAGE_KEY, json);
          setLastSaved(new Date());
        } catch (err) {
          console.error("[graphite] failed to persist document to localStorage:", err);
        }
      })
      .on("onDocumentNodes", (n) => {
        setNodes(n);
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

  // ── Stable callbacks ───────────────────────────────────────────────────────

  const setTool = useCallback((tool: ToolType) => {
    bridgeRef.current?.setTool(tool);
  }, []);
  const sendPointerDown = useCallback((x: number, y: number, b: number, m: PointerModifiers) => {
    bridgeRef.current?.sendPointerDown(x, y, b, m);
  }, []);
  const sendPointerMove = useCallback((x: number, y: number, m: PointerModifiers) => {
    bridgeRef.current?.sendPointerMove(x, y, m);
  }, []);
  const sendPointerUp = useCallback((x: number, y: number, b: number, m: PointerModifiers) => {
    bridgeRef.current?.sendPointerUp(x, y, b, m);
  }, []);
  const sendWheel = useCallback(
    (dx: number, dy: number, x: number, y: number, m: PointerModifiers) => {
      bridgeRef.current?.sendWheel(dx, dy, x, y, m);
    },
    []
  );
  const sendKeyDown = useCallback((key: string, mods: KeyboardModifiers) => {
    bridgeRef.current?.sendKeyDown(key, mods);
  }, []);
  const requestSave = useCallback(() => {
    bridgeRef.current?.requestSave();
  }, []);
  const setSelection = useCallback((nodeIds: readonly string[]) => {
    bridgeRef.current?.setSelection(nodeIds);
  }, []);
  const updateNode = useCallback((nodeId: string, patch: NodePatch) => {
    bridgeRef.current?.updateNode(nodeId, patch);
  }, []);

  return {
    initEngine,
    status,
    stats,
    error,
    selectedIds,
    viewport,
    lastSaved,
    setTool,
    sendPointerDown,
    sendPointerMove,
    sendPointerUp,
    sendWheel,
    sendKeyDown,
    requestSave,
    nodes,
    setSelection,
    updateNode,
  };
}
