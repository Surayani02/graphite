import type { DocumentOp } from "@graphite/protocol";
import type { EngineState } from "../state";
import { commitEdit } from "./apply";

/**
 * Deletes every currently-selected node that's a leaf (rect/ellipse).
 *
 * Single selection today (see selection.ts), so in practice this deletes
 * at most one node — written as if the future multi-select's `nodeIds`
 * were already a list so that milestone doesn't have to touch this file.
 * Frames with children are silently skipped rather than errored: refusing
 * is the *right* answer (see ADR-014), and the skip happens here — before
 * ops are built — so the funnel never sees an op it would reject.
 *
 * Phase 7 M1: routed through `commitEdit`, which applies the removal to
 * document and SceneGraph (same targeted `remove_node` + map cleanup as
 * before), clears the selection via `selectionAfter: []`, records one
 * undoable entry, and broadcasts `document:nodes` + `history:state`.
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

  const ops: DocumentOp[] = [];
  const names: string[] = [];
  for (const id of ids) {
    const node = state.docModel.getNode(id);
    if (!node || node.children.length > 0) continue;
    ops.push({ op: "node:remove", nodeId: id });
    names.push(node.name);
  }
  if (ops.length === 0) return;

  const firstName = names[0];
  const label =
    ops.length === 1 && firstName !== undefined ? `Delete ${firstName}` : "Delete Selection";
  commitEdit(state, label, ops, []);
}
