import type { EngineState } from "../state";
import { post } from "../messaging";

/**
 * Writes position and/or size to SceneGraph *and* DocumentModel, with no
 * clamping and no `document:nodes` broadcast. Two separate functions
 * rather than one combined `writeGeometry` deliberately: drag-move
 * (`input/pointer.ts`) only ever changes position, never size, and
 * `DocumentModel.setSize`/`setNodePosition` each unconditionally bump
 * `_version` — a combined helper would force drag-move to also bump
 * version for size on every move, for a value that never changed.
 * Creation's live-resize (`scene/create.ts`) calls both together, since it
 * genuinely changes both at once.
 *
 * Both are un-clamped (creation always starts at `cornerRadius: 0`, so
 * there's nothing to re-clamp mid-drag) and un-broadcast (called at up to
 * 60Hz during a drag; callers broadcast once when the drag ends — see
 * `postDocumentNodes` below, `pointer.ts`'s `handlePointerUp`, and
 * `create.ts`'s `commitCreation`).
 *
 * These interim drag writes are also, by design, the one mutation path
 * that bypasses the Phase 7 history funnel (`scene/apply.ts`): a gesture
 * is one undoable edit, not sixty per second, so the gesture records a
 * single precomputed entry via `recordCompletedEdit` when it ends.
 * Inspector patches — which are already one edit each — go through the
 * funnel's `applyNodePatch` instead, which now lives in `scene/apply.ts`.
 */
export function writePosition(
  state: EngineState,
  nodeId: string | null,
  engineId: number | undefined,
  x: number,
  y: number
): void {
  if (nodeId !== null) state.docModel?.setNodePosition(nodeId, x, y);
  if (engineId !== undefined) state.sceneGraph?.set_node_position(engineId, x, y);
}

export function writeSize(
  state: EngineState,
  nodeId: string | null,
  engineId: number | undefined,
  w: number,
  h: number
): void {
  if (nodeId !== null) state.docModel?.setSize(nodeId, w, h);
  if (engineId !== undefined) state.sceneGraph?.set_size(engineId, w, h);
}

/**
 * Pushes the full node list to the main thread.
 *
 * Called after document:new/document:load (orchestrator), after every
 * funnel commit (`scene/apply.ts`), and once at drag-end
 * (input/pointer.ts) — never on every intermediate pointermove, which
 * would re-serialise and re-post the whole node list at up to 60Hz.
 */
export function postDocumentNodes(state: EngineState): void {
  if (!state.docModel) return;
  post({ type: "document:nodes", nodes: state.docModel.getNodesInOrder() });
}
