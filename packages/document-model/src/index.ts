/**
 * @graphite/document-model
 *
 * The document model — Graphite's worker-hosted source of truth — extracted
 * from `apps/web` per ADR-030 so the Phase 11 server and the Phase 12 CRDT
 * binding can consume one implementation without depending on the web
 * application. Three hosts, one model: the web worker owns the live editing
 * instance, the server will construct instances for validation and
 * persistence, the CRDT binding maps this schema onto Yjs.
 *
 * Boundaries (ADR-030):
 *   - Depends on `@graphite/protocol` only. Wire types (`DocNode`,
 *     `DocumentData`, `NodePatch`, `DocumentOp`, `Color`) live in protocol
 *     and are deliberately NOT re-exported here — import them from
 *     `@graphite/protocol`.
 *   - No React, no worker/IPC transport, no engine or GPU types, no network
 *     or filesystem I/O. Hosts do I/O; this package computes.
 *
 * Everything exported below is the stable contract; anything not exported
 * here is internal. Additions are cheap, removals are breaking (three
 * independent consumers).
 */

// ── Model ────────────────────────────────────────────────────────────────────
export { DocumentModel } from "./model";

// ── Operations ───────────────────────────────────────────────────────────────
export { applyOp, effectiveNodePatch, isEmptyPatch, OpError } from "./ops";
export type { AppliedOp, OpErrorCode } from "./ops";

// ── Validation ───────────────────────────────────────────────────────────────
export { assertValidDocumentData, DOCUMENT_LIMITS } from "./validate";
export type { ValidationLimits } from "./validate";

// ── Tree derivation ──────────────────────────────────────────────────────────
export { buildTree } from "./tree";
export type { TreeNode } from "./tree";

// ── .graphite file format (ADR-021; moved intact per ADR-030) ────────────────
export {
  FILE_MIGRATIONS,
  FileFormatError,
  GRAPHITE_FILE_EXTENSION,
  GRAPHITE_FILE_MIME,
  GRAPHITE_FILE_VERSION,
  MAX_GRAPHITE_FILE_CHARS,
  parseGraphiteFile,
  runFileMigrations,
  serializeGraphiteFile,
  suggestedFileName,
} from "./format";
export type { FileFormatErrorCode, FileMigration, GraphiteFileV1 } from "./format";
