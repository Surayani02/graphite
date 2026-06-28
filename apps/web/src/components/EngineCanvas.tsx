import { useCallback, useEffect, useRef, useState } from "react";
import { useEngine } from "../hooks/useEngine";
import type { ToolType, PointerModifiers } from "@graphite/protocol";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPointerMods(e: React.PointerEvent | PointerEvent | WheelEvent): PointerModifiers {
  return {
    shift: e.shiftKey,
    ctrl: e.ctrlKey,
    alt: e.altKey,
    meta: e.metaKey,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EngineCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const {
    initEngine,
    status,
    stats,
    error,
    selectedIds,
    viewport,
    setTool: bridgeSetTool,
    sendPointerDown,
    sendPointerMove,
    sendPointerUp,
    sendWheel,
    sendKeyDown,
  } = useEngine();

  // ── Local UI state ─────────────────────────────────────────────────────────

  const [tool, setToolState] = useState<ToolType>("select");
  const [spaceDown, setSpaceDown] = useState(false);
  const [isPointerDown, setPointerDown] = useState(false);

  // Refs keep keyboard handlers stable without re-creating them on state changes
  const toolRef = useRef<ToolType>("select");
  const spaceDownRef = useRef(false);

  const effectiveTool: ToolType = spaceDown ? "pan" : tool;
  const cursor = effectiveTool === "pan" ? (isPointerDown ? "grabbing" : "grab") : "default";

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!canvasRef.current) return;
    return initEngine(canvasRef.current);
  }, [initEngine]);

  // ── Tool management ────────────────────────────────────────────────────────

  const changeTool = useCallback(
    (newTool: ToolType) => {
      toolRef.current = newTool;
      setToolState(newTool);
      bridgeSetTool(newTool);
    },
    [bridgeSetTool]
  );

  // ── Keyboard ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't intercept shortcuts when the user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === " ") {
        e.preventDefault();
        if (!spaceDownRef.current) {
          spaceDownRef.current = true;
          setSpaceDown(true);
          bridgeSetTool("pan"); // temporary override
        }
        return;
      }

      const mods = { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey };

      // Tool shortcuts (no modifier required)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "v" || e.key === "V") {
          changeTool("select");
          return;
        }
        if (e.key === "h" || e.key === "H") {
          changeTool("pan");
          return;
        }
      }

      if (e.key === "Escape") {
        sendKeyDown("Escape", mods);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        spaceDownRef.current = false;
        setSpaceDown(false);
        bridgeSetTool(toolRef.current); // restore actual tool
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [changeTool, bridgeSetTool, sendKeyDown]);

  // ── Wheel (non-passive so we can preventDefault) ──────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      sendWheel(e.deltaX, e.deltaY, e.offsetX, e.offsetY, getPointerMods(e));
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [sendWheel]);

  // ── Pointer events ─────────────────────────────────────────────────────────

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setPointerDown(true);
    sendPointerDown(e.nativeEvent.offsetX, e.nativeEvent.offsetY, e.button, getPointerMods(e));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    sendPointerMove(e.nativeEvent.offsetX, e.nativeEvent.offsetY, getPointerMods(e));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setPointerDown(false);
    sendPointerUp(e.nativeEvent.offsetX, e.nativeEvent.offsetY, e.button, getPointerMods(e));
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const zoomPct = Math.round(viewport.zoom * 100);

  return (
    <div
      role="region"
      aria-label="Graphite canvas"
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      {/* GPU canvas */}
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />

      {/* Tool bar — top-left */}
      {status === "running" && (
        <div
          aria-label="Toolbar"
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            display: "flex",
            gap: 4,
            background: "rgba(0,0,0,0.55)",
            borderRadius: 6,
            padding: "4px 6px",
          }}
        >
          {(["select", "pan"] as const).map((t) => (
            <button
              key={t}
              title={t === "select" ? "Select (V)" : "Pan (H)"}
              onClick={() => {
                changeTool(t);
              }}
              style={{
                background: effectiveTool === t ? "rgba(22,119,255,0.85)" : "transparent",
                border: "none",
                borderRadius: 4,
                color: "rgba(255,255,255,0.85)",
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: 12,
                padding: "3px 8px",
                fontWeight: effectiveTool === t ? 600 : 400,
              }}
            >
              {t === "select" ? "V" : "H"}
            </button>
          ))}
        </div>
      )}

      {/* Stats HUD — bottom-left */}
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
            <div>Phase 4 — Interaction ✓</div>
            <div>
              {stats.fps} fps · {stats.renderTimeMs.toFixed(2)} ms
            </div>
            <div>zoom {zoomPct}%</div>
            {selectedIds.length > 0 && (
              <div>
                {selectedIds.length} shape{selectedIds.length > 1 ? "s" : ""} selected — Esc to
                deselect
              </div>
            )}
          </>
        )}

        {status === "error" && (
          <span style={{ color: "#ff6b6b" }}>{error ?? "Engine error — check console"}</span>
        )}
      </div>
    </div>
  );
}
