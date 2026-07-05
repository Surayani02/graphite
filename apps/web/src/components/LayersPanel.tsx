import { useMemo, useState } from "react";
import type { DocNodeKind } from "@graphite/protocol";
import { useUIStore } from "../stores/uiStore";
import { useEngineContext } from "../context/EngineContext";
import { buildTree, type TreeNode } from "../document/tree";

/**
 * LayersPanel — Phase 6 Milestone 2.
 *
 * Renders the document's node tree from EngineContext's `nodes` list
 * (pushed by the worker on every load/edit — see workers/engine/scene/mutate.ts)
 * with click-to-select and full keyboard operation. Frame rows are not
 * selectable, matching hit_test()'s existing behaviour on canvas (frames
 * are containers, never hit-testable) — keeps both selection paths
 * behaviourally identical.
 *
 * Keyboard model: the tree container is the single tab stop and exposes the
 * active row via aria-activedescendant (the WAI-ARIA alternative to roving
 * tabindex — one focusable element, no ref bookkeeping per row).
 * ArrowUp/Down move across selectable rows in visual order, Home/End jump,
 * Enter/Space select.
 */
export function LayersPanel() {
  const layersOpen = useUIStore((s) => s.layersOpen);
  const toggleLayers = useUIStore((s) => s.toggleLayers);
  const { nodes, selectedIds, setSelection } = useEngineContext();

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

  return (
    <aside
      aria-label="Layers"
      className={`flex flex-col border-r border-border-subtle bg-surface-panel transition-[width] ${
        layersOpen ? "w-60" : "w-9"
      }`}
    >
      <div className="flex h-9 items-center justify-between border-b border-border-subtle px-2">
        {layersOpen && (
          <span className="font-mono text-[11px] uppercase tracking-wide text-content-tertiary">
            Layers
          </span>
        )}
        <button
          type="button"
          title={layersOpen ? "Collapse layers panel" : "Expand layers panel"}
          onClick={toggleLayers}
          className="ml-auto rounded px-1.5 py-0.5 text-content-tertiary hover:bg-surface-panel-hover"
        >
          {layersOpen ? "‹" : "›"}
        </button>
      </div>
      {layersOpen && (
        <div
          role="tree"
          aria-label="Layer tree"
          tabIndex={0}
          aria-activedescendant={
            effectiveActiveId !== null ? rowDomId(effectiveActiveId) : undefined
          }
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
                onSelect={(id) => {
                  setActiveId(id);
                  setSelection([id]);
                }}
              />
            ))
          )}
        </div>
      )}
    </aside>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

interface LayerRowProps {
  treeNode: TreeNode;
  depth: number;
  selectedId: string | undefined;
  activeId: string | null;
  onSelect: (id: string) => void;
}

function LayerRow({ treeNode, depth, selectedId, activeId, onSelect }: LayerRowProps) {
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
