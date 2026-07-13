import { describe, expect, it, vi } from "vitest";
import { builtinCommands, ensureBuiltinCommands } from "../features/commands/builtin";
import { createCommandRegistry } from "../features/commands/registry";
import { type CommandContext } from "../features/commands/types";
import { normalizeChord } from "../features/shortcuts/chord";

function fakeContext(
  selectedIds: readonly string[] = [],
  history: { canUndo?: boolean; canRedo?: boolean } = {},
  status: "running" | "error" = "running"
): CommandContext {
  return {
    engine: {
      status,
      selectedIds,
      setSelection: vi.fn(),
      deleteSelection: vi.fn(),
      updateNode: vi.fn(),
      historyStatus: {
        canUndo: history.canUndo ?? false,
        canRedo: history.canRedo ?? false,
        undoLabel: history.canUndo === true ? "Move Rectangle" : null,
        redoLabel: history.canRedo === true ? "Move Rectangle" : null,
        dirty: false,
      },
      undo: vi.fn(),
      redo: vi.fn(),
    },
    files: {
      save: vi.fn(),
      saveAs: vi.fn(),
      open: vi.fn(),
      newDocument: vi.fn(),
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

describe("builtinCommands", () => {
  it("has globally unique ids", () => {
    const ids = builtinCommands.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every default chord is valid and no two commands' defaults collide", () => {
    const claimed = new Map<string, string>();
    for (const command of builtinCommands) {
      for (const raw of command.defaultChords ?? []) {
        const chord = normalizeChord(raw);
        expect(chord, `${command.id} declares invalid default "${raw}"`).not.toBeNull();
        if (chord === null) continue;
        const holder = claimed.get(chord);
        expect(
          holder,
          `"${chord}" claimed by both ${holder ?? ""} and ${command.id}`
        ).toBeUndefined();
        claimed.set(chord, command.id);
      }
    }
  });

  it("ensureBuiltinCommands is idempotent per registry", () => {
    const registry = createCommandRegistry();
    ensureBuiltinCommands(registry);
    ensureBuiltinCommands(registry);
    expect(registry.list()).toHaveLength(builtinCommands.length);
  });

  it("tool commands set the matching UI tool", () => {
    const registry = createCommandRegistry();
    ensureBuiltinCommands(registry);
    for (const [id, tool] of [
      ["tool.select", "select"],
      ["tool.pan", "pan"],
      ["tool.rectangle", "rectangle"],
      ["tool.ellipse", "ellipse"],
    ] as const) {
      const ctx = fakeContext();
      expect(registry.execute(id, ctx)).toBe(true);
      expect(ctx.ui.setActiveTool).toHaveBeenCalledExactlyOnceWith(tool);
    }
  });

  it("edit.deleteSelection is gated on selection and routes to the semantic engine path", () => {
    const registry = createCommandRegistry();
    ensureBuiltinCommands(registry);
    const empty = fakeContext([]);
    expect(registry.execute("edit.deleteSelection", empty)).toBe(false);
    expect(empty.engine.deleteSelection).not.toHaveBeenCalled();
    const withSelection = fakeContext(["n1"]);
    expect(registry.execute("edit.deleteSelection", withSelection)).toBe(true);
    expect(withSelection.engine.deleteSelection).toHaveBeenCalledTimes(1);
  });

  it("file and view commands drive the right capability", () => {
    const registry = createCommandRegistry();
    ensureBuiltinCommands(registry);

    const save = fakeContext();
    registry.execute("file.save", save);
    expect(save.files.save).toHaveBeenCalledTimes(1);

    const palette = fakeContext();
    registry.execute("view.commandPalette", palette);
    expect(palette.ui.openPalette).toHaveBeenCalledTimes(1);

    const assets = fakeContext();
    registry.execute("view.assetsTab", assets);
    expect(assets.ui.setLeftPanelTab).toHaveBeenCalledExactlyOnceWith("assets");

    const recorder = fakeContext();
    registry.execute("help.changeShortcut", recorder);
    expect(recorder.ui.openShortcutRecorder).toHaveBeenCalledTimes(1);
  });
});

// ─── Undo / redo (Phase 7 Milestone 1) ───────────────────────────────────────

describe("edit.undo / edit.redo", () => {
  it("undo dispatches to the engine when history allows it", () => {
    const registry = createCommandRegistry();
    ensureBuiltinCommands(registry);
    const ctx = fakeContext([], { canUndo: true });
    expect(registry.execute("edit.undo", ctx)).toBe(true);
    expect(ctx.engine.undo).toHaveBeenCalledOnce();
  });

  it("undo neither runs nor calls the engine with an empty history", () => {
    const registry = createCommandRegistry();
    ensureBuiltinCommands(registry);
    const ctx = fakeContext();
    expect(registry.execute("edit.undo", ctx)).toBe(false);
    expect(ctx.engine.undo).not.toHaveBeenCalled();
  });

  it("redo mirrors the same gate on canRedo", () => {
    const registry = createCommandRegistry();
    ensureBuiltinCommands(registry);

    const disabled = fakeContext();
    expect(registry.execute("edit.redo", disabled)).toBe(false);
    expect(disabled.engine.redo).not.toHaveBeenCalled();

    const enabled = fakeContext([], { canRedo: true });
    expect(registry.execute("edit.redo", enabled)).toBe(true);
    expect(enabled.engine.redo).toHaveBeenCalledOnce();
  });

  it("declares the design-tool default chords", () => {
    const undo = builtinCommands.find((c) => c.id === "edit.undo");
    const redo = builtinCommands.find((c) => c.id === "edit.redo");
    expect(undo?.defaultChords).toEqual(["mod+z"]);
    expect(redo?.defaultChords).toEqual(["mod+shift+z", "mod+y"]);
  });
});

// ─── File commands (Phase 7 Milestone 2) ─────────────────────────────────────

describe("file commands", () => {
  it("registers all four with the expected chords", () => {
    const byId = new Map(builtinCommands.map((c) => [c.id, c]));
    expect(byId.get("file.save")?.defaultChords).toEqual(["mod+s"]);
    expect(byId.get("file.saveAs")?.defaultChords).toEqual(["mod+shift+s"]);
    expect(byId.get("file.open")?.defaultChords).toEqual(["mod+o"]);
    // mod+n is browser-reserved in Chromium — New ships chord-less.
    expect(byId.get("file.new")).toBeDefined();
    expect(byId.get("file.new")?.defaultChords).toBeUndefined();
  });

  it("each dispatches to its FilesProvider action", () => {
    const registry = createCommandRegistry();
    ensureBuiltinCommands(registry);
    const pairs = [
      ["file.saveAs", "saveAs"],
      ["file.open", "open"],
      ["file.new", "newDocument"],
    ] as const;
    for (const [id, action] of pairs) {
      const ctx = fakeContext();
      expect(registry.execute(id, ctx)).toBe(true);
      expect(ctx.files[action]).toHaveBeenCalledTimes(1);
    }
  });

  it("all four gate on the engine running — no document, no file ops", () => {
    const registry = createCommandRegistry();
    ensureBuiltinCommands(registry);
    for (const id of ["file.save", "file.saveAs", "file.open", "file.new"] as const) {
      const ctx = fakeContext([], {}, "error");
      expect(registry.execute(id, ctx)).toBe(false);
    }
  });
});
