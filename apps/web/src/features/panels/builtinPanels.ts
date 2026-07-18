import { InspectorPanel } from "../inspector/InspectorPanel";
import { LeftPanel } from "../../layouts/LeftPanel";
import { panelRegistry, type PanelRegistry } from "./panelRegistry";

const registered = new WeakSet<PanelRegistry>();

/**
 * The built-in panels (M5). LeftPanel (Layers|Assets) and InspectorPanel
 * are the first descriptors. Both own their collapsed rail internally and
 * are therefore **always present** (`isVisible: true`) — the rail is how a
 * collapsed panel offers its own re-expand control. Binding inspector
 * visibility to `inspectorOpen` was BUG-08: it removed the whole panel,
 * collapsed rail included, so a collapsed inspector had no way back. Width
 * (full vs w-9 rail) is each panel's own internal concern, driven by the
 * store flag; presence is not.
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
    isVisible: () => true,
  });
}
