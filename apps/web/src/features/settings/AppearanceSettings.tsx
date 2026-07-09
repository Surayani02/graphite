import { RadioGroup, type RadioOption } from "@graphite/ui-core";
import { useUIStore } from "../../stores/uiStore";
import { type ThemePreference } from "../theme/theme";

const THEME_OPTIONS: readonly RadioOption[] = [
  { value: "dark", label: "Dark", description: "The default Graphite theme." },
  { value: "light", label: "Light", description: "A high-brightness theme." },
  {
    value: "system",
    label: "System",
    description: "Follow your operating system's appearance.",
  },
];

/**
 * Appearance settings (M5): the theme preference, applied instantly.
 * Instant-apply (no Save button) is the correct settings UX and the reason
 * this milestone needs no form library — the radio's onChange writes UI
 * intent straight to the store, and features/theme reacts (ADR-016).
 */
export function AppearanceSettings() {
  const themePreference = useUIStore((s) => s.themePreference);
  const setThemePreference = useUIStore((s) => s.setThemePreference);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-[13px] font-semibold text-content-primary">Appearance</h2>
      <RadioGroup
        label="Theme"
        value={themePreference}
        onChange={(value) => {
          setThemePreference(value as ThemePreference);
        }}
        options={THEME_OPTIONS}
      />
    </section>
  );
}
