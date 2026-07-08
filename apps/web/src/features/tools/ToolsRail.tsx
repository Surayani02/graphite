import { useMemo, useRef } from "react";
import { MousePointer2, Hand, Square, Circle, type LucideIcon } from "lucide-react";
import { Tooltip } from "@graphite/ui-core";
import type { ToolType } from "@graphite/protocol";
import { useUIStore, selectEffectiveTool } from "../../stores/uiStore";
import { type CommandId } from "../commands/types";
import { detectChordPlatform, formatChord, toAriaKeyshortcuts } from "../shortcuts/chord";
import { useResolvedShortcuts } from "../shortcuts/useResolvedShortcuts";

interface ToolSpec {
  readonly tool: ToolType;
  readonly label: string;
  /** The command that switches to this tool — its live chord labels the button. */
  readonly commandId: CommandId;
  readonly icon: LucideIcon;
}

const TOOLS: readonly ToolSpec[] = [
  { tool: "select", label: "Select", commandId: "tool.select", icon: MousePointer2 },
  { tool: "pan", label: "Pan", commandId: "tool.pan", icon: Hand },
  { tool: "rectangle", label: "Rectangle", commandId: "tool.rectangle", icon: Square },
  { tool: "ellipse", label: "Ellipse", commandId: "tool.ellipse", icon: Circle },
] as const;

/**
 * Left tools rail — Phase 6 M3; chords made live in M4.
 *
 * Select/Pan move here from TopToolbar (which slims to document-level
 * actions only); Rectangle/Ellipse are new. ARIA `toolbar` pattern: one
 * tab stop, Up/Down roving focus between buttons, `aria-pressed` marks the
 * active tool. `spaceDown`'s temporary pan override (see uiStore) is
 * reflected here the same way TopToolbar always showed it: via
 * `selectEffectiveTool`, not `activeTool` directly, so holding Space
 * visually highlights Pan without touching what's *stored* as the user's
 * chosen tool.
 *
 * Tooltip and `aria-keyshortcuts` labels come from the resolved shortcut
 * map, not hardcoded letters (M4): rebinding a tool in the recorder
 * updates every affordance, and an unbound tool simply shows no chord.
 */
export function ToolsRail() {
  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const effectiveTool = useUIStore(selectEffectiveTool);
  const resolved = useResolvedShortcuts();
  const platform = useMemo(() => detectChordPlatform(), []);
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
      {TOOLS.map(({ tool, label, commandId, icon: Icon }, index) => {
        const active = effectiveTool === tool;
        const chord = resolved.byCommand.get(commandId)?.[0];
        return (
          <Tooltip
            key={tool}
            label={label}
            {...(chord !== undefined ? { shortcut: formatChord(chord, platform) } : {})}
          >
            <button
              type="button"
              aria-pressed={active}
              tabIndex={active ? 0 : -1}
              {...(chord !== undefined
                ? { "aria-keyshortcuts": toAriaKeyshortcuts(chord, platform) }
                : {})}
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
