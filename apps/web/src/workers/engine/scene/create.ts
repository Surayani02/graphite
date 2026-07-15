import type { Color } from "@graphite/protocol";
import type { EngineState, CreationDraft } from "../state";
import { writePosition, writeSize, postDocumentNodes } from "./mutate";
import { recordCompletedEdit } from "./apply";
import { setSelection } from "../selection";
import { post } from "../messaging";
import { markSceneDirty } from "../state";

/** Manhattan-adjacent movement (px, world units) before a click becomes a
 * drag. Below this, pointerup still produces the click default-size path —
 * screens/hands aren't perfectly still, and without a threshold every
 * single-click would flash a 1×1 node for one frame before growing. */
const DRAG_THRESHOLD = 4;
/** Default size for a plain click with no drag. */
const DEFAULT_SIZE = 100;

const FILL_STOPS: Record<"rectangle" | "ellipse", Color> = {
  rectangle: { r: 99, g: 179, b: 237, a: 255 },
  ellipse: { r: 159, g: 122, b: 234, a: 255 },
};

/**
 * Starts a rectangle/ellipse creation drag at world `(x, y)`.
 *
 * Nothing is created yet — see the module doc on `CreationDraft`. This
 * only records the anchor and resolves which frame the shape will belong
 * to once it *is* created.
 */
export function beginCreation(
  state: EngineState,
  tool: "rectangle" | "ellipse",
  x: number,
  y: number
): void {
  const frameId = findTargetFrame(state, x, y);
  if (frameId === null) return; // no frame exists — nothing to parent into (shouldn't happen; every document seeds one)

  state.creation = {
    tool,
    frameId,
    anchorX: x,
    anchorY: y,
    selectionBefore: state.selectedUuid !== null ? [state.selectedUuid] : [],
    nodeId: null,
    engineId: null,
  };
  state.dragMode = "create";
  state.isDragging = true;
}

/**
 * Continues an in-progress creation drag to world `(x, y)`.
 *
 * Below `DRAG_THRESHOLD`, does nothing — the node isn't created until the
 * drag genuinely moves, so a click-without-drag can take the cheaper,
 * cleaner "default size at the click point" path in `commitCreation`
 * instead of creating-then-immediately-resizing a throwaway 1×1 node.
 * `shift` constrains to a square/circle, growing from the fixed anchor
 * corner toward wherever the pointer currently is.
 */
