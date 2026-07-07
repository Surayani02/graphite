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
    requestSave: vi.fn(),
    nodes: [],
    setSelection: vi.fn(),
    updateNode: vi.fn(),
    lastEngineTool: null,
    deleteSelection: vi.fn(),
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

describe("EngineCanvas — M3 keyboard shortcuts", () => {
  it("R sets the active tool to rectangle", () => {
    renderWithEngine(mockEngine());
    fireEvent.keyDown(window, { key: "r" });
    expect(useUIStore.getState().activeTool).toBe("rectangle");
  });

  it("O sets the active tool to ellipse", () => {
    renderWithEngine(mockEngine());
    fireEvent.keyDown(window, { key: "o" });
    expect(useUIStore.getState().activeTool).toBe("ellipse");
  });

  it("forwards Delete to the engine via sendKeyDown", () => {
    const sendKeyDown = vi.fn();
    renderWithEngine(mockEngine({ sendKeyDown }));
    fireEvent.keyDown(window, { key: "Delete" });
    expect(sendKeyDown).toHaveBeenCalledWith("Delete", expect.objectContaining({ shift: false }));
  });

  it("forwards Backspace to the engine via sendKeyDown", () => {
    const sendKeyDown = vi.fn();
    renderWithEngine(mockEngine({ sendKeyDown }));
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(sendKeyDown).toHaveBeenCalledWith("Backspace", expect.anything());
  });

  it("does not forward Delete when a form field has focus (isEditableTarget guard)", () => {
    const sendKeyDown = vi.fn();
    renderWithEngine(mockEngine({ sendKeyDown }));
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "Delete" });
    expect(sendKeyDown).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});

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
