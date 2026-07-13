/**
 * Mutation funnel — Phase 7 Milestone 1.
 *
 * Every user edit becomes exactly one `HistoryEntry` through one of two
 * doors, and undo/redo replays entries back through this module alone:
 *
 *   - `commitEdit` — the funnel applies the ops itself (document via
 *     `applyOp`, engine via `syncOpToEngine`), records the entry, and
 *     broadcasts. Used by inspector patches (`applyNodePatch`) and
 *     deletion (`scene/remove.ts`).
 *   - `recordCompletedEdit` — for 60Hz drag interactions (`input/pointer.ts`
 *     move, `scene/create.ts` creation) that already wrote document and
 *     engine incrementally through `writePosition`/`writeSize` for
 *     responsiveness. The producer supplies the precomputed forward/inverse
 *     pair at gesture end; the funnel records and broadcasts history state.
 *     Interim drag writes stay outside history by design — one gesture,
 *     one entry.
 *
 * Engine synchronisation is asymmetric on purpose:
 *   - `node:set-props` / `node:remove` mirror to the SceneGraph with the
 *     same targeted calls Phase 6 used — order-safe and cheap.
 *   - `node:create` forces a full `rebuildSceneFromDocument`: the SceneGraph
 *     can only append, but a create op may splice mid-order (undo of a
 *     mid-stack delete), and paint order must follow document order. M3's
 *     damage model replaces this with something cheaper; the funnel is the
 *     seam it plugs into.
 */

import type { DocumentOp, HistoryAnnounce, NodePatch } from "@graphite/protocol";
import { applyOp, effectiveNodePatch, isEmptyPatch, type AppliedOp } from "../../../document/ops";
import type { EngineState } from "../state";
import { post, toErrorMsg } from "../messaging";
import { setSelection } from "../selection";
import { rebuildSceneFromDocument } from "./rebuild";
import { postDocumentNodes } from "./mutate";

// ─── Funnel entry points ─────────────────────────────────────────────────────

/**
 * Applies an Inspector-panel patch to one node — Phase 6's entry point,
 * now routed through the funnel so every patch is undoable.
 *
 * The raw patch is first normalised against the node's current values
 * (`effectiveNodePatch`: size floor, corner-radius clamp and shrink
 * re-clamp, unchanged keys dropped). A patch that changes nothing is
 * discarded entirely — no history entry, no engine write, no broadcast.
 */
export function applyNodePatch(state: EngineState, nodeId: string, patch: NodePatch): void {
  if (!state.docModel) return;
  const node = state.docModel.getNode(nodeId);
  if (!node) return;

  const effective = effectiveNodePatch(node, patch);
  if (isEmptyPatch(effective)) return;

  commitEdit(state, `Edit ${node.name}`, [{ op: "node:set-props", nodeId, patch: effective }]);
}

/**
 * Applies `ops` to document + engine, records one history entry, restores
 * or sets selection, and broadcasts `document:nodes` + `history:state`.
 *
 * `selectionAfter` (node UUIDs) is what the edit leaves selected — pass
 * `[]` to clear (deletion). When omitted, selection is left untouched
 * unless a rebuild wiped it, in which case the pre-edit selection is
 * restored. Returns `false` (nothing recorded, nothing broadcast) for an
 * empty batch, a missing document, or an op failure — failures roll the
 * document back and surface `engine:error`.
 */
export function commitEdit(
  state: EngineState,
  label: string,
  ops: readonly DocumentOp[],
  selectionAfter?: readonly string[]
): boolean {
  if (!state.docModel || ops.length === 0) return false;

  const selectionBefore = currentSelection(state);
  const executed = executeOps(state, ops);
  if (executed === null) return false;

  if (executed.needsRebuild) rebuildSceneFromDocument(state);

  if (selectionAfter !== undefined) {
    setSelectionByUuid(state, selectionAfter);
  } else if (executed.needsRebuild) {
    setSelectionByUuid(state, selectionBefore);
  }

  state.history.push({
    label,
    forward: executed.applied.map((a) => a.forward),
    inverse: executed.applied.map((a) => a.inverse).reverse(),
    selectionBefore,
    selectionAfter: currentSelection(state),
  });

  postDocumentNodes(state);
  postHistoryStatus(state);
  return true;
}

/**
 * Records an edit whose document/engine writes already happened
 * incrementally (drag move, creation drag) and broadcasts the new history
 * state. Does NOT re-apply the ops and does NOT broadcast `document:nodes`
 * — the producing gesture already posts the final node list itself.
 *
 * `selectionBefore` is the selection at gesture start (the producer
 * captures it); selection-after is read live, since the gesture has
 * already settled it.
 */
export function recordCompletedEdit(
  state: EngineState,
  label: string,
  applied: readonly AppliedOp[],
  selectionBefore: readonly string[]
): void {
  if (applied.length === 0) return;
  state.history.push({
    label,
    forward: applied.map((a) => a.forward),
    inverse: applied.map((a) => a.inverse).reverse(),
    selectionBefore,
    selectionAfter: currentSelection(state),
  });
  postHistoryStatus(state);
}

// ─── Undo / redo ─────────────────────────────────────────────────────────────

export function undoEdit(state: EngineState): void {
  if (!state.docModel) return;
  const entry = state.history.undo();
  if (entry === null) return;

  const executed = executeOps(state, entry.inverse);
  if (executed === null) {
    // The document was rolled back to the pre-undo state; put the entry
    // back on the undo stack so history keeps matching reality. Near
    // unreachable — inverse ops come from applyOp — but cheap to keep true.
    state.history.redo();
    postHistoryStatus(state);
    return;
  }

  if (executed.needsRebuild) rebuildSceneFromDocument(state);
  setSelectionByUuid(state, entry.selectionBefore);
  postDocumentNodes(state);
  postHistoryStatus(state, { action: "undo", label: entry.label });
}

