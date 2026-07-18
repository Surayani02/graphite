import { useEffect, useRef } from "react";
import { useUIStore, selectEffectiveTool } from "../stores/uiStore";
import { useEngineContext } from "../contexts/EngineContext";

/**
 * The crossing point between UI intent (Zustand) and the engine — two-way
 * since Phase 6 M3, corrected in Phase 7 (BUG-07).
 *
 * **Store → engine.** Whenever the store's effective tool changes, tell the
 * worker. Guarded against redundant sends by comparing against the last
 * value actually sent (`lastSentRef`).
 *
 * **Engine → store.** The worker can change the active tool itself — today,
 * auto-returning to "select" once a shape-creation drag commits
 * (workers/engine/scene/create.ts). That arrives as `lastEngineTool`, an
 * `EngineToolSignal` = `{ tool, seq }`.
 *
 * **Why a signal, not a value (the BUG-07 fix).** The previous design
 * stored the engine's tool as *sticky state* and, in one combined effect,
 * compared it against the last-synced value. That comparison could not
 * distinguish "the engine just asked for select" from "the engine asked for
 * select several actions ago and the field never cleared." Concretely:
 * draw a rect (engine → select), click Pan (store → pan, sent), then click
 * Select. On that last click the sticky `lastEngineTool` still read
 * "select" while last-synced read "pan", so the engine-branch fired,
 * absorbed the value as though the *worker* had requested select, and
 * returned **without sending anything to the worker** — which kept using
 * pan. The tool switched visually but not functionally.
 *
 * The fix separates the two directions by *what changed*, tracked with
 * independent refs, and consumes the engine direction by `seq`: a signal is
 * acted on once, when its sequence number is new. A repeat of the same tool
 * is a new signal (new seq) and still applies; a render that merely
 * re-runs the effect without a new signal does nothing. The store→engine
 * branch then always runs on a real store change, so the user's pick is
 * never swallowed.
 */
export function useSyncToolWithEngine(): void {
  const { setTool, lastEngineTool } = useEngineContext();
  const effectiveTool = useUIStore(selectEffectiveTool);
  const setActiveTool = useUIStore((s) => s.setActiveTool);

  const lastSentRef = useRef<string | null>(null);
  const lastSeqRef = useRef<number>(0);

  // Engine → store: apply a worker-initiated change exactly once, keyed by
  // the signal's sequence number. Writing the store here retriggers the
  // send-effect below, but by then lastSentRef already equals this tool, so
  // it's a no-op — no echo, regardless of render count.
  useEffect(() => {
    if (lastEngineTool === null || lastEngineTool.seq === lastSeqRef.current) return;
    lastSeqRef.current = lastEngineTool.seq;
    lastSentRef.current = lastEngineTool.tool; // the worker already has this value
    setActiveTool(lastEngineTool.tool);
  }, [lastEngineTool, setActiveTool]);

  // Store → engine: send whenever the effective tool differs from what the
  // worker was last told. Runs on every genuine user tool change (BUG-07:
  // this send must never be gated behind engine-signal bookkeeping).
  useEffect(() => {
    if (effectiveTool === lastSentRef.current) return;
    lastSentRef.current = effectiveTool;
    setTool(effectiveTool);
  }, [effectiveTool, setTool]);
}
