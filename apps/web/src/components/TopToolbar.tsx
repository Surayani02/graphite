import { useEngineContext } from "../contexts/EngineContext";
import { useCommandShortcut } from "../features/shortcuts/useResolvedShortcuts";

/**
 * Top toolbar — Phase 6 M1, slimmed to document-level actions in M3.
 *
 * The Select/Pan tool buttons that lived here in M1 have moved to
 * `features/tools/ToolsRail`, alongside the new Rectangle/Ellipse
 * creation tools — one place owns "which tool is active" UI, rather than
 * splitting it across two toolbars. What's left here is document-scoped,
 * not tool-scoped: the wordmark and Save, with more document actions
 * (export, undo/redo) joining at their own milestones. Save's chord is
 * live from the resolved shortcut map (M4) — remaps show here too.
 */
export function TopToolbar() {
  const { requestSave, status } = useEngineContext();
  const saveShortcut = useCommandShortcut("file.save");

  return (
    <header className="flex h-11 items-center gap-2 border-b border-border-subtle bg-surface-panel px-3">
      <span className="font-mono text-xs font-semibold tracking-wide text-content-secondary">
        Graphite
      </span>

      <div className="flex-1" />

      <button
        type="button"
        title={saveShortcut === null ? "Save" : `Save (${saveShortcut.label})`}
        {...(saveShortcut !== null ? { "aria-keyshortcuts": saveShortcut.aria } : {})}
        disabled={status !== "running"}
        onClick={requestSave}
        className="rounded px-2.5 py-1 font-mono text-xs text-content-secondary hover:bg-surface-panel-hover disabled:opacity-40"
      >
        Save
      </button>
    </header>
  );
}
