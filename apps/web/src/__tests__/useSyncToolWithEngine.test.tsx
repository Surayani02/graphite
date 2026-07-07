// @vitest-environment jsdom
/**
 * useSyncToolWithEngine unit tests — the two-way store↔engine tool sync,
 * with particular attention to the loop-suppression guard (Phase 6 M3).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { EngineContext, type EngineStableState } from "../contexts/EngineContext";
import { useUIStore } from "../stores/uiStore";
import { useSyncToolWithEngine } from "../hooks/useSyncToolWithEngine";

function stableEngine(overrides: Partial<EngineStableState> = {}): EngineStableState {
  return {
    initEngine: () => () => {},
    status: "running",
    error: null,
    selectedIds: [],
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

function wrapperFor(value: EngineStableState) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
  };
}

beforeEach(() => {
  useUIStore.setState({ activeTool: "select", spaceDown: false });
});

describe("useSyncToolWithEngine", () => {
  it("sends the store's effective tool to the engine on mount", () => {
    const engine = stableEngine();
    renderHook(() => useSyncToolWithEngine(), { wrapper: wrapperFor(engine) });
    expect(engine.setTool).toHaveBeenCalledWith("select");
  });

  it("sends a new tool to the engine when the store changes", () => {
    const engine = stableEngine();
    renderHook(() => useSyncToolWithEngine(), { wrapper: wrapperFor(engine) });
    vi.mocked(engine.setTool).mockClear();
    act(() => {
      useUIStore.getState().setActiveTool("rectangle");
    });
    expect(engine.setTool).toHaveBeenCalledWith("rectangle");
  });

  it("applies a worker-initiated tool change to the store", () => {
    const engine = stableEngine({ lastEngineTool: "select" });
    useUIStore.setState({ activeTool: "rectangle" }); // was mid-creation
    renderHook(() => useSyncToolWithEngine(), { wrapper: wrapperFor(engine) });
    expect(useUIStore.getState().activeTool).toBe("select");
  });

  it("does not echo a worker-initiated tool change back to the engine", () => {
    // The core regression this test protects: applying lastEngineTool to
    // the store must not make the send-effect fire again for the same
    // value, which would be a pointless (if harmless) round trip.
    const engine = stableEngine({ lastEngineTool: "select" });
    useUIStore.setState({ activeTool: "rectangle" });
    renderHook(() => useSyncToolWithEngine(), { wrapper: wrapperFor(engine) });
    expect(engine.setTool).not.toHaveBeenCalledWith("select");
  });

  it("still sends a genuine later user change after a suppressed echo", () => {
    const engine = stableEngine({ lastEngineTool: "select" });
    useUIStore.setState({ activeTool: "rectangle" });
    renderHook(() => useSyncToolWithEngine(), { wrapper: wrapperFor(engine) });
    vi.mocked(engine.setTool).mockClear();
    act(() => {
      useUIStore.getState().setActiveTool("ellipse"); // a real, later user action
    });
    expect(engine.setTool).toHaveBeenCalledWith("ellipse");
  });

  it("does nothing on lastEngineTool while it stays null", () => {
    const engine = stableEngine();
    const setActiveToolSpy = vi.spyOn(useUIStore.getState(), "setActiveTool");
    renderHook(() => useSyncToolWithEngine(), { wrapper: wrapperFor(engine) });
    expect(setActiveToolSpy).not.toHaveBeenCalled();
  });
});
