# ADR-030: Document Model Package Extraction

- **Status:** Accepted (design decision — implementation not yet scheduled)
- **Date:** 2026-07-20
- **Phase:** Precedes Phase 11; best landed early in the Phase 8–10 window
- **Related:** ADR-001 (monorepo structure), ADR-009 (protocol-first IPC),
  ADR-010 (Rust `document` crate placeholder), ADR-011 (TypeScript
  document model), ADR-020 (ops and history), ADR-021 (`.graphite` format),
  ADR-022 (validation ceilings), ADR-029 (phase resequencing)

## Context

The document model — the worker-owned source of truth — lives in
`apps/web/src/document/` (866 lines across `model.ts`, `ops.ts`,
`validate.ts`, `tree.ts`, `color.ts`), imported by eight non-test files.

That location was correct while the web app was its only consumer. It stops
being correct in Phase 11 and 12: the Axum server needs to validate and
persist documents, and the CRDT binding needs to map the schema onto Yjs.
Neither may depend on `apps/web` — an application must not be a library for
its own backend.

Extracting it is a change to the monorepo structure, so ADR-001 requires
this record.

## Decision

Extract to **`packages/document-model`**, published in-workspace as
`@graphite/document-model`.

### Naming

`document-model`, not `document`, because `packages/document` already
exists as the Rust crate placeholder (ADR-010). Two packages differing only
by language would be a permanent source of import mistakes. If ADR-010's
crate is ever retired, the name is freed but not reclaimed.

### Package boundaries

**In:** document data structures and their invariants; the `DocumentModel`
class; operation application and reversal (`applyOp`, `AppliedOp`,
`OpError`); validation and resource ceilings (`assertValidDocumentData`,
`DOCUMENT_LIMITS`); `.graphite` serialisation and deserialisation; schema
migrations; pure derivations over document data.

**Out:** React, hooks, and any UI concern; worker lifecycle and IPC
transport (the worker _hosts_ the model, the package does not know about
workers); GPU, scene graph, or engine types; network and persistence
transport (the server calls the package, the package never calls out).

**Dependencies:** `@graphite/protocol` only. Wire types (`DocNode`,
`DocumentData`, `NodePatch`, `DocumentOp`, `Color`) stay in `protocol` —
they are the crossing contract (ADR-009) and must not invert into the
model. The model _consumes_ them; it does not re-export them.

### Two boundary calls made now, not during implementation

- **`buildTree` / `TreeNode` move with the package.** It is a pure
  derivation over document data with no UI dependency, even though the
  Layers panel is its only current caller. If it ever acquires
  presentation concerns (virtualisation state, expansion memory), it moves
  back to `apps/web`.
- **`color.ts` does _not_ move — it is presentation, and it may be a
  duplicate.** `colorToHex` / `hexToColor` convert to a _UI_
  representation, and `packages/ui-core/src/color.ts` already exists. The
  extraction must first determine whether these two files overlap, then
  consolidate into `ui-core` rather than carrying a colour utility into a
  package the server will import. Resolving this is part of the extraction
  work, not a follow-up.

### Ownership

Unchanged, and worth restating because extraction can be misread as a
relocation of authority: **the worker owns the live instance; the package
owns the type and its logic.** The document model remains the single
source of truth, hosted by the worker, edited through the protocol. React
never holds it. The server will construct its own instances for validation
and persistence — different hosts, one implementation, no shared mutable
state.

### Public API

The extracted surface, unchanged in shape from today:

```
DocumentModel                 class — construction, mutation, query, serialise
applyOp, AppliedOp            operation application and its reversal record
OpError, OpErrorCode          typed failure of an operation
assertValidDocumentData       validation entry point
DOCUMENT_LIMITS, ValidationLimits   resource ceilings (ADR-022)
buildTree, TreeNode           pure tree derivation
effectiveNodePatch, isEmptyPatch    patch normalisation
```

This is a **stable contract** from extraction onward: it is consumed by
three independent hosts (web worker, server, CRDT binding), so additions
are cheap and removals are breaking. Anything not on this list is internal.

### Serialisation

`.graphite` (ADR-021) remains the format and moves into the package intact,
so that the web app, the server, and any future tool serialise identically
— one implementation, no drift.

`DocumentData.version` is the schema version and becomes load-bearing.
Rules:

- **`version < current`** — migrate forward through a registered chain of
  single-step migrations, then validate. Migrations are pure
  `(DocumentData) => DocumentData`, individually tested, never skipped or
  combined.
- **`version > current`** — reject with a clear, user-facing message. Do
  **not** attempt best-effort loading: silently discarding node kinds a
  newer build wrote would corrupt a user's document on round-trip. Refusing
  is the honest failure.
- Validation (ADR-022 ceilings) always runs **after** migration, never
  before — a migrated document must satisfy current invariants, not
  historical ones.

### Migration strategy

Two distinct migrations, deliberately separated:

**1. Code migration (this extraction).** Move the files, add the package
manifest and tsconfig, update the eight importing files plus tests, resolve
the `color.ts` question above. **Zero behaviour change** — the test suite is
the proof, and the milestone does not close on a single altered assertion.
Turborepo gains one node; the WASM build order is untouched. Bundle impact
should be neutral (same code, new location) and is verified against the
ceiling, not assumed.

**2. Data migration (ongoing, enabled by this ADR).** Phases 8–10 each
expand the schema: path nodes and text nodes (Phase 8), layout properties
(Phase 9), component and variable structures (Phase 10). Every expansion
bumps `version` and ships its migration in the same milestone as the
schema change — never retrofitted. This is precisely why ADR-029 sequences
the expansion _before_ collaboration: these migrations run against files on
disk, where they are ordinary; after Phase 12 they would run against live
concurrently-edited documents, where they are not.

## Alternatives considered

- **Leave it in `apps/web`.** Zero work today, but Phase 11 would make the
  server depend on the web application. Rejected outright — it inverts the
  dependency graph and would be far more expensive to unwind later, with
  the server already built on top.
- **Duplicate the model in the server.** Two implementations of validation
  and serialisation guarantees drift, and the drift surfaces as documents
  that one side accepts and the other rejects. Rejected.
- **Put it in `@graphite/protocol`.** Superficially tempting since the
  types already live there. Rejected: `protocol` is the _contract_ between
  layers and must stay small, dependency-free, and cheap to reason about.
  Adding a mutable model class, an operation engine, and migrations would
  make the crossing contract the largest package in the workspace.
- **Extract later, during Phase 11.** Rejected: it would land in the middle
  of backend work, mixing a pure refactor with new behaviour in the same
  milestone — precisely the combination that makes a regression hard to
  locate.

## Consequences

- `apps/web` imports `@graphite/document-model`; the eight import sites and
  their tests change in one mechanical commit.
- The public API above becomes a versioned contract with three consumers;
  changes to it are reviewed as contract changes, not refactors.
- Schema evolution gains an explicit, tested migration chain from Phase 8
  onward, instead of implicit tolerance.
- The Rust `document` crate (ADR-010) remains a placeholder and is
  untouched; this ADR does not revisit the Rust-vs-TypeScript model
  question settled in ADR-011.