export function updateCreation(state: EngineState, x: number, y: number, shift: boolean): void {
  const draft = state.creation;
  if (!draft) return;

  const dx = x - draft.anchorX;
  const dy = y - draft.anchorY;
  if (draft.nodeId === null && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

  if (draft.nodeId === null) {
    allocateNode(state, draft);
  }
  // Re-read into a fresh binding rather than casting draft.nodeId: TS can't
  // narrow a field through an opaque allocateNode() call, and casting past
  // that would hide the one real failure mode — no docModel, so
  // allocateNode no-op'd and nodeId is still genuinely null — instead of
  // guarding it. In that case there is nothing to resize.
  const nodeId = draft.nodeId;
  if (nodeId === null) return;

  const { x0, y0, w, h } = normalizedBounds(draft.anchorX, draft.anchorY, x, y, shift);
  writePosition(state, nodeId, draft.engineId ?? undefined, x0, y0);
  writeSize(state, nodeId, draft.engineId ?? undefined, w, h);
}

/**
 * Ends a creation drag at world `(x, y)`.
 *
 * If the drag never crossed the threshold (`draft.nodeId` still `null`),
 * this is the click path: create fresh, `DEFAULT_SIZE × DEFAULT_SIZE`,
 * anchored at the click point. Either way: one final bounds write (so the
 * committed shape reflects `(x, y)` exactly, not whatever the last
 * pointermove happened to report), select the new node, broadcast once,
 * clear the draft, and auto-return the active tool to "select" — the
 * Figma convention this milestone commits to (see `docs/adr/ADR-014`).
 */
export function commitCreation(state: EngineState, x: number, y: number, shift: boolean): void {
  const draft = state.creation;
  if (!draft) return;

  if (draft.nodeId === null) {
    allocateNode(state, draft);
    // Same reasoning as updateCreation: re-read rather than cast, so a
    // docModel-less no-op inside allocateNode is a guarded early return,
    // not a lie to the type checker.
    const nodeId = draft.nodeId;
    if (nodeId === null) {
      state.creation = null;
      state.dragMode = null;
      state.isDragging = false;
      return;
    }
    writePosition(state, nodeId, draft.engineId ?? undefined, x, y);
    writeSize(state, nodeId, draft.engineId ?? undefined, DEFAULT_SIZE, DEFAULT_SIZE);
  } else {
    const { x0, y0, w, h } = normalizedBounds(draft.anchorX, draft.anchorY, x, y, shift);
    writePosition(state, draft.nodeId, draft.engineId ?? undefined, x0, y0);
    writeSize(state, draft.nodeId, draft.engineId ?? undefined, w, h);
  }

  postDocumentNodes(state);
  setSelection(state, draft.engineId);
  recordCreation(state, draft);
  state.creation = null;
  state.dragMode = null;
  state.isDragging = false;
  post({ type: "tool:changed", tool: "select" });
}

/**
 * Cancels an in-progress creation drag (Escape).
 *
 * Deliberately does *not* auto-return to select — matching the Figma
 * convention this asymmetry is borrowed from: cancelling a shape you were
 * dragging out means "not that one", not "I'm done creating shapes", so
 * the tool stays active for another attempt. If a node was already
 * allocated (past the drag threshold), it's removed the same way the
 * Delete key would — nothing was ever broadcast for it (creation never
 * posts `document:nodes` until commit), so the main thread never even saw
 * the phantom node; only worker-side state needs cleaning up.
 */
export function cancelCreation(state: EngineState): void {
  const draft = state.creation;
  if (!draft) return;

  if (draft.nodeId !== null) {
    state.docModel?.removeNode(draft.nodeId);
    if (draft.engineId !== null) {
      state.sceneGraph?.remove_node(draft.engineId);
      state.engineIdToUuid.delete(draft.engineId);
    }
    state.uuidToEngineId.delete(draft.nodeId);
  }

  state.creation = null;
  state.dragMode = null;
  state.isDragging = false;
}

// ─── Internals ──────────────────────────────────────────────────────────────

/** Allocates the actual node once a drag crosses the threshold (or at
 * commit, for a plain click) — 1×1 placeholder bounds; the caller writes
 * real bounds immediately after via writePosition/writeSize. No-ops
 * (leaving `draft.nodeId`/`engineId` at `null`) if there's no document to
 * add to, which callers check for via the guard on their own return. */
function allocateNode(state: EngineState, draft: CreationDraft): void {
  if (!state.docModel) return;
  const id = crypto.randomUUID();
  const fill = FILL_STOPS[draft.tool];

  if (draft.tool === "rectangle") {
    state.docModel.addRect(id, draft.frameId, draft.anchorX, draft.anchorY, 1, 1, fill);
  } else {
    state.docModel.addEllipse(id, draft.frameId, draft.anchorX, draft.anchorY, 1, 1, fill);
  }

  const parentEngineId = state.uuidToEngineId.get(draft.frameId);
  let engineId: number | null = null;
  if (parentEngineId !== undefined && state.sceneGraph) {
    const { r, g, b, a } = fill;
    engineId =
      draft.tool === "rectangle"
        ? state.sceneGraph.add_rect(parentEngineId, draft.anchorX, draft.anchorY, 1, 1, r, g, b, a)
        : state.sceneGraph.add_ellipse(
            parentEngineId,
            draft.anchorX,
            draft.anchorY,
            1,
            1,
            r,
            g,
            b,
            a
          );
    markSceneDirty(state);
    state.uuidToEngineId.set(id, engineId);
    state.engineIdToUuid.set(engineId, id);
  }

  draft.nodeId = id;
  draft.engineId = engineId;
}

/** Records the committed creation as one undoable history entry
 * (Phase 7 M1). Document and SceneGraph were already written incrementally
 * during the drag, so this goes through `recordCompletedEdit` — record and
 * broadcast history state, nothing re-applied, no second `document:nodes`.
 * The forward op snapshots the node's *final* committed bounds; undo
 * removes it, redo re-creates it exactly as committed (never as the 1×1
 * placeholder it briefly was). A cancelled creation records nothing —
 * `cancelCreation` stays symmetric with "the main thread never saw it". */
function recordCreation(state: EngineState, draft: CreationDraft): void {
  const nodeId = draft.nodeId;
  if (nodeId === null || !state.docModel) return;
  const node = state.docModel.getNode(nodeId);
  const indices = state.docModel.getNodeIndices(nodeId);
  if (!node || !indices) return;

  recordCompletedEdit(
    state,
    node.kind === "ellipse" ? "Create Ellipse" : "Create Rectangle",
    [
      {
        forward: {
          op: "node:create",
          node,
          childIndex: indices.childIndex,
          orderIndex: indices.orderIndex,
        },
        inverse: { op: "node:remove", nodeId },
      },
    ],
    draft.selectionBefore
  );
}

/** Topmost root frame (last-added wins, matching hit_test's own reverse-
 * insertion-order convention) whose bounds contain the point; falls back
 * to the first root frame if none contains it (every document seeds at
 * least one — see scene/demo.ts — and M3 offers no way to delete the last
 * one, since deletion is leaf-only). `null` only if a document somehow
 * has zero frames, which no current code path produces. */
function findTargetFrame(state: EngineState, x: number, y: number): string | null {
  if (!state.docModel) return null;
  const nodes = state.docModel.getNodesInOrder();
  const frames = nodes.filter((n) => n.kind === "frame" && n.parent === null);

  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i];
    if (f && x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) {
      return f.id;
    }
  }
  return frames[0]?.id ?? null;
}

interface NormalizedBounds {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

/** Top-left/width/height from an anchor + current point, normalising a
 * drag in any direction (dragging up-left is as valid as down-right).
 * `shift` constrains to a square/circle sized to the *larger* of the two
 * axes, keeping the anchor corner fixed. */
function normalizedBounds(
  anchorX: number,
  anchorY: number,
  x: number,
  y: number,
  shift: boolean
): NormalizedBounds {
  if (!shift) {
    return {
      x0: Math.min(anchorX, x),
      y0: Math.min(anchorY, y),
      w: Math.max(1, Math.abs(x - anchorX)),
      h: Math.max(1, Math.abs(y - anchorY)),
    };
  }
  const size = Math.max(1, Math.abs(x - anchorX), Math.abs(y - anchorY));
  return {
    x0: x >= anchorX ? anchorX : anchorX - size,
    y0: y >= anchorY ? anchorY : anchorY - size,
    w: size,
    h: size,
  };
}
