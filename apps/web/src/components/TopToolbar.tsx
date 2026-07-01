import { useUIStore, selectEffectiveTool } from "../stores/uiStore";
import { useEngineContext } from "../context/EngineContext";
import type { ToolType } from "@graphite/protocol";

const TOOLS: ReadonlyArray<{ tool: ToolType; label: string; title: string }> = [
  { tool: "select", label: "V", title: "Select (V)" },
  { tool: "pan", label: "H", title: "Pan (H)" },
];

export function TopToolbar() {
  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const effectiveTool = useUIStore(selectEffectiveTool);
  const { requestSave, status } = useEngineContext();

  return (
    <header className="flex h-11 items-center gap-2 border-b border-border-subtle bg-surface-panel px-3">
      <span className="font-mono text-xs font-semibold tracking-wide text-content-secondary">
        Graphite
      </span>

      <div className="ml-4 flex items-center gap-1 rounded-md bg-surface-canvas/60 p-1">
        {TOOLS.map(({ tool, label, title }) => (
          <button
            key={tool}
            type="button"
            title={title}
            aria-pressed={effectiveTool === tool}
            onClick={() => {
              setActiveTool(tool);
            }}
            className={`rounded px-2.5 py-1 font-mono text-xs transition-colors ${
              effectiveTool === tool
                ? "bg-accent font-semibold text-white"
                : "text-content-secondary hover:bg-surface-panel-hover"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <button
        type="button"
        title="Save (Ctrl+S)"
        disabled={status !== "running"}
        onClick={requestSave}
        className="rounded px-2.5 py-1 font-mono text-xs text-content-secondary hover:bg-surface-panel-hover disabled:opacity-40"
      >
        Save
      </button>
    </header>
  );
}
