import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { ContextMenu, useContextMenuState, type MenuItem } from "@graphite/ui-core";
import { useEngineContext } from "../contexts/EngineContext";
import { useUIStore, selectEffectiveTool } from "../stores/uiStore";
import { useSyncToolWithEngine } from "../hooks/useSyncToolWithEngine";
import { useCommandShortcut } from "../features/shortcuts/useResolvedShortcuts";
import type { PointerModifiers } from "@graphite/protocol";

function getPointerMods(e: PointerEvent | WheelEvent): PointerModifiers {
  return { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey };
}

/**
 * Phase 6: canvas + pointer/wheel wiring only. The toolbar and stats HUD
 * that used to float on top of this component are docked panels in
 * AppShell (M1); the global keyboard listener that lived here through M3
 * (tool letters, mod+S, Space-pan, Escape/Delete forwarding) moved to
 * features/shortcuts/ShortcutProvider in M4 — one owner for global keys,
 * driven by the command registry (ADR-015). What remains is strictly
 * pointer-coupled: pointer/wheel forwarding, cursor, the save-on-hide
 * hook, and the right-click context menu.
 */
export function EngineCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    initEngine,
    sendPointerDown,
    sendPointerMove,
    sendPointerUp,
    sendWheel,
    requestRecoverySnapshot,
    selectedIds,
    deleteSelection,
  } = useEngineContext();

  const effectiveTool = useUIStore(selectEffectiveTool);
  const deleteShortcut = useCommandShortcut("edit.deleteSelection");

  const [isPointerDown, setPointerDown] = useState(false);
  const menu = useContextMenuState();

  useSyncToolWithEngine();

  const cursor = effectiveTool === "pan" ? (isPointerDown ? "grabbing" : "grab") : "default";

  useEffect(() => {
    if (!canvasRef.current) return;
    return initEngine(canvasRef.current);
  }, [initEngine]);

  useEffect(() => {
    const handler = () => {
      if (globalThis.document.visibilityState === "hidden") requestRecoverySnapshot();
    };
    globalThis.document.addEventListener("visibilitychange", handler);
    return () => globalThis.document.removeEventListener("visibilitychange", handler);
  }, [requestRecoverySnapshot]);

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
      danger: true,
      onSelect: deleteSelection,
      // Live chord (M4): rebinding Delete in the recorder updates this label.
      ...(deleteShortcut !== null ? { shortcut: deleteShortcut.label } : {}),
    },
  ];

  return (
    <div role="region" aria-label="Graphite canvas" className="relative h-full min-h-0 w-full">
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
