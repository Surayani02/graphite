import { type CommandDescriptor } from "../types";

/** Tool-switching commands — one per rail tool, chords matching the M3
 *  single-letter defaults. Idempotent by nature, so key-repeat is safe. */
export const toolCommands: readonly CommandDescriptor[] = [
  {
    id: "tool.select",
    title: "Select Tool",
    category: "Tools",
    keywords: ["cursor", "pointer", "move"],
    defaultChords: ["v"],
    run: (ctx) => {
      ctx.ui.setActiveTool("select");
    },
  },
  {
    id: "tool.pan",
    title: "Pan Tool",
    category: "Tools",
    keywords: ["hand", "grab", "scroll"],
    defaultChords: ["h"],
    run: (ctx) => {
      ctx.ui.setActiveTool("pan");
    },
  },
  {
    id: "tool.rectangle",
    title: "Rectangle Tool",
    category: "Tools",
    keywords: ["rect", "square", "shape", "draw"],
    defaultChords: ["r"],
    run: (ctx) => {
      ctx.ui.setActiveTool("rectangle");
    },
  },
  {
    id: "tool.ellipse",
    title: "Ellipse Tool",
    category: "Tools",
    keywords: ["circle", "oval", "shape", "draw"],
    defaultChords: ["o"],
    run: (ctx) => {
      ctx.ui.setActiveTool("ellipse");
    },
  },
];
