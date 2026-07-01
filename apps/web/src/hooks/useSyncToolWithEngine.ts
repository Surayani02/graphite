import { useEffect } from "react";
import { useUIStore, selectEffectiveTool } from "../stores/uiStore";
import { useEngineContext } from "../context/EngineContext";

/**
 * The one place UI intent (Zustand) crosses into an engine API call.
 * Keeps the worker's active tool in sync with the UI store's effective
 * tool. Must be called once, inside the EngineProvider tree (currently:
 * EngineCanvas).
 */
export function useSyncToolWithEngine(): void {
  const { setTool } = useEngineContext();
  const effectiveTool = useUIStore(selectEffectiveTool);

  useEffect(() => {
    setTool(effectiveTool);
  }, [effectiveTool, setTool]);
}
