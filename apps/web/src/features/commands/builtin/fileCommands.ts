import { type CommandDescriptor } from "../types";

/**
 * Document-level file commands — Phase 7 M2 routes them through the
 * FilesProvider (`ctx.files`), which owns pickers, the `.graphite`
 * envelope, the discard guard, and confirmed-write dirty semantics.
 *
 * All of these gate on the engine running: before the worker is up there
 * is no document to serialise, and nothing to load one into. "Save
 * Document" keeps its M4-era title — the settings keymap e2e greps for
 * it, and palette muscle memory is worth preserving.
 *
 * Export (Phase 7 M4) additionally gates on `hasContent` — an empty
 * document has nothing to serialise, and a disabled command beats a
 * silent no-op or an empty file.
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
  {
    id: "export.svg",
    title: "Export as SVG",
    category: "File",
    // No default chord: mod+e is browser-contested (Chromium search-mode)
    // and mod+shift+e is extension-squatted — palette + custom remap only,
    // same policy as file.new.
    keywords: ["export", "svg", "vector", "image", "download"],
    enabled: (ctx) => ctx.engine.status === "running" && ctx.engine.hasContent,
    run: (ctx) => {
      ctx.exports.svg();
    },
  },
];
