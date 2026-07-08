import { Tab, TabList, TabPanel, Tabs } from "@graphite/ui-core";
import { AssetsPanel } from "../features/assets/AssetsPanel";
import { LayersPanel } from "../features/layers/LayersPanel";
import { useUIStore } from "../stores/uiStore";

/**
 * Left panel host (M4): the Layers | Assets tab pair, collapse control,
 * and panel chrome — composition only, no feature logic. Panel visibility
 * stays on the store's `layersOpen` (persisted key kept stable across
 * releases) and now governs the whole panel; the active tab persists as
 * `leftPanelTab`. Deliberately thin: M5's PanelDescriptor registry absorbs
 * this as its first docking site, and the less this file owns, the
 * cheaper that migration is.
 */
export function LeftPanel() {
  const open = useUIStore((s) => s.layersOpen);
  const toggleLayers = useUIStore((s) => s.toggleLayers);
  const tab = useUIStore((s) => s.leftPanelTab);
  const setLeftPanelTab = useUIStore((s) => s.setLeftPanelTab);

  if (!open) {
    return (
      <aside
        aria-label="Layers and assets"
        className="flex w-9 flex-col items-center border-r border-border-subtle bg-surface-panel"
      >
        <button
          type="button"
          title="Expand left panel"
          onClick={toggleLayers}
          className="mt-1.5 rounded px-1.5 py-0.5 font-mono text-[11px] text-content-tertiary hover:bg-surface-panel-hover hover:text-content-secondary"
        >
          ›
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Layers and assets"
      className="flex w-60 flex-col border-r border-border-subtle bg-surface-panel"
    >
      <Tabs
        selectedKey={tab}
        onSelectionChange={(key) => {
          setLeftPanelTab(key === "assets" ? "assets" : "layers");
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-border-subtle px-1.5">
          <TabList label="Left panel">
            <Tab id="layers">Layers</Tab>
            <Tab id="assets">Assets</Tab>
          </TabList>
          <button
            type="button"
            title="Collapse left panel"
            onClick={toggleLayers}
            className="rounded px-1.5 py-0.5 font-mono text-[11px] text-content-tertiary hover:bg-surface-panel-hover hover:text-content-secondary"
          >
            ‹
          </button>
        </div>
        <TabPanel id="layers" className="min-h-0 flex-1 overflow-hidden">
          <LayersPanel />
        </TabPanel>
        <TabPanel id="assets" className="min-h-0 flex-1 overflow-y-auto">
          <AssetsPanel />
        </TabPanel>
      </Tabs>
    </aside>
  );
}
