import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ModalDialog } from "@graphite/ui-core";
import { useUIStore } from "../../stores/uiStore";
import { commandRegistry, type CommandRegistry } from "../commands/registry";
import { chordFromEvent, detectChordPlatform, formatChord, type Chord } from "./chord";
import { useResolvedShortcuts } from "./useResolvedShortcuts";

const FIELD_CLASS =
  "rounded border border-border-subtle bg-surface-canvas px-2 py-1.5 font-mono text-[12px] " +
  "text-content-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus";

/**
 * In-product shortcut remapping (M4) — reachable via the palette's "Change
 * Keyboard Shortcut…". Pick a command, press the new keys into the capture
 * field, save. Escape and Tab keep their meaning inside the capture field
 * (dialog dismissal and focus movement must never be bindable-by-accident);
 * bare modifier presses are ignored until a real key completes the chord.
 *
 * Conflicts are shown, not blocked: saving a chord another command holds
 * reassigns it — the store nulls a colliding *override*, and a colliding
 * *default* is shadowed at resolve time (shortcutMap.ts). A native
 * `<select>` is deliberate: fully accessible out of the box, and M5's
 * Settings page (React Hook Form + Zod) is where a design-system Select
 * belongs. The full keymap editor lands there; this dialog is the M4
 * mechanism that makes "remappable" true today.
 */
export function ShortcutRecorderDialog({
  registry = commandRegistry,
}: {
  registry?: CommandRegistry;
}) {
  const isOpen = useUIStore((s) => s.shortcutRecorderOpen);
  const target = useUIStore((s) => s.shortcutRecorderTarget);
  const close = useUIStore((s) => s.closeShortcutRecorder);
  const setShortcutOverride = useUIStore((s) => s.setShortcutOverride);
  const resolved = useResolvedShortcuts(registry);
  const platform = useMemo(() => detectChordPlatform(), []);
  const commands = useMemo(() => registry.list(), [registry]);

  const [selectedId, setSelectedId] = useState(commands[0]?.id ?? null);
  const [captured, setCaptured] = useState<Chord | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedId(target ?? commands[0]?.id ?? null);
    setCaptured(null);
  }, [isOpen, target, commands]);

  const currentChord = selectedId === null ? undefined : resolved.byCommand.get(selectedId)?.[0];
  const conflictId = captured === null ? undefined : resolved.byChord.get(captured);
  const conflict =
    conflictId !== undefined && conflictId !== selectedId ? registry.get(conflictId) : undefined;

  const onCaptureKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Escape" || e.key === "Tab") return;
    e.preventDefault();
    const chord = chordFromEvent(e.nativeEvent, platform);
    if (chord !== null) setCaptured(chord);
  };

  const save = (): void => {
    if (selectedId === null || captured === null) return;
    setShortcutOverride(selectedId, captured);
    close();
  };

  const unbind = (): void => {
    if (selectedId === null) return;
    setShortcutOverride(selectedId, null);
    close();
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      label="Change keyboard shortcut"
      widthClassName="w-full max-w-md"
    >
      <div className="flex flex-col gap-3 p-4 font-mono">
        <h2 className="text-[12px] font-semibold text-content-primary">Change keyboard shortcut</h2>

        <label className="flex flex-col gap-1 text-[11px] text-content-secondary">
          Command
          <select
            value={selectedId ?? ""}
            onChange={(e) => {
              const next = commands.find((c) => c.id === e.target.value);
              if (next !== undefined) {
                setSelectedId(next.id);
                setCaptured(null);
              }
            }}
            className={FIELD_CLASS}
          >
            {commands.map((command) => (
              <option key={command.id} value={command.id}>
                {command.title}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[11px] text-content-secondary">
          New shortcut
          <input
            readOnly
            value={captured === null ? "" : formatChord(captured, platform)}
            placeholder={
              currentChord === undefined
                ? "Press the new key combination"
                : `Current: ${formatChord(currentChord, platform)} — press new keys`
            }
            onKeyDown={onCaptureKeyDown}
            className={FIELD_CLASS}
          />
        </label>

        {conflict !== undefined && (
          <p role="alert" className="text-[11px] leading-relaxed text-content-secondary">
            Currently assigned to “{conflict.title}” — saving reassigns it.
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={unbind}
            className="rounded px-2.5 py-1 text-[11px] text-content-tertiary hover:bg-surface-panel-hover hover:text-content-secondary"
          >
            Remove binding
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={close}
            className="rounded px-2.5 py-1 text-[11px] text-content-secondary hover:bg-surface-panel-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={captured === null}
            className="rounded bg-accent px-2.5 py-1 text-[11px] text-content-primary hover:bg-accent-hover disabled:cursor-default disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
