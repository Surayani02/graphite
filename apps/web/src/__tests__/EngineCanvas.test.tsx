// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { EngineCanvas } from "../components/EngineCanvas";
import { EngineContext } from "../contexts/EngineContext";
import { useUIStore } from "../stores/uiStore";
import type { UseEngineResult } from "../hooks/useEngine";

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

function renderWithEngine(value: UseEngineResult) {
  return render(
    <EngineContext.Provider value={value}>
      <EngineCanvas />
    </EngineContext.Provider>
  );
}

beforeEach(() => {
  useUIStore.setState({ activeTool: "select", spaceDown: false });
});

// The M3 global-keyboard specs (tool letters, Delete/Backspace handling,
// the editable-target guard, Space-pan) moved with the listener itself to
// ShortcutProvider.test.tsx in M4 — EngineCanvas no longer owns keys.

describe("EngineCanvas — context menu", () => {
  it("does not open the menu when nothing is selected", () => {
    const { container } = renderWithEngine(mockEngine({ selectedIds: [] }));
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    fireEvent.contextMenu(canvas, { clientX: 5, clientY: 5 });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens the menu when a shape is selected", async () => {
    const { container } = renderWithEngine(mockEngine({ selectedIds: ["r1"] }));
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    fireEvent.contextMenu(canvas, { clientX: 5, clientY: 5 });
    await act(async () => {});
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("Delete in the menu calls deleteSelection", async () => {
    const deleteSelection = vi.fn();
    const { container } = renderWithEngine(mockEngine({ selectedIds: ["r1"], deleteSelection }));
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    fireEvent.contextMenu(canvas, { clientX: 5, clientY: 5 });
    await act(async () => {});
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
    expect(deleteSelection).toHaveBeenCalledTimes(1);
  });
});
