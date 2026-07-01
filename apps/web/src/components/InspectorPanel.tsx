import { useUIStore } from "../stores/uiStore";
import { useEngineContext } from "../context/EngineContext";

export function InspectorPanel() {
  const inspectorOpen = useUIStore((s) => s.inspectorOpen);
  const toggleInspector = useUIStore((s) => s.toggleInspector);
  const { selectedIds } = useEngineContext();

  return (
    <aside
      aria-label="Inspector"
      className={`flex flex-col border-l border-border-subtle bg-surface-panel transition-[width] ${
        inspectorOpen ? "w-64" : "w-9"
      }`}
    >
      <div className="flex h-9 items-center justify-between border-b border-border-subtle px-2">
        <button
          type="button"
          title={inspectorOpen ? "Collapse inspector" : "Expand inspector"}
          onClick={toggleInspector}
          className="mr-auto rounded px-1.5 py-0.5 text-content-tertiary hover:bg-surface-panel-hover"
        >
          {inspectorOpen ? "›" : "‹"}
        </button>
        {inspectorOpen && (
          <span className="font-mono text-[11px] uppercase tracking-wide text-content-tertiary">
            Inspector
          </span>
        )}
      </div>
      {inspectorOpen && (
        <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] text-content-tertiary">
          {selectedIds.length > 0
            ? `${selectedIds.length} node(s) selected — property fields land in the next Phase 6 milestone.`
            : "Select a shape to inspect it."}
        </div>
      )}
    </aside>
  );
}
