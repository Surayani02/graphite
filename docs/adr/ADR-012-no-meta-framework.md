# ADR-012: No Meta-Framework for the Editor Application

**Date**: 2026-07-05
**Status**: Accepted
**Deciders**: Surajit (Project Lead)

## Context

The project charter lists both `Build tool: Vite` and `Meta-framework: Next.js`
as frontend defaults, alongside `Routing: TanStack Router`. These three cannot
coexist for one application: Next.js is itself a build system (own bundler,
dev server, and routing convention), so adopting it would replace Vite _and_
supersede TanStack Router with the App Router. The charter's own rule —
"unless a superior, justified alternative exists" — requires resolving the
contradiction explicitly rather than complying with one line of it silently.

## Decision

The editor application (`apps/web`) stays on Vite, with no meta-framework.
TanStack Router remains the routing choice, adopted when the second route
ships (Phase 6 M5, Settings). If a content-heavy surface (marketing site,
hosted documentation) joins the project later, it becomes a separate app in
the monorepo where a meta-framework can be justified on its own merits —
never the editor.

## Rationale

- The editor is a fully client-rendered GPU application: an `OffscreenCanvas`
  transferred into a module Worker driving a WASM scene graph. Server-side
  rendering has no content to render — first meaningful paint is a WebGPU
  device initialising client-side regardless.
- React Server Components cannot reach across the worker boundary; there is
  no server half of this architecture until Phase 8, and that half is Rust.
- Six phases of verified build configuration — workspace-source `resolve`
  mapping, `new Worker(new URL(...), { type: "module" })` bundling, and the
  `wasm-pack → pkg/ → import` pipeline — are Vite-specific. Migration cost is
  total; functional benefit is nil.
- Precedent: none of Figma, VS Code, Blender's web tooling, or Chromium
  DevTools run their editor surface on a server-rendering meta-framework.

## Consequences

**Positive**: build pipeline stability across the WASM/worker boundary; the
routing decision stays where the charter wanted it (TanStack Router); no
SSR/CSR hybrid complexity in a codebase that gets zero value from it.

**Negative**: no SSR/SEO for the editor URL (irrelevant — it is an
authenticated tool surface, not content); contributors arriving with Next.js
habits need this ADR as the pointer.

## Review Criteria

Revisit only if a content-serving surface is added to the monorepo, and then
only for that surface.
