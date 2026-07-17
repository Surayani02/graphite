import { commandRegistry, type CommandRegistry } from "../registry";
import { type CommandDescriptor } from "../types";
import { debugCommands } from "./debugCommands";
import { editCommands } from "./editCommands";
import { fileCommands } from "./fileCommands";
import { toolCommands } from "./toolCommands";
import { viewCommands } from "./viewCommands";

/**
 * Every builtin, in the order the palette lists them for an empty query:
 * tools first (highest-frequency), then edit/file, then chrome. Debug
 * commands come last and only exist in dev builds — `import.meta.env.DEV`
 * is statically `false` in production, so the spread is empty, the
 * descriptors tree-shake away, and the palette never lists a Debug
 * category outside dev (ADR-027).
 */
export const builtinCommands: readonly CommandDescriptor[] = [
  ...toolCommands,
  ...editCommands,
  ...fileCommands,
  ...viewCommands,
  ...(import.meta.env.DEV ? debugCommands : []),
];

const registered = new WeakSet<CommandRegistry>();

/**
 * Registers every builtin exactly once per registry — idempotent so the
 * shell bootstrap, HMR re-imports, and multiple test files can all call it
 * without tripping the registry's duplicate-id guard.
 */
export function ensureBuiltinCommands(registry: CommandRegistry = commandRegistry): void {
  if (registered.has(registry)) return;
  registered.add(registry);
  for (const command of builtinCommands) registry.register(command);
}
