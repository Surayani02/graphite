import { useMemo } from "react";
import { type DocNode } from "@graphite/protocol";
import { useEngineContext } from "../../contexts/EngineContext";
import { fuzzyScore } from "../commands/fuzzy";
import { commandRegistry, type CommandRegistry } from "../commands/registry";
import { type CommandDescriptor } from "../commands/types";
import { useCommandContext } from "../commands/useCommandContext";

export interface CommandPaletteEntry {
  readonly kind: "command";
  readonly command: CommandDescriptor;
  readonly score: number;
}

export interface NodePaletteEntry {
  readonly kind: "node";
  readonly node: DocNode;
  readonly score: number;
}

/** One row the palette can show — a command or a document node. */
export type PaletteEntry = CommandPaletteEntry | NodePaletteEntry;

export interface PaletteItems {
  readonly commands: readonly CommandPaletteEntry[];
  readonly nodes: readonly NodePaletteEntry[];
}

/** Layer results are capped: past a handful, refining the query beats
 *  scrolling, and the cap keeps worst-case render cost flat on huge docs. */
const NODE_RESULT_CAP = 8;

function commandScore(query: string, command: CommandDescriptor): number {
  let best = fuzzyScore(query, command.title);
  for (const keyword of command.keywords ?? []) {
    // Keyword hits rank strictly below an equivalent title hit.
    const score = Math.floor(fuzzyScore(query, keyword) / 2);
    if (score > best) best = score;
  }
  return best;
}

/**
 * Ranked palette content for a query: enabled commands (all of them, in
 * registry order, when the query is empty — the palette doubles as a
 * command browser) plus, once the user types, document nodes by name.
 * Frames are excluded from node results — they aren't selectable, so a
 * result row that can't act is noise.
 */
export function usePaletteItems(
  query: string,
  registry: CommandRegistry = commandRegistry
): PaletteItems {
  const ctx = useCommandContext();
  const { nodes } = useEngineContext();

  return useMemo(() => {
    const commands = registry
      .list()
      .filter((command) => command.enabled === undefined || command.enabled(ctx))
      .map((command) => ({
        kind: "command" as const,
        command,
        score: commandScore(query, command),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    const trimmed = query.trim();
    const nodeEntries =
      trimmed.length === 0
        ? []
        : nodes
            .filter((node) => node.kind !== "frame")
            .map((node) => ({ kind: "node" as const, node, score: fuzzyScore(trimmed, node.name) }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, NODE_RESULT_CAP);

    return { commands, nodes: nodeEntries };
  }, [query, registry, ctx, nodes]);
}
