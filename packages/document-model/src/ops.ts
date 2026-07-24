/**
 * Document operations — Phase 7 Milestone 1.
 *
 * `applyOp` is the single authority for mutating a `DocumentModel` from a
 * `DocumentOp` and for deriving that op's exact inverse. The worker's
 * history stack records what this module returns and replays entries back
 * through this module on undo/redo — nothing else in the codebase decides
 * what an op "means".
 *
 * Layer boundaries (unchanged from Phase 5/6):
 *   - This file is document-only: no SceneGraph, no IPC, no worker state.
 *     The engine-side mirror of each op lives in
 *     `workers/engine/scene/apply.ts`.
 *   - Ops are protocol types (`@graphite/protocol`) because Phase 9's CRDT
 *     ships these exact shapes between peers.
 *
 * Inverse-capture rules:
 *   - `node:create`  → inverse `node:remove` of the same id.
 *   - `node:remove`  → inverse `node:create` carrying the pre-removal node
 *     snapshot plus its positions in *both* ordering arrays (parent
 *     `children` and document insertion order), so undo restores z-order
 *     exactly rather than appending.
 *   - `node:set-props` → inverse patch holding the prior value of exactly
 *     the keys the forward patch touches.
 */

import type { Color, DocNode, DocStroke, DocumentOp, NodePatch } from "@graphite/protocol";
import type { DocumentModel } from "./model";

// ─── Errors ───────────────────────────────────────────────────────────────────

export type OpErrorCode = "missing-node" | "duplicate-node" | "missing-parent" | "has-children";

/**
 * Thrown when an op cannot apply to the current document. Producers inside
 * the worker validate before building ops, so in practice this only fires
 * on programmer error or corrupted history — the funnel catches it, rolls
 * the batch back, and surfaces an `engine:error` rather than crashing the
 * worker.
 */
export class OpError extends Error {
  readonly code: OpErrorCode;
  readonly nodeId: string;

  constructor(code: OpErrorCode, nodeId: string) {
    super(`Document op failed (${code}) for node "${nodeId}"`);
    this.name = "OpError";
    this.code = code;
    this.nodeId = nodeId;
  }
}

// ─── Application ─────────────────────────────────────────────────────────────

/** A successfully applied op paired with the op that exactly reverses it. */
export interface AppliedOp {
  readonly forward: DocumentOp;
  readonly inverse: DocumentOp;
}

/**
 * Applies one op to the document and returns it with its inverse.
 * Throws `OpError` (leaving the document untouched) if the op cannot apply.
 */
export function applyOp(doc: DocumentModel, op: DocumentOp): AppliedOp {
  switch (op.op) {
    case "node:create": {
      if (doc.getNode(op.node.id) !== undefined) {
        throw new OpError("duplicate-node", op.node.id);
      }
      if (op.node.parent !== null && doc.getNode(op.node.parent) === undefined) {
        throw new OpError("missing-parent", op.node.id);
      }
      const restored = doc.restoreNode(op.node, op.childIndex, op.orderIndex);
      if (!restored) {
        // Both failure modes are pre-checked above; guarded defensively so a
        // future restoreNode rule can't silently desync history from the doc.
        throw new OpError("duplicate-node", op.node.id);
      }
      return { forward: op, inverse: { op: "node:remove", nodeId: op.node.id } };
    }

    case "node:remove": {
      const node = doc.getNode(op.nodeId);
      if (node === undefined) throw new OpError("missing-node", op.nodeId);
      if (node.children.length > 0) throw new OpError("has-children", op.nodeId);

      const indices = doc.getNodeIndices(op.nodeId);
      if (indices === undefined) throw new OpError("missing-node", op.nodeId);

      const removed = doc.removeNode(op.nodeId);
      if (!removed) throw new OpError("has-children", op.nodeId);

      return {
        forward: op,
        inverse: {
          op: "node:create",
          node,
          childIndex: indices.childIndex,
          orderIndex: indices.orderIndex,
        },
      };
    }

    case "node:set-props": {
      const node = doc.getNode(op.nodeId);
      if (node === undefined) throw new OpError("missing-node", op.nodeId);

      // Capture the inverse before mutating: prior values for exactly the
      // keys the forward patch carries. `node` is already a deep clone
      // (DocumentModel.getNode contract), so embedding its values is safe.
      const p = op.patch;
      const inversePatch: NodePatch = {};
      if (p.x !== undefined) inversePatch.x = node.x;
      if (p.y !== undefined) inversePatch.y = node.y;
      if (p.w !== undefined) inversePatch.w = node.w;
      if (p.h !== undefined) inversePatch.h = node.h;
      if (p.fill !== undefined) inversePatch.fill = { ...node.fill };
      if (p.stroke !== undefined) inversePatch.stroke = cloneStroke(node.stroke);
      if (p.cornerRadius !== undefined) inversePatch.cornerRadius = node.cornerRadius;

      if (p.x !== undefined || p.y !== undefined) {
        doc.setNodePosition(op.nodeId, p.x ?? node.x, p.y ?? node.y);
      }
      if (p.w !== undefined || p.h !== undefined) {
        doc.setSize(op.nodeId, p.w ?? node.w, p.h ?? node.h);
      }
      if (p.fill !== undefined) doc.setFill(op.nodeId, p.fill);
      if (p.stroke !== undefined) doc.setStrokeValue(op.nodeId, p.stroke);
      if (p.cornerRadius !== undefined) doc.setCornerRadius(op.nodeId, p.cornerRadius);

      return {
        forward: op,
        inverse: { op: "node:set-props", nodeId: op.nodeId, patch: inversePatch },
      };
    }

    default: {
      const exhaustive: never = op;
      throw new Error(`Unknown document op: ${JSON.stringify(exhaustive)}`);
    }
  }
}

