import { useMemo, useState } from "react";
import { Kbd, SearchableListBox, type SearchableListSection } from "@graphite/ui-core";
import { useUIStore } from "../../stores/uiStore";
import { fuzzyScore } from "../commands/fuzzy";
import { commandRegistry } from "../commands/registry";
import { type CommandDescriptor } from "../commands/types";
import { detectChordPlatform, formatChord } from "../shortcuts/chord";
import { useResolvedShortcuts } from "../shortcuts/useResolvedShortcuts";

/**
 * Keymap editor (M5) — the payoff of M4's command architecture (ADR-015 §7
 * promised the full editor here). It is a *view*: every row is a registered
 * command, its chord read live from the resolved map, and Rebind reuses the
 * exact M4 ShortcutRecorderDialog via the recorder's `target` parameter.
 * No new state — search is the M4 fuzzy scorer, edits write the same
 * `shortcutOverrides` the recorder and provider already use. Reset All
 * clears every override back to defaults.
 *
 * The list uses ui-core's SearchableListBox (the palette's primitive) for
 * search + keyboard navigation; each row's Rebind/Clear are reachable via
 * the row's own controls.
 */
export function KeymapEditor() {
  const openShortcutRecorder = useUIStore((s) => s.openShortcutRecorder);
  const resetShortcuts = useUIStore((s) => s.resetShortcuts);
  const resolved = useResolvedShortcuts();
  const platform = useMemo(() => detectChordPlatform(), []);
  const [query, setQuery] = useState("");

  const commands = useMemo(() => commandRegistry.list(), []);
  const filtered = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) return commands;
    return commands
      .map((command) => ({ command, score: fuzzyScore(trimmed, command.title) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.command);
  }, [commands, query]);

  const sections: readonly SearchableListSection<CommandDescriptor>[] = [
    { id: "commands", title: "Commands", items: filtered },
  ];

  const renderRow = (command: CommandDescriptor) => {
    const chord = resolved.byCommand.get(command.id)?.[0];
    return (
      <>
        <span className="flex-1 truncate">{command.title}</span>
        {chord !== undefined ? (
          <Kbd>{formatChord(chord, platform)}</Kbd>
        ) : (
          <span className="text-[10px] uppercase tracking-wide text-content-tertiary">Unbound</span>
        )}
      </>
    );
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[13px] font-semibold text-content-primary">
          Keyboard shortcuts
        </h2>
        <button
          type="button"
          onClick={resetShortcuts}
          className="rounded px-2 py-1 font-mono text-[11px] text-content-tertiary hover:bg-surface-panel-hover hover:text-content-secondary"
        >
          Reset all
        </button>
      </div>

      <div className="rounded-md border border-border-subtle">
        <SearchableListBox<CommandDescriptor>
          label="Keyboard shortcuts"
          placeholder="Search commands…"
          query={query}
          onQueryChange={setQuery}
          sections={sections}
          itemKey={(command) => command.id}
          itemText={(command) => command.title}
          renderItem={renderRow}
          onAction={(id) => {
            openShortcutRecorder(id as CommandDescriptor["id"]);
          }}
          emptyState={
            <span className="block px-3 py-6 text-center font-mono text-[11px] text-content-tertiary">
              No commands match “{query}”.
            </span>
          }
        />
      </div>

      <p className="font-mono text-[10px] leading-relaxed text-content-tertiary">
        Select a command to rebind it. In the editor, open the command palette (mod+K) and choose
        “Change Keyboard Shortcut…” to remap on the fly.
      </p>
    </section>
  );
}
