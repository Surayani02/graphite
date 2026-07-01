/**
 * UI-only state — Phase 6.
 *
 * Holds exactly what the blueprint specifies for Zustand: tool selection
 * intent and layout preferences. It never holds engine/renderer/document
 * state (selection, viewport, FPS) — that stays in `useEngine`/Context,
 * reachable via `useEngineContext()`.
 */

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { ToolType } from "@graphite/protocol";

interface UIState {
  /** The tool the user explicitly selected (toolbar click or V/H shortcut). */
  activeTool: ToolType;
  /** True while the spacebar is held — temporarily overrides the engine's
   * active tool to "pan" without changing `activeTool` itself. */
  spaceDown: boolean;
  layersOpen: boolean;
  inspectorOpen: boolean;

  setActiveTool: (tool: ToolType) => void;
  setSpaceDown: (down: boolean) => void;
  toggleLayers: () => void;
  toggleInspector: () => void;
}

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/** Falls back to a no-op storage outside the browser (SSR, plain-node test
 * runs) instead of crashing on `localStorage is not defined`. */
const storage = typeof window !== "undefined" ? window.localStorage : noopStorage;

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      activeTool: "select",
      spaceDown: false,
      layersOpen: true,
      inspectorOpen: true,

      setActiveTool: (tool) => {
        set({ activeTool: tool });
      },
      setSpaceDown: (down) => {
        set({ spaceDown: down });
      },
      toggleLayers: () => {
        set((s) => ({ layersOpen: !s.layersOpen }));
      },
      toggleInspector: () => {
        set((s) => ({ inspectorOpen: !s.inspectorOpen }));
      },
    }),
    {
      // Versioned key, separate from the document's "graphite-document-v1" —
      // UI preferences and document content are different persistence concerns.
      name: "graphite-ui-v1",
      storage: createJSONStorage(() => storage),
      // Only layout preferences persist. activeTool/spaceDown are transient
      // interaction state and should reset to "select" on every fresh load.
      partialize: (state) => ({
        layersOpen: state.layersOpen,
        inspectorOpen: state.inspectorOpen,
      }),
    }
  )
);

/**
 * The tool the engine should actually use right now. Deliberately not
 * stored as its own field — it is a pure function of `activeTool` and
 * `spaceDown`, and storing it separately would let it drift out of sync
 * with the two values it's derived from.
 */
export function selectEffectiveTool(state: UIState): ToolType {
  return state.spaceDown ? "pan" : state.activeTool;
}
