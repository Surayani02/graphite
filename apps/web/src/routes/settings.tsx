import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "./__root";

/**
 * Settings route "/settings" (M5), code-split. The component and everything
 * it pulls in — the keymap editor, appearance controls, ui-core's RadioGroup
 * — load only when the route is visited, keeping the editor's initial bundle
 * free of settings code (see docs/benchmarks/phase6-m5.md). The editor is
 * the hot path; settings is occasional, so this is exactly where a lazy
 * boundary belongs.
 */
export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: lazyRouteComponent(() => import("../features/settings/SettingsPage")),
});
