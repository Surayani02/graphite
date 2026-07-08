import { type CommandDescriptor } from "../types";

/** Document-level file commands. */
export const fileCommands: readonly CommandDescriptor[] = [
  {
    id: "file.save",
    title: "Save Document",
    category: "File",
    keywords: ["persist", "store", "write"],
    defaultChords: ["mod+s"],
    run: (ctx) => {
      ctx.engine.requestSave();
    },
  },
];
