// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TopToolbar } from "../components/TopToolbar";
import { EngineContext } from "../contexts/EngineContext";
import { FilesContext, type FilesContextValue } from "../features/files/FilesProvider";
import type { UseEngineResult } from "../hooks/useEngine";

import { ensureBuiltinCommands } from "../features/commands/builtin";

// Live chords (M4): titles/aria-keyshortcuts resolve from the registry.
ensureBuiltinCommands();

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

function renderWithEngine(value: UseEngineResult, files: FilesContextValue = mockFiles()) {
  return render(
    <EngineContext.Provider value={value}>
      <FilesContext.Provider value={files}>
        <TopToolbar />
      </FilesContext.Provider>
    </EngineContext.Provider>
  );
}

/**
 * Tool-button behaviour (Select/Pan pressed state, clicking Pan, keyboard
 * shortcuts) moved to ToolsRail.test.tsx in Phase 6 M3 along with the
 * buttons themselves — TopToolbar is document-scoped only now.
 */
describe("TopToolbar", () => {
  it("renders the wordmark", () => {
    renderWithEngine(mockEngine());
    expect(screen.getByText("Graphite")).toBeInTheDocument();
  });

  it("clicking Save routes through the files layer (Phase 7 M2)", () => {
    const files = mockFiles();
    renderWithEngine(mockEngine(), files);
    fireEvent.click(screen.getByTitle("Save (Ctrl+S)"));
    expect(files.save).toHaveBeenCalledTimes(1);
  });

  it("shows the file name, falling back to Untitled", () => {
    renderWithEngine(mockEngine(), mockFiles({ fileName: "logo.graphite" }));
    expect(screen.getByText("logo.graphite")).toBeInTheDocument();

    renderWithEngine(mockEngine());
    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  it("shows the unsaved-changes dot only while dirty", () => {
    const { rerender } = renderWithEngine(mockEngine(), mockFiles({ dirty: true }));
    expect(screen.getByTitle("Unsaved changes")).toBeInTheDocument();
    rerender(
      <EngineContext.Provider value={mockEngine()}>
        <FilesContext.Provider value={mockFiles({ dirty: false })}>
          <TopToolbar />
        </FilesContext.Provider>
      </EngineContext.Provider>
    );
    expect(screen.queryByTitle("Unsaved changes")).not.toBeInTheDocument();
  });

  it("surfaces file errors in an alert slot", () => {
    renderWithEngine(mockEngine(), mockFiles({ fileError: "Save failed: disk full" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Save failed: disk full");
  });

  it("disables Save while the engine is not running", () => {
    renderWithEngine(mockEngine({ status: "initializing" }));
    expect(screen.getByTitle("Save (Ctrl+S)")).toBeDisabled();
  });

  it("no longer renders tool buttons (moved to ToolsRail)", () => {
    renderWithEngine(mockEngine());
    expect(screen.queryByTitle(/Select|Pan/)).not.toBeInTheDocument();
  });
});
