// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InspectorPanel } from "../features/inspector/InspectorPanel";
import { EngineContext } from "../contexts/EngineContext";
import { useUIStore } from "../stores/uiStore";
import type { UseEngineResult } from "../hooks/useEngine";
import type { DocNode } from "@graphite/protocol";

const FILL = { r: 255, g: 128, b: 0, a: 255 } as const;

function makeNode(overrides: Partial<DocNode>): DocNode {
  return {
    id: "r1",
    kind: "rect",
    name: "Rectangle",
    x: 5,
    y: 6,
    w: 20,
    h: 30,
    fill: FILL,
    stroke: null,
    cornerRadius: 4,
    parent: "f1",
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
      <InspectorPanel />
    </EngineContext.Provider>
  );
}

describe("InspectorPanel", () => {
  beforeEach(() => {
    useUIStore.setState({ inspectorOpen: true });
  });

  it("shows a placeholder when nothing is selected", () => {
    renderWithEngine(mockEngine({ nodes: [], selectedIds: [] }));
    expect(screen.getByText("Select a shape to inspect it.")).toBeInTheDocument();
  });

  it("shows position/size fields for the selected node", () => {
    renderWithEngine(mockEngine({ nodes: [makeNode({})], selectedIds: ["r1"] }));
    expect(screen.getByDisplayValue("5")).toBeInTheDocument(); // X
    expect(screen.getByDisplayValue("6")).toBeInTheDocument(); // Y
    expect(screen.getByDisplayValue("20")).toBeInTheDocument(); // W
    expect(screen.getByDisplayValue("30")).toBeInTheDocument(); // H
  });

  it("commits a width edit on blur", () => {
    const updateNode = vi.fn();
    renderWithEngine(mockEngine({ nodes: [makeNode({})], selectedIds: ["r1"], updateNode }));
    const wInput = screen.getByDisplayValue("20");
    fireEvent.change(wInput, { target: { value: "99" } });
    fireEvent.blur(wInput);
    expect(updateNode).toHaveBeenCalledWith("r1", { w: 99 });
  });

  it("reverts an invalid width edit instead of committing NaN", () => {
    const updateNode = vi.fn();
    renderWithEngine(mockEngine({ nodes: [makeNode({})], selectedIds: ["r1"], updateNode }));
    const wInput = screen.getByDisplayValue("20");
    fireEvent.change(wInput, { target: { value: "not a number" } });
    fireEvent.blur(wInput);
    expect(updateNode).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("20")).toBeInTheDocument();
  });

  it("reverts an emptied fill-alpha field instead of committing 0", () => {
    // Regression test: input[type=number] normalises unparseable text to ""
    // at the DOM level, and Number("") is 0 (not NaN) — an earlier version
    // of this fix let that slip through and silently zero the alpha.
    const updateNode = vi.fn();
    renderWithEngine(mockEngine({ nodes: [makeNode({})], selectedIds: ["r1"], updateNode }));
    const alphaInput = screen.getByLabelText("Fill alpha");
    fireEvent.change(alphaInput, { target: { value: "" } });
    fireEvent.blur(alphaInput);
    expect(updateNode).not.toHaveBeenCalled();
  });

  it("clamps width to the 1px minimum", () => {
    const updateNode = vi.fn();
    renderWithEngine(mockEngine({ nodes: [makeNode({})], selectedIds: ["r1"], updateNode }));
    const wInput = screen.getByDisplayValue("20");
    fireEvent.change(wInput, { target: { value: "-5" } });
    fireEvent.blur(wInput);
    expect(updateNode).toHaveBeenCalledWith("r1", { w: 1 });
  });

  it("hides corner radius for an ellipse", () => {
    renderWithEngine(mockEngine({ nodes: [makeNode({ kind: "ellipse" })], selectedIds: ["r1"] }));
    expect(screen.queryByText("R")).not.toBeInTheDocument();
  });

  it("shows corner radius for a rect", () => {
    renderWithEngine(mockEngine({ nodes: [makeNode({ kind: "rect" })], selectedIds: ["r1"] }));
    expect(screen.getByText("R")).toBeInTheDocument();
  });

  it("hides fill/stroke fields for a frame", () => {
    renderWithEngine(mockEngine({ nodes: [makeNode({ kind: "frame" })], selectedIds: ["r1"] }));
    expect(screen.queryByText("Fill")).not.toBeInTheDocument();
    expect(screen.queryByText("Stroke")).not.toBeInTheDocument();
  });

  it("falls back to a loading state if the selected id isn't in nodes yet", () => {
    renderWithEngine(mockEngine({ nodes: [], selectedIds: ["r1"] }));
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});

// ─── Stroke removal (M2 closeout) ─────────────────────────────────────────────

describe("InspectorPanel — stroke removal", () => {
  it("commits { stroke: null } when Remove stroke is clicked", () => {
    const updateNode = vi.fn();
    renderWithEngine(
      mockEngine({
        nodes: [makeNode({ stroke: { color: { r: 0, g: 0, b: 255, a: 255 }, width: 2 } })],
        selectedIds: ["r1"],
        updateNode,
      })
    );
    fireEvent.click(screen.getByLabelText("Remove stroke"));
    expect(updateNode).toHaveBeenCalledWith("r1", { stroke: null });
  });

  it("hides the Remove stroke button when the node has no stroke", () => {
    renderWithEngine(mockEngine({ nodes: [makeNode({ stroke: null })], selectedIds: ["r1"] }));
    expect(screen.queryByLabelText("Remove stroke")).not.toBeInTheDocument();
  });
});
