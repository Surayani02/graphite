/**
 * UI-only state — Phase 6.
 *
 * Holds exactly what the blueprint specifies for Zustand: tool selection
 * intent, layout preferences, and (M4) chrome intent — palette and
 * shortcut-recorder visibility, the left-panel tab, and persisted shortcut
 * overrides. It never holds engine/renderer/document state (selection,
 * viewport, FPS) — that stays in `useEngine`/Context, reachable via
 * `useEngineContext()`.
 */

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { type ToolType } from "@graphite/protocol";
import { type CommandId } from "../features/commands/types";
import { type ThemePreference } from "../features/theme/theme";

/** Which tab the left panel shows. */
export type LeftPanelTab = "layers" | "assets";

export interface UIState {
  /** The tool the user explicitly selected (toolbar click or V/H shortcut). */
  activeTool: ToolType;
  /** True while the spacebar is held — temporarily overrides the engine's
   * active tool to "pan" without changing `activeTool` itself. */
  spaceDown: boolean;
  layersOpen: boolean;
  inspectorOpen: boolean;
  /** Active left-panel tab (persisted; M4). */
  leftPanelTab: LeftPanelTab;
  /** Command palette visibility (transient; M4). */
  paletteOpen: boolean;
  /** Shortcut-recorder dialog visibility (transient; M4). */
  shortcutRecorderOpen: boolean;
  /** Command preselected in the recorder when opened for a specific one. */
  shortcutRecorderTarget: CommandId | null;
  /**
   * Persisted keymap edits, keyed by CommandId: a chord string rebinds the
   * command, `null` explicitly unbinds it, absence means "use defaults".
   * Values are canonicalized by features/shortcuts at resolve time, so
   * stale or hand-edited storage degrades to "unbound", never to a crash.
   */
  shortcutOverrides: Readonly<Record<string, string | null>>;
  /** Appearance preference (persisted; M5). Resolved to a concrete theme
   * and applied to the document by features/theme. */
  themePreference: ThemePreference;

  setActiveTool: (tool: ToolType) => void;
  setSpaceDown: (down: boolean) => void;
  toggleLayers: () => void;
  toggleInspector: () => void;
  /** Switches the tab and reveals the panel — navigating to a tab implies
   * wanting to see it, so a collapsed left panel expands. */
  setLeftPanelTab: (tab: LeftPanelTab) => void;
  openPalette: () => void;
  closePalette: () => void;
  /** Opens the recorder, closing the palette — one modal at a time. */
  openShortcutRecorder: (target?: CommandId) => void;
  closeShortcutRecorder: () => void;
  /**
   * Rebinds (chord) or unbinds (`null`) one command. Enforces the
   * one-chord-one-command invariant among *overrides* by nulling any other
   * override holding the same chord. Collisions with shipped defaults are
   * resolved at read time instead (shortcutMap.ts) — clearing this
   * override later lets a shadowed default come back.
   */
  setShortcutOverride: (id: CommandId, chord: string | null) => void;
  resetShortcuts: () => void;
  setThemePreference: (preference: ThemePreference) => void;
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
      leftPanelTab: "layers",
      paletteOpen: false,
      shortcutRecorderOpen: false,
      shortcutRecorderTarget: null,
      shortcutOverrides: {},
      themePreference: "dark",

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
      setLeftPanelTab: (tab) => {
        set({ leftPanelTab: tab, layersOpen: true });
      },
      openPalette: () => {
        // Start of the <50ms open budget — CommandPalette closes the measure
        // after its first painted frame (docs/benchmarks/phase6-m4.md).
        if (typeof performance !== "undefined") {
          performance.mark("graphite:palette-open:start");
        }
        set({ paletteOpen: true });
      },
      closePalette: () => {
        set({ paletteOpen: false });
      },
      openShortcutRecorder: (target) => {
        set({
          shortcutRecorderOpen: true,
          shortcutRecorderTarget: target ?? null,
          paletteOpen: false,
        });
      },
      closeShortcutRecorder: () => {
        set({ shortcutRecorderOpen: false, shortcutRecorderTarget: null });
      },
      setShortcutOverride: (id, chord) => {
        set((s) => {
          const next: Record<string, string | null> = { ...s.shortcutOverrides };
          if (chord !== null) {
            for (const [otherId, existing] of Object.entries(next)) {
              if (otherId !== id && existing === chord) next[otherId] = null;
            }
          }
          next[id] = chord;
          return { shortcutOverrides: next };
        });
      },
      resetShortcuts: () => {
        set({ shortcutOverrides: {} });
      },
      setThemePreference: (preference) => {
        set({ themePreference: preference });
      },
    }),
    {
      // Versioned key, separate from the document's "graphite-document-v1" —
      // UI preferences and document content are different persistence concerns.
      name: "graphite-ui-v1",
      storage: createJSONStorage(() => storage),
      // Only durable preferences persist. Tool, space-pan, and modal
      // visibility are transient interaction state and reset on every load.
      partialize: (state) => ({
        layersOpen: state.layersOpen,
        inspectorOpen: state.inspectorOpen,
        leftPanelTab: state.leftPanelTab,
        shortcutOverrides: state.shortcutOverrides,
        themePreference: state.themePreference,
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
