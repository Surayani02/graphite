import { createRoute } from "@tanstack/react-router";
import { AppShell } from "../layouts/AppShell";
import { rootRoute } from "./__root";

/**
 * Editor route "/" (M5). AppShell is unchanged from M4 — it still owns
 * EngineProvider, ShortcutProvider, the command bootstrap, and the modals.
 * Wrapping it in a route rather than rendering it from App.tsx is the whole
 * change: the engine worker and global shortcuts now boot only when this
 * route is active, which is what lets /settings stay GPU-free.
 */
export const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: AppShell,
});
