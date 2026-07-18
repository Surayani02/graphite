import { useCallback, useEffect, useRef, useState } from "react";
import { EngineWorkerBridge } from "../engine/bridge";
import type { EngineStats } from "../engine/bridge";
import type {
  ToolType,
  PointerModifiers,
  KeyboardModifiers,
  DocNode,
  HistoryStatus,
  NodePatch,
  RasterFormat,
  Color,
} from "@graphite/protocol";
import { DEFAULT_CAMERA } from "@graphite/protocol";

// ─── Constants ────────────────────────────────────────────────────────────────

/** localStorage key.  Versioned to allow future format migrations. */
const STORAGE_KEY = "graphite-document-v1";

/**
 * A worker-initiated tool change, modelled as an *event*. The `seq`
 * increments on every emission, so two consecutive changes to the *same*
 * tool ("select" → draw → "select" → draw) still register as distinct
 * signals — which is exactly what the sync hook needs to avoid mistaking a
 * stale value for the absence of a new one (BUG-07).
 */
export interface EngineToolSignal {
  readonly tool: ToolType;
  readonly seq: number;
}

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
  // Document (Phase 5, renamed Phase 7 M2)
  /** Asks the worker for a fresh state broadcast so the localStorage
   *  recovery snapshot updates — without touching the dirty flag (file
   *  saves are getDocumentJson + markSaved). The visibility handler in
   *  EngineCanvas fires this when the tab hides. */
  requestRecoverySnapshot: () => void;
  // Layers / Inspector (Phase 6 Milestone 2)
  nodes: readonly DocNode[];
  setSelection: (nodeIds: readonly string[]) => void;
  updateNode: (nodeId: string, patch: NodePatch) => void;
  // Tools & deletion (Phase 6 Milestone 3)
  /** One-shot signal that the *worker* changed the active tool on its own
   *  (e.g. auto-return to "select" after a shape-creation drag commits).
   *  An **event, not a state**: it carries the tool plus a monotonically
   *  increasing `seq`, so useSyncToolWithEngine can distinguish a genuinely
   *  new engine change from a stale repeat of the same tool value. `null`
   *  until the first such change this session. The previous sticky-state
   *  form let a stale "select" masquerade as a fresh engine command and
   *  silently override the user's next tool pick (BUG-07). */
  lastEngineTool: EngineToolSignal | null;
  deleteSelection: () => void;
  // Files (Phase 7 Milestone 2)
  /** Loads a bare DocumentData JSON string into the worker (replaces the
   *  current document, clears history). The file layer unwraps `.graphite`
   *  envelopes before calling this — the worker never sees them. */
  loadDocument: (json: string) => void;
  /** Starts a fresh document (worker seeds the default scene, clears history). */
  newDocument: () => void;
  /** Requests a fresh serialisation from the worker and resolves with the
   *  bare DocumentData JSON. Rejects if the engine worker isn't running.
   *  Correlated by requestId, so a document:new/load broadcast racing the
   *  request can never be mistaken for the answer. */
  getDocumentJson: () => Promise<string>;
  /** Confirms a durable write — clears the worker's dirty flag. */
  markSaved: () => void;
  /** Off-screen raster export (Phase 7 M4b) — resolves with encoded
   *  PNG/JPEG bytes, rejects if the worker reports an export failure. */
  exportRaster: (
    format: RasterFormat,
    scale: number,
    quality: number,
    background: Color
  ) => Promise<Uint8Array>;
  // History (Phase 7 Milestone 1)
  /** Undo/redo availability — drives command enablement and (later, M2)
   *  the unsaved-changes indicator. Mirrors the worker's history:state. */
  historyStatus: HistoryStatus;
  /** Human-readable record of the last undo/redo ("Undid Move Rectangle"),
   *  rendered into the StatusBar's live region for screen readers. `null`
   *  until the first undo/redo this session. */
  historyAnnouncement: string | null;
  undo: () => void;
  redo: () => void;
  // Debug (Phase 7 Milestone 5)
  /** Dev-only stress trigger (ADR-027) — replaces the current document
   *  with the deterministic `count`-node stress scene via the standard
   *  load pipeline. Only the DEV-gated Debug commands call this; the
   *  worker handler is compiled out of production builds. */
  loadStress: (count: number) => void;
}

