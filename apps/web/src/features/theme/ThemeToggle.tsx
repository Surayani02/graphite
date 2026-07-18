import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Tooltip } from "@graphite/ui-core";
import { useUIStore } from "../../stores/uiStore";
import { PREFERS_LIGHT_QUERY, resolveTheme, type ThemePreference } from "./theme";

/**
 * Toolbar theme control (Phase 7 bug-fix round). Cycles the *preference*
 * dark → light → system → dark; the icon shows the preference, not the
 * resolved theme, so "system" is honestly distinct from a fixed choice
 * that happens to match the OS. The actual DOM theme write stays in
 * `useApplyTheme` at the router root — this button only moves the store
 * value, keeping the single-writer invariant (ADR-018) intact.
 *
 * The "system" branch subscribes to the OS scheme purely to caption the
 * tooltip ("System — currently dark"); feature-detected for the non-DOM
 * test runs where `matchMedia` is absent.
 */
const ORDER: readonly ThemePreference[] = ["dark", "light", "system"];

const ICON = { dark: Moon, light: Sun, system: Monitor } as const;
const LABEL = { dark: "Dark", light: "Light", system: "System" } as const;

export function ThemeToggle() {
  const preference = useUIStore((s) => s.themePreference);
  const setThemePreference = useUIStore((s) => s.setThemePreference);

  const [systemPrefersLight, setSystemPrefersLight] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return;
    const mql = window.matchMedia(PREFERS_LIGHT_QUERY);
    setSystemPrefersLight(mql.matches);
    const onChange = (e: MediaQueryListEvent): void => {
      setSystemPrefersLight(e.matches);
    };
    mql.addEventListener("change", onChange);
    return () => {
      mql.removeEventListener("change", onChange);
    };
  }, []);

  const Icon = ICON[preference];
  const next = ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length] ?? "dark";
  const resolvedLabel =
    preference === "system"
      ? `System — currently ${resolveTheme("system", systemPrefersLight)}`
      : LABEL[preference];

  return (
    <Tooltip label={`Theme: ${resolvedLabel}`} shortcut={`Switch to ${LABEL[next]}`}>
      <button
        type="button"
        aria-label={`Theme: ${resolvedLabel}. Activate to switch to ${LABEL[next]}.`}
        onClick={() => {
          setThemePreference(next);
        }}
        className="flex h-7 w-7 items-center justify-center rounded text-content-tertiary hover:bg-surface-panel-hover hover:text-content-secondary focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-border-focus"
      >
        <Icon size={15} aria-hidden />
      </button>
    </Tooltip>
  );
}
