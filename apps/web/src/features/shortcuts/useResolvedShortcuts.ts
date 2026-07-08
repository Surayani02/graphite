import { useMemo } from "react";
import { useUIStore } from "../../stores/uiStore";
import { commandRegistry, type CommandRegistry } from "../commands/registry";
import { type CommandId } from "../commands/types";
import { detectChordPlatform, formatChord, toAriaKeyshortcuts, type Chord } from "./chord";
import { resolveShortcuts, type ResolvedShortcuts } from "./shortcutMap";

/**
 * Live chord ⇄ command resolution: registry defaults ⊕ persisted overrides.
 * Recomputes only when overrides change — the registry is static after
 * shell bootstrap, and `resolveShortcuts` over a dozen commands is
 * microseconds, so no finer-grained caching is warranted.
 */
export function useResolvedShortcuts(
  registry: CommandRegistry = commandRegistry
): ResolvedShortcuts {
  const overrides = useUIStore((s) => s.shortcutOverrides);
  return useMemo(() => resolveShortcuts(registry.list(), overrides), [registry, overrides]);
}

export interface CommandShortcut {
  /** Canonical chord ("mod+k") — what the recorder and tests reason about. */
  readonly chord: Chord;
  /** Display label — "⌘K" on Mac, "Ctrl+K" elsewhere. */
  readonly label: string;
  /** `aria-keyshortcuts` value — "Meta+K" / "Control+K". */
  readonly aria: string;
}

/**
 * The (first) live shortcut of one command, formatted for this platform —
 * what toolbars put in tooltips, `<Kbd>`, and `aria-keyshortcuts`. Returns
 * `null` for unbound commands so callers can omit the affordance entirely.
 */
export function useCommandShortcut(
  id: CommandId,
  registry: CommandRegistry = commandRegistry
): CommandShortcut | null {
  const resolved = useResolvedShortcuts(registry);
  return useMemo(() => {
    const chord = resolved.byCommand.get(id)?.[0];
    if (chord === undefined) return null;
    const platform = detectChordPlatform();
    return {
      chord,
      label: formatChord(chord, platform),
      aria: toAriaKeyshortcuts(chord, platform),
    };
  }, [resolved, id]);
}
