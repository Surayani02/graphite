// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TopToolbar } from "../components/TopToolbar";
import { EngineContext } from "../contexts/EngineContext";
import type { UseEngineResult } from "../hooks/useEngine";

import { ensureBuiltinCommands } from "../features/commands/builtin";

// Live chords (M4): titles/aria-keyshortcuts resolve from the registry.
ensureBuiltinCommands();

function mockEngine(overrides: Partial<UseEngineResult> = {}): UseEngineResult {
  return {
    initEngine: () => () => {},
    status: "running",
    stats: { frameNumber: 0, renderTimeMs: 0, fps: 60 },
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
    requestSave: vi.fn(),
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

function renderWithEngine(value: UseEngineResult) {
  return render(
    <EngineContext.Provider value={value}>
      <TopToolbar />
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

  it("clicking Save calls requestSave", () => {
    const requestSave = vi.fn();
    renderWithEngine(mockEngine({ requestSave }));
    fireEvent.click(screen.getByTitle("Save (Ctrl+S)"));
    expect(requestSave).toHaveBeenCalledTimes(1);
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
