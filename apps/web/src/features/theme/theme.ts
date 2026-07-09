/**
 * Theme model — Phase 6 M5 (ADR-017).
 *
 * Theming is pure CSS-variable swapping: every Tailwind v4 utility in the
 * app compiles to `var(--color-*)`, so switching themes means changing
 * which value block those variables resolve to — no component ever branches
 * on theme. This module owns the *preference → resolved theme* logic and
 * the single DOM write; the value blocks themselves live in ui-core's
 * tokens.css under `[data-theme="light"]` and the dark `@theme` default.
 */

/** What the user chose. `system` defers to the OS. */
export type ThemePreference = "dark" | "light" | "system";

/** What actually renders — `system` resolved against the OS at read time. */
export type ResolvedTheme = "dark" | "light";

/** Resolve a preference to a concrete theme. `system` follows the OS
 *  (via the caller's `prefers-color-scheme: light` match). */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersLight: boolean
): ResolvedTheme {
  if (preference === "system") return systemPrefersLight ? "light" : "dark";
  return preference;
}

/**
 * Apply a resolved theme to the document. Dark is the default token block
 * (bare `:root`/`@theme`), so it carries no attribute — the attribute is
 * only ever set for a non-default theme. This keeps the DOM clean and makes
 * "no attribute" unambiguously mean "dark", matching the CSS.
 *
 * `forced-colors` (Windows High Contrast) is deliberately NOT handled here:
 * it is a system state, not a user preference, and tokens.css maps it with
 * a media query that overrides both value blocks regardless of this
 * attribute. See ADR-017.
 */
export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  if (theme === "light") {
    root.dataset.theme = "light";
  } else {
    delete root.dataset.theme;
  }
}

/** The media query used everywhere `system` resolution is needed. Centralised
 *  so the string exists in exactly one place. */
export const PREFERS_LIGHT_QUERY = "(prefers-color-scheme: light)";
