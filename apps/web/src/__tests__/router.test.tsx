// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router";

// Mirrors router.ts's structure (code-based tree, lazy settings, notFound →
// "/") without booting the real editor route, which would spin up the engine
// worker. Verifies the routing *contract*, not AppShell.
function buildRouter(initial: string) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>editor-route</div>,
  });
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: lazyRouteComponent(() =>
      Promise.resolve({ default: () => <div>settings-route</div> })
    ),
  });
  const catchAllRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "$",
    beforeLoad: () => {
      throw redirect({ to: "/" });
    },
  });
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute, settingsRoute, catchAllRoute]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
}

describe("router", () => {
  it("renders the editor route at /", async () => {
    render(<RouterProvider router={buildRouter("/")} />);
    expect(await screen.findByText("editor-route")).toBeInTheDocument();
  });

  it("lazy-loads the settings route at /settings", async () => {
    render(<RouterProvider router={buildRouter("/settings")} />);
    await waitFor(() => expect(screen.getByText("settings-route")).toBeInTheDocument());
  });

  it("redirects an unknown path back to the editor", async () => {
    render(<RouterProvider router={buildRouter("/does-not-exist")} />);
    await waitFor(() => expect(screen.getByText("editor-route")).toBeInTheDocument());
  });
});
