import { useEngineContext, useEngineFrame } from "../context/EngineContext";

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * The only component that subscribes to EngineFrameContext — it exists to
 * display per-frame numbers, so re-rendering at frame cadence is its job,
 * not a leak. Everything else in the shell reads the stable context.
 */
export function StatusBar() {
  const { status, lastSaved, selectedIds, error } = useEngineContext();
  const { stats, viewport } = useEngineFrame();
  const zoomPct = Math.round(viewport.zoom * 100);

  return (
    <footer className="flex h-7 items-center gap-4 border-t border-border-subtle bg-surface-panel px-3 font-mono text-[11px] text-content-tertiary">
      {status === "initializing" && <span>Initializing…</span>}

      {status === "running" && (
        <>
          <span>{stats.fps} fps</span>
          <span>{stats.renderTimeMs.toFixed(2)} ms</span>
          <span>zoom {zoomPct}%</span>
          {lastSaved && <span>saved {formatTime(lastSaved)}</span>}
          {selectedIds.length > 0 && <span>{selectedIds.length} selected</span>}
        </>
      )}

      {status === "error" && (
        <span className="text-danger">{error ?? "Engine error — check console"}</span>
      )}
    </footer>
  );
}
