import { useCallback, useEffect, useRef, useState } from "react";
import { useEngine } from "../hooks/useEngine";
import type { ToolType, PointerModifiers } from "@graphite/protocol";
import { ToolBar } from "./ToolBar";
import { StatsHUD } from "./StatsHUD";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPointerMods(e: PointerEvent | WheelEvent): PointerModifiers {
  return { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey };
}

/**
 * QUAL-10: the previous guard only excluded `HTMLInputElement` and
 * `HTMLTextAreaElement`, so typing "v" into a `contenteditable` element
 * (e.g. a future inline rename field, comment box, or text-tool overlay)
 * would still trigger the "switch to select tool" shortcut. `isContentEditable`
 * covers every editable surface generically, including ones added later,
 * without needing this list updated per new component.
 *
 * Listeners stay on `window` rather than being scoped to a focused wrapper
 * element (the literal fix suggested by the static-analysis report): for a
 * design tool, keyboard shortcuts are expected to work regardless of which
 * panel currently has DOM focus (this is how Figma, Linear, and Sketch all
 * behave) — scoping to focus would silently break shortcuts the moment
 * focus lands somewhere unexpected, which is a worse failure mode than the
 * narrow gap being closed here.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
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
    lastSaved,
    setTool: bridgeSetTool,
    sendPointerDown,
    sendPointerMove,
    sendPointerUp,
    sendWheel,
    sendKeyDown,
    requestSave,
  } = useEngine();

  // ── Local UI state ─────────────────────────────────────────────────────────

  const [tool, setToolState] = useState<ToolType>("select");
  const [spaceDown, setSpaceDown] = useState(false);
  const [isPointerDown, setPointerDown] = useState(false);

  const toolRef = useRef<ToolType>("select");
  const spaceDownRef = useRef(false);

  const effectiveTool: ToolType = spaceDown ? "pan" : tool;
  const cursor = effectiveTool === "pan" ? (isPointerDown ? "grabbing" : "grab") : "default";

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!canvasRef.current) return;
    return initEngine(canvasRef.current);
  }, [initEngine]);

  // ── Auto-save on tab hide ──────────────────────────────────────────────────

  useEffect(() => {
    const handler = () => {
      if (globalThis.document.visibilityState === "hidden") requestSave();
    };
    globalThis.document.addEventListener("visibilitychange", handler);
    return () => globalThis.document.removeEventListener("visibilitychange", handler);
  }, [requestSave]);

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
      if (isEditableTarget(e.target)) return;

      // Ctrl/Cmd+S — save
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        requestSave();
        return;
      }

      if (e.key === " ") {
        e.preventDefault();
        if (!spaceDownRef.current) {
          spaceDownRef.current = true;
          setSpaceDown(true);
          bridgeSetTool("pan");
        }
        return;
      }

      const mods = { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey };

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
      if (e.key === "Escape") sendKeyDown("Escape", mods);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        spaceDownRef.current = false;
        setSpaceDown(false);
        bridgeSetTool(toolRef.current);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [changeTool, bridgeSetTool, sendKeyDown, requestSave]);

  // ── Wheel (non-passive) ───────────────────────────────────────────────────

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

  // ── Pointer ────────────────────────────────────────────────────────────────

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setPointerDown(true);
    sendPointerDown(
      e.nativeEvent.offsetX,
      e.nativeEvent.offsetY,
      e.button,
      getPointerMods(e.nativeEvent)
    );
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    sendPointerMove(e.nativeEvent.offsetX, e.nativeEvent.offsetY, getPointerMods(e.nativeEvent));
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setPointerDown(false);
    sendPointerUp(
      e.nativeEvent.offsetX,
      e.nativeEvent.offsetY,
      e.button,
      getPointerMods(e.nativeEvent)
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      role="region"
      aria-label="Graphite canvas"
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />

      {status === "running" && (
        <ToolBar effectiveTool={effectiveTool} onSelectTool={changeTool} onSave={requestSave} />
      )}

      <StatsHUD
        status={status}
        stats={stats}
        zoomPct={Math.round(viewport.zoom * 100)}
        lastSaved={lastSaved}
        selectedCount={selectedIds.length}
        error={error}
      />
    </div>
  );
}
