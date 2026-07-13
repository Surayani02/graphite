// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EngineContext } from "../contexts/EngineContext";
import { LeftPanel } from "../layouts/LeftPanel";
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

function renderLeftPanel() {
  return render(
    <EngineContext.Provider value={mockEngine()}>
      <LeftPanel />
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

describe("LeftPanel", () => {
  it("renders the Layers | Assets tablist with the layer tree in the default tab", () => {
    renderLeftPanel();
    expect(screen.getByRole("tablist", { name: "Left panel" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Layers" })).toHaveAttribute("aria-selected", "true");
    // With no nodes, the Layers tab shows the empty-state region (not a
    // role="tree" — an empty tree fails aria-required-children, so the tree
    // role and keyboard model appear only once there are rows).
    expect(screen.getByRole("region", { name: "Layer tree" })).toBeInTheDocument();
    expect(screen.getByText("No layers yet.")).toBeInTheDocument();
  });

  it("switching to Assets persists the tab and shows assets content", async () => {
    renderLeftPanel();
    await userEvent.click(screen.getByRole("tab", { name: "Assets" }));
    expect(useUIStore.getState().leftPanelTab).toBe("assets");
    expect(screen.getByRole("status")).toHaveTextContent("No document colors");
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
  });

  it("collapse hides the tabs; expand restores them", async () => {
    renderLeftPanel();
    await userEvent.click(screen.getByTitle("Collapse left panel"));
    expect(useUIStore.getState().layersOpen).toBe(false);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTitle("Expand left panel"));
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });
});
