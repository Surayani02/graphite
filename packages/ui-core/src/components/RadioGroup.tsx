import { type ReactNode } from "react";
import { Label, Radio as AriaRadio, RadioGroup as AriaRadioGroup } from "react-aria-components";

export interface RadioOption {
  /** Stable value — the string reported by onChange. */
  readonly value: string;
  readonly label: string;
  /** Optional helper line under the label. */
  readonly description?: string;
}

interface RadioGroupProps {
  /** Group label for assistive tech (rendered visibly above the options). */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly RadioOption[];
}

/**
 * Styled radio group on react-aria-components' WAI-ARIA implementation
 * (`radiogroup`/`radio` roles, arrow-key roving selection, label
 * association, single tab stop). Controlled-only, like Tabs — hosts persist
 * the choice in their own store. Used by appearance settings for the
 * theme choice (M5); the design-system primitive for any future
 * single-choice setting.
 */
export function RadioGroup({ label, value, onChange, options }: RadioGroupProps) {
  return (
    <AriaRadioGroup value={value} onChange={onChange} className="flex flex-col gap-2 font-mono">
      <Label className="text-[11px] uppercase tracking-wide text-content-tertiary">{label}</Label>
      {options.map((option) => (
        <AriaRadio
          key={option.value}
          value={option.value}
          className={({ isSelected, isFocusVisible }) =>
            `flex cursor-pointer items-start gap-2 rounded border px-2.5 py-2 text-[12px] outline-none ${
              isSelected
                ? "border-accent bg-surface-panel-hover"
                : "border-border-subtle hover:border-border-strong"
            } ${isFocusVisible ? "ring-1 ring-border-focus" : ""}`
          }
        >
          <RadioDot />
          <span className="flex flex-col gap-0.5">
            <span className="text-content-primary">{option.label}</span>
            {option.description !== undefined && (
              <span className="text-[10px] leading-relaxed text-content-tertiary">
                {option.description}
              </span>
            )}
          </span>
        </AriaRadio>
      ))}
    </AriaRadioGroup>
  );
}

/** The selection indicator — a ring that fills when its radio is selected.
 *  Split out only to keep the option's className logic readable. */
function RadioDot(): ReactNode {
  return (
    <span className="mt-0.5 flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-content-tertiary">
      <span className="h-1.5 w-1.5 rounded-full bg-accent opacity-0 in-data-[selected]:opacity-100" />
    </span>
  );
}
