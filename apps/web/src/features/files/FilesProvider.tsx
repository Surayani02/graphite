/**
 * FilesProvider — Phase 7 Milestone 2.
 *
 * Owns the file session (`fileName` + retained handle), orchestrates the
 * four file actions against the engine and the `FileGateway`, and enforces
 * the two data-loss guards: an in-app confirm dialog before `open`/`new`
 * discard unsaved changes, and the browser `beforeunload` prompt while
 * dirty.
 *
 * Save semantics (ADR-021): the worker serialises (`getDocumentJson`), the
 * gateway writes, and only a **confirmed** write sends `markSaved` — a
 * cancelled picker or a failed write leaves the document dirty. `dirty`
 * itself is the worker's `historyStatus.dirty` (history position vs saved
 * marker, M1); this provider never computes its own.
 *
 * Mounts between EngineProvider (it consumes the engine context) and
 * ShortcutProvider (commands dispatched by shortcuts consume this context).
 * Session state is deliberately React state, not uiStore: uiStore persists
 * to localStorage, and neither a dead `FileSystemFileHandle` nor a stale
 * file name should survive a reload (handle persistence via IndexedDB is a
 * documented future extension).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ModalDialog } from "@graphite/ui-core";
import { useEngineContext } from "../../contexts/EngineContext";
import { createFileGateway, type ExportBlobOptions, type FileGateway } from "./gateway";
import {
  FileFormatError,
  parseGraphiteFile,
  serializeGraphiteFile,
  suggestedFileName,
} from "./format";

// ─── Context ─────────────────────────────────────────────────────────────────

export interface FilesContextValue {
  /** Saves one binary export through the gateway (Phase 7 M4). Resolves
   *  `true` when written, `false` on user cancel; gateway failures surface
   *  through `fileError` like every other disk operation here. */
  readonly exportBlob: (blob: Blob, opts: ExportBlobOptions) => Promise<boolean>;
  /** Name of the associated file, or `null` before the first save/open. */
  readonly fileName: string | null;
  /** Unsaved changes relative to the file (worker history's dirty flag). */
  readonly dirty: boolean;
  /** Last file operation failure, cleared on the next action. */
  readonly fileError: string | null;
  readonly save: () => void;
  readonly saveAs: () => void;
  readonly open: () => void;
  readonly newDocument: () => void;
}

export const FilesContext = createContext<FilesContextValue | null>(null);

