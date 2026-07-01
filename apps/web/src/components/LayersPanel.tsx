import { useUIStore } from "../stores/uiStore";

export function LayersPanel() {
  const layersOpen = useUIStore((s) => s.layersOpen);
  const toggleLayers = useUIStore((s) => s.toggleLayers);

  return (
    <aside
      aria-label="Layers"
      className={`flex flex-col border-r border-border-subtle bg-surface-panel transition-[width] ${
        layersOpen ? "w-60" : "w-9"
      }`}
    >
      <div className="flex h-9 items-center justify-between border-b border-border-subtle px-2">
        {layersOpen && (
          <span className="font-mono text-[11px] uppercase tracking-wide text-content-tertiary">
            Layers
          </span>
        )}
        <button
          type="button"
          title={layersOpen ? "Collapse layers panel" : "Expand layers panel"}
          onClick={toggleLayers}
          className="ml-auto rounded px-1.5 py-0.5 text-content-tertiary hover:bg-surface-panel-hover"
        >
          {layersOpen ? "‹" : "›"}
        </button>
      </div>
      {layersOpen && (
        <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] text-content-tertiary">
          Layer list — next Phase 6 milestone.
        </div>
      )}
    </aside>
  );
}