const DEFAULT_STATS: EngineStats = { idle: false, frameNumber: 0, renderTimeMs: 0, fps: 0 };
const DEFAULT_HISTORY_STATUS: HistoryStatus = {
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
  dirty: false,
};
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
  const [lastEngineTool, setLastEngineTool] = useState<EngineToolSignal | null>(null);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>(DEFAULT_HISTORY_STATUS);
  const [historyAnnouncement, setHistoryAnnouncement] = useState<string | null>(null);

  /** Pending getDocumentJson() calls, keyed by requestId (Phase 7 M2). */
  const pendingStateRequests = useRef(new Map<string, (json: string) => void>());
  useEffect(() => {
    const pending = pendingStateRequests.current;
    return () => pending.clear();
  }, []);

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
      .on("onFrameIdle", () => {
        // Edge event, not a stats stream: merge onto the last real frame's
        // numbers so fps/renderTime freeze honestly labelled rather than
        // ticking a fake heartbeat (ADR-025).
        setStats((s) => ({ ...s, idle: true }));
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
      .on("onDocumentState", (json, requestId) => {
        // A correlated answer resolves its waiting file save (Phase 7 M2)…
        if (requestId !== null) {
          const resolve = pendingStateRequests.current.get(requestId);
          if (resolve !== undefined) {
            pendingStateRequests.current.delete(requestId);
            resolve(json);
          }
        }
        // …and every state broadcast still feeds the recovery snapshot:
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
      })
      .on("onToolChanged", (tool) => {
        // Event, not state: bump seq every time so an identical tool value
        // arriving twice still counts as two distinct signals (BUG-07).
        setLastEngineTool((prev) => ({ tool, seq: (prev?.seq ?? 0) + 1 }));
      })
      .on("onHistoryStatus", (status, announce) => {
        setHistoryStatus(status);
        if (announce !== null) {
          setHistoryAnnouncement(
            `${announce.action === "undo" ? "Undid" : "Redid"} ${announce.label}`
          );
        }
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
  const setSelection = useCallback((nodeIds: readonly string[]) => {
    bridgeRef.current?.setSelection(nodeIds);
  }, []);
  const updateNode = useCallback((nodeId: string, patch: NodePatch) => {
    bridgeRef.current?.updateNode(nodeId, patch);
  }, []);
  const deleteSelection = useCallback(() => {
    bridgeRef.current?.deleteSelection();
  }, []);
  const undo = useCallback(() => {
    bridgeRef.current?.undo();
  }, []);
  const redo = useCallback(() => {
    bridgeRef.current?.redo();
  }, []);
  const loadStress = useCallback((count: number) => {
    bridgeRef.current?.loadStress(count);
  }, []);
  const requestRecoverySnapshot = useCallback(() => {
    bridgeRef.current?.requestSave();
  }, []);
  const loadDocument = useCallback((json: string) => {
    bridgeRef.current?.loadDocument(json);
  }, []);
  const newDocument = useCallback(() => {
    bridgeRef.current?.newDocument();
  }, []);
  const getDocumentJson = useCallback((): Promise<string> => {
    const bridge = bridgeRef.current;
    if (bridge === null) {
      return Promise.reject(new Error("Engine worker is not running"));
    }
    return new Promise<string>((resolve) => {
      const requestId = crypto.randomUUID();
      pendingStateRequests.current.set(requestId, resolve);
      bridge.requestSave(requestId);
    });
  }, []);
  const markSaved = useCallback(() => {
    bridgeRef.current?.markSaved();
  }, []);
  const exportRaster = useCallback(
    (
      format: RasterFormat,
      scale: number,
      quality: number,
      background: Color
    ): Promise<Uint8Array> => {
      const bridge = bridgeRef.current;
      if (bridge === null) {
        return Promise.reject(new Error("Engine worker is not running"));
      }
      return bridge.exportRaster(format, scale, quality, background);
    },
    []
  );

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
    requestRecoverySnapshot,
    nodes,
    setSelection,
    updateNode,
    lastEngineTool,
    deleteSelection,
    historyStatus,
    historyAnnouncement,
    undo,
    redo,
    loadDocument,
    newDocument,
    getDocumentJson,
    markSaved,
    exportRaster,
    loadStress,
  };
}
