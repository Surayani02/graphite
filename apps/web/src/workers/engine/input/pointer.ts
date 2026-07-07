import type { PointerModifiers } from "@graphite/protocol";
import type { EngineState } from "../state";
import { cssToWorld, notifyViewport } from "../camera";
import { setSelection } from "../selection";
import { writePosition, postDocumentNodes } from "../scene/mutate";
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
    // handlePointerMove above) without ever notifying the panels — send
    // the final state once here, rather than on every intermediate
    // pointermove, which would re-serialise and re-post the whole node
    // list at up to 60Hz. No-op (harmless) for a click with no movement.
    postDocumentNodes(state);
  }
  state.isDragging = false;
  state.dragMode = null;
}
