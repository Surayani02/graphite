import { Palette } from "lucide-react";
import { type Color } from "@graphite/protocol";
import { EmptyState } from "@graphite/ui-core";
import { useEngineContext } from "../../contexts/EngineContext";
import { useDocumentColors } from "./useDocumentColors";

function cssColor(color: Color): string {
  return `rgb(${color.r} ${color.g} ${color.b} / ${color.a / 255})`;
}

/**
 * Assets tab, v1 (M4): the document's live color palette. Swatches are
 * derived from actual fills/strokes (useDocumentColors) — never a stored
 * list that can drift from the document. Clicking a swatch applies it as
 * the fill of the single selected shape via the same `node:update` path
 * the Inspector uses; with no single selection, swatches are disabled and
 * a hint explains why rather than failing silently. Future asset classes
 * (components, styles — Phase 10) become sibling sections here.
 */
export function AssetsPanel() {
  const colors = useDocumentColors();
  const { selectedIds, updateNode } = useEngineContext();
  const targetId = selectedIds.length === 1 ? selectedIds[0] : undefined;

  if (colors.length === 0) {
    return (
      <EmptyState
        icon={<Palette size={16} />}
        title="No document colors"
        description="Fills and strokes used by shapes appear here. Draw a rectangle (R) to get started."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      <span className="px-0.5 font-mono text-[10px] uppercase tracking-wide text-content-tertiary">
        Document colors
      </span>
      <div className="grid grid-cols-7 gap-1.5">
        {colors.map((entry) => (
          <button
            key={entry.hex}
            type="button"
            disabled={targetId === undefined}
            aria-label={`Apply ${entry.hex} to selection`}
            title={`${entry.hex} — ${entry.usageCount} ${entry.usageCount === 1 ? "use" : "uses"}`}
            onClick={() => {
              if (targetId !== undefined) updateNode(targetId, { fill: entry.color });
            }}
            className="h-6 w-6 rounded border border-border-subtle focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus enabled:hover:scale-110 enabled:hover:border-border-strong disabled:cursor-default"
            style={{ backgroundColor: cssColor(entry.color) }}
          />
        ))}
      </div>
      {targetId === undefined && (
        <p className="px-0.5 font-mono text-[10px] leading-relaxed text-content-tertiary">
          Select a single shape to apply a color as its fill.
        </p>
      )}
    </div>
  );
}
