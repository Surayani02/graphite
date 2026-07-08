import { type CommandDescriptor } from "../types";

/** Document-mutating commands. */
export const editCommands: readonly CommandDescriptor[] = [
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
