import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { Tooltip } from "@graphite/ui-core";
import { useEngineContext } from "../contexts/EngineContext";
import { useFiles } from "../features/files/FilesProvider";
import { useCommandShortcut } from "../features/shortcuts/useResolvedShortcuts";
import { ThemeToggle } from "../features/theme/ThemeToggle";

/**
 * Top toolbar — Phase 6 M1, slimmed to document-level actions in M3,
 * file-session aware in Phase 7 M2.
 *
 * Document-scoped chrome only: the wordmark, the current file name with
 * the unsaved-changes dot (title-bar convention — the dot, not the name,
 * is the dirty signal), a transient file-error slot, and Save. Save now
 * routes through the FilesProvider (real `.graphite` writes, confirmed-
 * write dirty semantics) rather than poking the worker directly; its
 * chord label stays live from the resolved shortcut map (M4).
 */
export function TopToolbar() {
  const { status } = useEngineContext();
  const { fileName, dirty, fileError, save } = useFiles();
  const saveShortcut = useCommandShortcut("file.save");

  return (
    <header className="flex h-11 items-center gap-2 border-b border-border-subtle bg-surface-panel px-3">
      <span className="font-mono text-xs font-semibold tracking-wide text-content-secondary">
        Graphite
      </span>

      <span className="max-w-64 truncate font-mono text-xs text-content-tertiary">
        {fileName ?? "Untitled"}
        {dirty && (
          <span className="ml-1 text-content-secondary" title="Unsaved changes">
            ●<span className="sr-only"> (unsaved changes)</span>
          </span>
        )}
      </span>

      {fileError !== null && (
        <span role="alert" className="max-w-96 truncate font-mono text-[11px] text-danger">
          {fileError}
        </span>
      )}

      <div className="flex-1" />

      <ThemeToggle />

      <Tooltip label="Settings">
        <Link
          to="/settings"
          aria-label="Settings"
          className="flex h-7 w-7 items-center justify-center rounded text-content-tertiary hover:bg-surface-panel-hover hover:text-content-secondary focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-border-focus"
        >
          <Settings size={15} aria-hidden />
        </Link>
      </Tooltip>

      <div className="mx-1 h-5 w-px bg-border-subtle" aria-hidden />

      <button
        type="button"
        title={saveShortcut === null ? "Save" : `Save (${saveShortcut.label})`}
        {...(saveShortcut !== null ? { "aria-keyshortcuts": saveShortcut.aria } : {})}
        disabled={status !== "running"}
        onClick={save}
        className="rounded px-2.5 py-1 font-mono text-xs text-content-secondary hover:bg-surface-panel-hover disabled:opacity-40"
      >
        Save
      </button>
    </header>
  );
}
