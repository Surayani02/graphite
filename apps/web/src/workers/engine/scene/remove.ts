import type { EngineState } from "../state";
import { setSelection } from "../selection";
import { postDocumentNodes } from "./mutate";

/**
 * Deletes every currently-selected node that's a leaf (rect/ellipse).
 *
 * Single selection today (see selection.ts), so in practice this deletes
 * at most one node — written as if the future multi-select's `nodeIds`
 * were already a list so that milestone doesn't have to touch this file.
 * Frames are silently skipped rather than erroring: `DocumentModel.removeNode`
 * already refuses a frame with children, and refusing is the *right* answer
 * here too, not a bug to surface — cascading delete has no undo system yet
 * to protect it (see ADR-014).
 *
 * Called from two independent triggers that must stay behaviourally
 * identical — keyboard Delete/Backspace (input/keyboard.ts) and the
 * canvas/Layers-row context menu (document:delete_selection IPC) — which
 * is exactly why this lives as one shared function instead of being
 * duplicated at each call site.
 */
export function deleteSelection(state: EngineState): void {
  if (!state.docModel) return;

  const ids = state.selectedUuid !== null ? [state.selectedUuid] : [];
  if (ids.length === 0) return;

  let anyRemoved = false;
  for (const id of ids) {
    const removed = state.docModel.removeNode(id);
    if (!removed) continue;
    anyRemoved = true;

    const engineId = state.uuidToEngineId.get(id);
    if (engineId !== undefined) {
      state.sceneGraph?.remove_node(engineId);
      state.engineIdToUuid.delete(engineId);
    }
    state.uuidToEngineId.delete(id);
  }

  if (!anyRemoved) return;
  setSelection(state, null);
  postDocumentNodes(state);
}
