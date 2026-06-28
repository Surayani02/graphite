import { useEffect, useRef } from "react";
import { useEngine } from "../hooks/useEngine";

const EngineCanvas=function() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { initEngine, status, stats, error } = useEngine();

  useEffect(() => {
    if (!canvasRef.current) return;
    return initEngine(canvasRef.current);
  }, [initEngine]);

  return (
    <div
      role="region"
      aria-label="Graphite canvas"
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />

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
        {status === "initializing" && <span>Initializing…</span>}

        {status === "running" && (
          <>
            <div>Phase 2 — Scene Graph ✓</div>
            <div>
              {stats.fps} fps · {stats.renderTimeMs.toFixed(2)} ms
            </div>
            <div>frame {stats.frameNumber.toLocaleString()}</div>
          </>
        )}

        {status === "error" && (
          <span style={{ color: "#ff6b6b" }}>Engine error — check console</span>
        )}
      </div>
    </div>
  );
}

export default EngineCanvas;