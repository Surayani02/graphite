/**
 * Runtime validation for `DocumentModel.fromJson()` input.
 *
 * `JSON.parse()` returns `any` — an `as DocumentData` cast after it is a
 * compile-time-only assertion with zero runtime effect. Untrusted input
 * (a corrupted `localStorage` entry, a hand-edited file, a future network
 * payload from another client) can violate the shape in ways a cast will
 * never catch: a missing `nodes` array, an unrecognised `kind`, or a
 * `parent`/`children` pair that points at a node that doesn't exist.
 *
 * Kept as a small handwritten guard rather than a schema library (zod):
 * the shape is three fixed node kinds and is unlikely to grow quickly, so a
 * ~40-line guard fully covers it without adding a dependency's runtime
 * weight to the worker bundle that ships to every tab. Revisit this
 * decision if the document schema grows substantially more complex (see
 * ADR-010).
 */

import type { DocNode, DocNodeKind, DocumentData } from "./model";

const VALID_NODE_KINDS: ReadonlySet<DocNodeKind> = new Set(["frame", "rect", "ellipse"]);

/** Type guard: is `value` a plausible `{r,g,b,a}` colour object? */
function isColorLike(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c["r"] === "number" &&
    typeof c["g"] === "number" &&
    typeof c["b"] === "number" &&
    typeof c["a"] === "number"
  );
}

/** Validates a single parsed node object. Throws with a descriptive message on the first violation. */
function assertValidNode(value: unknown, index: number): asserts value is DocNode {
  if (!value || typeof value !== "object") {
    throw new Error(`Invalid document: nodes[${index}] is not an object`);
  }
  const n = value as Record<string, unknown>;

  if (typeof n["id"] !== "string" || n["id"].length === 0) {
    throw new Error(`Invalid document: nodes[${index}] has a missing or empty id`);
  }
  if (typeof n["kind"] !== "string" || !VALID_NODE_KINDS.has(n["kind"] as DocNodeKind)) {
    throw new Error(`Invalid document: nodes[${index}] has unknown kind "${String(n["kind"])}"`);
  }
  if (
    typeof n["x"] !== "number" ||
    typeof n["y"] !== "number" ||
    typeof n["w"] !== "number" ||
    typeof n["h"] !== "number"
  ) {
    throw new Error(`Invalid document: nodes[${index}] (${n["id"]}) has non-numeric geometry`);
  }
  if (!isColorLike(n["fill"])) {
    throw new Error(`Invalid document: nodes[${index}] (${n["id"]}) has an invalid fill colour`);
  }
  if (n["stroke"] !== null) {
    const s = n["stroke"] as Record<string, unknown> | undefined;
    if (!s || !isColorLike(s["color"]) || typeof s["width"] !== "number") {
      throw new Error(`Invalid document: nodes[${index}] (${n["id"]}) has an invalid stroke`);
    }
  }
  if (n["parent"] !== null && typeof n["parent"] !== "string") {
    throw new Error(`Invalid document: nodes[${index}] (${n["id"]}) has an invalid parent`);
  }
  if (!Array.isArray(n["children"]) || n["children"].some((c) => typeof c !== "string")) {
    throw new Error(`Invalid document: nodes[${index}] (${n["id"]}) has invalid children`);
  }
}

/**
 * Validates that `data` matches the `DocumentData` shape, throwing a
 * descriptive `Error` on the first violation found.
 *
 * Does NOT mutate `data`. Caller (`DocumentModel.fromJson`) is responsible
 * for actually constructing the model once this passes.
 */
export function assertValidDocumentData(data: unknown): asserts data is DocumentData {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid document: root value is not an object");
  }
  const d = data as Record<string, unknown>;

  if (typeof d["version"] !== "number") {
    throw new Error("Invalid document: missing or non-numeric version");
  }
  if (typeof d["name"] !== "string") {
    throw new Error("Invalid document: missing or non-string name");
  }
  if (!Array.isArray(d["nodes"])) {
    throw new Error("Invalid document: missing nodes array");
  }

  const nodes = d["nodes"];
  nodes.forEach((node, i) => {
    assertValidNode(node, i);
  });

  // Structural consistency, part 1: node ids must be unique. A duplicate id
  // would silently overwrite its predecessor in DocumentModel's Map while
  // insertionOrder kept both entries — the same node rendered twice and a
  // corrupted UUID↔engine-id mapping.
  const byId = new Map<string, DocNode>();
  for (const node of nodes as DocNode[]) {
    if (byId.has(node.id)) {
      throw new Error(`Invalid document: duplicate node id "${node.id}"`);
    }
    byId.set(node.id, node);
  }

  // Part 2: every non-null `parent` must reference a node that exists.
  // (The reverse direction — children→parent backlinks — is checked below.)
  // Without this, scene/rebuild.ts would have to invent a parent for the
  // orphan, and the layers tree would drop it while the canvas still drew it.
  for (const node of nodes as DocNode[]) {
    if (node.parent !== null && !byId.has(node.parent)) {
      throw new Error(
        `Invalid document: node "${node.id}" references missing parent "${node.parent}"`
      );
    }
  }

  // Part 3: every `children` entry must point at a node that exists and
  // whose own `parent` points back. Catches a document that was hand-edited
  // or corrupted into an inconsistent tree shape.
  for (const node of nodes as DocNode[]) {
    for (const childId of node.children) {
      const child = byId.get(childId);
      if (!child) {
        throw new Error(`Invalid document: node "${node.id}" lists missing child "${childId}"`);
      }
      if (child.parent !== node.id) {
        throw new Error(
          `Invalid document: node "${childId}" parent mismatch (expected "${node.id}", got "${String(child.parent)}")`
        );
      }
    }
  }
}
