/**
 * File System Access — ambient Window declarations (Phase 7 M2).
 *
 * TypeScript 6's lib.dom ships `FileSystemFileHandle` and
 * `createWritable()`, but the picker entry points remain WICG-only and are
 * absent from `Window`. These are the two signatures `gateway.ts` calls,
 * declared narrowly here rather than pulling in
 * `@types/wicg-file-system-access` — the dependency framework's third
 * question (why is a built-in solution insufficient?) has no answer for a
 * package that would contribute two method signatures. Delete this file
 * the day lib.dom ships them; the compiler will flag the duplicate.
 */

interface GraphiteFilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface GraphiteOpenFilePickerOptions {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: GraphiteFilePickerAcceptType[];
}

interface GraphiteSaveFilePickerOptions {
  suggestedName?: string;
  excludeAcceptAllOption?: boolean;
  types?: GraphiteFilePickerAcceptType[];
}

interface Window {
  showOpenFilePicker(options?: GraphiteOpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker(options?: GraphiteSaveFilePickerOptions): Promise<FileSystemFileHandle>;
}
