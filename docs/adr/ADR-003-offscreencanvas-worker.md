# ADR-003: OffscreenCanvas + Web Worker for the Render Loop

**Date**: Phase 1
**Status**: Accepted
**Deciders**: Engineering Team

## Context

The system prompt's technical philosophy is explicit: "React is responsible
only for UI. It never owns document state, renderer state, scene graph,
GPU state, networking, or collaboration logic." React's reconciler and the
JS garbage collector both run on the main thread; either one pausing for a
few milliseconds at the wrong moment drops a frame. A 60 FPS editor cannot
tolerate that.

## Decision

The `<canvas>` element's control is transferred to a dedicated Web Worker
via `canvas.transferControlToOffscreen()`. The worker owns the WebGPU
device, the render loop, and (from Phase 5) the document model. The main
thread never touches GPU state and never drives a frame.

## Rationale

- **Isolation is structural, not disciplinary.** A worker-owned render loop
  cannot be blocked by a slow React re-render, because they execute on
  different threads — there is no rule to remember or regression to guard
  against, the architecture makes it impossible by construction.
- **Typed IPC boundary.** All communication crosses through
  `@graphite/protocol`'s `MainToEngineMessage` / `EngineToMainMessage`
  discriminated unions (ADR-009), so the worker and the UI can evolve
  independently behind a stable, reviewable contract.
- **Known trade-off, accepted explicitly**: `transferControlToOffscreen()`
  is a one-way operation — once transferred, `canvas.width`/`canvas.height`
  can never be written from the main thread again, which is incompatible
  with React StrictMode's double-invocation of effects in development.
  StrictMode is intentionally disabled in `main.tsx` for this reason (see
  the comment there, and https://github.com/facebook/react/issues/24502).

## Alternatives Considered

| Alternative                                                                                        | Reason rejected                                                                                                                                                                 |
|----------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Render on the main thread, in a `requestAnimationFrame` loop                                       | Directly violates the "GPU state must never live on the main thread" principle; one slow React commit drops a frame                                                             |
| `OffscreenCanvas` without a Worker (main-thread rendering to an offscreen canvas, composited back) | Doesn't move work off the main thread at all — the bottleneck this ADR exists to solve is untouched                                                                             |
| `SharedArrayBuffer` + Atomics for a tighter main↔worker coupling                                   | Requires cross-origin isolation headers (`COOP`/`COEP`) that complicate deployment for no benefit at current scale; revisit only if message-passing overhead becomes measurable |

## Consequences

### Positive

- Render loop timing is structurally isolated from React.
- Clean seam for Phase 9: the worker is already the natural place for CRDT
  sync logic to live, since it already owns document mutation.

### Negative

- StrictMode is off, which removes one category of React bug-detection
  (double-invoke effect bugs) for the rest of the app, not just the canvas.
- Debugging requires reasoning about two execution contexts and an async
  message boundary, which is a steeper learning curve for new contributors
  than a single-threaded render loop.

## Review Criteria

Revisit the `SharedArrayBuffer` alternative if per-frame `postMessage`
overhead is ever shown (via the benchmark harness) to be a measurable
fraction of the 16.67ms frame budget.
