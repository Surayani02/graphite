import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { DocNodeKind } from "@graphite/protocol";
import { ContextMenu, useContextMenuState, type MenuItem } from "@graphite/ui-core";
import { useEngineContext } from "../../contexts/EngineContext";
import { buildTree, type TreeNode } from "../../document/tree";
import { useCommandShortcut } from "../shortcuts/useResolvedShortcuts";

/**
 * LayersPanel — Phase 6 Milestone 2, context menu added Milestone 3,
 * re-hosted inside LeftPanel's Layers tab in Milestone 4 (panel chrome —
 * width, collapse, tab strip — lives in layouts/LeftPanel.tsx now; this
 * component is the tree itself and fills whatever region hosts it).
 *
 * Renders the document's node tree from EngineContext's `nodes` list
 * (pushed by the worker on every load/edit — see workers/engine/scene/mutate.ts)
 * with click-to-select and full keyboard operation. Frame rows are not
 * selectable, matching hit_test()'s existing behaviour on canvas (frames
 * are containers, never hit-testable) — keeps both selection paths
 * behaviourally identical. The same rule extends to the context menu:
 * right-clicking a frame does nothing, since there is nothing to delete.
 *
 * Keyboard model: the tree container is the single tab stop and exposes the
 * active row via aria-activedescendant (the WAI-ARIA alternative to roving
 * tabindex — one focusable element, no ref bookkeeping per row).
 * ArrowUp/Down move across selectable rows in visual order, Home/End jump,
 * Enter/Space select. Selection made *outside* the tree (canvas click,
 * palette layer search) scrolls its row into view — M4's reveal-on-select.
 */
export function LayersPanel() {
  const { nodes, selectedIds, setSelection, deleteSelection } = useEngineContext();
  const menu = useContextMenuState();
  const deleteShortcut = useCommandShortcut("edit.deleteSelection");

  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const selectableIds = useMemo(() => flattenSelectable(tree), [tree]);
  const selectedId = selectedIds[0];

  const [activeId, setActiveId] = useState<string | null>(null);
  // The stored active row may have been deleted or belong to a previous
  // document — fall back to the current selection, then to nothing.
  const effectiveActiveId =
    activeId !== null && selectableIds.includes(activeId)
      ? activeId
      : selectedId !== undefined && selectableIds.includes(selectedId)
        ? selectedId
        : null;

  // Reveal-on-select: selection can change without the tree being touched
  // (canvas click, palette layer search) — bring the row into view so the
  // tree always reflects where the user just landed.
  useEffect(() => {
    if (selectedId === undefined) return;
    document.getElementById(rowDomId(selectedId))?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const onTreeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (selectableIds.length === 0) return;
    const last = selectableIds.length - 1;
    const index = effectiveActiveId !== null ? selectableIds.indexOf(effectiveActiveId) : -1;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveId(selectableIds[Math.min(index + 1, last)] ?? null);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveId(selectableIds[Math.max(index - 1, 0)] ?? null);
        break;
      case "Home":
        e.preventDefault();
        setActiveId(selectableIds[0] ?? null);
        break;
      case "End":
        e.preventDefault();
        setActiveId(selectableIds[last] ?? null);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (effectiveActiveId !== null) setSelection([effectiveActiveId]);
        break;
      default:
        break;
    }
  };

  const select = (id: string) => {
    setActiveId(id);
    setSelection([id]);
  };

  // Right-click selects first (matching Figma/most file explorers: the
  // command you're about to invoke should visibly apply to what you
  // clicked, not whatever was selected before), then opens the menu.
  const onRowContextMenu = (id: string, clientX: number, clientY: number) => {
    select(id);
    menu.show(clientX, clientY);
  };

  const menuItems: MenuItem[] = [
    {
      id: "delete",
      label: "Delete",
      icon: Trash2,
      danger: true,
      onSelect: deleteSelection,
      // Live chord, not a hardcoded "Del" — remaps (M4 recorder) show here.
      ...(deleteShortcut !== null ? { shortcut: deleteShortcut.label } : {}),
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div
        role="tree"
        aria-label="Layer tree"
        tabIndex={0}
        aria-activedescendant={effectiveActiveId !== null ? rowDomId(effectiveActiveId) : undefined}
        onKeyDown={onTreeKeyDown}
        className="flex-1 overflow-y-auto py-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/60"
      >
        {tree.length === 0 ? (
          <div className="px-2 py-1 font-mono text-[11px] text-content-tertiary">
            No layers yet.
          </div>
        ) : (
          tree.map((root) => (
            <LayerRow
              key={root.node.id}
              treeNode={root}
              depth={0}
              selectedId={selectedId}
              activeId={effectiveActiveId}
              onSelect={select}
              onContextMenu={onRowContextMenu}
            />
          ))
        )}
      </div>
      <ContextMenu
        open={menu.open}
        position={menu.position}
        items={menuItems}
        onClose={menu.close}
      />
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

interface LayerRowProps {
  treeNode: TreeNode;
  depth: number;
  selectedId: string | undefined;
  activeId: string | null;
  onSelect: (id: string) => void;
  onContextMenu: (id: string, clientX: number, clientY: number) => void;
}

function LayerRow({
  treeNode,
  depth,
  selectedId,
  activeId,
  onSelect,
  onContextMenu,
}: LayerRowProps) {
  const { node, children } = treeNode;
  const isFrame = node.kind === "frame";
  const isSelected = node.id === selectedId;
  const isActive = node.id === activeId;

  return (
    <>
      <div
        id={rowDomId(node.id)}
        role="treeitem"
        aria-selected={isSelected}
        onClick={() => {
          if (!isFrame) onSelect(node.id);
        }}
        onContextMenu={(e) => {
          if (isFrame) return;
          e.preventDefault();
          onContextMenu(node.id, e.clientX, e.clientY);
        }}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        className={`flex h-6 items-center gap-1.5 pr-2 font-mono text-[11px] ${
          isFrame
            ? "cursor-default font-semibold text-content-secondary"
            : "cursor-pointer text-content-tertiary hover:bg-surface-panel-hover"
        } ${isSelected ? "bg-accent/20 text-content-primary" : ""} ${
          isActive ? "ring-1 ring-inset ring-accent/70" : ""
        }`}
      >
        <span className="w-3 shrink-0 text-center opacity-60">{kindIcon(node.kind)}</span>
        <span className="truncate">{node.name}</span>
      </div>
      {children.map((child) => (
        <LayerRow
          key={child.node.id}
          treeNode={child}
          depth={depth + 1}
          selectedId={selectedId}
          activeId={activeId}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
        />
      ))}
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** DOM id for a row — referenced by the tree's aria-activedescendant. */
function rowDomId(nodeId: string): string {
  return `layer-${nodeId}`;
}

/** Depth-first visual order of every selectable (non-frame) node id. */
function flattenSelectable(forest: readonly TreeNode[]): readonly string[] {
  const out: string[] = [];
  const walk = (t: TreeNode) => {
    if (t.node.kind !== "frame") out.push(t.node.id);
    t.children.forEach(walk);
  };
  forest.forEach(walk);
  return out;
}

function kindIcon(kind: DocNodeKind): string {
  if (kind === "frame") return "▢";
  if (kind === "ellipse") return "○";
  return "▭";
}
