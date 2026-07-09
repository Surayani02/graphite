import { InspectorPanel } from "../inspector/InspectorPanel";
import { LeftPanel } from "../../layouts/LeftPanel";
import { panelRegistry, type PanelRegistry } from "./panelRegistry";

const registered = new WeakSet<PanelRegistry>();

/**
 * The built-in panels (M5). LeftPanel (Layers|Assets) and InspectorPanel
 * become the first descriptors — visibility bound to the existing persisted
 * store flags, so this is pure indirection with zero behaviour change.
 * LeftPanel already renders its own collapsed rail via `layersOpen`, so it
 * is always present (`isVisible: true`) and owns its width internally;
 * the inspector is shown/hidden wholesale by `inspectorOpen`.
 *
 * Idempotent per registry, like ensureBuiltinCommands — safe under HMR and
 * repeated test setup.
 */
export function ensureBuiltinPanels(registry: PanelRegistry = panelRegistry): void {
  if (registered.has(registry)) return;
  registered.add(registry);
  registry.register({
    id: "left",
    title: "Layers & Assets",
    area: "left",
    order: 0,
    component: LeftPanel,
    isVisible: () => true,
  });
  registry.register({
    id: "inspector",
    title: "Inspector",
    area: "right",
    order: 0,
    component: InspectorPanel,
    isVisible: (state) => state.inspectorOpen,
  });
}
