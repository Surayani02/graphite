import { useUIStore } from "../../stores/uiStore";
import { panelRegistry, type PanelArea as Area } from "./panelRegistry";

/**
 * Renders every visible panel registered for one dock area (M5). AppShell
 * uses this for its left and right columns instead of naming components
 * directly — so the shell no longer knows *which* panels exist, only *where*
 * areas go. Subscribes to the whole UI state because a descriptor's
 * `isVisible` may read any field; the store is small and these evaluations
 * are trivial.
 */
export function PanelAreaSlot({ area }: { area: Area }) {
  const state = useUIStore();
  const panels = panelRegistry.byArea(area);
  return (
    <>
      {panels
        .filter((panel) => panel.isVisible(state))
        .map((panel) => {
          const Component = panel.component;
          return <Component key={panel.id} />;
        })}
    </>
  );
}
