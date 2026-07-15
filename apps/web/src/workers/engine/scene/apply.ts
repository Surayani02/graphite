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
 * Engine synchronisation is fully targeted as of Phase 7 M3:
 *   - `node:set-props` / `node:remove` mirror with the same calls Phase 6
 *     used.
 *   - `node:create` appends via the kind-specific `add_*` and then splices
 *     to the document's paint position with `move_node_to_index` — the
 *     SceneGraph gained an explicit paint order exactly so an undone
 *     mid-stack delete lands back where it was. The M1 stopgap (full
 *     rebuild per create) is retired; `rebuildSceneFromDocument` survives
 *     only for document:load/new and the all-or-nothing rollback path.
 */

import type { DocNode, DocumentOp, HistoryAnnounce, NodePatch } from "@graphite/protocol";
import { applyOp, effectiveNodePatch, isEmptyPatch, type AppliedOp } from "../../../document/ops";
import { markSceneDirty, type EngineState } from "../state";
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
 * (since M3 no success path rebuilds the scene, nothing can wipe it).
 * Returns `false` (nothing recorded, nothing broadcast) for an
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

  if (selectionAfter !== undefined) {
    setSelectionByUuid(state, selectionAfter);
  }

  state.history.push({
    label,
    forward: executed.map((a) => a.forward),
    inverse: executed.map((a) => a.inverse).reverse(),
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

/**
 * Applies a batch to document + engine. All-or-nothing: an `OpError`
 * mid-batch rolls the document back (inverses of the already-applied ops,
 * newest first), rebuilds the scene to erase any partial engine writes,
 * posts `engine:error`, and returns `null`.
 */
function executeOps(state: EngineState, ops: readonly DocumentOp[]): readonly AppliedOp[] | null {
  const doc = state.docModel;
  if (!doc) return null;

  const applied: AppliedOp[] = [];

  for (const op of ops) {
    try {
      const result = applyOp(doc, op);
      applied.push(result);
      syncOpToEngine(state, op);
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

  return applied;
}

/** Mirrors one already-applied op to the SceneGraph. Returns `true` when
 *  the op needs a full rebuild instead of a targeted call (see module doc). */
function syncOpToEngine(state: EngineState, op: DocumentOp): void {
  markSceneDirty(state);
  switch (op.op) {
    case "node:create": {
      insertNodeIntoScene(state, op.node, op.orderIndex);
      return;
    }

    case "node:remove": {
      const engineId = state.uuidToEngineId.get(op.nodeId);
      if (engineId !== undefined) {
        state.sceneGraph?.remove_node(engineId);
        state.engineIdToUuid.delete(engineId);
      }
      state.uuidToEngineId.delete(op.nodeId);
      return;
    }

    case "node:set-props": {
      syncPatchToEngine(state, op.nodeId, op.patch);
      return;
    }

    default: {
      const exhaustive: never = op;
      throw new Error(`Unknown document op: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Targeted scene insertion for `node:create` — Phase 7 M3, retiring the
 * M1 rebuild-per-create stopgap. Mirrors rebuild.ts's per-node block
 * exactly (kind switch, corner-radius threshold, stroke-alpha threshold),
 * registers the id maps, then splices the appended node to the document's
 * paint position. `applyOp` has already mutated the document when this
 * runs, so `orderIndex` names the same slot a full rebuild would produce.
 * A dangling parent skips, mirroring rebuild's contract: a shape the
 * layers tree can't show shouldn't be painted either.
 */
function insertNodeIntoScene(state: EngineState, node: DocNode, orderIndex: number): void {
  if (!state.sceneGraph) return;

  let parentEngineId = 0;
  if (node.parent !== null) {
    const resolved = state.uuidToEngineId.get(node.parent);
    if (resolved === undefined) return;
    parentEngineId = resolved;
  }

  let engineId: number;
  if (node.kind === "frame") {
    engineId = state.sceneGraph.add_frame(node.x, node.y, node.w, node.h);
  } else if (node.kind === "rect") {
    engineId = state.sceneGraph.add_rect(
      parentEngineId,
      node.x,
      node.y,
      node.w,
      node.h,
      node.fill.r,
      node.fill.g,
      node.fill.b,
      node.fill.a
    );
    if (node.cornerRadius > 0) {
      state.sceneGraph.set_corner_radius(engineId, node.cornerRadius);
    }
  } else {
    engineId = state.sceneGraph.add_ellipse(
      parentEngineId,
      node.x,
      node.y,
      node.w,
      node.h,
      node.fill.r,
      node.fill.g,
      node.fill.b,
      node.fill.a
    );
  }

  if (node.stroke !== null && node.stroke.color.a > 0) {
    state.sceneGraph.set_stroke(
      engineId,
      node.stroke.color.r,
      node.stroke.color.g,
      node.stroke.color.b,
      node.stroke.color.a,
      node.stroke.width
    );
  }

  state.uuidToEngineId.set(node.id, engineId);
  state.engineIdToUuid.set(engineId, node.id);
  state.sceneGraph.move_node_to_index(engineId, orderIndex);
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
