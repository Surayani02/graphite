import type { NodeId } from "@graphite/protocol";
import type { EngineState } from "./state";
import { post } from "./messaging";
import { markSceneDirty } from "./state";

/**
 * Updates the engine's selection state and notifies the main thread.
 *
 * `id` is the SceneGraph arena id (or `null` for "nothing selected").
 * Resolves the corresponding document UUID via `engineIdToUuid` so the
 * `selection:changed` IPC message carries the *stable* UUID — arena ids
 * are ephemeral and get reassigned on every scene rebuild, so the main
 * thread (and any future inspector panel) must never see them.
 */
export function setSelection(state: EngineState, id: number | null): void {
  markSceneDirty(state); // the selection overlay is a rendered pass
  state.selectedId = id;
  state.selectedUuid = id !== null ? (state.engineIdToUuid.get(id) ?? null) : null;
  const nodeIds: readonly NodeId[] =
    state.selectedUuid !== null ? [state.selectedUuid as NodeId] : [];
  post({ type: "selection:changed", nodeIds });
}
