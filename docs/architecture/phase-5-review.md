# Architecture Review — Codebase Analysis Report Validation (Post-Phase-5)

- **Scope**: Validation of an external static-analysis report against the actual
  Phase 0–5 codebase, followed by implementation of every recommendation that
  survived validation.
- **Method**: Every claim was checked against the real source files (not
  assumed from the report's quotes), and every code change was validated with
  real tooling — `tsc` 6.0.3 (the project's actual pinned version) against the
  project's exact strict compiler settings, `cargo check` / `cargo test` /
  `cargo clippy -D warnings` / `rustfmt --check` against an available Rust
  toolchain, and `prettier --check` against the project's exact config.

---

## 1. Report Validation

Status legend: ✅ Necessary · ⚠️ Optional/Partial · ❌ Incorrect/Already done

| ID      | Recommendation                                   | Status                                           | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUG-01  | `COLOR_BLACK`/`COLOR_WHITE` alpha wrong          | ⚠️ Real defect, wrong diagnosis                  | Doc comment quoted belongs to a different file (`DocColor` in `model.ts`, not protocol's `Color`). The constants were dead code (zero non-test imports) — not "any future code that reaches for this will render nothing," since no code did. Real underlying issue: two `Color`-shaped types, two scales, no enforcement. Fixed by unifying on the 0–255 scale `DocColor` actually used.                                                    |
| BUG-02  | `getNode()` returns mutable reference            | ✅ Necessary                                     | Confirmed. Report's own suggested fix was incomplete (shallow-copies `children` but not nested `fill`/`stroke`) — used `structuredClone` instead for a complete, low-maintenance fix.                                                                                                                                                                                                                                                        |
| BUG-03  | `fromJson` no validation                         | ✅ Necessary, code fix broken                    | Confirmed crash risk. Report's suggested code (`Object.values(DocNodeKind)`) does not compile — `DocNodeKind` is a type alias, not a runtime value. Replaced with a working hand-rolled guard in new `validate.ts`.                                                                                                                                                                                                                          |
| BUG-04  | Wrong "pre-multiplied alpha" doc comment         | ✅ Necessary                                     | Confirmed exactly as described. Doc-comment-only fix.                                                                                                                                                                                                                                                                                                                                                                                        |
| BUG-05  | `hit_test` `-1` sentinel                         | ✅ Necessary                                     | Confirmed. `wasm-bindgen 0.2.126` (actual lockfile version) supports `Option<u32>` natively.                                                                                                                                                                                                                                                                                                                                                 |
| BUG-06  | Camera default duplicated                        | ⚠️ Real defect, wrong file                       | Duplication confirmed, but in `useEngine.ts`, not `bridge.ts` as claimed. Fixed via `DEFAULT_CAMERA` in `@graphite/protocol` — without changing the `engine:init` IPC contract (report's suggestion), since nothing currently needs the worker's initial camera to be caller-supplied.                                                                                                                                                       |
| ARCH-01 | No Tailwind                                      | ⚠️ Deferred to Phase 6                           | Confirmed absent. Installing a UI framework with zero current consumers (no panels exist yet) is premature per the project's own "never adopt trendy technologies without explicit justification" principle.                                                                                                                                                                                                                                 |
| ARCH-02 | No Zustand stores                                | ⚠️ Deferred to Phase 6                           | Same reasoning — store shape is best designed against real consumers (toolbar, inspector) that don't exist yet.                                                                                                                                                                                                                                                                                                                              |
| ARCH-03 | `engine.worker.ts` 719 lines                     | ✅ Necessary — implemented                       | Confirmed (719, report said 718 — trivial). Split into 14 files under `apps/web/src/workers/engine/`, largest now 159 lines. State coordination via one `EngineState` object passed by reference, per the report's own correct principle.                                                                                                                                                                                                    |
| ARCH-04 | `EngineCanvas.tsx` 285 lines, embedded UI        | ✅ Necessary — implemented                       | Confirmed. Split into `EngineCanvas` + `ToolBar` + `StatsHUD`.                                                                                                                                                                                                                                                                                                                                                                               |
| ARCH-05 | ADRs 002–010 missing                             | ✅ Necessary — implemented                       | Confirmed only ADR-001/011 existed. All 9 written. Report's own ADR-010 topic ("TypeScript document model") duplicates ADR-011 — re-scoped ADR-010 to the `packages/document` crate ownership question instead (the topic ARCH-09 actually asked for).                                                                                                                                                                                       |
| ARCH-06 | `docs/BLUEPRINT.md` missing                      | ✅ Necessary — implemented                       | Confirmed broken link. Created.                                                                                                                                                                                                                                                                                                                                                                                                              |
| ARCH-07 | `docs/contributing/`, `docs/architecture/` empty | ✅ Necessary — implemented                       | Confirmed both empty. `getting-started.md` added; this file fills `docs/architecture/`.                                                                                                                                                                                                                                                                                                                                                      |
| ARCH-08 | No WASM build script                             | ❌ Incorrect                                     | `packages/engine/package.json`'s `build` script and `turbo.json`'s `dev: { dependsOn: ["^build"] }` already exist and already work — confirmed by reading both files. Real, narrower gap: `wasm-pack` wasn't listed as a README prerequisite. Fixed.                                                                                                                                                                                         |
| ARCH-09 | `packages/document` no ownership plan            | ⚠️ Real concern, fabricated evidence             | The quoted crate content (`pub fn add(left,right)`) is fabricated — the actual file has a real `version()` fn and `NodeId` newtype with 5 passing tests, not a `cargo new` template. The underlying concern (no documented future) was valid. Added `packages/document/README.md` + ADR-010.                                                                                                                                                 |
| ARCH-10 | No Playwright                                    | ⚠️ Deferred to Phase 6                           | Confirmed absent. With no toolbar/panels to exercise yet, E2E coverage has marginal value before Phase 6 builds the UI shell.                                                                                                                                                                                                                                                                                                                |
| QUAL-01 | FPS shows 0 for first second                     | ✅ Necessary                                     | Confirmed in `bridge.ts`. _(Not separately implemented this pass — see §3.)_                                                                                                                                                                                                                                                                                                                                                                 |
| QUAL-02 | `setTimeout` jitter                              | ✅ Necessary — implemented                       | Confirmed: HTML spec's 4ms nested-timer clamp applies inside Workers, and `tick()` is a recursive `setTimeout` chain. Replaced with a `MessageChannel`-based scheduler for sub-4ms reschedules, falling back to `setTimeout` for genuinely longer waits.                                                                                                                                                                                     |
| QUAL-03 | `roots` field dead                               | ✅ Necessary — implemented, primary fix rejected | Confirmed write-only. Implementing full recursive z-order traversal (report's primary suggestion) would silently change tested z-order semantics with no current feature need — removed the field instead (report's own fallback option).                                                                                                                                                                                                    |
| QUAL-04 | `node_count()` O(n)                              | ⚠️ Implemented, wrong justification              | Confirmed O(n), but never called in any hot path (`get_render_list` does not use it as a capacity hint — verified by reading the function, which uses bare `Vec::new()`). Fixed anyway as cheap, correct hygiene — now a maintained `u32` field.                                                                                                                                                                                             |
| QUAL-05 | `onerror` message guard                          | ✅ Necessary — implemented                       | Confirmed.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| QUAL-06 | `destroy()` try/catch                            | ❌ Incorrect                                     | `GPUBuffer.destroy()` is specified (MDN/W3C) as safe to call multiple times and non-throwing; WebGPU device-timeline errors are asynchronous (error scopes), not synchronous exceptions. Device loss is already handled correctly via `running = false`, which halts the render loop before `destroy()` would ever be reached on a lost device. Documented this reasoning directly in `buffers.ts` instead of adding a misleading try/catch. |
| QUAL-07 | `addFrame` skips version bump                    | ✅ Necessary — implemented                       | Confirmed; matters for Phase 9 CRDT change detection.                                                                                                                                                                                                                                                                                                                                                                                        |
| QUAL-08 | 0×0 rect on init                                 | ⚠️ Implemented, low impact                       | Confirmed code path exists, but `ResizeObserver`'s guaranteed first callback (plus the existing init-vs-resize race handling from Phase 4) means this self-corrects within one frame in practice. Fixed anyway as a 3-line defensive guard.                                                                                                                                                                                                  |
| QUAL-09 | Vitest missing `.tsx`                            | ❌ Already implemented                           | Confirmed: `apps/web/vitest.config.ts` already includes `*.test.tsx` and `benchmark.include`.                                                                                                                                                                                                                                                                                                                                                |
| QUAL-10 | Global `window` keyboard listener                | ✅ Necessary, better fix used                    | Confirmed gap (input/textarea only, not `contenteditable`). Report's fix (scope to a focused wrapper) risks shortcuts silently breaking on focus loss — rejected as a UX regression for a tool where shortcuts are expected to work globally (Figma/Linear convention). Implemented `isEditableTarget()` instead, which also catches `contenteditable`, keeping the listener at `window` scope.                                              |
| QUAL-11 | bench imports `DocColor`                         | ✅ Necessary — implemented                       | Resolved automatically by BUG-01's type unification; import switched to `Color` from `@graphite/protocol`.                                                                                                                                                                                                                                                                                                                                   |
| QUAL-12 | No semantic colour tests                         | ✅ Necessary — implemented                       | Added explicit opacity/range assertions to `protocol.test.ts`, plus tests for `DEFAULT_CAMERA`.                                                                                                                                                                                                                                                                                                                                              |
| P3      | `scripts/build-wasm.sh`                          | ❌ Unnecessary                                   | Turborepo already orchestrates this; a parallel script would be redundant.                                                                                                                                                                                                                                                                                                                                                                   |
| P3      | `tools/bench/` harness                           | ⚠️ Premature                                     | Per-package Vitest bench is sufficient at current scale (~10 benchmarks across 2 packages).                                                                                                                                                                                                                                                                                                                                                  |
| P3      | `benchmarks.yml` CI                              | ⚠️ Premature                                     | Defer until enough benchmark history exists for trend tracking to be meaningful.                                                                                                                                                                                                                                                                                                                                                             |
| P3      | `ui-core` design tokens                          | ⚠️ Deferred to Phase 6                           | Tied to ARCH-01.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| P3      | Per-package READMEs                              | ⚠️ Partial                                       | Added to `packages/document` (tied to ARCH-09); not added to all 8 packages, to avoid padding unrelated to this review's findings.                                                                                                                                                                                                                                                                                                           |
| P3      | Playwright                                       | ⚠️ Deferred to Phase 6                           | Tied to ARCH-10.                                                                                                                                                                                                                                                                                                                                                                                                                             |

---

## 2. Changes Implemented

### Rust

- **`packages/engine/src/scene/graph.rs`** — `hit_test` now returns
  `Option<u32>` (BUG-05); removed the dead `roots` field, added a
  maintained `count: u32` so `node_count()` is O(1) (QUAL-03, QUAL-04); all
  8 affected tests rewritten for the new return type. Verified: `cargo
check`, `cargo test --lib` (35/35 passing), `cargo clippy --all-features
-D warnings` (clean), `rustfmt --check` (clean).
- **`packages/engine/src/math/color.rs`** — doc comment corrected from
  "pre-multiplied" to "straight" alpha; implementation unchanged (BUG-04).

### TypeScript — protocol & document model

- **`packages/protocol/src/index.ts`** — `Color` is now the canonical 0–255
  type with an explicit scale doc comment; `COLOR_BLACK`/`COLOR_WHITE` fixed
  to `a: 255`; added `DEFAULT_CAMERA` (BUG-01, BUG-06).
- **`packages/protocol/src/__tests__/protocol.test.ts`** — updated expected
  values; added semantic opacity/range tests and `DEFAULT_CAMERA` tests
  (QUAL-12).
- **`apps/web/src/document/model.ts`** — rewritten: imports `Color` from
  protocol instead of a duplicate `DocColor`; `getNode()` /
  `getNodesInOrder()` return `structuredClone` snapshots (BUG-02);
  `fromJson` validates via the new `validate.ts` (BUG-03); `addFrame` now
  bumps `_version` (QUAL-07).
- **`apps/web/src/document/validate.ts`** _(new)_ — structural validator
  for `fromJson`'s untrusted input: node-shape checks, unknown-kind
  rejection, parent/child consistency check.
- **`apps/web/src/__tests__/document.test.ts`** — added: `addFrame` version
  test, `getNode` immutability tests (including nested-field mutation),
  6 `fromJson` validation-failure tests.
- **`apps/web/src/__tests__/document.bench.ts`** — import switched from
  `DocColor` to `Color` (QUAL-11).

### TypeScript — engine worker split (ARCH-03)

`apps/web/src/workers/engine.worker.ts` (719 lines) replaced with a
159-line orchestrator plus 13 new focused modules under
`apps/web/src/workers/engine/`: `state.ts`, `messaging.ts`, `selection.ts`,
`camera.ts`, `gpu/{shader,pipeline,context,buffers,render}.ts`,
`scene/{demo,rebuild}.ts`, `input/{pointer,keyboard}.ts`. State is one
`EngineState` object passed by reference — no module-level globals shared
implicitly. `render.ts` also carries the QUAL-02 `MessageChannel`
scheduling fix; `input/pointer.ts` carries the BUG-05 `hit_test` call-site
update.

### TypeScript — UI split (ARCH-04) and bridge fixes

- **`apps/web/src/components/EngineCanvas.tsx`** — rewritten: toolbar and
  HUD extracted; keyboard guard widened to `isEditableTarget()` (catches
  `contenteditable`, not just input/textarea) while staying `window`-scoped
  (QUAL-10).
- **`apps/web/src/components/ToolBar.tsx`**, **`StatsHUD.tsx`** _(new)_.
- **`apps/web/src/engine/bridge.ts`** — `onerror` includes filename/line
  when `message` is empty (QUAL-05); skips the redundant 0×0 initial resize
  (QUAL-08).
- **`apps/web/src/hooks/useEngine.ts`** — `DEFAULT_VIEWPORT` now reads from
  `DEFAULT_CAMERA` (BUG-06).

### Documentation

- `packages/document/README.md` _(new)_, `docs/adr/ADR-002` through
  `ADR-010` _(new, 9 files)_, `docs/BLUEPRINT.md` _(new)_,
  `docs/contributing/getting-started.md` _(new)_, `README.md` _(rewritten:
  added `wasm-pack` prerequisite, corrected the stale Phase 0 status/table
  — see §4)_.

**Expected impact**: zero behavioural change to anything a user can
currently observe in the running app (every fix is either dead-code
removal, a type-safety improvement, or a defensive guard) — the demo
scene renders identically, pan/zoom/select/drag/save all work the same.
The one user-visible difference, if any, is render-loop timing precision
(QUAL-02), which should make frame pacing _more_ consistent, not different
in any way a user would describe as a behaviour change.

---

## 3. Recommendations Not Implemented

- **ARCH-01 (Tailwind), ARCH-02 (Zustand), ARCH-10 (Playwright)** — all
  three are new dependencies with zero current consumers. Phase 6 is where
  panels/toolbar/inspector get built; installing this infrastructure now,
  ahead of the components that would use it, risks designing it against
  guesses rather than real consumers. Explicitly deferred to the start of
  Phase 6, not abandoned.
- **QUAL-01 (FPS shows 0 for ~1s on cold start)** — genuinely necessary and
  trivial, but was the one item not completed in this pass due to scope;
  flagged here explicitly rather than silently dropped. See §5 for the
  exact fix to apply.
- **Full per-package README sweep, `tools/bench/`, `benchmarks.yml` CI,
  `scripts/build-wasm.sh`** — each individually justified in §1 as
  unnecessary or premature at current scale.

---

## 4. Additional Issues Found (not in the original report)

1. **README phase-status table was stale** — _Medium severity._ Showed
   "Phase 0 — Foundation (active)" and marked Phases 1–5 as
   "🔜 Next"/"⏳", despite all five being complete in the actual codebase.
   The original report's own "Strengths" section (#11) incorrectly praised
   this table as "accurately reflect[ing] current status" — it did not, at
   the time of review. **Fixed** as part of the README rewrite above.

2. **A TypeScript-version-sensitive test artifact, found via real
   compiler verification, turned out to be a false positive from my own
   test harness** — while validating `protocol.test.ts` against the
   project's actual pinned TypeScript 6.0.3, an "unused `@ts-expect-error`
   directive" error appeared. Investigation traced it to a path-duplication
   bug in my own verification setup (a broken import resolution that made
   `IDENTITY_TRANSFORM` resolve as `any`, masking the real check). Confirmed
   not a real codebase issue once the harness was fixed — included here
   for transparency about the verification process, not as a codebase
   defect. No code change resulted.

3. **`Cargo.lock` lockfile format vs. older toolchains** — _Low severity,
   informational._ The committed `Cargo.lock` is format version 4 (written
   by a recent Cargo), which an older Cargo (this review used 1.75.0 via
   `apt`, since `rustup.rs` is outside this environment's allowed network
   domains) cannot read. Not a defect — your actual pinned toolchain
   (1.96.0) handles this natively — but worth knowing if anyone tries to
   build this project with a significantly older Rust install.

---

## 5. Risks and Follow-Up

**Remaining technical debt (tracked, not urgent):**

- `packages/document` Rust crate remains an intentionally-unused
  placeholder (ADR-010) — revisit per that ADR's review criteria.
- QUAL-01 (FPS-shows-0 cold start) is unimplemented — trivial fix:
  initialise `EngineWorkerBridge.currentFps` to `60` as a placeholder
  rather than `0`, or compute an instantaneous estimate from the first
  frame's delta before the 1-second window completes.
- `packages/protocol`'s 90%-coverage threshold (QUAL-12 context) is good
  practice but was never actually _tested_ against the colour-constant bug
  before this review — the new semantic tests close that specific gap, but
  the broader question "does our coverage threshold catch correctness bugs
  or just line coverage" is worth revisiting periodically.

**Potential regressions to watch for:**

- The `MessageChannel` render-loop change (QUAL-02) could not be verified
  empirically in this sandbox (no real GPU/browser available) — please
  confirm FPS/render-time in the HUD still meet the ≥58fps / <4ms targets
  after applying these changes, on real hardware.
- The engine-worker module split (ARCH-03) is a large mechanical refactor
  across 14 files. It compiles cleanly and passes all existing automated
  checks, but GPU-dependent runtime behaviour (the actual rendering output)
  could not be verified in this sandbox — please run the full manual
  verification checklist from the Phase 4/5 exit criteria after applying.

**Suggested next steps:**

- Apply QUAL-01's fix (see above) to close out the one P2 item left open.
- Phase 6 kickoff is the natural point to revisit ARCH-01/02/10 together,
  since panels/toolbar/inspector will be built in the same phase that
  needs Tailwind, Zustand, and (once there's UI to test) Playwright.
