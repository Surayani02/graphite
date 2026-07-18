// @vitest-environment jsdom
/**
 * useSyncToolWithEngine unit tests — the two-way store↔engine tool sync.
 * Engine→store is now an EngineToolSignal ({ tool, seq }); the headline
 * case is BUG-07: selecting a tool after the engine last auto-returned to
 * "select" must actually reach the worker.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { EngineContext, type EngineStableState } from "../contexts/EngineContext";
import type { EngineToolSignal } from "../hooks/useEngine";
import { useUIStore } from "../stores/uiStore";
import { useSyncToolWithEngine } from "../hooks/useSyncToolWithEngine";

function signal(tool: EngineToolSignal["tool"], seq: number): EngineToolSignal {
  return { tool, seq };
}

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
    const engine = stableEngine({ lastEngineTool: signal("select", 1) });
    useUIStore.setState({ activeTool: "rectangle" }); // was mid-creation
    renderHook(() => useSyncToolWithEngine(), { wrapper: wrapperFor(engine) });
    expect(useUIStore.getState().activeTool).toBe("select");
  });

  it("does not echo a worker-initiated tool change into an extra send", () => {
    // Applying lastEngineTool to the store must not cause the send-effect
    // to re-transmit that same value to the worker (the worker already has
    // it). The store settles on the engine's tool, and setTool is never
    // called more than once with it.
    const engine = stableEngine({ lastEngineTool: signal("select", 1) });
    useUIStore.setState({ activeTool: "rectangle" });
    renderHook(() => useSyncToolWithEngine(), { wrapper: wrapperFor(engine) });
    expect(useUIStore.getState().activeTool).toBe("select");
    const selectSends = vi.mocked(engine.setTool).mock.calls.filter(([tool]) => tool === "select");
    expect(selectSends.length).toBeLessThanOrEqual(1);
  });

  it("BUG-07: sends select to the engine when the user picks it after an auto-return", () => {
    // Reproduces the reported bug exactly. The engine auto-returned to
    // "select" earlier (a stale signal, seq 1). The user had since moved to
    // pan, then clicks Select. That store change MUST reach the worker —
    // the stale engine signal must not swallow it.
    const engine = stableEngine({ lastEngineTool: signal("select", 1) });
    const { rerender } = renderHook(() => useSyncToolWithEngine(), {
      wrapper: wrapperFor(engine),
    });
    act(() => {
      useUIStore.getState().setActiveTool("pan");
    });
    expect(engine.setTool).toHaveBeenCalledWith("pan");
    vi.mocked(engine.setTool).mockClear();

    // No new engine signal (same seq) — the user, not the worker, acts.
    act(() => {
      useUIStore.getState().setActiveTool("select");
    });
    rerender();
    expect(engine.setTool).toHaveBeenCalledWith("select");
  });

  it("acts on a repeated tool value when it arrives as a new signal", () => {
    // select → draw → select → draw: the second auto-return is the same
    // tool but a new seq, and must still apply to the store.
    const engine = stableEngine({ lastEngineTool: signal("select", 1) });
    useUIStore.setState({ activeTool: "rectangle" });
    const { rerender } = renderHook(() => useSyncToolWithEngine(), {
      wrapper: wrapperFor(engine),
    });
    expect(useUIStore.getState().activeTool).toBe("select");

    // User draws again → store rectangle; engine auto-returns → new signal.
    act(() => {
      useUIStore.getState().setActiveTool("rectangle");
    });
    rerender();
    const engine2 = stableEngine({ lastEngineTool: signal("select", 2) });
    // Re-render under a fresh signal seq (simulating the next emission).
    renderHook(() => useSyncToolWithEngine(), { wrapper: wrapperFor(engine2) });
    expect(useUIStore.getState().activeTool).toBe("select");
  });

  it("does nothing on lastEngineTool while it stays null", () => {
    const engine = stableEngine();
    const setActiveToolSpy = vi.spyOn(useUIStore.getState(), "setActiveTool");
    renderHook(() => useSyncToolWithEngine(), { wrapper: wrapperFor(engine) });
    expect(setActiveToolSpy).not.toHaveBeenCalled();
  });
});
