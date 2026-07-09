import { Outlet, createRootRoute } from "@tanstack/react-router";
import { useApplyTheme } from "../features/theme/useApplyTheme";

/**
 * Root route (M5, ADR-016) — the shell every route renders inside.
 *
 * Owns exactly two cross-route concerns: applying the theme (so a light
 * preference holds on /settings, not just the editor) and rendering the
 * active route via <Outlet/>. It deliberately does NOT mount EngineProvider
 * or ShortcutProvider — those are editor-scoped (routes/index.tsx), so
 * visiting /settings never boots a GPU worker or installs global key
 * handling for a page that wants neither.
 */
function RootLayout() {
  useApplyTheme();
  return <Outlet />;
}

export const rootRoute = createRootRoute({
  component: RootLayout,
});
