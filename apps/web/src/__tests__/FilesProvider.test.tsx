// @vitest-environment jsdom
/**
 * features/files/FilesProvider.tsx integration tests — the M2 save
 * semantics contract, end to end against a mocked gateway and engine:
 *
 *   markSaved fires on confirmed writes ONLY. A cancelled picker, a failed
 *   write, or a not-running engine must leave the document dirty.
 *
 * The engine context is the standard typed mock; the gateway is injected
 * (FilesProvider's test seam). A probe component exercises the context the
 * way commands do.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { UseEngineResult } from "../hooks/useEngine";
import { EngineContext } from "../contexts/EngineContext";
import { FilesProvider, useFiles } from "../features/files/FilesProvider";
import type { FileGateway } from "../features/files/gateway";
import { serializeGraphiteFile } from "../features/files/format";
import { DocumentModel } from "../document/model";

const FILL = { r: 255, g: 128, b: 0, a: 255 } as const;

function testDocJson(): string {
  const doc = new DocumentModel("Logo Draft");
  doc.addFrame("f1", 0, 0, 800, 600);
  doc.addRect("r1", "f1", 10, 20, 100, 80, FILL);
  return doc.serialize();
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
    getDocumentJson: vi.fn(() => Promise.resolve(testDocJson())),
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

function mockGateway(overrides: Partial<FileGateway> = {}): FileGateway {
  return {
    supportsHandles: false,
    open: vi.fn(() => Promise.resolve(null)),
    saveAs: vi.fn((_text: string, name: string) => Promise.resolve({ name, handle: null })),
    writeTo: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

/** Exposes the context to the test the way commands consume it. */
function Probe() {
  const files = useFiles();
  return (
    <div>
      <span data-testid="file-name">{files.fileName ?? "∅"}</span>
      <span data-testid="dirty">{String(files.dirty)}</span>
      <button onClick={files.save}>do-save</button>
      <button onClick={files.saveAs}>do-save-as</button>
      <button onClick={files.open}>do-open</button>
      <button onClick={files.newDocument}>do-new</button>
    </div>
  );
}

function renderFiles(engine: UseEngineResult, gateway: FileGateway) {
  return render(
    <EngineContext.Provider value={engine}>
      <FilesProvider gateway={gateway}>
        <Probe />
      </FilesProvider>
    </EngineContext.Provider>
  );
}

const dirtyStatus = {
  canUndo: true,
  canRedo: false,
  undoLabel: "Move Rectangle",
  redoLabel: null,
  dirty: true,
};

afterEach(cleanup);

// ─── Save ────────────────────────────────────────────────────────────────────

