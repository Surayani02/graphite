import { bench, describe } from "vitest";
import { fuzzyScore } from "../features/commands/fuzzy";

// Realistic palette corpus: the builtin command titles plus synthetic layer
// names, against the query shapes a user actually types.
const TARGETS: readonly string[] = [
  "Select Tool",
  "Pan Tool",
  "Rectangle Tool",
  "Ellipse Tool",
  "Delete Selection",
  "Save Document",
  "Show Command Palette",
  "Toggle Left Panel",
  "Toggle Inspector",
  "Go to Layers",
  "Go to Assets",
  "Change Keyboard Shortcut…",
  ...Array.from({ length: 88 }, (_, i) => `Layer ${i} — hero banner ${i % 7}`),
];

const QUERIES: readonly string[] = ["s", "sd", "rect", "save doc", "hero 4", "tog insp", "zzz", ""];

describe("fuzzyScore", () => {
  // Target: 10,000 scores in <10ms (docs/benchmarks/phase6-m4.md) — an
  // order of magnitude above what one palette keystroke needs (~100).
  bench("10,000 scores across mixed queries and targets", () => {
    let acc = 0;
    for (let i = 0; i < 10_000; i += 1) {
      acc += fuzzyScore(QUERIES[i % QUERIES.length] ?? "", TARGETS[i % TARGETS.length] ?? "");
    }
    if (acc < 0) throw new Error("unreachable — keeps the loop from being optimised away");
  });
});
