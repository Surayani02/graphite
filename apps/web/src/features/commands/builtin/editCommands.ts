import { type CommandDescriptor } from "../types";

/** Document-mutating commands. Undo/redo lead the Edit group — they are
 *  the highest-frequency edit actions in every design tool's palette. */
export const editCommands: readonly CommandDescriptor[] = [
  {
    id: "edit.undo",
    title: "Undo",
    category: "Edit",
    keywords: ["revert", "back", "history"],
    defaultChords: ["mod+z"],
    // Gated on the worker's live history:state mirror, exactly like
    // deleteSelection gates on selectedIds: disabled means the command
    // neither runs nor appears in the palette.
    enabled: (ctx) => ctx.engine.historyStatus.canUndo,
    run: (ctx) => {
      ctx.engine.undo();
    },
  },
  {
    id: "edit.redo",
    title: "Redo",
    category: "Edit",
    keywords: ["repeat", "forward", "history"],
    // mod+shift+z is the design-tool convention (Figma, Sketch); mod+y
    // aliases it for Windows muscle memory — same pattern as Delete +
    // Backspace below. First entry is the display chord.
    defaultChords: ["mod+shift+z", "mod+y"],
    enabled: (ctx) => ctx.engine.historyStatus.canRedo,
    run: (ctx) => {
      ctx.engine.redo();
    },
  },
  {
    id: "edit.deleteSelection",
    title: "Delete Selection",
    category: "Edit",
    keywords: ["remove", "erase", "clear"],
    // Backspace aliases Delete, matching the M3 raw-key behaviour (and every
    // design tool on laptops without a dedicated Delete key).
    defaultChords: ["delete", "backspace"],
    enabled: (ctx) => ctx.engine.selectedIds.length > 0,
    // Same semantic IPC path the M3 context menus use
    // (document:delete_selection) — not raw key forwarding, so behaviour is
    // identical whether the user pressed Delete, clicked a menu, or ran the
    // palette entry.
    run: (ctx) => {
      ctx.engine.deleteSelection();
    },
  },
];
