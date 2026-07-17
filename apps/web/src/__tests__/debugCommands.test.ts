import { describe, expect, it, vi } from "vitest";
import { MVP_MAX_OBJECTS, SYSTEM_MAX_OBJECTS } from "@graphite/protocol";
import { builtinCommands, ensureBuiltinCommands } from "../features/commands/builtin";
import { debugCommands } from "../features/commands/builtin/debugCommands";
import { createCommandRegistry } from "../features/commands/registry";
import { type CommandContext } from "../features/commands/types";
import { type EngineStatus } from "../hooks/useEngine";

/**
 * Phase 7 M5 — Debug commands (ADR-027).
 *
 * Vitest runs with `import.meta.env.DEV === true`, so these tests exercise
 * the dev branch: the commands exist, register, gate, and route. The
 * production branch — the spread collapsing to nothing — is a build-time
 * property verified against the built artifact (the release-bundle greps
 * recorded in docs/benchmarks/phase7-stress.md), not something a dev-mode
 * test runner can observe.
 */

function fakeContext(status: EngineStatus = "running"): CommandContext {
  return {
    engine: {
      status,
      selectedIds: [],
      hasContent: true,
      setSelection: vi.fn(),
      deleteSelection: vi.fn(),
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
      loadStress: vi.fn(),
    },
    files: {
      save: vi.fn(),
      saveAs: vi.fn(),
      open: vi.fn(),
      newDocument: vi.fn(),
    },
    exports: {
      open: vi.fn(),
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

describe("debugCommands", () => {
  it("registers both stress commands under dev-gated registration", () => {
    const ids = builtinCommands.map((c) => c.id);
    expect(ids).toContain("debug.stress10k");
    expect(ids).toContain("debug.stress100k");
  });

  it("lists Debug last in palette empty-query order", () => {
    // Registry order is the palette's browse order — the dev surface must
    // sit below every real command, never above the tools a user wants.
    const firstDebug = builtinCommands.findIndex((c) => c.category === "Debug");
    expect(firstDebug).toBeGreaterThan(-1);
    for (const command of builtinCommands.slice(firstDebug)) {
      expect(command.category).toBe("Debug");
    }
  });

  it("is palette-only — no default chords, by decision", () => {
    for (const command of debugCommands) {
      expect(command.category).toBe("Debug");
      expect(command.defaultChords).toBeUndefined();
    }
  });

  it("gates on the engine running", () => {
    for (const command of debugCommands) {
      expect(command.enabled?.(fakeContext("running"))).toBe(true);
      expect(command.enabled?.(fakeContext("initializing"))).toBe(false);
      expect(command.enabled?.(fakeContext("error"))).toBe(false);
    }
  });

  it("routes to loadStress with the exact Blueprint budgets", () => {
    const registry = createCommandRegistry();
    ensureBuiltinCommands(registry);

    const tenK = fakeContext();
    expect(registry.execute("debug.stress10k", tenK)).toBe(true);
    expect(tenK.engine.loadStress).toHaveBeenCalledExactlyOnceWith(MVP_MAX_OBJECTS);

    const hundredK = fakeContext();
    expect(registry.execute("debug.stress100k", hundredK)).toBe(true);
    expect(hundredK.engine.loadStress).toHaveBeenCalledExactlyOnceWith(SYSTEM_MAX_OBJECTS);
  });

  it("does not run while the engine is down", () => {
    const registry = createCommandRegistry();
    ensureBuiltinCommands(registry);
    const ctx = fakeContext("error");
    expect(registry.execute("debug.stress10k", ctx)).toBe(false);
    expect(ctx.engine.loadStress).not.toHaveBeenCalled();
  });
});
