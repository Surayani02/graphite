# ADR-021: The `.graphite` File Format and the File Layer

- **Status:** Accepted
- **Date:** 2026-07-13
- **Phase:** 7, Milestone 2
- **Related:** ADR-009 (protocol-first IPC), ADR-020 (operations & history), BLUEPRINT §Phase 7

## Context

Through Phase 6 the only persistence was a localStorage snapshot: mod+S asked
the worker to serialise, the main thread wrote `graphite-document-v1`, and —
since M1 — the worker marked its history saved _at request time_. That model
has no durable artifact, no way to open someone else's document, and dirty
semantics that assume the write cannot fail. M2 makes files real without
creating a parallel save path.

## Decision

### 1. Format: a versioned JSON envelope, main-thread only

A `.graphite` file is `{ format: "graphite", version: 1, savedAt, document:
DocumentData }`, pretty-printed (2-space indent — these files get diffed and
committed; ~30% size overhead at MVP scale is the right trade). The worker
never sees the envelope: its serialisation contract stays bare `DocumentData`
(`document:state` / `document:load` and the localStorage snapshot), and the
file layer wraps/unwraps on the main thread (`features/files/format.ts`).
Parsing runs typed stages — `invalid-json` → `not-graphite` →
`unsupported-version` → migrations → `invalid-document` — and reuses the
exact `assertValidDocumentData` the load path relies on, so a file that
parses is guaranteed loadable.

`FILE_MIGRATIONS` (a `fromVersion → step` map) plus `runFileMigrations` are
the forward-compatibility _mechanism_, shipped empty and exercised by tests
through injection: v2 registers one step and bumps the version constant, and
every v1 file keeps opening. A file whose version exceeds the build's reports
`unsupported-version` with the offending version — never a half-parse.

### 2. Save correlation: `requestId`, and mark-saved on confirmed writes only

`document:request_save` gains an optional `requestId`, echoed on the
answering `document:state`. The main thread's `getDocumentJson()` correlates
by id, so a spontaneous broadcast (document:new/load racing a save click)
can never be mistaken for the answer — the same class of race the
`useSyncToolWithEngine` fix taught us to kill at design time.

**M1's mark-on-request moves out of the worker.** `document:request_save` now
serialises and nothing more; a new `document:mark_saved` message confirms a
durable write, and the FilesProvider sends it only after the gateway
resolves. A cancelled picker, a rejected write, or a not-running engine all
leave `dirty` true — which is the whole point of history-based dirty
tracking. This is the semantic hand-off ADR-020 §5 anticipated ("M2
re-points this at real file saves").

### 3. localStorage is demoted to crash recovery

Every `document:state` still lands in `graphite-document-v1` (boot restore is
unchanged, and the tab-hidden snapshot survives under its honest new name,
`requestRecoverySnapshot`) — but writing it no longer touches dirty. `dirty`
means "differs from the file". A reload therefore restores work with no file
association and a clean history; the first mod+S becomes Save As. File
handles are deliberately **not** persisted across sessions in M2 — IndexedDB
handle storage plus permission re-request is the documented next step here.

### 4. FileGateway: FSAA with a download fallback

One interface, feature-detected once: File System Access (Chromium) gives
pickers, a retained handle, and silent in-place re-saves; the fallback
(Firefox/Safari) opens through `<input type=file>` and saves through
`<a download>` — every save a fresh download, reported as **optimistic
success** because the page cannot observe the download manager. Picker
cancels resolve `null` (mapped from `AbortError`), never throw: cancelling
is a normal outcome the provider must branch on. Pickers are window-scoped,
so the gateway is main-thread by construction, matching the layering rule
that persistence sits outside the engine.

### 5. Commands, guards, and surfacing

`file.save` (mod+S) / `file.saveAs` (mod+shift+S) / `file.open` (mod+O) /
`file.new` (no chord — mod+N is browser-reserved in Chromium) dispatch to a
new `CommandContext.files` surface, all gated on `engine.status ===
"running"`; the now-superseded `CommandContext.engine.requestSave` was
removed rather than left dead. The FilesProvider (mounted between
EngineProvider and ShortcutProvider) owns the discard-guard dialog before
destructive open/new, the `beforeunload` prompt while dirty, the window
title (`● name — Graphite`), and a `role="alert"` error slot in the toolbar.
Session state is React state, not uiStore: uiStore persists, and neither a
dead handle nor a stale name should survive a reload.

## Alternatives considered

- **Envelope types in `@graphite/protocol`** — rejected: the envelope never
  crosses an IPC boundary (the worker sees bare DocumentData), and a future
  Rust server validates natively anyway; promoting the types when a real
  second consumer exists beats speculative placement.
- **Worker-side envelope handling** — rejected: pickers are window-only, the
  localStorage format would need migrating, and persistence belongs outside
  the engine layer.
- **Correlate saves by message ordering instead of `requestId`** — rejected:
  a document:new fired between request and answer would resolve the save
  promise with the _new_ document and write it over the old file. One
  optional field buys airtight correlation.
- **Keep mark-saved at request time** — rejected: it is simply false once a
  save can be cancelled or fail.
- **Minified envelope output** — rejected: `.graphite` files are artifacts
  users diff, review, and commit; compactness can become a save option if
  size ever matters.
- **Persist FSAA handles in IndexedDB now** — deferred: real value, but it
  drags in IndexedDB plumbing and permission re-request UX; M2's semantics
  (reload → recovery content, no association) are honest without it.

## Consequences

- One save path: worker serialises → file layer wraps → gateway writes →
  confirmation marks saved. M4's PNG export reuses the gateway's save-as
  shape for a different payload.
- Fallback browsers get optimistic dirty-clearing on download — documented,
  and strictly better than the M1 behaviour of clearing on request.
- Losing a save's answer (worker death mid-save) leaves a pending promise;
  the busy-guard prevents pile-ups and the action is user-retriable. A
  timeout wrapper is a cheap later hardening if it ever shows up in
  practice.
- The `.graphite` v1 shape is now a public contract; changes go through the
  migration table, never through edits to v1's meaning.
