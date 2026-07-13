import { useMemo } from "react";
import { useEngineContext } from "../../contexts/EngineContext";
import { useUIStore } from "../../stores/uiStore";
import { type CommandContext } from "./types";

/**
 * Assembles the `CommandContext` handed to `run`/`enabled` at dispatch
 * time. All setters below are referentially stable (useCallback([]) in
 * useEngine; Zustand actions), so this memo's identity changes only when
 * `selectedIds` or `historyStatus` does — the two live values commands
 * read.
 */
export function useCommandContext(): CommandContext {
  const {
    selectedIds,
    setSelection,
    deleteSelection,
    requestSave,
    updateNode,
    historyStatus,
    undo,
    redo,
  } = useEngineContext();
  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const toggleLayers = useUIStore((s) => s.toggleLayers);
  const toggleInspector = useUIStore((s) => s.toggleInspector);
  const openPalette = useUIStore((s) => s.openPalette);
  const setLeftPanelTab = useUIStore((s) => s.setLeftPanelTab);
  const openShortcutRecorder = useUIStore((s) => s.openShortcutRecorder);

  return useMemo<CommandContext>(
    () => ({
      engine: {
        selectedIds,
        setSelection,
        deleteSelection,
        requestSave,
        updateNode,
        historyStatus,
        undo,
        redo,
      },
      ui: {
        setActiveTool,
        toggleLeftPanel: toggleLayers,
        toggleInspector,
        openPalette,
        setLeftPanelTab,
        openShortcutRecorder,
      },
    }),
    [
      selectedIds,
      setSelection,
      deleteSelection,
      requestSave,
      updateNode,
      historyStatus,
      undo,
      redo,
      setActiveTool,
      toggleLayers,
      toggleInspector,
      openPalette,
      setLeftPanelTab,
      openShortcutRecorder,
    ]
  );
}
