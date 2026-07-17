// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EngineContext } from "../contexts/EngineContext";
import { AssetsPanel } from "../features/assets/AssetsPanel";
import { deriveDocumentColors } from "../features/assets/useDocumentColors";
import { colorToHex } from "../document/color";
import { useUIStore } from "../stores/uiStore";
import type { UseEngineResult } from "../hooks/useEngine";
import type { DocNode } from "@graphite/protocol";

const RED = { r: 200, g: 40, b: 40, a: 255 } as const;
const BLUE = { r: 20, g: 60, b: 220, a: 255 } as const;

function makeNode(overrides: Partial<DocNode>): DocNode {
  return {
    id: "r1",
    kind: "rect",
    name: "Rectangle",
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    fill: RED,
    stroke: null,
    cornerRadius: 0,
    parent: "f1",
    children: [],
    ...overrides,
  };
}

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
    exportRaster: vi.fn(() => Promise.resolve(new Uint8Array())),
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

function renderPanel(engine: UseEngineResult) {
  return render(
    <EngineContext.Provider value={engine}>
      <AssetsPanel />
    </EngineContext.Provider>
  );
}

beforeEach(() => {
  useUIStore.setState({ shortcutOverrides: {} });
});

describe("deriveDocumentColors", () => {
  it("dedupes identical fills and counts every usage", () => {
    const colors = deriveDocumentColors([
      makeNode({ id: "a" }),
      makeNode({ id: "b" }),
      makeNode({ id: "c", fill: BLUE }),
    ]);
    expect(colors).toHaveLength(2);
    expect(colors[0]?.usageCount).toBe(2);
    expect(colors[1]?.usageCount).toBe(1);
  });

  it("treats fully transparent paint as no paint", () => {
    const colors = deriveDocumentColors([makeNode({ fill: { ...RED, a: 0 } })]);
    expect(colors).toHaveLength(0);
  });

  it("includes stroke colors", () => {
    const colors = deriveDocumentColors([makeNode({ stroke: { color: BLUE, width: 2 } })]);
    expect(colors.map((c) => c.hex)).toContain(colorToHex(BLUE));
  });

  it("keeps alpha variants distinct", () => {
    const colors = deriveDocumentColors([
      makeNode({ id: "a" }),
      makeNode({ id: "b", fill: { ...RED, a: 128 } }),
    ]);
    expect(colors).toHaveLength(2);
    expect(colors[1]?.hex).toBe(`${colorToHex(RED)}/128`);
  });

  it("preserves first-appearance document order", () => {
    const colors = deriveDocumentColors([
      makeNode({ id: "a", fill: BLUE }),
      makeNode({ id: "b", fill: RED }),
    ]);
    expect(colors.map((c) => c.hex)).toEqual([colorToHex(BLUE), colorToHex(RED)]);
  });
});

describe("AssetsPanel", () => {
  it("shows the design-system empty state when the document has no colors", () => {
    renderPanel(mockEngine({ nodes: [] }));
    expect(screen.getByRole("status")).toHaveTextContent("No document colors");
  });

  it("renders one swatch per color with usage in the title", () => {
    renderPanel(mockEngine({ nodes: [makeNode({ id: "a" }), makeNode({ id: "b", fill: BLUE })] }));
    const red = screen.getByRole("button", { name: `Apply ${colorToHex(RED)} to selection` });
    expect(red).toHaveAttribute("title", `${colorToHex(RED)} — 1 use`);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("disables swatches and explains why without a single selection", () => {
    renderPanel(mockEngine({ nodes: [makeNode({})], selectedIds: [] }));
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByText(/Select a single shape/)).toBeInTheDocument();
  });

  it("stays disabled for multi-selection", () => {
    renderPanel(mockEngine({ nodes: [makeNode({})], selectedIds: ["a", "b"] }));
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("applies the color as the selected shape's fill via node:update", () => {
    const updateNode = vi.fn();
    renderPanel(
      mockEngine({ nodes: [makeNode({ id: "a", fill: BLUE })], selectedIds: ["n9"], updateNode })
    );
    fireEvent.click(screen.getByRole("button", { name: `Apply ${colorToHex(BLUE)} to selection` }));
    expect(updateNode).toHaveBeenCalledExactlyOnceWith("n9", { fill: BLUE });
  });
});