describe("save", () => {
  it("serialises through the engine, writes the envelope, then — and only then — marks saved", async () => {
    const engine = mockEngine();
    const gateway = mockGateway();
    renderFiles(engine, gateway);

    fireEvent.click(screen.getByText("do-save"));
    await waitFor(() => {
      expect(engine.markSaved).toHaveBeenCalledTimes(1);
    });

    expect(engine.getDocumentJson).toHaveBeenCalledTimes(1);
    const [writtenText, suggested] = vi.mocked(gateway.saveAs).mock.calls[0] ?? [];
    // Envelope shape and payload match serializeGraphiteFile's output for
    // this document; savedAt is wall-clock and deliberately not compared.
    const written = JSON.parse(writtenText ?? "") as Record<string, unknown>;
    expect(written["format"]).toBe("graphite");
    expect(written["version"]).toBe(1);
    expect(written["document"]).toEqual(JSON.parse(testDocJson()));
    // Suggested name derives from the document's own name.
    expect(suggested).toBe("logo-draft.graphite");
    expect(screen.getByTestId("file-name")).toHaveTextContent("logo-draft.graphite");
  });

  it("a cancelled picker marks nothing saved and keeps the session unchanged", async () => {
    const engine = mockEngine();
    const gateway = mockGateway({ saveAs: vi.fn(() => Promise.resolve(null)) });
    renderFiles(engine, gateway);

    fireEvent.click(screen.getByText("do-save"));
    await waitFor(() => {
      expect(gateway.saveAs).toHaveBeenCalledTimes(1);
    });

    expect(engine.markSaved).not.toHaveBeenCalled();
    expect(screen.getByTestId("file-name")).toHaveTextContent("∅");
  });

  it("with a retained handle, save rewrites in place — no picker", async () => {
    const engine = mockEngine();
    const handle = { name: "logo.graphite" } as FileSystemFileHandle;
    const gateway = mockGateway({
      supportsHandles: true,
      saveAs: vi.fn(() => Promise.resolve({ name: "logo.graphite", handle })),
    });
    renderFiles(engine, gateway);

    fireEvent.click(screen.getByText("do-save")); // first save → picker, retains handle
    await waitFor(() => {
      expect(engine.markSaved).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByText("do-save")); // second save → silent rewrite
    await waitFor(() => {
      expect(engine.markSaved).toHaveBeenCalledTimes(2);
    });
    expect(gateway.saveAs).toHaveBeenCalledTimes(1);
    expect(gateway.writeTo).toHaveBeenCalledWith(handle, expect.stringContaining('"graphite"'));
  });

  it("a failed in-place write keeps the document dirty and surfaces the error", async () => {
    const engine = mockEngine();
    const handle = { name: "locked.graphite" } as FileSystemFileHandle;
    const gateway = mockGateway({
      supportsHandles: true,
      saveAs: vi.fn(() => Promise.resolve({ name: "locked.graphite", handle })),
      writeTo: vi.fn(() => Promise.reject(new Error("disk full"))),
    });
    renderFiles(engine, gateway);

    fireEvent.click(screen.getByText("do-save"));
    await waitFor(() => {
      expect(engine.markSaved).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByText("do-save"));
    await waitFor(() => {
      expect(gateway.writeTo).toHaveBeenCalledTimes(1);
    });
    expect(engine.markSaved).toHaveBeenCalledTimes(1); // still just the first save
  });

  it("Save As always shows a picker even with a retained handle", async () => {
    const engine = mockEngine();
    const handle = { name: "logo.graphite" } as FileSystemFileHandle;
    const gateway = mockGateway({
      supportsHandles: true,
      saveAs: vi.fn(() => Promise.resolve({ name: "logo.graphite", handle })),
    });
    renderFiles(engine, gateway);

    fireEvent.click(screen.getByText("do-save"));
    await waitFor(() => {
      expect(engine.markSaved).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByText("do-save-as"));
    await waitFor(() => {
      expect(gateway.saveAs).toHaveBeenCalledTimes(2);
    });
    expect(gateway.writeTo).not.toHaveBeenCalled();
  });

  it("no-ops while the engine is not running", async () => {
    const engine = mockEngine({ status: "error" });
    const gateway = mockGateway();
    renderFiles(engine, gateway);

    fireEvent.click(screen.getByText("do-save"));
    await new Promise((r) => setTimeout(r, 5));
    expect(engine.getDocumentJson).not.toHaveBeenCalled();
    expect(gateway.saveAs).not.toHaveBeenCalled();
  });
});

// ─── Open ────────────────────────────────────────────────────────────────────

describe("open", () => {
  it("unwraps the envelope and loads bare DocumentData into the worker", async () => {
    const engine = mockEngine();
    const envelope = serializeGraphiteFile(testDocJson());
    const gateway = mockGateway({
      open: vi.fn(() => Promise.resolve({ name: "picked.graphite", text: envelope, handle: null })),
    });
    renderFiles(engine, gateway);

    fireEvent.click(screen.getByText("do-open"));
    await waitFor(() => {
      expect(engine.loadDocument).toHaveBeenCalledTimes(1);
    });

    const loaded = vi.mocked(engine.loadDocument).mock.calls[0]?.[0];
    expect(JSON.parse(loaded ?? "")).toEqual(JSON.parse(testDocJson()));
    expect(screen.getByTestId("file-name")).toHaveTextContent("picked.graphite");
  });

  it("a file that fails to parse is surfaced and never reaches the worker", async () => {
    const engine = mockEngine();
    const gateway = mockGateway({
      open: vi.fn(() => Promise.resolve({ name: "junk.txt", text: "not json", handle: null })),
    });
    renderFiles(engine, gateway);

    fireEvent.click(screen.getByText("do-open"));
    await waitFor(() => {
      expect(gateway.open).toHaveBeenCalledTimes(1);
    });
    expect(engine.loadDocument).not.toHaveBeenCalled();
    expect(screen.getByTestId("file-name")).toHaveTextContent("∅");
  });
});

// ─── Discard guard ───────────────────────────────────────────────────────────

describe("discard guard", () => {
  it("open on a dirty document asks first; Discard proceeds", async () => {
    const engine = mockEngine({ historyStatus: dirtyStatus });
    const gateway = mockGateway();
    renderFiles(engine, gateway);

    fireEvent.click(screen.getByText("do-open"));
    expect(gateway.open).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog", { name: "Unsaved changes" });
    expect(dialog).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => {
      expect(gateway.open).toHaveBeenCalledTimes(1);
    });
  });

  it("Cancel keeps everything", async () => {
    const engine = mockEngine({ historyStatus: dirtyStatus });
    const gateway = mockGateway();
    renderFiles(engine, gateway);

    fireEvent.click(screen.getByText("do-new"));
    await screen.findByRole("dialog", { name: "Unsaved changes" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(engine.newDocument).not.toHaveBeenCalled();
  });

  it("a clean document skips the dialog entirely", async () => {
    const engine = mockEngine();
    const gateway = mockGateway();
    renderFiles(engine, gateway);

    fireEvent.click(screen.getByText("do-new"));
    await waitFor(() => {
      expect(engine.newDocument).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("file-name")).toHaveTextContent("∅");
  });
});

// ─── Window title ────────────────────────────────────────────────────────────

describe("window title", () => {
  it("reflects the file name and dirty state, title-bar style", async () => {
    const engine = mockEngine({ historyStatus: dirtyStatus });
    renderFiles(engine, mockGateway());
    await waitFor(() => {
      expect(document.title).toBe("● Untitled — Graphite");
    });
  });
});
