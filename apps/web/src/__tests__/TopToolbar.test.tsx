// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TopToolbar } from "../components/TopToolbar";
import { EngineContext } from "../context/EngineContext";
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
    requestSave: vi.fn(),
    nodes: [],
    setSelection: vi.fn(),
    updateNode: vi.fn(),
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

beforeEach(() => {
  useUIStore.setState({ activeTool: "select", spaceDown: false });
});

describe("TopToolbar", () => {
  it("renders both tool buttons", () => {
    renderWithEngine(mockEngine());
    expect(screen.getByTitle("Select (V)")).toBeInTheDocument();
    expect(screen.getByTitle("Pan (H)")).toBeInTheDocument();
  });

  it("marks the active tool as pressed", () => {
    renderWithEngine(mockEngine());
    expect(screen.getByTitle("Select (V)")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTitle("Pan (H)")).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking the Pan button updates the UI store", () => {
    renderWithEngine(mockEngine());
    fireEvent.click(screen.getByTitle("Pan (H)"));
    expect(useUIStore.getState().activeTool).toBe("pan");
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
});
