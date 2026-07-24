# ADR-033: Startup Budgets — Closure Gate, Lazy Islands, and the WASM Line

- **Status:** Accepted
- **Date:** 2026-07-25
- **Phase:** 8, precondition commit PC-2 (Phase E entry)
- **Related:** ADR-017 (bundle ceiling), ADR-022 (gate enforcement), ADR-024
  (recalibration to 190 kB), ADR-031 (made code splitting and a WASM budget
  Phase 8 preconditions), ADR-032 (M1 design this clears the path for)

## Context

ADR-031 made two budget moves preconditions of the path pipeline: create
JS headroom before Phase 8's UI lands on it, and give the engine binary
its own budget line before lyon lands in it. Delivering the first exposed
an instrumentation flaw worth its own record: the bundle gate read one
file, and code splitting can satisfy a one-file gate without deferring a
single byte.

## Decision 1 — The gate measures the startup closure, not a file

`check-bundle-size.mjs` now measures the **entry chunk plus every chunk it
reaches through static `import`/`from` edges, transitively**, and enforces
ADR-024's unchanged 190 kB ceiling against that sum. Dynamic imports are
deliberately outside the closure — deferring them is the point. The
distinction is mechanical in the emitted ESM: `from"./x.js"` is an edge,
`import("./x.js")` is not.

This was not theoretical. The first island cut of this very commit moved
the react-aria dialog subtree into chunks the entry still imported
statically: the gated file shrank 41 kB while true startup shrank 12. A
gate that can be satisfied by moving bytes between startup files is
measuring filenames, not cost. The worker entry stays out of scope — it
parses off the main thread and its budget is Decision 4's WASM line.

**Rejected — vendor `manualChunks`:** splits react/router/aria into named
files the entry loads anyway. Same startup, prettier waterfall, and it
would have "reduced" the old gate to double digits. The closure gate
exists so neither this project nor a well-meaning contributor can make
that mistake pass CI.

## Decision 2 — Always-rendered lazy islands, and the SLO rule

Three closed-until-invoked surfaces now mount through `React.lazy` behind
`Suspense fallback={null}`, rendered **unconditionally** — the shortcut
recorder, the export dialog, and the files discard-confirm (extracted
from `FilesProvider` to its own component so the provider keeps only the
boundary):

- **Semantics are byte-for-byte today's:** permanently mounted, nothing
  rendered while closed, open/close state and its persistence unchanged.
  No open-flag logic moved into hosts; the boundary is purely a loading
  seam. The chunk is requested at the shell's first render (rendering a
  lazy component triggers its load), so these dialogs are typically
  resident well before their multi-interaction open paths complete; when
  they are not, Suspense holds the closed appearance until the chunk
  lands, and none of the three carries a latency budget.
- **This is the pattern Phase 8 M4's text UI ships in from day one.** The
  islands were worth doing at PC-2 for the mechanism as much as the
  kilobytes: it must exist, tested, before the first genuinely heavy UI
  arrives.

**The rule this commit learned the hard way: a surface carrying an
open-latency SLO is never an island.** The command palette was the fourth
island in this commit's first cut, on the assumption that a chunk
requested at first render is resident before any plausible first mod+K.
The reference machine (i3-1115G4, 2C/4T) falsified that assumption in
review: the palette e2e gate measured a **347 ms** first open against its
150 ms CI bound (<50 ms reference target, phase6-m4) — on two cores the
deferred chunk's fetch-and-evaluate competes with hydration, engine
worker start-up, and GPU init, and an early press catches it mid-flight.
Any "usually warm" scheme leaves exactly the tail the adversarial e2e
(and a muscle-memory user) hits. The palette is therefore mounted
eagerly, its docblock states why, and the phase6-m4 decision it briefly
overrode ("no lazy import on the <50 ms hot path") is reaffirmed as the
general law.

