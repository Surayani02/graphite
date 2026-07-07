import { useRef } from "react";
import { MousePointer2, Hand, Square, Circle, type LucideIcon } from "lucide-react";
import { Tooltip } from "@graphite/ui-core";
import type { ToolType } from "@graphite/protocol";
import { useUIStore, selectEffectiveTool } from "../../stores/uiStore";

interface ToolSpec {
  readonly tool: ToolType;
  readonly label: string;
  readonly shortcut: string;
  readonly icon: LucideIcon;
}

const TOOLS: readonly ToolSpec[] = [
  { tool: "select", label: "Select", shortcut: "V", icon: MousePointer2 },
  { tool: "pan", label: "Pan", shortcut: "H", icon: Hand },
  { tool: "rectangle", label: "Rectangle", shortcut: "R", icon: Square },
  { tool: "ellipse", label: "Ellipse", shortcut: "O", icon: Circle },
] as const;

/**
 * Left tools rail — Phase 6 M3.
 *
 * Select/Pan move here from TopToolbar (which slims to document-level
 * actions only); Rectangle/Ellipse are new. ARIA `toolbar` pattern: one
 * tab stop, Up/Down roving focus between buttons, `aria-pressed` marks the
 * active tool. `spaceDown`'s temporary pan override (see uiStore) is
 * reflected here the same way TopToolbar always showed it: via
 * `selectEffectiveTool`, not `activeTool` directly, so holding Space
 * visually highlights Pan without touching what's *stored* as the user's
 * chosen tool.
 */
export function ToolsRail() {
  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const effectiveTool = useUIStore(selectEffectiveTool);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const activeIndex = TOOLS.findIndex((t) => t.tool === effectiveTool);
    let nextIndex: number | null = null;
    if (e.key === "ArrowDown") nextIndex = Math.min(activeIndex + 1, TOOLS.length - 1);
    else if (e.key === "ArrowUp") nextIndex = Math.max(activeIndex - 1, 0);
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = TOOLS.length - 1;
    if (nextIndex === null) return;

    e.preventDefault();
    const next = TOOLS[nextIndex];
    if (next) {
      setActiveTool(next.tool);
      buttonRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <div
      role="toolbar"
      aria-label="Tools"
      aria-orientation="vertical"
      onKeyDown={onKeyDown}
      className="flex w-9 flex-col items-center gap-1 border-r border-border-subtle bg-surface-panel py-2"
    >
      {TOOLS.map(({ tool, label, shortcut, icon: Icon }, index) => {
        const active = effectiveTool === tool;
        return (
          <Tooltip key={tool} label={label} shortcut={shortcut}>
            <button
              type="button"
              aria-pressed={active}
              aria-keyshortcuts={shortcut}
              tabIndex={active ? 0 : -1}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              onClick={() => {
                setActiveTool(tool);
              }}
              className={`flex h-7 w-7 items-center justify-center rounded transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-border-focus ${
                active
                  ? "bg-accent text-content-primary"
                  : "text-content-tertiary hover:bg-surface-panel-hover hover:text-content-secondary"
              }`}
            >
              <Icon size={16} aria-hidden />
              <span className="sr-only">{label}</span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