export function redoEdit(state: EngineState): void {
  if (!state.docModel) return;
  const entry = state.history.redo();
  if (entry === null) return;

  const executed = executeOps(state, entry.forward);
  if (executed === null) {
    state.history.undo();
    postHistoryStatus(state);
    return;
  }

  if (executed.needsRebuild) rebuildSceneFromDocument(state);
  setSelectionByUuid(state, entry.selectionAfter);
  postDocumentNodes(state);
  postHistoryStatus(state, { action: "redo", label: entry.label });
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/** document:new / document:load — a fresh document starts a clean timeline. */
export function resetHistory(state: EngineState): void {
  state.history.clear();
  postHistoryStatus(state);
}

/** document:request_save — the current position becomes the saved state. */
export function markHistorySaved(state: EngineState): void {
  state.history.markSaved();
  postHistoryStatus(state);
}

/** Broadcasts the current `HistoryStatus`, optionally announcing the
 *  undo/redo that caused it (surfaced in the StatusBar live region). */
export function postHistoryStatus(state: EngineState, announce?: HistoryAnnounce): void {
  if (announce !== undefined) {
    post({ type: "history:state", status: state.history.status(), announce });
  } else {
    post({ type: "history:state", status: state.history.status() });
  }
}

// ─── Internals ───────────────────────────────────────────────────────────────

interface ExecutedOps {
  readonly applied: readonly AppliedOp[];
  readonly needsRebuild: boolean;
}

/**
 * Applies a batch to document + engine. All-or-nothing: an `OpError`
 * mid-batch rolls the document back (inverses of the already-applied ops,
 * newest first), rebuilds the scene to erase any partial engine writes,
 * posts `engine:error`, and returns `null`.
 */
function executeOps(state: EngineState, ops: readonly DocumentOp[]): ExecutedOps | null {
  const doc = state.docModel;
  if (!doc) return null;

  const applied: AppliedOp[] = [];
  let needsRebuild = false;

  for (const op of ops) {
    try {
      const result = applyOp(doc, op);
      applied.push(result);
      if (syncOpToEngine(state, op)) needsRebuild = true;
    } catch (err) {
      for (let i = applied.length - 1; i >= 0; i--) {
        const done = applied[i];
        if (done === undefined) continue;
        try {
          applyOp(doc, done.inverse);
        } catch {
          // Best-effort rollback; the rebuild below restores render
          // consistency from whatever the document now holds.
        }
      }
      if (applied.length > 0) rebuildSceneFromDocument(state);
      post(toErrorMsg(err));
      return null;
    }
  }

  return { applied, needsRebuild };
}

/** Mirrors one already-applied op to the SceneGraph. Returns `true` when
 *  the op needs a full rebuild instead of a targeted call (see module doc). */
function syncOpToEngine(state: EngineState, op: DocumentOp): boolean {
  switch (op.op) {
    case "node:create": {
      return true;
    }

    case "node:remove": {
      const engineId = state.uuidToEngineId.get(op.nodeId);
      if (engineId !== undefined) {
        state.sceneGraph?.remove_node(engineId);
        state.engineIdToUuid.delete(engineId);
      }
      state.uuidToEngineId.delete(op.nodeId);
      return false;
    }

    case "node:set-props": {
      syncPatchToEngine(state, op.nodeId, op.patch);
      return false;
    }

    default: {
      const exhaustive: never = op;
      throw new Error(`Unknown document op: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * The engine half of a set-props op — the same targeted SceneGraph calls
 * Phase 6's `applyNodePatch` made, reading merged values from the
 * already-updated document. A cleared stroke (`null`) is written to the
 * engine as a fully-transparent zero-width stroke, matching what
 * `scene/rebuild.ts` renders for `stroke: null`; the document itself now
 * stores the honest `null` (see `DocumentModel.setStrokeValue`).
 */
function syncPatchToEngine(state: EngineState, nodeId: string, patch: NodePatch): void {
  const engineId = state.uuidToEngineId.get(nodeId);
  if (engineId === undefined || !state.sceneGraph) return;
  const node = state.docModel?.getNode(nodeId);
  if (!node) return;

  const scene = state.sceneGraph;
  if (patch.x !== undefined || patch.y !== undefined) {
    scene.set_node_position(engineId, node.x, node.y);
  }
  if (patch.w !== undefined || patch.h !== undefined) {
    scene.set_size(engineId, node.w, node.h);
  }
  if (patch.fill !== undefined) {
    scene.set_fill(engineId, patch.fill.r, patch.fill.g, patch.fill.b, patch.fill.a);
  }
  if (patch.stroke !== undefined) {
    const s = patch.stroke ?? { color: { r: 0, g: 0, b: 0, a: 0 }, width: 0 };
    scene.set_stroke(engineId, s.color.r, s.color.g, s.color.b, s.color.a, s.width);
  }
  if (patch.cornerRadius !== undefined) {
    scene.set_corner_radius(engineId, patch.cornerRadius);
  }
}

function currentSelection(state: EngineState): readonly string[] {
  return state.selectedUuid !== null ? [state.selectedUuid] : [];
}

/** Resolves the first UUID to its (possibly freshly-rebuilt) arena id and
 *  hands off to the one existing `setSelection`, so undo/redo selection
 *  restore can never diverge from click/layers selection behaviour. */
function setSelectionByUuid(state: EngineState, uuids: readonly string[]): void {
  const first = uuids[0];
  const engineId = first !== undefined ? (state.uuidToEngineId.get(first) ?? null) : null;
  setSelection(state, engineId);
}
