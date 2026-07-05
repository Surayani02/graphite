// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LayersPanel } from "../components/LayersPanel";
import { EngineContext } from "../context/EngineContext";
import { useUIStore } from "../stores/uiStore";
import type { UseEngineResult } from "../hooks/useEngine";
import type { DocNode } from "@graphite/protocol";

const FILL = { r: 255, g: 128, b: 0, a: 255 } as const;

function makeNode(overrides: Partial<DocNode>): DocNode {
  return {
    id: "n1",
    kind: "rect",
    name: "Rect",
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    fill: FILL,
    stroke: null,
    cornerRadius: 0,
    parent: null,
    children: [],
    ...overrides,
  };
}

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
      <LayersPanel />
    </EngineContext.Provider>
  );
}

describe("LayersPanel", () => {
  beforeEach(() => {
    useUIStore.setState({ layersOpen: true });
  });

  it("shows an empty state with no nodes", () => {
    renderWithEngine(mockEngine({ nodes: [] }));
    expect(screen.getByText("No layers yet.")).toBeInTheDocument();
  });

  it("renders a frame and its child rect, nested", () => {
    renderWithEngine(
      mockEngine({
        nodes: [
          makeNode({ id: "f1", kind: "frame", name: "Frame", parent: null, children: ["r1"] }),
          makeNode({ id: "r1", name: "Rectangle", parent: "f1" }),
        ],
      })
    );
    expect(screen.getByText("Frame")).toBeInTheDocument();
    expect(screen.getByText("Rectangle")).toBeInTheDocument();
  });

  it("clicking a shape row calls setSelection with its id", () => {
    const setSelection = vi.fn();
    renderWithEngine(
      mockEngine({
        nodes: [
          makeNode({ id: "f1", kind: "frame", parent: null, children: ["r1"] }),
          makeNode({ id: "r1", name: "Rectangle", parent: "f1" }),
        ],
        setSelection,
      })
    );
    fireEvent.click(screen.getByText("Rectangle"));
    expect(setSelection).toHaveBeenCalledWith(["r1"]);
  });

  it("clicking a frame row does not call setSelection", () => {
    const setSelection = vi.fn();
    renderWithEngine(
      mockEngine({
        nodes: [makeNode({ id: "f1", kind: "frame", name: "Frame", parent: null })],
        setSelection,
      })
    );
    fireEvent.click(screen.getByText("Frame"));
    expect(setSelection).not.toHaveBeenCalled();
  });

  it("marks the selected row via aria-selected", () => {
    renderWithEngine(
      mockEngine({
        nodes: [
          makeNode({ id: "f1", kind: "frame", parent: null, children: ["r1"] }),
          makeNode({ id: "r1", name: "Rectangle", parent: "f1" }),
        ],
        selectedIds: ["r1"],
      })
    );
    expect(screen.getByText("Rectangle").closest('[role="treeitem"]')).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("renders nothing in the tree body when the panel is collapsed", () => {
    useUIStore.setState({ layersOpen: false });
    renderWithEngine(mockEngine({ nodes: [makeNode({ id: "f1", kind: "frame", parent: null })] }));
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
  });
});

// ─── Keyboard operation (M2 closeout) ─────────────────────────────────────────

describe("LayersPanel — keyboard", () => {
  beforeEach(() => {
    useUIStore.setState({ layersOpen: true });
  });

  const forest = () => [
    makeNode({ id: "f1", kind: "frame", name: "Frame", parent: null, children: ["r1", "e1"] }),
    makeNode({ id: "r1", name: "Rectangle", parent: "f1" }),
    makeNode({ id: "e1", kind: "ellipse", name: "Ellipse", parent: "f1" }),
  ];

  it("ArrowDown then Enter selects the first shape", () => {
    const setSelection = vi.fn();
    renderWithEngine(mockEngine({ nodes: forest(), setSelection }));
    const tree = screen.getByRole("tree");
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    fireEvent.keyDown(tree, { key: "Enter" });
    expect(setSelection).toHaveBeenCalledWith(["r1"]);
  });

  it("navigates with ArrowDown/ArrowUp and exposes the active row via aria-activedescendant", () => {
    renderWithEngine(mockEngine({ nodes: forest() }));
    const tree = screen.getByRole("tree");
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    expect(tree).toHaveAttribute("aria-activedescendant", "layer-r1");
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    expect(tree).toHaveAttribute("aria-activedescendant", "layer-e1");
    fireEvent.keyDown(tree, { key: "ArrowUp" });
    expect(tree).toHaveAttribute("aria-activedescendant", "layer-r1");
  });

  it("skips frame rows during keyboard navigation", () => {
    // First ArrowDown lands on the rect — the frame above it is a
    // container, unselectable by keyboard exactly as it is by click/canvas.
    renderWithEngine(mockEngine({ nodes: forest() }));
    const tree = screen.getByRole("tree");
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    expect(tree).toHaveAttribute("aria-activedescendant", "layer-r1");
  });

  it("Home and End jump to the first and last selectable rows", () => {
    renderWithEngine(mockEngine({ nodes: forest() }));
    const tree = screen.getByRole("tree");
    fireEvent.keyDown(tree, { key: "End" });
    expect(tree).toHaveAttribute("aria-activedescendant", "layer-e1");
    fireEvent.keyDown(tree, { key: "Home" });
    expect(tree).toHaveAttribute("aria-activedescendant", "layer-r1");
  });

  it("Space selects the active row", () => {
    const setSelection = vi.fn();
    renderWithEngine(mockEngine({ nodes: forest(), setSelection }));
    const tree = screen.getByRole("tree");
    fireEvent.keyDown(tree, { key: "End" });
    fireEvent.keyDown(tree, { key: " " });
    expect(setSelection).toHaveBeenCalledWith(["e1"]);
  });
});
