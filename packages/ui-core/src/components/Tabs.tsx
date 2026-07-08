import type { ReactNode } from "react";
import {
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  Tabs as AriaTabs,
} from "react-aria-components";

/**
 * Styled tabs on react-aria-components' WAI-ARIA implementation (roles,
 * `aria-selected`, Arrow/Home/End roving focus, automatic panel
 * association). Controlled-only: panel hosts like the editor persist the
 * active tab in their own store, so an uncontrolled mode would just be a
 * second code path nothing uses. Keys are plain strings — RAC's wider
 * `Key` never leaves this module.
 */

interface TabsProps {
  selectedKey: string;
  onSelectionChange: (key: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({ selectedKey, onSelectionChange, children, className = "" }: TabsProps) {
  return (
    <AriaTabs
      selectedKey={selectedKey}
      onSelectionChange={(key) => {
        onSelectionChange(String(key));
      }}
      className={className}
    >
      {children}
    </AriaTabs>
  );
}

/** Horizontal tab strip. `label` names the tablist for assistive tech. */
export function TabList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <AriaTabList aria-label={label} className="flex items-center gap-0.5">
      {children}
    </AriaTabList>
  );
}

/** One tab. `id` pairs it with the `TabPanel` of the same id. */
export function Tab({ id, children }: { id: string; children: ReactNode }) {
  return (
    <AriaTab
      id={id}
      className={({ isSelected }) =>
        `cursor-pointer rounded px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide outline-none focus-visible:ring-1 focus-visible:ring-border-focus ${
          isSelected
            ? "bg-surface-panel-hover text-content-primary"
            : "text-content-tertiary hover:text-content-secondary"
        }`
      }
    >
      {children}
    </AriaTab>
  );
}

/** Content for the tab of the same `id`. Only the selected panel renders. */
export function TabPanel({
  id,
  children,
  className = "",
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AriaTabPanel id={id} className={`outline-none ${className}`}>
      {children}
    </AriaTabPanel>
  );
}
