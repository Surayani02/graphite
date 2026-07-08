import { type CommandDescriptor } from "../types";

/** Workspace/chrome commands — panels, palette, shortcut remapping. */
export const viewCommands: readonly CommandDescriptor[] = [
  {
    id: "view.commandPalette",
    title: "Show Command Palette",
    category: "View",
    keywords: ["search", "actions", "quick", "run"],
    defaultChords: ["mod+k"],
    run: (ctx) => {
      ctx.ui.openPalette();
    },
  },
  {
    id: "view.toggleLeftPanel",
    title: "Toggle Left Panel",
    category: "View",
    keywords: ["layers", "assets", "sidebar", "hide", "show"],
    defaultChords: ["mod+\\"],
    run: (ctx) => {
      ctx.ui.toggleLeftPanel();
    },
  },
  {
    id: "view.toggleInspector",
    title: "Toggle Inspector",
    category: "View",
    keywords: ["properties", "panel", "hide", "show"],
    defaultChords: ["mod+alt+\\"],
    run: (ctx) => {
      ctx.ui.toggleInspector();
    },
  },
  {
    id: "view.layersTab",
    title: "Go to Layers",
    category: "View",
    keywords: ["tree", "panel", "objects"],
    run: (ctx) => {
      ctx.ui.setLeftPanelTab("layers");
    },
  },
  {
    id: "view.assetsTab",
    title: "Go to Assets",
    category: "View",
    keywords: ["colors", "swatches", "panel"],
    run: (ctx) => {
      ctx.ui.setLeftPanelTab("assets");
    },
  },
  {
    id: "help.changeShortcut",
    title: "Change Keyboard Shortcut…",
    category: "Help",
    keywords: ["keybinding", "remap", "hotkey", "rebind", "keymap"],
    run: (ctx) => {
      ctx.ui.openShortcutRecorder();
    },
  },
];
