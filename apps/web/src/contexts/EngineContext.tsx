import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useEngine } from "../hooks/useEngine";
import type { UseEngineResult } from "../hooks/useEngine";

/**
 * The engine surface is split across two contexts by update frequency:
 *
 * - `EngineContext` — everything that changes at interaction rate or slower
 *   (status, selection, nodes, lastSaved, and every stable sender). Its
 *   value is memoised, so panels subscribing here re-render only when one
 *   of those actually changes.
 * - `EngineFrameContext` — `stats` + `viewport`, which update at frame
 *   cadence (~60Hz). Only components that genuinely display per-frame data
 *   (StatusBar) should subscribe to this one.
 *
 * Without the split, `useEngine`'s per-frame `setStats` recreated one big
 * context value ~60 times a second and re-rendered every panel with it —
 * harmless while panels were placeholders, but once LayersPanel started
 * rebuilding the node tree per render, "every panel, every frame" became a
 * real O(n)-per-frame cost.
 */

export type EngineStableState = Omit<UseEngineResult, "stats" | "viewport">;

export type EngineFrameState = Pick<UseEngineResult, "stats" | "viewport">;

/**
 * Exported alongside the hooks specifically so tests can inject a mock via
 * `<EngineContext.Provider value={mock}>` without mounting a real
 * canvas/worker. Application code should always go through
 * `useEngineContext()` / `useEngineFrame()`, never import these directly.
 */
export const EngineContext = createContext<EngineStableState | null>(null);
export const EngineFrameContext = createContext<EngineFrameState | null>(null);

export function EngineProvider({ children }: { children: ReactNode }) {
  const engine = useEngine();
  const { stats, viewport, ...stable } = engine;

  // All callbacks below are stable (useCallback([]) in useEngine), so this
  // memo's identity changes only when status/error/selection/save/nodes do.
  const stableValue = useMemo<EngineStableState>(
    () => stable,
    // Dependency list mirrors every field of `stable`, so the memo breaks
    // exactly when one of them changes and never otherwise.
    [
      stable.initEngine,
      stable.status,
      stable.error,
      stable.selectedIds,
      stable.lastSaved,
      stable.nodes,
      stable.setTool,
      stable.sendPointerDown,
      stable.sendPointerMove,
      stable.sendPointerUp,
      stable.sendWheel,
      stable.sendKeyDown,
      stable.requestSave,
      stable.setSelection,
      stable.updateNode,
      stable.lastEngineTool,
      stable.deleteSelection,
      stable.historyStatus,
      stable.historyAnnouncement,
      stable.undo,
      stable.redo,
    ]
  );

  const frameValue = useMemo<EngineFrameState>(() => ({ stats, viewport }), [stats, viewport]);

  return (
    <EngineContext.Provider value={stableValue}>
      <EngineFrameContext.Provider value={frameValue}>{children}</EngineFrameContext.Provider>
    </EngineContext.Provider>
  );
}

export function useEngineContext(): EngineStableState {
  const ctx = useContext(EngineContext);
  if (!ctx) {
    throw new Error("useEngineContext must be used within an EngineProvider");
  }
  return ctx;
}

export function useEngineFrame(): EngineFrameState {
  const ctx = useContext(EngineFrameContext);
  if (!ctx) {
    throw new Error("useEngineFrame must be used within an EngineProvider");
  }
  return ctx;
}
