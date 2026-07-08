/**
 * Graphite document model — Phase 5, extended Phase 6 Milestone 2.
 *
 * Source of truth for the scene.  The SceneGraph in the engine worker is a
 * derived, ephemeral rendering structure rebuilt from this model on every load.
 *
 * Design notes:
 *   - Node IDs are UUID v4 strings, stable across serialisation cycles.
 *   - `cornerRadius` is stored on all node kinds (ignored by the Ellipse SDF).
 *   - Phase 9 (Yjs CRDT) wraps this model's mutation methods directly.
 *   - This file has zero DOM or WebWorker dependencies — it runs in both.
 *   - Colour values use `Color` from `@graphite/protocol` (0–255 straight
 *     alpha) rather than a locally-defined type — see ADR-007 / BUG-01.
 *   - `DocNode`/`DocNodeKind`/`DocStroke`/`DocumentData` moved to
 *     `@graphite/protocol` in Phase 6 M2 (the `document:nodes` IPC message
 *     needs this shape, and protocol can't depend back on apps/web) and are
 *     re-exported below so existing imports from this module don't break.
 */

import type { Color, DocNode, DocNodeKind, DocStroke, DocumentData } from "@graphite/protocol";
import { assertValidDocumentData } from "./validate";

export type { Color, DocNode, DocNodeKind, DocStroke, DocumentData };

// ─── DocumentModel ────────────────────────────────────────────────────────────

export class DocumentModel {
  private readonly nodeMap = new Map<string, DocNode>();
  /** Insertion-ordered UUID list — guarantees a deterministic SceneGraph rebuild. */
  private readonly insertionOrder: string[] = [];
  private _name: string;
  private _version: number;

  constructor(name = "Untitled", version = 1) {
    this._name = name;
    this._version = version;
  }

