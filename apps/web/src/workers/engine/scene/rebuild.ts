import { SceneGraph } from "@graphite/engine";
import type { EngineState } from "../state";
import { setSelection } from "../selection";
import { markSceneDirty } from "../state";

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
  const rebuildStart = performance.now();

  state.sceneGraph = new SceneGraph();
  state.uuidToEngineId.clear();
  state.engineIdToUuid.clear();
  setSelection(state, null);

  for (const node of state.docModel.getNodesInOrder()) {
    // A non-null parent that hasn't been inserted yet can only mean a
    // dangling reference (insertion order guarantees parents precede
    // children, and validate.ts rejects missing parents on load). Skip the
    // node rather than silently adopting it onto arena id 0 — a shape the
    // layers tree can't show shouldn't be painted either.
    let parentEngineId = 0;
    if (node.parent !== null) {
      const resolved = state.uuidToEngineId.get(node.parent);
      if (resolved === undefined) continue;
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
  }

  markSceneDirty(state);
  // Through-worker rebuild cost (ADR-023 measurement item): User Timing
  // entries in the worker's own timeline, visible under the worker track
  // of a DevTools Performance recording. Capture procedure documented in
  // docs/benchmarks/README.md; the 10k workload arrives with M5's stress
  // scene.
  performance.measure("scene-rebuild", { start: rebuildStart, end: performance.now() });
}
