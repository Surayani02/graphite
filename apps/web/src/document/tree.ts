import type { DocNode } from "@graphite/protocol";

export interface TreeNode {
  readonly node: DocNode;
  readonly children: readonly TreeNode[];
}

/**
 * Builds a tree from the flat node list using each node's existing
 * parent/children pointers. O(n) with a Map lookup. Pure — no React, no
 * IPC — so it's unit-testable in isolation from LayersPanel.
 *
 * A child id that doesn't resolve to a real node (stale reference) is
 * dropped rather than thrown on, since document:nodes is a live snapshot
 * that could in principle be read mid-mutation.
 */
export function buildTree(nodes: readonly DocNode[]): readonly TreeNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));

  const toTreeNode = (n: DocNode): TreeNode => ({
    node: n,
    children: n.children
      .map((childId) => byId.get(childId))
      .filter((c): c is DocNode => c !== undefined)
      .map(toTreeNode),
  });

  return nodes.filter((n) => n.parent === null).map(toTreeNode);
}
