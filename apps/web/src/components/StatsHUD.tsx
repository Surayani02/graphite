import type { EngineStats } from "../engine/bridge";
import type { EngineStatus } from "../hooks/useEngine";

export interface StatsHUDProps {
  status: EngineStatus;
  stats: EngineStats;
  zoomPct: number;
  lastSaved: Date | null;
  selectedCount: number;
  error: string | null;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Bottom-left stats overlay: FPS, render time, zoom level, last-saved time,
 * and selection count. Pure presentational — all data flows in as props,
 * no engine/bridge access of its own.
 */
export function StatsHUD({
  status,
  stats,
  zoomPct,
  lastSaved,
  selectedCount,
  error,
}: StatsHUDProps) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        bottom: 12,
        left: 12,
        fontFamily: "monospace",
        fontSize: 11,
        lineHeight: 1.8,
        color: "rgba(255,255,255,0.38)",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {status === "initializing" && <span>Initializing…</span>}

      {status === "running" && (
        <>
          <div>Phase 5 — Document Model ✓</div>
          <div>
            {stats.fps} fps · {stats.renderTimeMs.toFixed(2)} ms
          </div>
          <div>zoom {zoomPct}%</div>
          {lastSaved && <div>Saved {formatTime(lastSaved)}</div>}
          {selectedCount > 0 && <div>{selectedCount} selected — Esc to deselect</div>}
        </>
      )}

      {status === "error" && (
        <span style={{ color: "#ff6b6b" }}>{error ?? "Engine error — check console"}</span>
      )}
    </div>
  );
}
