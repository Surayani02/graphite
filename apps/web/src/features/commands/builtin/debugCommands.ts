import { MVP_MAX_OBJECTS, SYSTEM_MAX_OBJECTS } from "@graphite/protocol";
import { type CommandDescriptor } from "../types";

/**
 * Debug commands — Phase 7 M5, the project's first dev-only surface
 * (ADR-027).
 *
 * These load the deterministic stress scene at the two Blueprint budgets:
 * `MVP_MAX_OBJECTS` (10k — the performance charter every target is
 * written against) and `SYSTEM_MAX_OBJECTS` (100k — the system ceiling,
 * probed to feed ADR-023's R-tree re-adoption trigger). The counts come
 * from the protocol constants, never local literals, so the commands can
 * only ever load exactly the documented budgets.
 *
 * **Palette-only, by decision.** No `defaultChords` — the same policy as
 * `file.new`/`file.export`, so the trigger is discoverable by typing
 * "stress" into the palette and has zero visual footprint in the shell.
 * No toolbar affordance, no dev HUD.
 *
 * **Dev-only, by construction.** This array is spread into
 * `builtinCommands` behind `import.meta.env.DEV` (see `./index.ts`): in a
 * production build the spread is statically empty, these descriptors are
 * tree-shaken out, the palette never lists them, and the worker's
 * `debug:load_stress` handler is likewise compiled away — the surface
 * doesn't exist outside dev, it isn't merely hidden.
 *
 * Loading a stress scene replaces the current document exactly like
 * File → New does (same broadcasts, same history reset, same recovery-
 * snapshot overwrite) — deliberate, so a reload measures the real
 * `document:load` path at scale. The 100k snapshot exceeds the
 * localStorage quota and is skipped by the existing guard; the 10k one
 * persists and survives reload.
 */
export const debugCommands: readonly CommandDescriptor[] = [
  {
    id: "debug.stress10k",
    title: "Load Stress Scene (10k)",
    category: "Debug",
    keywords: ["stress", "performance", "benchmark", "profile", "10000"],
    enabled: (ctx) => ctx.engine.status === "running",
    run: (ctx) => {
      ctx.engine.loadStress(MVP_MAX_OBJECTS);
    },
  },
  {
    id: "debug.stress100k",
    title: "Load Stress Scene (100k)",
    category: "Debug",
    keywords: ["stress", "performance", "benchmark", "profile", "100000", "ceiling"],
    enabled: (ctx) => ctx.engine.status === "running",
    run: (ctx) => {
      ctx.engine.loadStress(SYSTEM_MAX_OBJECTS);
    },
  },
];
