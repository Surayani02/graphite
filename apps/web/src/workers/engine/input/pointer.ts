import type { PointerModifiers } from "@graphite/protocol";
import type { EngineState } from "../state";
import { cssToWorld, notifyViewport } from "../camera";
import { setSelection } from "../selection";
import { writePosition, postDocumentNodes } from "../scene/mutate";
import { recordCompletedEdit } from "../scene/apply";
import { beginCreation, updateCreation, commitCreation } from "../scene/create";

export function handlePointerDown(
  state: EngineState,
  cssX: number,
  cssY: number,
  button: number,
  _modifiers: PointerModifiers
): void {
  if (state.activeTool === "rectangle" || state.activeTool === "ellipse") {
    const [wx, wy] = cssToWorld(state, cssX, cssY);
    beginCreation(state, state.activeTool, wx, wy);
    return;
  }

  if (state.activeTool === "pan" || button === 1) {
    state.dragMode = "pan";
    state.isDragging = true;
    state.panStartCssX = cssX;
    state.panStartCssY = cssY;
    state.panStartCamX = state.camX;
    state.panStartCamY = state.camY;
    return;
  }

  if (!state.sceneGraph) return;

  const [wx, wy] = cssToWorld(state, cssX, cssY);
  // BUG-05: hit_test returns `number | undefined` (wasm-bindgen's mapping
  // of Rust's Option<u32>), not the previous -1 sentinel. `undefined`
  // reads as \"no hit\" with no magic-number comparison required.
  const hitId = state.sceneGraph.hit_test(wx, wy);

  if (hitId !== undefined) {
    setSelection(state, hitId);
    const bounds = state.sceneGraph.get_node_bounds(hitId);
    const [boundsX, boundsY] = bounds;
    if (boundsX !== undefined && boundsY !== undefined) {
      state.dragMode = "move";
      state.isDragging = true;
      state.moveStartWorldX = wx;
      state.moveStartWorldY = wy;
      state.moveStartBoundsX = boundsX;
      state.moveStartBoundsY = boundsY;
    }
  } else {
    setSelection(state, null);
    state.dragMode = null;
    state.isDragging = false;
  }
}

export function handlePointerMove(
  state: EngineState,
  cssX: number,
  cssY: number,
  modifiers: PointerModifiers
): void {
  if (state.dragMode === "create") {
    const [wx, wy] = cssToWorld(state, cssX, cssY);
    updateCreation(state, wx, wy, modifiers.shift);
    return;
  }

  if (!state.isDragging || state.dragMode === null) return;

  if (state.dragMode === "pan") {
    state.camX = state.panStartCamX - ((cssX - state.panStartCssX) * state.dpr) / state.zoom;
    state.camY = state.panStartCamY - ((cssY - state.panStartCssY) * state.dpr) / state.zoom;
    notifyViewport(state);
    return;
  }

  if (state.dragMode === "move" && state.sceneGraph && state.selectedId !== null) {
    const [wx, wy] = cssToWorld(state, cssX, cssY);
    const newX = state.moveStartBoundsX + (wx - state.moveStartWorldX);
    const newY = state.moveStartBoundsY + (wy - state.moveStartWorldY);

    // Update the renderer immediately for a responsive drag; the document
    // (source of truth) is kept in sync the same way — see writePosition's
    // doc comment for why a full scene rebuild per drag-move isn't done.
    // selectedUuid can in principle be null even with a selectedId set (no
    // reverse engineId→uuid mapping) — writePosition's nodeId is nullable
    // for exactly this: the scene graph still updates, the document simply
    // has nothing to write to.
    writePosition(state, state.selectedUuid, state.selectedId, newX, newY);
  }
}

export function handlePointerUp(
  state: EngineState,
  cssX: number,
  cssY: number,
  modifiers: PointerModifiers
): void {
  if (state.dragMode === "create") {
    const [wx, wy] = cssToWorld(state, cssX, cssY);
    commitCreation(state, wx, wy, modifiers.shift);
    return;
  }

  if (state.dragMode === "move") {
    // A move-drag may have changed this node's position (see
    // handlePointerMove above) without ever notifying the panels — record
    // the gesture as one undoable entry, then send the final state once
    // here, rather than on every intermediate pointermove, which would
    // re-serialise and re-post the whole node list at up to 60Hz. Both are
    // no-ops (harmless) for a click with no movement.
    recordMoveIfChanged(state);
    postDocumentNodes(state);
  }
  state.isDragging = false;
  state.dragMode = null;
}

// ─── Internals ───────────────────────────────────────────────────────────────

/**
 * Records a completed move-drag as one history entry (Phase 7 M1).
 *
 * The before-position is `moveStartBoundsX/Y` — captured at pointer-down
 * from the node's bounds, i.e. exactly what the document held before the
 * first `writePosition`. The after-position is read from the document,
 * which the drag kept in sync at 60Hz. Equal positions mean the "drag" was
 * a click: nothing to record. `selectionBefore` is the dragged node itself
 * — pointer-down selected it before the drag began.
 */
function recordMoveIfChanged(state: EngineState): void {
  if (state.selectedUuid === null || !state.docModel) return;
  const node = state.docModel.getNode(state.selectedUuid);
  if (!node) return;

  const fromX = state.moveStartBoundsX;
  const fromY = state.moveStartBoundsY;
  if (node.x === fromX && node.y === fromY) return;

  recordCompletedEdit(
    state,
    `Move ${node.name}`,
    [
      {
        forward: { op: "node:set-props", nodeId: node.id, patch: { x: node.x, y: node.y } },
        inverse: { op: "node:set-props", nodeId: node.id, patch: { x: fromX, y: fromY } },
      },
    ],
    [node.id]
  );
}
