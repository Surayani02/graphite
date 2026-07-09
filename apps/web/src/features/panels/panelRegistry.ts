import { type ComponentType } from "react";
import { type UIState } from "../../stores/uiStore";

/** Where a panel docks in the shell. Two areas today; the enum is the
 *  extension point for future dock zones (bottom, floating) at P10. */
export type PanelArea = "left" | "right";

/**
 * A panel as data (M5, ADR-018). AppShell renders areas from the registry
 * instead of hardcoding which component sits where — the first step toward
 * P10 docking, and the same registration idiom as the command registry so
 * contributors learn one pattern. Visibility stays bound to existing store
 * flags (`isVisible`) rather than introducing new persistence: no storage
 * migration until real docking needs it.
 */
export interface PanelDescriptor {
  /** Stable id — also the React key and the duplicate-guard key. */
  readonly id: string;
  readonly title: string;
  readonly area: PanelArea;
  /** Ascending render order within the area; ties break by registration order. */
  readonly order: number;
  readonly component: ComponentType;
  /** Reads current UI state to decide if the panel shows. Panels own their
   *  collapsed/expanded chrome; this governs presence in the layout. */
  readonly isVisible: (state: UIState) => boolean;
}

/**
 * Registration + area queries. Mirrors createCommandRegistry deliberately
 * (factory + singleton, insertion order preserved, duplicate-id throw) — a
 * contributor who has seen one has seen both.
 */
export interface PanelRegistry {
  register(panel: PanelDescriptor): () => void;
  /** Panels in an area, sorted by `order` then registration order. */
  byArea(area: PanelArea): readonly PanelDescriptor[];
  list(): readonly PanelDescriptor[];
}

export function createPanelRegistry(): PanelRegistry {
  const panels = new Map<string, PanelDescriptor>();
  return {
    register(panel) {
      if (panels.has(panel.id)) {
        throw new Error(`Panel "${panel.id}" is already registered`);
      }
      panels.set(panel.id, panel);
      return () => {
        panels.delete(panel.id);
      };
    },
    byArea(area) {
      // Stable sort by order; Map preserves insertion order for ties.
      return [...panels.values()]
        .filter((panel) => panel.area === area)
        .sort((a, b) => a.order - b.order);
    },
    list() {
      return [...panels.values()];
    },
  };
}

/** App-wide panel registry, populated at shell bootstrap (ensureBuiltinPanels). */
export const panelRegistry: PanelRegistry = createPanelRegistry();
