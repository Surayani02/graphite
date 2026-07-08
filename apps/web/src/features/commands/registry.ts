import { type CommandContext, type CommandDescriptor, type CommandId } from "./types";

/**
 * Registration + dispatch for commands. `list()` preserves insertion order
 * — that order is contract, not accident: it is the palette's empty-query
 * order and the deterministic tie-breaker for shortcut collisions
 * (shortcutMap.ts). `register` returns an unregister function; today that
 * exists for test isolation, and it is deliberately the exact shape a
 * Phase 10 plugin-unload hook needs.
 */
export interface CommandRegistry {
  /** Adds a command. Throws on a duplicate id — always a programmer error. */
  register(command: CommandDescriptor): () => void;
  get(id: CommandId): CommandDescriptor | undefined;
  list(): readonly CommandDescriptor[];
  /**
   * Runs a command through its `enabled` gate. Returns false (and runs
   * nothing) for unknown or disabled commands — pressing Delete with an
   * empty selection is a no-op, not an error.
   */
  execute(id: CommandId, ctx: CommandContext): boolean;
}

/** Isolated registry — production code uses the singleton below; tests
 *  create their own so suites can't contaminate each other. */
export function createCommandRegistry(): CommandRegistry {
  const commands = new Map<CommandId, CommandDescriptor>();
  return {
    register(command) {
      if (commands.has(command.id)) {
        throw new Error(`Command "${command.id}" is already registered`);
      }
      commands.set(command.id, command);
      return () => {
        commands.delete(command.id);
      };
    },
    get(id) {
      return commands.get(id);
    },
    list() {
      return [...commands.values()];
    },
    execute(id, ctx) {
      const command = commands.get(id);
      if (command === undefined) return false;
      if (command.enabled !== undefined && !command.enabled(ctx)) return false;
      command.run(ctx);
      return true;
    },
  };
}

/** The app-wide registry. Populated once at shell bootstrap
 *  (`ensureBuiltinCommands`), read by the palette and ShortcutProvider. */
export const commandRegistry: CommandRegistry = createCommandRegistry();
