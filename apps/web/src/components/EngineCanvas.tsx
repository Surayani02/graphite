import { useEffect, useRef, useState } from "react";
import { useEngineContext } from "../context/EngineContext";
import { useUIStore, selectEffectiveTool } from "../stores/uiStore";
import { useSyncToolWithEngine } from "../hooks/useSyncToolWithEngine";
import type { PointerModifiers } from "@graphite/protocol";

function getPointerMods(e: PointerEvent | WheelEvent): PointerModifiers {
  return { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

/**
 * Phase 6: trimmed to canvas + input wiring only. The toolbar and stats
 * HUD that used to float on top of this component are now docked panels
 * in AppShell (TopToolbar, StatusBar) reading the same engine context.
 */
export function EngineCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    initEngine,
    sendPointerDown,
    sendPointerMove,
    sendPointerUp,
    sendWheel,
    sendKeyDown,
    requestSave,
  } = useEngineContext();

  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const setSpaceDown = useUIStore((s) => s.setSpaceDown);
  const effectiveTool = useUIStore(selectEffectiveTool);

  const [isPointerDown, setPointerDown] = useState(false);
  const spaceDownRef = useRef(false);

  useSyncToolWithEngine();

  const cursor = effectiveTool === "pan" ? (isPointerDown ? "grabbing" : "grab") : "default";

  useEffect(() => {
    if (!canvasRef.current) return;
    return initEngine(canvasRef.current);
  }, [initEngine]);

  useEffect(() => {
    const handler = () => {
      if (globalThis.document.visibilityState === "hidden") requestSave();
    };
    globalThis.document.addEventListener("visibilitychange", handler);
    return () => globalThis.document.removeEventListener("visibilitychange", handler);
  }, [requestSave]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

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
        }
        return;
      }

      const mods = { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey };

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "v" || e.key === "V") {
          setActiveTool("select");
          return;
        }
        if (e.key === "h" || e.key === "H") {
          setActiveTool("pan");
          return;
        }
      }
      if (e.key === "Escape") sendKeyDown("Escape", mods);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        spaceDownRef.current = false;
        setSpaceDown(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [setActiveTool, setSpaceDown, sendKeyDown, requestSave]);

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

  return (
    <div role="region" aria-label="Graphite canvas" className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </div>
  );
}
