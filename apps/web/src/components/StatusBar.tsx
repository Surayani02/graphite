import { useEngineContext, useEngineFrame } from "../contexts/EngineContext";

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * The only component that subscribes to EngineFrameContext — it exists to
 * display per-frame numbers, so re-rendering at frame cadence is its job,
 * not a leak. Everything else in the shell reads the stable context.
 */
export function StatusBar() {
  const { status, lastSaved, selectedIds, error, historyAnnouncement } = useEngineContext();
  const { stats, viewport } = useEngineFrame();
  const zoomPct = Math.round(viewport.zoom * 100);

  return (
    <footer className="flex h-7 items-center gap-4 border-t border-border-subtle bg-surface-panel px-3 font-mono text-[11px] text-content-tertiary">
      {/* Undo/redo announcements for screen readers (Phase 7 M1): visually
          nothing changes on undo except canvas pixels, which NVDA can't
          narrate — this polite live region says "Undid Move Rectangle". */}
      <span role="status" className="sr-only">
        {historyAnnouncement ?? ""}
      </span>
      {status === "initializing" && <span>Initializing…</span>}

      {status === "running" && (
        <>
          {stats.idle ? (
            // Damage model parked the loop — zero GPU submits right now
            // (ADR-025). Not a stall: a dimmed dot + "idle" reads as a
            // resting state rather than a broken "0 fps", and the title
            // explains the loop wakes on the next interaction. A frozen
            // "60 fps" here would be a lie.
            <span
              className="flex items-center gap-1.5 text-content-tertiary opacity-70"
              title="Render loop is idle — paused to save power (ADR-025). It resumes automatically on the next interaction."
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-content-tertiary"
                aria-hidden
              />
              idle
            </span>
          ) : (
            <>
              <span>{stats.fps} fps</span>
              <span>{stats.renderTimeMs.toFixed(2)} ms</span>
            </>
          )}
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
