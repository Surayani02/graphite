import { createRoute, createRouter, redirect } from "@tanstack/react-router";
import { rootRoute } from "./routes/__root";
import { editorRoute } from "./routes/index";
import { settingsRoute } from "./routes/settings";

/**
 * Route tree + router (M5, ADR-016). Code-based, not the file-based plugin:
 * at three routes the generator's convention cost buys nothing, and an
 * explicit tree is greppable. Fixed future shape (reserved, not built):
 * `/plugins` (P10), `/account` (P8), `/docs/*`.
 *
 * Unknown paths redirect to the editor rather than showing a 404 — this is
 * a single-window design tool, not a content site. The redirect is a
 * catch-all splat route whose `beforeLoad` throws `redirect` (the supported
 * mechanism — a thrown redirect during loading is caught by the router and
 * turned into navigation, whereas throwing it from a not-found *component*
 * surfaces as an uncaught Response).
 */
const catchAllRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});

const routeTree = rootRoute.addChildren([editorRoute, settingsRoute, catchAllRoute]);

export const router = createRouter({
  routeTree,
  // Deployment base path. Vite injects `import.meta.env.BASE_URL` from the
  // build's `base` config: "/" for local dev and root hosting, "/graphite/"
  // for the GitHub Pages project page. TanStack strips the trailing slash
  // itself. Without this the router would treat "/graphite/settings" as an
  // unknown path and bounce it through the catch-all on every load under
  // Pages. Keeping it env-driven means dev and prod share one router.
  basepath: import.meta.env.BASE_URL,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
