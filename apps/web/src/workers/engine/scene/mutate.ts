import type { NodePatch } from "@graphite/protocol";
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
 * `create.ts`'s `commitCreation`). `applyNodePatch` below is the only
 * caller that also needs the corner-radius clamp and the broadcast; it
 * applies those itself, after calling these.
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
 * Applies an Inspector-panel patch to one node.
 *
 * SceneGraph first (immediate re-render), then DocumentModel (persistence)
 * — the same dual-write order `input/pointer.ts` already uses for drag.
 * Silent no-op if the node, or its engine-side arena mapping, doesn't exist
 * (matches every SceneGraph setter's own no-op-on-missing-id contract).
 *
 * Corner radius is clamped here — the single choke-point every writer goes
 * through — to `min(w, h) / 2`, the largest value the round-rect SDF renders
 * without distortion. The clamp also re-runs when a size patch shrinks a
 * node below its stored radius, so document and render never disagree.
 */
export function applyNodePatch(state: EngineState, nodeId: string, patch: NodePatch): void {
  if (!state.docModel) return;
  const node = state.docModel.getNode(nodeId);
  if (!node) return;

  const engineId = state.uuidToEngineId.get(nodeId);

  if (patch.x !== undefined || patch.y !== undefined) {
    writePosition(state, nodeId, engineId, patch.x ?? node.x, patch.y ?? node.y);
  }

  // Effective size after this patch — also the clamp bound for corner radius.
  const w = Math.max(1, patch.w ?? node.w);
  const h = Math.max(1, patch.h ?? node.h);
  const sizeChanged = patch.w !== undefined || patch.h !== undefined;

  if (sizeChanged) {
    writeSize(state, nodeId, engineId, w, h);
  }

  if (patch.fill !== undefined) {
    state.docModel.setFill(nodeId, patch.fill);
    if (engineId !== undefined) {
      const { r, g, b, a } = patch.fill;
      state.sceneGraph?.set_fill(engineId, r, g, b, a);
    }
  }

  if (patch.stroke !== undefined) {
    // Explicit `null` clears the stroke. Neither DocumentModel nor
    // SceneGraph has a "remove stroke" call, so a cleared stroke is
    // represented the same way addRect leaves a brand-new node: a
    // fully-transparent, zero-width stroke.
    const s = patch.stroke ?? { color: { r: 0, g: 0, b: 0, a: 0 }, width: 0 };
    state.docModel.setStroke(nodeId, s.color, s.width);
    if (engineId !== undefined) {
      state.sceneGraph?.set_stroke(engineId, s.color.r, s.color.g, s.color.b, s.color.a, s.width);
    }
  }

  const maxRadius = Math.min(w, h) / 2;
  if (patch.cornerRadius !== undefined || (sizeChanged && node.cornerRadius > maxRadius)) {
    const requested = patch.cornerRadius ?? node.cornerRadius;
    const radius = Math.max(0, Math.min(requested, maxRadius));
    state.docModel.setCornerRadius(nodeId, radius);
    if (engineId !== undefined) state.sceneGraph?.set_corner_radius(engineId, radius);
  }

  postDocumentNodes(state);
}

/**
 * Pushes the full node list to the main thread.
 *
 * Called after document:new/document:load (orchestrator), after every
 * node:update (above), and once at drag-end (input/pointer.ts) — never on
 * every intermediate pointermove, which would re-serialise and re-post the
 * whole node list at up to 60Hz for no benefit.
 */
export function postDocumentNodes(state: EngineState): void {
  if (!state.docModel) return;
  post({ type: "document:nodes", nodes: state.docModel.getNodesInOrder() });
}
