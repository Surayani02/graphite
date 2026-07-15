// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { EngineContext } from "../contexts/EngineContext";
import { FilesContext, type FilesContextValue } from "../features/files/FilesProvider";
import { ensureBuiltinCommands } from "../features/commands/builtin";
import { createCommandRegistry } from "../features/commands/registry";
import { ShortcutProvider } from "../features/shortcuts/ShortcutProvider";
import { useUIStore } from "../stores/uiStore";
import type { UseEngineResult } from "../hooks/useEngine";

// Isolated registry with the real builtins — the provider is exercised
// against production command wiring, not synthetic fixtures.
const registry = createCommandRegistry();
ensureBuiltinCommands(registry);

function mockEngine(overrides: Partial<UseEngineResult> = {}): UseEngineResult {
  return {
    initEngine: () => () => {},
    status: "running",
    stats: { idle: false, frameNumber: 0, renderTimeMs: 0, fps: 60 },
    error: null,
    selectedIds: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    lastSaved: null,
    setTool: vi.fn(),
    sendPointerDown: vi.fn(),
    sendPointerMove: vi.fn(),
    sendPointerUp: vi.fn(),
    sendWheel: vi.fn(),
    sendKeyDown: vi.fn(),
    requestRecoverySnapshot: vi.fn(),
    loadDocument: vi.fn(),
    newDocument: vi.fn(),
    getDocumentJson: vi.fn(() => Promise.resolve("{}")),
    markSaved: vi.fn(),
    nodes: [],
    setSelection: vi.fn(),
    updateNode: vi.fn(),
    lastEngineTool: null,
    deleteSelection: vi.fn(),
    historyStatus: {
      canUndo: false,
      canRedo: false,
      undoLabel: null,
      redoLabel: null,
      dirty: false,
    },
    historyAnnouncement: null,
    undo: vi.fn(),
    redo: vi.fn(),
    ...overrides,
  };
}

function mockFiles(overrides: Partial<FilesContextValue> = {}): FilesContextValue {
  return {
    fileName: null,
    dirty: false,
    fileError: null,
    save: vi.fn(),
    saveAs: vi.fn(),
    open: vi.fn(),
    newDocument: vi.fn(),
    ...overrides,
  };
}

function renderProvider(
  engine: UseEngineResult = mockEngine(),
  files: FilesContextValue = mockFiles()
) {
  return render(
    <EngineContext.Provider value={engine}>
      <FilesContext.Provider value={files}>
        <ShortcutProvider registry={registry}>
          <div />
        </ShortcutProvider>
      </FilesContext.Provider>
    </EngineContext.Provider>
  );
}

beforeEach(() => {
  useUIStore.setState({
    activeTool: "select",
    spaceDown: false,
    layersOpen: true,
    inspectorOpen: true,
    leftPanelTab: "layers",
    paletteOpen: false,
    shortcutRecorderOpen: false,
    shortcutRecorderTarget: null,
    shortcutOverrides: {},
  });
});

describe("ShortcutProvider — tool chords (ported from EngineCanvas M3)", () => {
  it("R switches to the rectangle tool through the command registry", () => {
    renderProvider();
    fireEvent.keyDown(window, { key: "r" });
    expect(useUIStore.getState().activeTool).toBe("rectangle");
  });

  it("O switches to the ellipse tool", () => {
    renderProvider();
    fireEvent.keyDown(window, { key: "o" });
    expect(useUIStore.getState().activeTool).toBe("ellipse");
  });

  it("modified letters do not trigger bare tool chords", () => {
    renderProvider();
    fireEvent.keyDown(window, { key: "r", ctrlKey: true });
    expect(useUIStore.getState().activeTool).toBe("select");
  });
});

describe("ShortcutProvider — command dispatch", () => {
  it("mod+S runs Save through the files layer and prevents the browser default", () => {
    const files = mockFiles();
    renderProvider(mockEngine(), files);
    const notPrevented = fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(files.save).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false);
  });

  it("Delete routes through the semantic deleteSelection path (M4 change from raw forwarding)", () => {
    const deleteSelection = vi.fn();
    const sendKeyDown = vi.fn();
    renderProvider(mockEngine({ selectedIds: ["r1"], deleteSelection, sendKeyDown }));
    fireEvent.keyDown(window, { key: "Delete" });
    expect(deleteSelection).toHaveBeenCalledTimes(1);
    expect(sendKeyDown).not.toHaveBeenCalled();
  });

  it("Backspace aliases Delete", () => {
    const deleteSelection = vi.fn();
    renderProvider(mockEngine({ selectedIds: ["r1"], deleteSelection }));
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(deleteSelection).toHaveBeenCalledTimes(1);
  });

  it("Delete is a no-op with an empty selection (enabled gate)", () => {
    const deleteSelection = vi.fn();
    renderProvider(mockEngine({ selectedIds: [], deleteSelection }));
    fireEvent.keyDown(window, { key: "Delete" });
    expect(deleteSelection).not.toHaveBeenCalled();
  });

  it("user overrides beat defaults", () => {
    renderProvider();
    act(() => {
      useUIStore.getState().setShortcutOverride("tool.rectangle", "q");
    });
    fireEvent.keyDown(window, { key: "q" });
    expect(useUIStore.getState().activeTool).toBe("rectangle");
    act(() => {
      useUIStore.getState().setActiveTool("select");
    });
    fireEvent.keyDown(window, { key: "r" });
    expect(useUIStore.getState().activeTool).toBe("select");
  });
});

describe("ShortcutProvider — gestures and suppression", () => {
  it("Escape forwards raw to the worker, modifier-agnostically (ported)", () => {
    const sendKeyDown = vi.fn();
    renderProvider(mockEngine({ sendKeyDown }));
    fireEvent.keyDown(window, { key: "Escape", shiftKey: true });
    expect(sendKeyDown).toHaveBeenCalledWith("Escape", expect.objectContaining({ shift: true }));
  });

  it("keys inside editable targets never dispatch (isEditableTarget guard, ported)", () => {
    renderProvider();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "r" });
    expect(useUIStore.getState().activeTool).toBe("select");
    document.body.removeChild(input);
  });

  it("Space holds temporary pan and releases on keyup (ported)", () => {
    renderProvider();
    fireEvent.keyDown(window, { key: " " });
    expect(useUIStore.getState().spaceDown).toBe(true);
    fireEvent.keyUp(window, { key: " " });
    expect(useUIStore.getState().spaceDown).toBe(false);
  });

  it("losing window focus releases a held Space (new in M4)", () => {
    renderProvider();
    fireEvent.keyDown(window, { key: " " });
    expect(useUIStore.getState().spaceDown).toBe(true);
    fireEvent.blur(window);
    expect(useUIStore.getState().spaceDown).toBe(false);
  });

  it("suppresses everything while a modal is open", () => {
    renderProvider();
    act(() => {
      useUIStore.setState({ paletteOpen: true });
    });
    fireEvent.keyDown(window, { key: "r" });
    expect(useUIStore.getState().activeTool).toBe("select");
  });
});
