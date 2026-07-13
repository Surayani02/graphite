// @vitest-environment jsdom
/**
 * features/files/gateway.ts unit tests.
 *
 * The FSAA gateway is driven through an injected fake window (the pickers
 * are the browser's; the contract under test is cancel-mapping, handle
 * plumbing, and the write sequence). The download gateway runs against
 * real jsdom DOM — created elements are captured via a createElement spy,
 * and picker outcomes are simulated by dispatching the input's own events.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDownloadGateway,
  createFileGateway,
  createFsaaGateway,
  supportsFileSystemAccess,
} from "../features/files/gateway";

function fakeHandle(name: string, sink?: { text?: string }) {
  const write = vi.fn((t: string) => {
    if (sink) sink.text = t;
    return Promise.resolve();
  });
  const close = vi.fn(() => Promise.resolve());
  return {
    handle: {
      name,
      getFile: () => Promise.resolve({ name, text: () => Promise.resolve("file-body") }),
      createWritable: () => Promise.resolve({ write, close }),
    } as unknown as FileSystemFileHandle,
    write,
    close,
  };
}

const abort = () => Promise.reject(new DOMException("The user aborted a request.", "AbortError"));

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── FSAA ────────────────────────────────────────────────────────────────────

describe("FSAA gateway", () => {
  it("open reads the picked file and keeps the handle", async () => {
    const { handle } = fakeHandle("logo.graphite");
    const w = { showOpenFilePicker: vi.fn(() => Promise.resolve([handle])) };
    const gw = createFsaaGateway(w as unknown as Window);

    const opened = await gw.open();
    expect(opened).toEqual({ name: "logo.graphite", text: "file-body", handle });
    expect(gw.supportsHandles).toBe(true);
  });

  it("open maps the picker's AbortError to null — cancel is not an error", async () => {
    const w = { showOpenFilePicker: abort };
    await expect(createFsaaGateway(w as unknown as Window).open()).resolves.toBeNull();
  });

  it("saveAs writes through the picked handle before reporting the target", async () => {
    const sink: { text?: string } = {};
    const { handle, write, close } = fakeHandle("new.graphite", sink);
    const w = { showSaveFilePicker: vi.fn(() => Promise.resolve(handle)) };
    const gw = createFsaaGateway(w as unknown as Window);

    const target = await gw.saveAs("BODY", "suggested.graphite");
    expect(w.showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: "suggested.graphite" })
    );
    expect(write).toHaveBeenCalledWith("BODY");
    expect(close).toHaveBeenCalledTimes(1);
    expect(sink.text).toBe("BODY");
    expect(target).toEqual({ name: "new.graphite", handle });
  });

  it("saveAs cancel resolves null; writeTo failures propagate to the caller", async () => {
    const cancelled = createFsaaGateway({ showSaveFilePicker: abort } as unknown as Window);
    await expect(cancelled.saveAs("x", "y.graphite")).resolves.toBeNull();

    const failing = {
      name: "locked.graphite",
      createWritable: () => Promise.reject(new DOMException("denied", "NotAllowedError")),
    } as unknown as FileSystemFileHandle;
    const gw = createFsaaGateway({} as Window);
    await expect(gw.writeTo(failing, "x")).rejects.toThrow("denied");
  });
});

// ─── Download fallback ───────────────────────────────────────────────────────

function captureCreated(): { inputs: HTMLInputElement[]; anchors: HTMLAnchorElement[] } {
  const created = { inputs: [] as HTMLInputElement[], anchors: [] as HTMLAnchorElement[] };
  const original = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = original(tag);
    if (el instanceof HTMLInputElement) created.inputs.push(el);
    if (el instanceof HTMLAnchorElement) {
      vi.spyOn(el, "click").mockImplementation(() => {});
      created.anchors.push(el);
    }
    return el;
  });
  return created;
}

describe("download gateway", () => {
  it("open resolves the chosen file's name and text", async () => {
    const created = captureCreated();
    const gw = createDownloadGateway(document);
    const pending = gw.open();

    const input = created.inputs[0];
    expect(input).toBeDefined();
    if (!input) return;
    expect(input.accept).toContain(".graphite");

    const file = new File(['{"x":1}'], "picked.graphite", { type: "application/json" });
    Object.defineProperty(input, "files", { value: [file] });
    input.dispatchEvent(new Event("change"));

    await expect(pending).resolves.toEqual({
      name: "picked.graphite",
      text: '{"x":1}',
      handle: null,
    });
  });

  it("open resolves null on the input's cancel event", async () => {
    const created = captureCreated();
    const gw = createDownloadGateway(document);
    const pending = gw.open();
    created.inputs[0]?.dispatchEvent(new Event("cancel"));
    await expect(pending).resolves.toBeNull();
  });

  it("saveAs triggers a named download and reports optimistic success", async () => {
    const created = captureCreated();
    const createObjectURL = vi.fn(() => "blob:graphite-test");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    const gw = createDownloadGateway(document);
    const target = await gw.saveAs("BODY", "logo.graphite");

    const anchor = created.anchors[0];
    expect(anchor).toBeDefined();
    if (!anchor) return;
    expect(anchor.download).toBe("logo.graphite");
    expect(anchor.href).toContain("blob:graphite-test");
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(target).toEqual({ name: "logo.graphite", handle: null });

    await new Promise((r) => setTimeout(r, 1));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:graphite-test");
    vi.unstubAllGlobals();
  });

  it("writeTo rejects — the fallback holds no handles", async () => {
    await expect(
      createDownloadGateway(document).writeTo({} as FileSystemFileHandle, "x")
    ).rejects.toThrow(/no file handles/);
    expect(createDownloadGateway(document).supportsHandles).toBe(false);
  });
});

describe("createFileGateway", () => {
  it("feature-detects: pickers → FSAA, otherwise the download fallback", () => {
    const withPickers = {
      showOpenFilePicker: vi.fn(),
      showSaveFilePicker: vi.fn(),
      document,
    } as unknown as Window;
    expect(supportsFileSystemAccess(withPickers)).toBe(true);
    expect(createFileGateway(withPickers).supportsHandles).toBe(true);

    const bare = { document } as unknown as Window;
    expect(supportsFileSystemAccess(bare)).toBe(false);
    expect(createFileGateway(bare).supportsHandles).toBe(false);
  });
});
