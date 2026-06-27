import { useEffect, useRef } from "react";
import { useEngine } from "../hooks/useEngine";

/**
 * EngineCanvas
 *
 * Mounts a <canvas> element and binds it to the engine worker.
 * The canvas fills its parent container; the overlay renders live GPU stats.
 *
 * Phase 6 will replace the inline overlay with proper toolbar and panel
 * components from @graphite/ui-core.
 */
export function EngineCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { initEngine, status, stats, error } = useEngine();

  useEffect(() => {
    if (!canvasRef.current) return;
    // initEngine returns the cleanup function React expects from useEffect
    return initEngine(canvasRef.current);
  }, [initEngine]);

  return (
    <div
      role="region"
      aria-label="Graphite canvas"
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      {/*
        GPU renders directly into this element via the transferred OffscreenCanvas.
        CSS width/height control layout; the physical pixel dimensions are set by
        the bridge before the transfer and updated via ResizeObserver.
      */}
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />

      {/* Lightweight stats overlay — will be feature-flagged out in Phase 7 */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          fontFamily: "monospace",
          fontSize: 11,
          lineHeight: 1.8,
          color: "rgba(255, 255, 255, 0.4)",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {status === "initializing" && <span>Initializing WebGPU…</span>}

        {status === "running" && (
          <>
            <div>Phase 1 — Engine Shell ✓</div>
            <div>{stats.fps} fps</div>
            <div>{stats.renderTimeMs.toFixed(2)} ms / frame</div>
            <div>frame {stats.frameNumber.toLocaleString()}</div>
          </>
        )}

        {status === "error" && (
          <span style={{ color: "#ff6b6b" }}>WebGPU error — open DevTools console</span>
        )}
      </div>
    </div>
  );
}
