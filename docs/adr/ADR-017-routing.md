# ADR-017: Client routing with TanStack Router

**Status**: Accepted — 2026-07-08 · **Context**: Phase 6, Milestone 5

## Context

Through M4 the app was a single view: `main.tsx` → `App` → `AppShell`. M5
adds a Settings page (keymap editor + appearance), the first destination
that is not the editor, and the Blueprint commits to a fixed future route
tree (`/plugins` P10, `/account` P8, `/docs/*`). A router is needed now, and
it must satisfy two constraints specific to this app: the engine worker and
global shortcut handling are editor concerns and must not boot for a page
that wants neither, and the initial editor bundle must not carry settings
code.

## Decision

**TanStack Router 1.170, code-based route tree.** Pre-gated in the Blueprint
for typed params and the future tree. Code-based (`createRootRoute` /
`createRoute`) rather than the file-based Vite plugin: at three routes the
generator's convention cost buys nothing and an explicit tree in `router.ts`
is greppable. Revisit the file-based approach at P10 when plugins contribute
routes.

**Editor-scoped providers.** `routes/__root.tsx` owns only cross-route
concerns — the theme effect (ADR-018) and `<Outlet/>`. `EngineProvider`,
`ShortcutProvider`, the command bootstrap, and the modals stay inside
`AppShell`, which is the `"/"` route's component (`routes/index.tsx`). So
visiting `/settings` boots no GPU worker and installs no global key handler.
`routes/settings.tsx` is `lazyRouteComponent(() => import(...))`, splitting
settings into its own chunk (measured 1.45 kB gzip) — the editor is the hot
path, settings is occasional, so that is exactly where a lazy boundary
belongs.

**Unknown paths redirect to the editor** via a catch-all splat route
(`path: "$"`) whose `beforeLoad` throws `redirect({ to: "/" })`. A thrown
redirect _during loading_ is the supported mechanism — the router catches it
and navigates; throwing a redirect from a not-found _component_ instead
surfaces the `Response` as an uncaught error (found empirically, locked by
`router.test.tsx`). This is a single-window design tool, not a content site,
so a bad path lands you back in the editor rather than on a 404.

**Bundle ceiling raised to 175 kB gzip (main chunk).** The M5 design set a
160 kB gzip exit criterion estimated as "M4's 142.93 + Router". The measured
Router cost is larger: main chunk went 142.93 → **171.99 kB gzip**, a
**~29 kB** framework delta (verified intrinsic, not trimmable import waste).
The original 160 was a forecast that under-estimated the delta; the ceiling
is corrected to **175 kB gzip** to match the real cost of a dependency the
Blueprint mandated for the whole future route tree. The alternatives —
lazy-loading the palette/recorder modal layer (recovers ~12 kB but puts a
dynamic import on the palette's <50 ms hot path, which the Blueprint names
as the thing not to do) or reversing the Router adoption mid-milestone —
were both judged worse trades than correcting an estimate. Palette and
recorder therefore stay **eager**. Watch item unchanged: if the main chunk
approaches 175 kB in a later milestone, the modal-layer split is the
sanctioned next move, hot-path cost accepted at that point.

## Consequences

**Positive.** Typed navigation and the reserved future tree exist; settings
costs its own chunk, not the editor's; the engine worker is scoped to the
route that uses it. `App.tsx` is retired — the shell it rendered is the
`"/"` route.

**Costs.** ~29 kB gzip in the main chunk (accepted, ceiling corrected).
Router is now a load-bearing dependency; the `declare module` register block
ties route types to the app.

## Alternatives considered

React Router / wouter — rejected: TanStack was pre-gated for typed params
and `/docs/*`; wouter cannot type splat params. File-based routing plugin —
rejected at three routes (convention + generator cost, no benefit yet).
Conditional render off a store flag instead of a router — rejected: abandons
typed routing and the future tree the Blueprint committed to. Holding 160 kB
by lazy-loading the modal layer — rejected here (hot-path cost outweighs
~12 kB), retained as the documented fallback if the new ceiling is later
approached.
