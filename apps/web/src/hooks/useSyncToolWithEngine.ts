import { useEffect, useRef } from "react";
import type { ToolType } from "@graphite/protocol";
import { useUIStore, selectEffectiveTool } from "../stores/uiStore";
import { useEngineContext } from "../contexts/EngineContext";

/**
 * The crossing point between UI intent (Zustand) and the engine — now
 * two-way as of Phase 6 M3.
 *
 * Store → engine (unchanged since M1): whenever the UI store's effective
 * tool changes, tell the worker.
 *
 * Engine → store (new): the worker can also change the active tool on its
 * own — right now, auto-returning to "select" once a shape-creation drag
 * commits (see workers/engine/scene/create.ts). `lastEngineTool` carries
 * that decision back through EngineContext; this hook applies it to the
 * store so the toolbar/rail UI reflects it.
 *
 * Both directions live in **one** effect rather than two, and the guard
 * against echoing an engine-applied value back to the engine compares
 * *values* against `lastSyncedRef`, not a one-shot "just applied" flag.
 * A two-effect, flag-based version was tried first and has a real bug: the
 * store write here (`setActiveTool`) changes `effectiveTool`, which
 * retriggers the *other* effect on the *next* render with a fresh
 * dependency change — a one-shot flag only catches the first (same-commit)
 * evaluation and has already reset itself by the time that second,
 * store-triggered render runs, so the echo fires anyway, just one render
 * late. Comparing against the last value both sides are known to agree on
 * is immune to how many renders it takes to get there.
 */
export function useSyncToolWithEngine(): void {
  const { setTool, lastEngineTool } = useEngineContext();
  const effectiveTool = useUIStore(selectEffectiveTool);
  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const lastSyncedRef = useRef<ToolType | null>(null);

  useEffect(() => {
    if (lastEngineTool !== null && lastEngineTool !== lastSyncedRef.current) {
      // The engine changed the tool. Absorb it into the store; this
      // render's job is done — it must not also fall through and report
      // the *pre-update* effectiveTool back to the engine as if it were
      // new information.
      lastSyncedRef.current = lastEngineTool;
      if (lastEngineTool !== effectiveTool) setActiveTool(lastEngineTool);
      return;
    }

    if (effectiveTool !== lastSyncedRef.current) {
      lastSyncedRef.current = effectiveTool;
      setTool(effectiveTool);
    }
  }, [effectiveTool, lastEngineTool, setActiveTool, setTool]);
}
