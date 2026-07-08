import { type CommandDescriptor, type CommandId } from "../commands/types";
import { normalizeChord, type Chord } from "./chord";

export interface ResolvedShortcuts {
  /** Chord → the single command it triggers. */
  readonly byChord: ReadonlyMap<Chord, CommandId>;
  /**
   * Command → the chords it *effectively* holds, shadowed entries removed;
   * first entry is the display chord. Unbound commands map to `[]`, so the
   * UI never advertises a chord that would actually run something else.
   */
  readonly byCommand: ReadonlyMap<CommandId, readonly Chord[]>;
}

/**
 * Resolve effective bindings from command defaults ⊕ user overrides.
 *
 * Rules, in order:
 * 1. An override replaces *all* of a command's default chords — one chord,
 *    or none (`null` = explicitly unbound). An invalid persisted override
 *    string resolves to unbound rather than resurrecting a default the
 *    user deliberately moved away from.
 * 2. Overridden bindings claim their chord before any default does — an
 *    explicit user choice always beats a shipped default, so a default
 *    colliding with an override is shadowed out of both maps.
 * 3. Within a tier, registry insertion order breaks ties deterministically.
 *    That only matters for corrupt storage or a builtin-authoring mistake;
 *    `builtinCommands.test.ts` guards defaults against colliding at all,
 *    and the store's `setShortcutOverride` keeps overrides unique.
 */
export function resolveShortcuts(
  commands: readonly CommandDescriptor[],
  overrides: Readonly<Record<string, string | null>>
): ResolvedShortcuts {
  const wanted = new Map<CommandId, readonly Chord[]>();
  for (const command of commands) {
    const override = overrides[command.id];
    if (override !== undefined) {
      const chord = override === null ? null : normalizeChord(override);
      wanted.set(command.id, chord === null ? [] : [chord]);
      continue;
    }
    const defaults: Chord[] = [];
    for (const raw of command.defaultChords ?? []) {
      const chord = normalizeChord(raw);
      if (chord !== null) defaults.push(chord);
    }
    wanted.set(command.id, defaults);
  }

  const byChord = new Map<Chord, CommandId>();
  const byCommand = new Map<CommandId, readonly Chord[]>();
  const claim = (command: CommandDescriptor): void => {
    const kept: Chord[] = [];
    for (const chord of wanted.get(command.id) ?? []) {
      if (!byChord.has(chord)) {
        byChord.set(chord, command.id);
        kept.push(chord);
      }
    }
    byCommand.set(command.id, kept);
  };
  for (const command of commands) {
    if (overrides[command.id] !== undefined) claim(command);
  }
  for (const command of commands) {
    if (overrides[command.id] === undefined) claim(command);
  }

  return { byChord, byCommand };
}
