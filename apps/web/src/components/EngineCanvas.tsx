import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { ContextMenu, useContextMenuState, type MenuItem } from "@graphite/ui-core";
import { useEngineContext } from "../contexts/EngineContext";
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
 * M3 adds: R/O tool shortcuts alongside V/H, Delete/Backspace forwarding,
 * and a right-click context menu.
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
    selectedIds,
    deleteSelection,
  } = useEngineContext();

  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const setSpaceDown = useUIStore((s) => s.setSpaceDown);
  const effectiveTool = useUIStore(selectEffectiveTool);

  const [isPointerDown, setPointerDown] = useState(false);
  const spaceDownRef = useRef(false);
  const menu = useContextMenuState();

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
        if (e.key === "r" || e.key === "R") {
          setActiveTool("rectangle");
          return;
        }
        if (e.key === "o" || e.key === "O") {
          setActiveTool("ellipse");
          return;
        }
      }
      if (e.key === "Escape" || e.key === "Delete" || e.key === "Backspace") {
        sendKeyDown(e.key, mods);
      }
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
  // An interrupted pointer (pen leaving range, a browser gesture stealing
  // the pointer, tab switch mid-drag) fires pointercancel and never
  // pointerup — without this the worker stays in isDragging=true and the
  // next bare pointermove keeps dragging with no button held.
  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setPointerDown(false);
    sendPointerUp(
      e.nativeEvent.offsetX,
      e.nativeEvent.offsetY,
      e.button,
      getPointerMods(e.nativeEvent)
    );
  };

  // Menu content is real commands only (see M3 scope: leaf-shape deletion
  // is the only canvas command that exists yet) — no selection, no menu,
  // rather than a menu with everything disabled.
  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (selectedIds.length === 0) return;
    menu.show(e.clientX, e.clientY);
  };

  const menuItems: MenuItem[] = [
    {
      id: "delete",
      label: "Delete",
      icon: Trash2,
      shortcut: "Del",
      danger: true,
      onSelect: deleteSelection,
    },
  ];

  return (
    <div role="region" aria-label="Graphite canvas" className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={handleContextMenu}
      />
      <ContextMenu
        open={menu.open}
        position={menu.position}
        items={menuItems}
        onClose={menu.close}
      />
    </div>
  );
}
