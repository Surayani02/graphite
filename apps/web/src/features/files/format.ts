/**
 * `.graphite` file format v1 — Phase 7 Milestone 2.
 *
 * A `.graphite` file is a versioned JSON envelope around the document:
 *
 * ```json
 * {
 *   "format": "graphite",
 *   "version": 1,
 *   "savedAt": "2026-07-13T09:30:00.000Z",
 *   "document": { ...DocumentData }
 * }
 * ```
 *
 * Layering (deliberate): the engine worker never sees this envelope. Its
 * serialisation contract stays bare `DocumentData` JSON (`document:state` /
 * `document:load`, and the localStorage recovery snapshot). The envelope is
 * a *file-layer* concern, wrapped and unwrapped here on the main thread —
 * so the protocol boundary, the worker, and every existing test of them
 * are untouched by the file format's existence. The envelope types live in
 * this module rather than `@graphite/protocol` because they never cross an
 * IPC boundary; if a future server needs to read `.graphite` natively it
 * will validate in Rust anyway (see ADR-021 §Alternatives).
 *
 * Output is pretty-printed (2-space indent): a `.graphite` file is a
 * source-like artifact users will diff and commit; ~30% size overhead at
 * MVP scale is the right trade. Parsing accepts any whitespace.
 */

import type { DocumentData } from "@graphite/protocol";
import { assertValidDocumentData } from "../../document/validate";

// ─── Constants ───────────────────────────────────────────────────────────────

export const GRAPHITE_FILE_EXTENSION = ".graphite";
export const GRAPHITE_FILE_VERSION = 1;
/** Envelope JSON is plain JSON on disk; pickers filter on the extension. */
export const GRAPHITE_FILE_MIME = "application/json";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GraphiteFileV1 {
  readonly format: "graphite";
  readonly version: 1;
  /** ISO-8601 write timestamp — informational; ignored on load. */
  readonly savedAt: string;
  readonly document: DocumentData;
}

export type FileFormatErrorCode =
  | "invalid-json"
  | "not-graphite"
  | "unsupported-version"
  | "invalid-document";

/**
 * Thrown by `parseGraphiteFile` with a stable machine code (drives which
 * message the UI shows) and a human `message` (embeds the underlying JSON
 * or validation detail). `fileVersion` is set for `unsupported-version`.
 */
export class FileFormatError extends Error {
  readonly code: FileFormatErrorCode;
  readonly fileVersion: number | null;

  constructor(code: FileFormatErrorCode, message: string, fileVersion: number | null = null) {
    super(message);
    this.name = "FileFormatError";
    this.code = code;
    this.fileVersion = fileVersion;
  }
}

/** One forward migration step: the raw `document` payload of version N in,
 *  the payload shaped as version N+1 out. Pure — no I/O, no mutation of
 *  the input. */
export type FileMigration = (payload: Record<string, unknown>) => Record<string, unknown>;

/**
 * Registered migrations, keyed by the version they migrate FROM. Empty
 * until a v2 exists — the map plus `runFileMigrations` below are the
 * versioning *mechanism* that lets v2 ship without redesigning the format:
 * a v2 adds `MIGRATIONS.set(1, migrateV1toV2)` and bumps
 * `GRAPHITE_FILE_VERSION`, and every v1 file on disk keeps opening.
 */
export const FILE_MIGRATIONS: ReadonlyMap<number, FileMigration> = new Map();

// ─── Serialise ───────────────────────────────────────────────────────────────

/**
 * Wraps an already-serialised document (the worker's `document:state`
 * payload) in the v1 envelope. Takes the JSON string rather than a
 * `DocumentModel` so the main thread never needs the model class — the
 * worker remains the only serialiser of documents.
 *
 * Throws `FileFormatError("invalid-document")` if `documentJson` is not
 * parseable JSON — that would mean the worker sent garbage, which is worth
 * failing loudly on rather than embedding.
 */
