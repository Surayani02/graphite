import { describe, expect, it, vi } from "vitest";
import { createCommandRegistry } from "../features/commands/registry";
import { type CommandContext, type CommandDescriptor } from "../features/commands/types";

function fakeContext(selectedIds: readonly string[] = []): CommandContext {
  return {
    engine: {
      selectedIds,
      setSelection: vi.fn(),
      deleteSelection: vi.fn(),
      requestSave: vi.fn(),
      updateNode: vi.fn(),
      historyStatus: {
        canUndo: false,
        canRedo: false,
        undoLabel: null,
        redoLabel: null,
        dirty: false,
      },
      undo: vi.fn(),
      redo: vi.fn(),
    },
    ui: {
      setActiveTool: vi.fn(),
      toggleLeftPanel: vi.fn(),
      toggleInspector: vi.fn(),
      openPalette: vi.fn(),
      setLeftPanelTab: vi.fn(),
      openShortcutRecorder: vi.fn(),
    },
  };
}

function testCommand(
  id: `${string}.${string}`,
  overrides: Partial<CommandDescriptor> = {}
): CommandDescriptor {
  return { id, title: id, category: "Edit", run: () => {}, ...overrides };
}

describe("createCommandRegistry", () => {
  it("registers, gets by id, and lists in insertion order", () => {
    const registry = createCommandRegistry();
    registry.register(testCommand("a.one"));
    registry.register(testCommand("b.two"));
    expect(registry.get("a.one")?.id).toBe("a.one");
    expect(registry.list().map((c) => c.id)).toEqual(["a.one", "b.two"]);
  });

  it("throws on a duplicate id", () => {
    const registry = createCommandRegistry();
    registry.register(testCommand("a.one"));
    expect(() => registry.register(testCommand("a.one"))).toThrowError(/already registered/);
  });

  it("unregister removes exactly that command", () => {
    const registry = createCommandRegistry();
    const unregister = registry.register(testCommand("a.one"));
    registry.register(testCommand("b.two"));
    unregister();
    expect(registry.get("a.one")).toBeUndefined();
    expect(registry.list().map((c) => c.id)).toEqual(["b.two"]);
  });

  it("execute returns false for unknown ids", () => {
    const registry = createCommandRegistry();
    expect(registry.execute("no.such", fakeContext())).toBe(false);
  });

  it("execute gates on enabled and never runs a disabled command", () => {
    const registry = createCommandRegistry();
    const run = vi.fn();
    registry.register(testCommand("a.one", { enabled: () => false, run }));
    expect(registry.execute("a.one", fakeContext())).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("execute runs enabled commands with the given context and reports true", () => {
    const registry = createCommandRegistry();
    const run = vi.fn();
    const ctx = fakeContext(["n1"]);
    registry.register(
      testCommand("a.one", { enabled: (c) => c.engine.selectedIds.length > 0, run })
    );
    expect(registry.execute("a.one", ctx)).toBe(true);
    expect(run).toHaveBeenCalledExactlyOnceWith(ctx);
  });
});
