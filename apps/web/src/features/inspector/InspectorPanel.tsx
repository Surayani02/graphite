import { useMemo } from "react";
import { COLOR_TRANSPARENT, type NodePatch } from "@graphite/protocol";
import { useUIStore } from "../../stores/uiStore";
import { useEngineContext } from "../../contexts/EngineContext";
import { NumberField, ColorField } from "@graphite/ui-core";

/**
 * InspectorPanel — Phase 6 Milestone 2.
 *
 * Shows position/size/fill/stroke/corner-radius for the selected node
 * (single-select only, matching canvas selection) and writes edits back
 * through EngineContext.updateNode → bridge → node:update IPC message,
 * which the worker applies to both SceneGraph (render) and DocumentModel
 * (persistence) — see workers/engine/scene/mutate.ts. Corner radius is
 * clamped worker-side at that single choke-point, so no max is duplicated
 * here.
 */
export function InspectorPanel() {
  const inspectorOpen = useUIStore((s) => s.inspectorOpen);
  const toggleInspector = useUIStore((s) => s.toggleInspector);
  const { nodes, selectedIds, updateNode } = useEngineContext();

  const selectedId = selectedIds[0];
  const node = useMemo(
    () => (selectedId ? nodes.find((n) => n.id === selectedId) : undefined),
    [nodes, selectedId]
  );

  const commit = (patch: NodePatch) => {
    if (node) updateNode(node.id, patch);
  };

  return (
    <aside
      aria-label="Inspector"
      className={`flex flex-col border-l border-border-subtle bg-surface-panel transition-[width] ${
        inspectorOpen ? "w-64" : "w-9"
      }`}
    >
      <div className="flex h-9 items-center justify-between border-b border-border-subtle px-2">
        <button
          type="button"
          title={inspectorOpen ? "Collapse inspector" : "Expand inspector"}
          onClick={toggleInspector}
          className="mr-auto rounded px-1.5 py-0.5 text-content-tertiary hover:bg-surface-panel-hover"
        >
          {inspectorOpen ? "›" : "‹"}
        </button>
        {inspectorOpen && (
          <span className="font-mono text-[11px] uppercase tracking-wide text-content-tertiary">
            Inspector
          </span>
        )}
      </div>

      {inspectorOpen && (
        <div className="flex-1 overflow-y-auto p-2">
          {!node ? (
            <p className="font-mono text-[11px] text-content-tertiary">
              {selectedIds.length > 0 ? "Loading…" : "Select a shape to inspect it."}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="truncate font-mono text-[11px] font-semibold text-content-primary">
                {node.name}
              </p>

              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="X"
                  value={node.x}
                  onCommit={(x) => {
                    commit({ x });
                  }}
                />
                <NumberField
                  label="Y"
                  value={node.y}
                  onCommit={(y) => {
                    commit({ y });
                  }}
                />
                <NumberField
                  label="W"
                  value={node.w}
                  min={1}
                  onCommit={(w) => {
                    commit({ w });
                  }}
                />
                <NumberField
                  label="H"
                  value={node.h}
                  min={1}
                  onCommit={(h) => {
                    commit({ h });
                  }}
                />
              </div>

              {node.kind !== "frame" && (
                <>
                  <div className="h-px bg-border-subtle" />
                  <ColorField
                    label="Fill"
                    value={node.fill}
                    onCommit={(fill) => {
                      commit({ fill });
                    }}
                  />
                  <div className="flex items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <ColorField
                        label="Stroke"
                        value={node.stroke?.color ?? COLOR_TRANSPARENT}
                        onCommit={(color) => {
                          commit({ stroke: { color, width: node.stroke?.width ?? 1 } });
                        }}
                      />
                    </div>
                    {node.stroke !== null && (
                      <button
                        type="button"
                        title="Remove stroke"
                        aria-label="Remove stroke"
                        onClick={() => {
                          commit({ stroke: null });
                        }}
                        className="rounded px-1 py-0.5 text-content-tertiary hover:bg-surface-panel-hover hover:text-danger"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <NumberField
                    label="SW"
                    value={node.stroke?.width ?? 0}
                    min={0}
                    onCommit={(width) => {
                      commit({
                        stroke: {
                          color: node.stroke?.color ?? { ...COLOR_TRANSPARENT, a: 255 },
                          width,
                        },
                      });
                    }}
                  />
                </>
              )}

              {node.kind === "rect" && (
                <NumberField
                  label="R"
                  value={node.cornerRadius}
                  min={0}
                  onCommit={(cornerRadius) => {
                    commit({ cornerRadius });
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