export function serializeGraphiteFile(documentJson: string, savedAt: Date = new Date()): string {
  let document: unknown;
  try {
    document = JSON.parse(documentJson);
  } catch (err) {
    throw new FileFormatError(
      "invalid-document",
      `Document payload is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const envelope = {
    format: "graphite",
    version: GRAPHITE_FILE_VERSION,
    savedAt: savedAt.toISOString(),
    document,
  };
  return JSON.stringify(envelope, null, 2);
}

// ─── Parse ───────────────────────────────────────────────────────────────────

/**
 * Parses `.graphite` file text into validated `DocumentData`.
 *
 * Pipeline: JSON.parse → envelope shape check → forward migrations from the
 * file's version up to `currentVersion` → `assertValidDocumentData` on the
 * final payload (the exact validator `document:load` relies on, so a file
 * that parses here is guaranteed loadable by the worker).
 *
 * `migrations`/`currentVersion` are parameters (defaulting to the real
 * registry) so the migration mechanism is testable today, while the empty
 * production table stays honest about only one version existing.
 */
export function parseGraphiteFile(
  text: string,
  migrations: ReadonlyMap<number, FileMigration> = FILE_MIGRATIONS,
  currentVersion: number = GRAPHITE_FILE_VERSION
): DocumentData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new FileFormatError(
      "invalid-json",
      `Not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new FileFormatError("not-graphite", "Not a .graphite file: top level is not an object");
  }
  const envelope = raw as Record<string, unknown>;

  if (envelope["format"] !== "graphite") {
    throw new FileFormatError("not-graphite", 'Not a .graphite file: missing format: "graphite"');
  }

  const version = envelope["version"];
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new FileFormatError("not-graphite", "Not a .graphite file: missing integer version");
  }
  if (version > currentVersion) {
    throw new FileFormatError(
      "unsupported-version",
      `This file was saved by a newer Graphite (format v${String(version)}); ` +
        `this build reads up to v${String(currentVersion)}.`,
      version
    );
  }

  const document = envelope["document"];
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    throw new FileFormatError("invalid-document", "Envelope has no document object");
  }

  const migrated = runFileMigrations(
    document as Record<string, unknown>,
    version,
    currentVersion,
    migrations
  );

  try {
    assertValidDocumentData(migrated);
  } catch (err) {
    throw new FileFormatError(
      "invalid-document",
      `Document failed validation: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  return migrated;
}

/**
 * Applies forward migrations step-by-step: `fromVersion → fromVersion+1 →
 * … → toVersion`. A missing step is a programming error (a released
 * version without its migration), reported as `unsupported-version` so the
 * user sees "can't open" rather than a corrupted document.
 */
export function runFileMigrations(
  payload: Record<string, unknown>,
  fromVersion: number,
  toVersion: number,
  migrations: ReadonlyMap<number, FileMigration>
): Record<string, unknown> {
  let current = payload;
  for (let v = fromVersion; v < toVersion; v++) {
    const step = migrations.get(v);
    if (step === undefined) {
      throw new FileFormatError(
        "unsupported-version",
        `No migration registered from format v${String(v)} to v${String(v + 1)}`,
        fromVersion
      );
    }
    current = step(current);
  }
  return current;
}

// ─── Names ───────────────────────────────────────────────────────────────────

/**
 * Suggested file name from a document name: lower-cased, whitespace runs
 * collapsed to single hyphens, filesystem-hostile characters stripped,
 * `.graphite` appended. Empty/emptied names fall back to "untitled".
 */
export function suggestedFileName(documentName: string): string {
  // Control characters are stripped by code point rather than a regex
  // range — the intent stays explicit and no-control-regex stays honest.
  const printable = Array.from(documentName)
    .filter((ch) => (ch.codePointAt(0) ?? 0) >= 0x20)
    .join("");
  const stem = printable
    .trim()
    .toLowerCase()
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^\.+|\.+$/g, "");
  return `${stem === "" ? "untitled" : stem}${GRAPHITE_FILE_EXTENSION}`;
}
