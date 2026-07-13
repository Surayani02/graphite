import { type CommandDescriptor } from "../types";

/**
 * Document-level file commands — Phase 7 M2 routes them through the
 * FilesProvider (`ctx.files`), which owns pickers, the `.graphite`
 * envelope, the discard guard, and confirmed-write dirty semantics.
 *
 * All four gate on the engine running: before the worker is up there is
 * no document to serialise, and nothing to load one into. "Save Document"
 * keeps its M4-era title — the settings keymap e2e greps for it, and
 * palette muscle memory is worth preserving.
 */
export const fileCommands: readonly CommandDescriptor[] = [
  {
    id: "file.save",
    title: "Save Document",
    category: "File",
    keywords: ["persist", "store", "write", "file"],
    defaultChords: ["mod+s"],
    enabled: (ctx) => ctx.engine.status === "running",
    run: (ctx) => {
      ctx.files.save();
    },
  },
  {
    id: "file.saveAs",
    title: "Save Document As",
    category: "File",
    keywords: ["export", "copy", "rename", "file"],
    defaultChords: ["mod+shift+s"],
    enabled: (ctx) => ctx.engine.status === "running",
    run: (ctx) => {
      ctx.files.saveAs();
    },
  },
  {
    id: "file.open",
    title: "Open Document",
    category: "File",
    keywords: ["load", "read", "import", "file"],
    defaultChords: ["mod+o"],
    enabled: (ctx) => ctx.engine.status === "running",
    run: (ctx) => {
      ctx.files.open();
    },
  },
  {
    id: "file.new",
    title: "New Document",
    category: "File",
    // No default chord: mod+n cannot be intercepted (browser-reserved in
    // Chromium); palette + custom remap only.
    keywords: ["create", "blank", "fresh", "file"],
    enabled: (ctx) => ctx.engine.status === "running",
    run: (ctx) => {
      ctx.files.newDocument();
    },
  },
];
