import { SceneGraph } from "@graphite/engine";
import type { EngineState } from "../state";
import { setSelection } from "../selection";

/**
 * Clears and rebuilds the SceneGraph from the current DocumentModel.
 *
 * Must be called after any document mutation that changes structure
 * (add/remove nodes). Position changes during drag skip the full rebuild
 * and update both SceneGraph and DocumentModel directly (see
 * `input/pointer.ts`) — a full rebuild on every drag-move event would be
 * far too slow for 100,000+ node documents.
 */
export function rebuildSceneFromDocument(state: EngineState): void {
  if (!state.docModel) return;

  state.sceneGraph = new SceneGraph();
  state.uuidToEngineId.clear();
  state.engineIdToUuid.clear();
  setSelection(state, null);

  for (const node of state.docModel.getNodesInOrder()) {
    const parentEngineId = node.parent !== null ? (state.uuidToEngineId.get(node.parent) ?? 0) : 0;

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
  }
}