export function useFiles(): FilesContextValue {
  const ctx = useContext(FilesContext);
  if (!ctx) {
    throw new Error("useFiles must be used within a FilesProvider");
  }
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

interface FileSession {
  readonly fileName: string;
  readonly handle: FileSystemFileHandle | null;
}

export function FilesProvider({
  children,
  gateway,
}: {
  children: ReactNode;
  /** Injectable for tests; production uses feature detection. */
  gateway?: FileGateway;
}) {
  const engine = useEngineContext();
  const gatewayRef = useRef<FileGateway | null>(gateway ?? null);
  gatewayRef.current ??= createFileGateway();

  const [session, setSession] = useState<FileSession | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pendingDiscard, setPendingDiscard] = useState<"open" | "new" | null>(null);
  /** Serialises the async actions — a second Save while one is in flight
   *  is dropped rather than raced. */
  const busyRef = useRef(false);

  const dirty = engine.historyStatus.dirty;

  // ── Core async actions ─────────────────────────────────────────────────────

  const runExclusive = useCallback(async (action: () => Promise<void>): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setFileError(null);
    try {
      await action();
    } catch (err) {
      setFileError(errorMessage(err));
    } finally {
      busyRef.current = false;
    }
  }, []);

  const doSave = useCallback(
    (forcePicker: boolean): Promise<void> =>
      runExclusive(async () => {
        const gw = gatewayRef.current;
        if (gw === null || engine.status !== "running") return;

        const documentJson = await engine.getDocumentJson();
        const text = serializeGraphiteFile(documentJson);

        if (!forcePicker && session !== null && session.handle !== null && gw.supportsHandles) {
          await gw.writeTo(session.handle, text);
          engine.markSaved();
          return;
        }

        const suggested = session?.fileName ?? suggestedFileName(documentNameOf(documentJson));
        const target = await gw.saveAs(text, suggested);
        if (target === null) return; // cancelled — the document stays dirty
        setSession({ fileName: target.name, handle: target.handle });
        engine.markSaved();
      }),
    [engine, runExclusive, session]
  );

  const doOpen = useCallback(
    (): Promise<void> =>
      runExclusive(async () => {
        const gw = gatewayRef.current;
        if (gw === null || engine.status !== "running") return;

        const opened = await gw.open();
        if (opened === null) return; // cancelled

        const data = parseGraphiteFile(opened.text); // FileFormatError → catch below
        engine.loadDocument(JSON.stringify(data));
        setSession({ fileName: opened.name, handle: opened.handle });
      }),
    [engine, runExclusive]
  );

  const doNew = useCallback(
    (): Promise<void> =>
      runExclusive(() => {
        if (engine.status === "running") {
          engine.newDocument();
          setSession(null);
        }
        return Promise.resolve();
      }),
    [engine, runExclusive]
  );

  // ── Public actions (discard guard in front of the destructive two) ────────

  const save = useCallback(() => {
    void doSave(false);
  }, [doSave]);
  const saveAs = useCallback(() => {
    void doSave(true);
  }, [doSave]);
  const open = useCallback(() => {
    if (dirty) {
      setPendingDiscard("open");
      return;
    }
    void doOpen();
  }, [dirty, doOpen]);
  const newDocument = useCallback(() => {
    if (dirty) {
      setPendingDiscard("new");
      return;
    }
    void doNew();
  }, [dirty, doNew]);

  const confirmDiscard = useCallback(() => {
    const pending = pendingDiscard;
    setPendingDiscard(null);
    if (pending === "open") void doOpen();
    if (pending === "new") void doNew();
  }, [pendingDiscard, doOpen, doNew]);

  // ── Data-loss guards & window title ────────────────────────────────────────

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty]);

  useEffect(() => {
    document.title = `${dirty ? "● " : ""}${session?.fileName ?? "Untitled"} — Graphite`;
    return () => {
      document.title = "Graphite";
    };
  }, [dirty, session]);

  const exportBlob = useCallback(async (blob: Blob, opts: ExportBlobOptions): Promise<boolean> => {
    // Same self-healing resolution as the render path above: the ref is
    // populated on first render, and ??= narrows it for TypeScript
    // without a dead null-branch or a banned non-null assertion.
    const gw = (gatewayRef.current ??= createFileGateway());
    try {
      const target = await gw.saveBlobAs(blob, opts);
      return target !== null;
    } catch (err) {
      setFileError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, []);

  // ── Context value ──────────────────────────────────────────────────────────

  const value = useMemo<FilesContextValue>(
    () => ({
      exportBlob,
      fileName: session?.fileName ?? null,
      dirty,
      fileError,
      save,
      saveAs,
      open,
      newDocument,
    }),
    [session, dirty, fileError, save, saveAs, open, newDocument, exportBlob]
  );

  return (
    <FilesContext.Provider value={value}>
      {children}
      <ModalDialog
        isOpen={pendingDiscard !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPendingDiscard(null);
        }}
        label="Unsaved changes"
        widthClassName="w-full max-w-sm"
      >
        <div className="p-4">
          <p className="text-sm text-content-primary">
            {pendingDiscard === "open" ? "Open another file?" : "Start a new document?"}
          </p>
          <p className="mt-1 text-xs text-content-tertiary">
            Unsaved changes will be lost. Save first with <span className="font-mono">mod+S</span>.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setPendingDiscard(null);
              }}
              className="rounded px-2.5 py-1 font-mono text-xs text-content-secondary hover:bg-surface-panel-hover"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDiscard}
              className="rounded px-2.5 py-1 font-mono text-xs text-danger hover:bg-surface-panel-hover"
            >
              Discard changes
            </button>
          </div>
        </div>
      </ModalDialog>
    </FilesContext.Provider>
  );
}

// ─── Internals ───────────────────────────────────────────────────────────────

function documentNameOf(documentJson: string): string {
  try {
    const parsed = JSON.parse(documentJson) as { name?: unknown };
    return typeof parsed.name === "string" ? parsed.name : "Untitled";
  } catch {
    return "Untitled";
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof FileFormatError) return `Can't open file: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
