// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EngineContext } from "../contexts/EngineContext";
import { FilesContext, type FilesContextValue } from "../features/files/FilesProvider";
import { ensureBuiltinCommands } from "../features/commands/builtin";
import { createCommandRegistry } from "../features/commands/registry";
import { CommandPalette } from "../features/palette/CommandPalette";
import { useUIStore } from "../stores/uiStore";
import type { UseEngineResult } from "../hooks/useEngine";
import type { DocNode } from "@graphite/protocol";

const registry = createCommandRegistry();
ensureBuiltinCommands(registry);

const FILL = { r: 10, g: 20, b: 30, a: 255 } as const;

function makeNode(overrides: Partial<DocNode>): DocNode {
  return {
    id: "r1",
    kind: "rect",
    name: "Rectangle",
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    fill: FILL,
    stroke: null,
    cornerRadius: 0,
    parent: "f1",
    children: [],
    ...overrides,
  };
}

const NODES: readonly DocNode[] = [
  makeNode({ id: "f1", kind: "frame", name: "Frame", parent: null, children: ["n1", "n2"] }),
  makeNode({ id: "n1", name: "Hero Banner" }),
  makeNode({ id: "n2", kind: "ellipse", name: "Sidebar Dot" }),
];

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
    nodes: NODES,
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
    exportBlob: vi.fn(() => Promise.resolve(true)),
    ...overrides,
  };
}

function renderPalette(
  engine: UseEngineResult = mockEngine(),
  files: FilesContextValue = mockFiles()
) {
  return render(
    <EngineContext.Provider value={engine}>
      <FilesContext.Provider value={files}>
        <CommandPalette registry={registry} />
      </FilesContext.Provider>
    </EngineContext.Provider>
  );
}

function openPalette(): void {
  act(() => {
    useUIStore.getState().openPalette();
  });
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

describe("CommandPalette", () => {
  it("renders nothing while closed", () => {
    renderPalette();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens as a dialog listing every enabled command, layers hidden until typed", () => {
    renderPalette();
    openPalette();
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Save Document(?! As)/ })).toBeInTheDocument();
    // Delete Selection is disabled with an empty selection → filtered out.
    expect(screen.queryByRole("option", { name: /Delete Selection/ })).not.toBeInTheDocument();
    // Node results only appear once a query exists.
    expect(screen.queryByRole("option", { name: /Hero Banner/ })).not.toBeInTheDocument();
  });

  it("filters as the user types and Enter executes the top match, closing the palette", async () => {
    const files = mockFiles();
    renderPalette(mockEngine(), files);
    openPalette();
    await userEvent.type(screen.getByRole("searchbox"), "save doc");
    expect(screen.queryByRole("option", { name: /Rectangle Tool/ })).not.toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    // Phase 7 M2: Save Document routes through the files layer.
    expect(files.save).toHaveBeenCalledTimes(1);
    expect(useUIStore.getState().paletteOpen).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("finds document nodes by name; picking one selects it and reveals Layers", async () => {
    const setSelection = vi.fn();
    renderPalette(mockEngine({ setSelection }));
    act(() => {
      useUIStore.setState({ leftPanelTab: "assets" });
    });
    openPalette();
    await userEvent.type(screen.getByRole("searchbox"), "hero");
    await userEvent.click(screen.getByRole("option", { name: /Hero Banner/ }));
    expect(setSelection).toHaveBeenCalledWith(["n1"]);
    expect(useUIStore.getState().leftPanelTab).toBe("layers");
    expect(useUIStore.getState().paletteOpen).toBe(false);
  });

  it("never lists frames as layer results", async () => {
    renderPalette();
    openPalette();
    await userEvent.type(screen.getByRole("searchbox"), "frame");
    expect(screen.queryByRole("option", { name: /^Frame/ })).not.toBeInTheDocument();
  });

  it("Escape clears the query first, then closes (standard palette staging)", async () => {
    renderPalette();
    openPalette();
    await userEvent.type(screen.getByRole("searchbox"), "sav");
    // RAC SearchField consumes Escape to clear a non-empty field — same
    // two-stage staging as Figma/VS Code search surfaces.
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(useUIStore.getState().paletteOpen).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(useUIStore.getState().paletteOpen).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
