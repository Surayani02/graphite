import { useEffect, useMemo, useState } from "react";
import { SearchX } from "lucide-react";
import {
  EmptyState,
  Kbd,
  ModalDialog,
  SearchableListBox,
  type SearchableListSection,
} from "@graphite/ui-core";
import { useUIStore } from "../../stores/uiStore";
import { commandRegistry, type CommandRegistry } from "../commands/registry";
import { useCommandContext } from "../commands/useCommandContext";
import { detectChordPlatform, formatChord } from "../shortcuts/chord";
import { useResolvedShortcuts } from "../shortcuts/useResolvedShortcuts";
import { usePaletteItems, type PaletteEntry } from "./usePaletteItems";

/** Row keys are namespaced so command ids and node ids can never collide. */
const COMMAND_PREFIX = "command:";
const NODE_PREFIX = "node:";

function entryKey(entry: PaletteEntry): string {
  return entry.kind === "command" ? COMMAND_PREFIX + entry.command.id : NODE_PREFIX + entry.node.id;
}

function entryText(entry: PaletteEntry): string {
  return entry.kind === "command" ? entry.command.title : entry.node.name;
}

/**
 * The command palette (M4) — mod+K, or the toolbar's palette entry point.
 * A thin composition: `usePaletteItems` ranks, ui-core's `ModalDialog` +
 * `SearchableListBox` own every interaction and ARIA concern, and this
 * component maps activation keys back to effects. Command rows execute
 * through the registry; layer rows select the node and reveal the Layers
 * tab (which also expands a collapsed panel, per the store contract).
 *
 * Mounted permanently by AppShell: opening is a state flip on an
 * already-populated registry — no lazy import on the <50ms hot path. The
 * effect below closes the `graphite:palette-open` performance measure one
 * painted frame after opening (see docs/benchmarks/phase6-m4.md).
 */
export function CommandPalette({ registry = commandRegistry }: { registry?: CommandRegistry }) {
  const isOpen = useUIStore((s) => s.paletteOpen);
  const closePalette = useUIStore((s) => s.closePalette);
  const setLeftPanelTab = useUIStore((s) => s.setLeftPanelTab);
  const ctx = useCommandContext();
  const [query, setQuery] = useState("");
  const items = usePaletteItems(query, registry);
  const resolved = useResolvedShortcuts(registry);
  const platform = useMemo(() => detectChordPlatform(), []);

  useEffect(() => {
    if (!isOpen || typeof performance === "undefined") return;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        performance.mark("graphite:palette-open:end");
        try {
          performance.measure(
            "graphite:palette-open",
            "graphite:palette-open:start",
            "graphite:palette-open:end"
          );
        } catch {
          // Opened without the store action (e.g. test setState) — no start
          // mark exists, and a missing sample is fine.
        }
      });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [isOpen]);

  const sections: readonly SearchableListSection<PaletteEntry>[] = [
    { id: "commands", title: "Commands", items: items.commands },
    { id: "layers", title: "Layers", items: items.nodes },
  ];

  const byKey = new Map<string, PaletteEntry>();
  for (const section of sections) {
    for (const entry of section.items) byKey.set(entryKey(entry), entry);
  }

  const close = (): void => {
    closePalette();
    setQuery("");
  };

  const onAction = (key: string): void => {
    const entry = byKey.get(key);
    if (entry === undefined) return;
    close();
    if (entry.kind === "command") {
      registry.execute(entry.command.id, ctx);
      return;
    }
    ctx.engine.setSelection([entry.node.id]);
    setLeftPanelTab("layers");
  };

  const renderEntry = (entry: PaletteEntry): React.ReactNode => {
    if (entry.kind === "command") {
      const chord = resolved.byCommand.get(entry.command.id)?.[0];
      return (
        <>
          <span className="flex-1 truncate">{entry.command.title}</span>
          {chord !== undefined && <Kbd>{formatChord(chord, platform)}</Kbd>}
        </>
      );
    }
    return (
      <>
        <span aria-hidden className="w-3 text-center text-content-tertiary">
          {entry.node.kind === "ellipse" ? "○" : "▭"}
        </span>
        <span className="flex-1 truncate">{entry.node.name}</span>
        <span className="text-[10px] uppercase tracking-wide text-content-tertiary">
          {entry.node.kind}
        </span>
      </>
    );
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      label="Command palette"
    >
      <SearchableListBox<PaletteEntry>
        label="Command palette"
        placeholder="Type a command or search layers…"
        query={query}
        onQueryChange={setQuery}
        sections={sections}
        itemKey={entryKey}
        itemText={entryText}
        renderItem={renderEntry}
        onAction={onAction}
        emptyState={
          <EmptyState
            icon={<SearchX size={16} />}
            title="No matching results"
            description={`Nothing matches “${query}”. Try fewer characters.`}
          />
        }
      />
    </ModalDialog>
  );
}
