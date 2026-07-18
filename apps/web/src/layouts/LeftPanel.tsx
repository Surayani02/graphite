import { Tab, TabList, TabPanel, Tabs } from "@graphite/ui-core";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { AssetsPanel } from "../features/assets/AssetsPanel";
import { LayersPanel } from "../features/layers/LayersPanel";
import { useUIStore } from "../stores/uiStore";

/**
 * Left panel host (M4): the Layers | Assets tab pair, collapse control,
 * and panel chrome — composition only, no feature logic. Visibility stays
 * on the store's `layersOpen` (persisted key kept stable across releases);
 * the active tab persists as `leftPanelTab`.
 *
 * **One element, animated width (BUG-fix).** Collapsed and expanded are
 * the *same* `<aside>` whose width transitions between the `w-9` rail and
 * the `w-60` panel, rather than two separate return branches — React can
 * only animate a property that changes on a persistent element, so the
 * earlier branch-swap produced an instant jump. The expanded content is
 * always mounted and simply clipped by `overflow-hidden` while the rail is
 * narrow, so the reveal slides instead of popping. `duration-200 ease-out`
 * matches the inspector so both sides of the shell feel identical.
 *
 * Deliberately thin: M5's PanelDescriptor registry hosts this as its first
 * docking site.
 */
export function LeftPanel() {
  const open = useUIStore((s) => s.layersOpen);
  const toggleLayers = useUIStore((s) => s.toggleLayers);
  const tab = useUIStore((s) => s.leftPanelTab);
  const setLeftPanelTab = useUIStore((s) => s.setLeftPanelTab);

  return (
    <aside
      aria-label="Layers and assets"
      className={`flex min-h-0 flex-col overflow-hidden border-r border-border-subtle bg-surface-panel transition-[width] duration-200 ease-out ${
        open ? "w-60" : "w-9"
      }`}
    >
      {open ? (
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
              aria-label="Collapse left panel"
              onClick={toggleLayers}
              className="flex h-6 w-6 items-center justify-center rounded text-content-tertiary hover:bg-surface-panel-hover hover:text-content-secondary"
            >
              <PanelLeftClose size={15} aria-hidden />
            </button>
          </div>
          <TabPanel id="layers" className="min-h-0 flex-1 overflow-hidden">
            <LayersPanel />
          </TabPanel>
          <TabPanel id="assets" className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
            <AssetsPanel />
          </TabPanel>
        </Tabs>
      ) : (
        <button
          type="button"
          title="Expand left panel"
          aria-label="Expand left panel"
          onClick={toggleLayers}
          className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center self-center rounded text-content-tertiary hover:bg-surface-panel-hover hover:text-content-secondary"
        >
          <PanelLeftOpen size={15} aria-hidden />
        </button>
      )}
    </aside>
  );
}