**Rejected — an idle-prefetch helper:** render-triggered fetch is earlier
than `requestIdleCallback`, needs no new utility, and dedupes for free.
**Rejected — islanding the shell's Tabs:** startup-critical UI; the
accessibility risk of a hand-rolled replacement outweighs the react-aria
mass it pins. **Rejected — rebuilding the palette on a slimmer bespoke
listbox/overlay** to shrink its now-eager subtree: it relitigates
ADR-015's react-aria adoption and the M5 a11y audit for kilobytes the
ceiling does not currently demand; recorded as a lever, with the Tabs
one, if Phase 8 pressure arrives.

## Decision 3 — `sideEffects` declarations on the TypeScript packages

`@graphite/ui-core` declares `"sideEffects": ["**/*.css"]`;
`@graphite/protocol` and `@graphite/document-model` declare `false`.
Without the flag, the bundler must assume a barrel's re-exported modules
execute for effect, and island splits strip almost nothing. With it, the
islands took the entire react-aria dialog/listbox subtree with them. The
CSS pattern keeps `tokens.css` importable; no source file in any of the
three packages has import-time effects, which is now a documented
invariant of writing modules in them.

## Measured result (this commit, container build)

| Startup closure (gz)    | Before        | After                                                                        |
| ----------------------- | ------------- | ---------------------------------------------------------------------------- |
| Chunks on startup path  | 1 (177.61 kB) | 4 (177.71 kB — entry 149.99 + Dialog 21.14 + transition 6.22 + runtime 0.36) |
| Ceiling headroom        | 12.4 kB       | 12.3 kB                                                                      |
| Deferred behind islands | —             | ≈ 9.3 kB across 6 chunks                                                     |

**The closure is flat by design, not by accident.** The palette's SLO
pins its subtree (ModalDialog, SearchableListBox, the react-aria dialog
and listbox internals, the fuzzy scorer) in startup, and splitting the
shared dialog/transition chunks for the three islands costs ~8 kB of
per-file gzip overhead that offsets their deferral. What PC-2 changes is
the _trajectory_: every future closed-until-invoked surface has a pattern
that adds zero closure bytes, the gate measures the closure honestly, and
growth can no longer hide. Two recorded levers exist if the ceiling ever
pressures: merge startup-static shared chunks back into the entry
(reclaims the ~8 kB split overhead), and the palette/Tabs slimming above.
The remaining closure is ~90 % framework; CI's number (real wasm-bindgen
glue in the worker chunk, outside this closure) is the authoritative
record.

## Decision 4 — The WASM budget line, shipped in capture mode

`scripts/check-wasm-size.mjs` measures gzip of
`packages/engine/pkg/graphite_engine_bg.wasm` with the same conventions as
the JS gate, wired into CI directly after the bundle gate. It ships with
`CEILING_KB = null` — **capture mode**: measure, print loudly, pass.

The container this project is developed in cannot build the WASM, and a
ceiling invented without a measurement would violate the ADR-023
discipline every other gate follows. The arming rule, fixed now: the
**first CI run after this commit prints the pre-lyon size**; the
**geometry-crate commit prints the post-lyon size and arms the ceiling**
from that measured pair (post-lyon plus a stated allowance, derivation
written into the script header in that commit). A persistent breach after
arming is handled the ADR-024 way — recalibrate by ADR with measured
justification, never by silently editing the number.

## Consequences

- The 190 kB ceiling now means what it always claimed to mean: main-thread
  startup JavaScript, wherever it lives.
- Every future closed-until-invoked surface has a named pattern, three
  in-tree examples, and one recorded counter-example with its measured
  reason; M4's text UI lands as an island, and anything with a latency
  SLO does not.
- Two budget lines exist where one did: JS closure (armed) and WASM
  (capture → armed at the geometry crate).
- The gate's closure walk depends on rolldown's emitted import syntax; if
  the bundler's output format changes, the gate fails loudly on a missing
  edge rather than silently narrowing (a referenced chunk that cannot be
  read is a hard failure).
