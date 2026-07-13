/**
 * FileGateway — Phase 7 Milestone 2.
 *
 * One interface, two implementations, chosen once at startup by feature
 * detection:
 *
 * - **File System Access** (Chromium): real pickers, a retained
 *   `FileSystemFileHandle`, and silent in-place re-saves. A user cancel
 *   surfaces as `null` (mapped from the picker's `AbortError`) — never as
 *   a thrown error, because cancelling is a normal outcome the caller must
 *   branch on (a cancelled save keeps the document dirty).
 * - **Download / <input type=file>** (Firefox, Safari): `saveAs` triggers a
 *   download and — since the page cannot observe the download manager —
 *   reports optimistic success; every save is a fresh download
 *   (`supportsHandles: false`, so callers route "Save" to "Save As").
 *   `open` uses a detached file input; cancel is detected via the input's
 *   `cancel` event with a focus-based fallback for engines that predate it.
 *
 * Main-thread only by architecture: pickers are window-scoped, and
 * persistence sits outside the engine worker (see BLUEPRINT layering).
 * Handles are not persisted across sessions in M2 — IndexedDB handle
 * storage plus permission re-request is a documented future extension
 * (ADR-021).
 */

import { GRAPHITE_FILE_EXTENSION, GRAPHITE_FILE_MIME } from "./format";

// ─── Interface ───────────────────────────────────────────────────────────────

export interface OpenedFile {
  readonly name: string;
  readonly text: string;
  /** Present only under File System Access — enables silent re-save. */
  readonly handle: FileSystemFileHandle | null;
}

export interface SaveTarget {
  readonly name: string;
  readonly handle: FileSystemFileHandle | null;
}

export interface FileGateway {
  /** True when saves can silently rewrite a retained handle. */
  readonly supportsHandles: boolean;
  /** Shows an open picker and reads the chosen file. `null` on cancel. */
  open(): Promise<OpenedFile | null>;
  /** Picks a destination (or triggers a download) and writes `text`.
   *  `null` on cancel; the returned target is already written. */
  saveAs(text: string, suggestedName: string): Promise<SaveTarget | null>;
  /** Rewrites an existing handle in place. Throws on failure — the caller
   *  must not mark the document saved when this rejects. */
  writeTo(handle: FileSystemFileHandle, text: string): Promise<void>;
}

const PICKER_TYPES = [
  {
    description: "Graphite document",
    accept: { [GRAPHITE_FILE_MIME]: [GRAPHITE_FILE_EXTENSION] } as Record<string, string[]>,
  },
];

// ─── File System Access implementation ──────────────────────────────────────

export function supportsFileSystemAccess(w: Window = window): boolean {
  return "showOpenFilePicker" in w && "showSaveFilePicker" in w;
}

/** `null` for the one non-error outcome a picker has: the user said no. */
function isPickerCancel(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export function createFsaaGateway(w: Window = window): FileGateway {
  return {
    supportsHandles: true,

    async open(): Promise<OpenedFile | null> {
      let handle: FileSystemFileHandle;
      try {
        const handles = await w.showOpenFilePicker({
          multiple: false,
          types: PICKER_TYPES,
        });
        const first = handles[0];
        if (first === undefined) return null;
        handle = first;
      } catch (err) {
        if (isPickerCancel(err)) return null;
        throw err;
      }
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    },

    async saveAs(text: string, suggestedName: string): Promise<SaveTarget | null> {
      let handle: FileSystemFileHandle;
      try {
        handle = await w.showSaveFilePicker({
          suggestedName,
          types: PICKER_TYPES,
        });
      } catch (err) {
        if (isPickerCancel(err)) return null;
        throw err;
      }
      await this.writeTo(handle, text);
      return { name: handle.name, handle };
    },

    async writeTo(handle: FileSystemFileHandle, text: string): Promise<void> {
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
    },
  };
}

// ─── Download / <input> fallback implementation ─────────────────────────────

export function createDownloadGateway(doc: Document = document): FileGateway {
  return {
    supportsHandles: false,

    open(): Promise<OpenedFile | null> {
      return new Promise<OpenedFile | null>((resolve, reject) => {
        const input = doc.createElement("input");
        input.type = "file";
        input.accept = `${GRAPHITE_FILE_EXTENSION},${GRAPHITE_FILE_MIME}`;

        let settled = false;
        const settle = (value: OpenedFile | null): void => {
          if (settled) return;
          settled = true;
          w?.removeEventListener("focus", onRefocus);
          resolve(value);
        };

        input.addEventListener("change", () => {
          const file = input.files?.[0];
          if (file === undefined) {
            settle(null);
            return;
          }
          file.text().then(
            (text) => {
              settle({ name: file.name, text, handle: null });
            },
            (err: unknown) => {
              if (!settled) {
                settled = true;
                reject(err instanceof Error ? err : new Error(String(err)));
              }
            }
          );
        });

        // Modern engines fire `cancel` on a dismissed picker; older ones
        // only return focus to the window. The refocus path waits a beat —
        // `change` fires after focus when a file WAS chosen, and `settle`
        // is idempotent, so the race resolves correctly either way.
        input.addEventListener("cancel", () => {
          settle(null);
        });
        const w = doc.defaultView;
        const onRefocus = (): void => {
          setTimeout(() => {
            if (input.files === null || input.files.length === 0) settle(null);
          }, 500);
        };
        w?.addEventListener("focus", onRefocus, { once: true });

        input.click();
      });
    },

    saveAs(text: string, suggestedName: string): Promise<SaveTarget | null> {
      const url = URL.createObjectURL(new Blob([text], { type: GRAPHITE_FILE_MIME }));
      const anchor = doc.createElement("a");
      anchor.href = url;
      anchor.download = suggestedName;
      anchor.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 0);
      // Downloads are fire-and-forget from the page's perspective:
      // optimistic success, documented in ADR-021.
      return Promise.resolve({ name: suggestedName, handle: null });
    },

    writeTo(): Promise<void> {
      return Promise.reject(
        new Error("Download gateway holds no file handles — use saveAs instead")
      );
    },
  };
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createFileGateway(w: Window = window): FileGateway {
  return supportsFileSystemAccess(w) ? createFsaaGateway(w) : createDownloadGateway(w.document);
}
