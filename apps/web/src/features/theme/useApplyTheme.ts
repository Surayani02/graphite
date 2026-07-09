import { useEffect } from "react";
import { useUIStore } from "../../stores/uiStore";
import { applyTheme, PREFERS_LIGHT_QUERY, resolveTheme } from "./theme";

/**
 * Mounts the theme: resolves the persisted preference against the OS and
 * writes it to the document, re-applying whenever the preference changes
 * or — while on `system` — when the OS scheme flips live. Mounted once at
 * the router root so it governs every route (settings included), not just
 * the editor.
 *
 * Guarded for non-DOM/older environments: `matchMedia` is absent in the
 * jsdom-less node test runs, so its use is feature-detected rather than
 * assumed.
 */
export function useApplyTheme(): void {
  const preference = useUIStore((s) => s.themePreference);

  useEffect(() => {
    const supportsMatchMedia = typeof window !== "undefined" && "matchMedia" in window;
    const mql = supportsMatchMedia ? window.matchMedia(PREFERS_LIGHT_QUERY) : null;

    const apply = (): void => {
      applyTheme(resolveTheme(preference, mql?.matches ?? false));
    };
    apply();

    // Only the `system` preference cares about OS changes; a fixed
    // light/dark choice ignores them.
    if (preference !== "system" || mql === null) return;
    mql.addEventListener("change", apply);
    return () => {
      mql.removeEventListener("change", apply);
    };
  }, [preference]);
}
