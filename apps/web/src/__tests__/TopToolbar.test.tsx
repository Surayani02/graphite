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
    exportRaster: vi.fn(() => Promise.resolve(new Uint8Array())),
    loadStress: vi.fn(),
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
    exportBlob: vi.fn(() => Promise.resolve(true)),
    ...overrides,
  };
}

import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

function renderWithEngine(value: UseEngineResult, files: FilesContextValue = mockFiles()) {
  // TopToolbar renders a <Link to="/settings">, so it needs a router
  // context. Same shape as SettingsPage.test: TopToolbar IS the "/" route
  // component and history starts there, so it mounts as the active route
  // synchronously — no async settle, no findBy needed.
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <EngineContext.Provider value={value}>
        <FilesContext.Provider value={files}>
          <TopToolbar />
        </FilesContext.Provider>
      </EngineContext.Provider>
    ),
  });
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: () => <div>settings</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, settingsRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

/**
 * Tool-button behaviour (Select/Pan pressed state, clicking Pan, keyboard
 * shortcuts) moved to ToolsRail.test.tsx in Phase 6 M3 along with the
 * buttons themselves — TopToolbar is document-scoped only now.
 */
describe("TopToolbar", () => {
  it("renders the wordmark", async () => {
    renderWithEngine(mockEngine());
    expect(await screen.findByText("Graphite")).toBeInTheDocument();
  });

  it("clicking Save routes through the files layer (Phase 7 M2)", async () => {
    const files = mockFiles();
    renderWithEngine(mockEngine(), files);
    fireEvent.click(await screen.findByTitle("Save (Ctrl+S)"));
    expect(files.save).toHaveBeenCalledTimes(1);
  });

  it("shows the file name, falling back to Untitled", async () => {
    renderWithEngine(mockEngine(), mockFiles({ fileName: "logo.graphite" }));
    expect(await screen.findByText("logo.graphite")).toBeInTheDocument();

    renderWithEngine(mockEngine());
    expect(await screen.findByText("Untitled")).toBeInTheDocument();
  });

  it("shows the unsaved-changes dot only while dirty", async () => {
    const { unmount } = renderWithEngine(mockEngine(), mockFiles({ dirty: true }));
    expect(await screen.findByTitle("Unsaved changes")).toBeInTheDocument();
    unmount();
    renderWithEngine(mockEngine(), mockFiles({ dirty: false }));
    expect(screen.queryByTitle("Unsaved changes")).not.toBeInTheDocument();
  });

  it("surfaces file errors in an alert slot", async () => {
    renderWithEngine(mockEngine(), mockFiles({ fileError: "Save failed: disk full" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Save failed: disk full");
  });

  it("disables Save while the engine is not running", async () => {
    renderWithEngine(mockEngine({ status: "initializing" }));
    expect(await screen.findByTitle("Save (Ctrl+S)")).toBeDisabled();
  });

  it("no longer renders tool buttons (moved to ToolsRail)", async () => {
    renderWithEngine(mockEngine());
    await screen.findByText("Graphite");
    expect(screen.queryByTitle(/Select|Pan/)).not.toBeInTheDocument();
  });

  it("links to the settings route", async () => {
    renderWithEngine(mockEngine());
    const link = await screen.findByRole("link", { name: "Settings" });
    expect(link).toHaveAttribute("href", "/settings");
  });

  it("renders the theme toggle", async () => {
    renderWithEngine(mockEngine());
    // Default preference is dark → the control offers switching to light.
    expect(await screen.findByRole("button", { name: /Theme:/ })).toBeInTheDocument();
  });
});