// ─── Patch normalisation ─────────────────────────────────────────────────────

/**
 * Normalises a raw inspector/IPC patch against a node's current values into
 * the *effective* patch: clamps applied, unchanged keys dropped.
 *
 * This is the Phase 6 `applyNodePatch` derivation logic (size floored at 1,
 * corner radius clamped to `min(w, h) / 2`, re-clamped when a size patch
 * shrinks the node below its stored radius) extracted into a pure function,
 * because history needs it *before* application: the forward op must record
 * what will actually be written — the clamped values — or redo would replay
 * the unclamped request and depend on the clamp being re-derived
 * identically forever.
 *
 * Returns `{}` when nothing would change; callers skip those entirely so a
 * no-op edit never pollutes the undo stack or triggers a broadcast.
 */
export function effectiveNodePatch(node: Readonly<DocNode>, patch: NodePatch): NodePatch {
  const out: NodePatch = {};

  if (patch.x !== undefined && patch.x !== node.x) out.x = patch.x;
  if (patch.y !== undefined && patch.y !== node.y) out.y = patch.y;

  // Effective size after this patch — also the clamp bound for corner radius.
  const w = Math.max(1, patch.w ?? node.w);
  const h = Math.max(1, patch.h ?? node.h);
  if (patch.w !== undefined && w !== node.w) out.w = w;
  if (patch.h !== undefined && h !== node.h) out.h = h;

  if (patch.fill !== undefined && !colorsEqual(patch.fill, node.fill)) {
    out.fill = patch.fill;
  }
  if (patch.stroke !== undefined && !strokesEqual(patch.stroke, node.stroke)) {
    out.stroke = patch.stroke;
  }

  const maxRadius = Math.min(w, h) / 2;
  const requested = patch.cornerRadius ?? node.cornerRadius;
  const clamped = Math.max(0, Math.min(requested, maxRadius));
  if (clamped !== node.cornerRadius) out.cornerRadius = clamped;

  return out;
}

/** True when the patch would change nothing — see `effectiveNodePatch`. */
export function isEmptyPatch(patch: NodePatch): boolean {
  return Object.keys(patch).length === 0;
}

// ─── Internals ───────────────────────────────────────────────────────────────

function colorsEqual(a: Color, b: Color): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

function strokesEqual(a: DocStroke | null, b: DocStroke | null): boolean {
  if (a === null || b === null) return a === b;
  return a.width === b.width && colorsEqual(a.color, b.color);
}

function cloneStroke(stroke: DocStroke | null): DocStroke | null {
  return stroke === null ? null : { color: { ...stroke.color }, width: stroke.width };
}