  get name(): string {
    return this._name;
  }
  get version(): number {
    return this._version;
  }
  get nodeCount(): number {
    return this.nodeMap.size;
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  /**
   * Adds a root-level frame (container; not rendered as a shape).
   *
   * Bumps `_version` like every other mutation — a frame addition is still
   * a document change that CRDT sync (Phase 9) and any future "unsaved
   * changes" indicator must detect. An earlier version of this method
   * special-cased frames to skip the bump on the theory that they are
   * "just a container, not a renderable shape" — that reasoning doesn't
   * hold once collaborators need to see each other's frame additions.
   */
  addFrame(id: string, x: number, y: number, w: number, h: number, name = "Frame"): void {
    const node: DocNode = {
      id,
      kind: "frame",
      name,
      x,
      y,
      w,
      h,
      fill: { r: 0, g: 0, b: 0, a: 0 },
      stroke: null,
      cornerRadius: 0,
      parent: null,
      children: [],
    };
    this.nodeMap.set(id, node);
    this.insertionOrder.push(id);
    this._version++;
  }

  addRect(
    id: string,
    parentId: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: Color,
    name = "Rectangle"
  ): void {
    const node: DocNode = {
      id,
      kind: "rect",
      name,
      x,
      y,
      w,
      h,
      fill: { ...fill },
      stroke: null,
      cornerRadius: 0,
      parent: parentId,
      children: [],
    };
    this.nodeMap.set(id, node);
    this.insertionOrder.push(id);
    this.nodeMap.get(parentId)?.children.push(id);
    this._version++;
  }

  addEllipse(
    id: string,
    parentId: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: Color,
    name = "Ellipse"
  ): void {
    const node: DocNode = {
      id,
      kind: "ellipse",
      name,
      x,
      y,
      w,
      h,
      fill: { ...fill },
      stroke: null,
      cornerRadius: 0,
      parent: parentId,
      children: [],
    };
    this.nodeMap.set(id, node);
    this.insertionOrder.push(id);
    this.nodeMap.get(parentId)?.children.push(id);
    this._version++;
  }

  setStroke(id: string, color: Color, width: number): void {
    const node = this.nodeMap.get(id);
    if (!node) return;
    node.stroke = { color: { ...color }, width };
    this._version++;
  }

  setCornerRadius(id: string, radius: number): void {
    const node = this.nodeMap.get(id);
    if (!node) return;
    node.cornerRadius = radius;
    this._version++;
  }

  /**
   * Moves a node to an absolute world position.
   * Use absolute coordinates (not deltas) to prevent float drift during drag.
   */
  setNodePosition(id: string, x: number, y: number): void {
    const node = this.nodeMap.get(id);
    if (!node) return;
    node.x = x;
    node.y = y;
    this._version++;
  }

  /** Phase 6 M2 — Inspector width/height edits. */
  setSize(id: string, w: number, h: number): void {
    const node = this.nodeMap.get(id);
    if (!node) return;
    node.w = w;
    node.h = h;
    this._version++;
  }

  /** Phase 6 M2 — Inspector fill edits. */
  setFill(id: string, fill: Color): void {
    const node = this.nodeMap.get(id);
    if (!node) return;
    node.fill = { ...fill };
    this._version++;
  }

  /**
   * Removes a node — leaf shapes only (rect/ellipse). Refuses (returns
   * `false`, no mutation, no version bump) if the id doesn't exist or
   * still has children: cascading a frame's contents is a data-loss
   * operation with no undo system yet to protect it, so Phase 6 M3
   * doesn't offer it. The Rust SceneGraph's own `remove_node` enforces
   * the identical rule independently — neither side trusts the other to
   * have checked first.
   *
   * On success, also removes the id from its parent's `children` array
   * (if any) so no dangling reference survives into the next
   * serialise/rebuild cycle — the exact class of corruption
   * `validate.ts` checks for on load.
   */
  removeNode(id: string): boolean {
    const node = this.nodeMap.get(id);
    if (!node) return false;
    if (node.children.length > 0) return false;

    if (node.parent !== null) {
      const parent = this.nodeMap.get(node.parent);
      if (parent) {
        parent.children = parent.children.filter((childId) => childId !== id);
      }
    }

    this.nodeMap.delete(id);
    const index = this.insertionOrder.indexOf(id);
    if (index !== -1) this.insertionOrder.splice(index, 1);
    this._version++;
    return true;
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  /**
   * Returns an immutable snapshot of a node, or `undefined` if it doesn't
   * exist.
   *
   * Returns a deep clone, never the live internal object: `DocNode` is a
   * mutable interface, and handing out the real reference would let a
   * caller mutate a returned node's fields directly and silently desync the
   * document from `_version` — breaking serialisation consistency and
   * every future CRDT operation that depends on `_version` to detect
   * changes. All mutation must go through the explicit setter methods
   * above.
   *
   * Uses `structuredClone` rather than a handwritten `{ ...node, x: ... }`
   * shallow copy: `DocNode` has nested objects (`fill`, `stroke.color`) that
   * a shallow copy would leave shared with the internal node, silently
   * reopening the same mutability hole one level down. `structuredClone`
   * clones the whole nested shape and needs no maintenance if `DocNode`
   * gains further nested fields later.
   */
  getNode(id: string): Readonly<DocNode> | undefined {
    const node = this.nodeMap.get(id);
    return node ? structuredClone(node) : undefined;
  }

  /**
   * Returns all nodes in insertion order, deep-cloned.
   * SceneGraph.add_* calls must be made in this order so parent IDs are
   * already resolved when a child node is inserted.
   */
  getNodesInOrder(): readonly Readonly<DocNode>[] {
    return this.insertionOrder
      .map((id) => this.nodeMap.get(id))
      .filter((n): n is DocNode => n !== undefined)
      .map((n) => structuredClone(n));
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  serialize(): string {
    const data: DocumentData = {
      version: this._version,
      name: this._name,
      nodes: Array.from(this.getNodesInOrder()),
    };
    return JSON.stringify(data);
  }

  /**
   * Parses and validates a serialised document, throwing a descriptive
   * `Error` if the JSON is malformed or structurally inconsistent (missing
   * `nodes`, an unrecognised node `kind`, a `children`/`parent` mismatch,
   * etc.) — see `validate.ts`. Callers (the engine worker's
   * `document:load` handler) already catch and fall back to the demo
   * scene on failure; this validation step is what makes that fallback
   * trigger for semantically-corrupt documents, not just unparsable JSON.
   */
  static fromJson(json: string): DocumentModel {
    const data: unknown = JSON.parse(json);
    assertValidDocumentData(data);

    const doc = new DocumentModel(data.name, data.version);
    for (const node of data.nodes) {
      doc.nodeMap.set(node.id, structuredClone(node));
      doc.insertionOrder.push(node.id);
    }
    return doc;
  }
}
