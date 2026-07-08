import type { ReactNode } from "react";

interface KbdProps {
  /** Pre-formatted, platform-appropriate shortcut label, e.g. "⌘K" or "Ctrl+K". */
  children: ReactNode;
  className?: string;
}

/**
 * Semantic `<kbd>` chip for keyboard shortcuts.
 *
 * Deliberately dumb: it renders exactly the string it is given. Chord
 * storage, platform detection, and formatting live in the consuming app
 * (apps/web `features/shortcuts`) — ui-core is standalone and must not
 * know what a "chord" is, only how a shortcut should *look*. Tooltip and
 * ContextMenu keep their own inline `shortcut` styling for now; Kbd is the
 * primitive for new surfaces (palette rows, dialogs, toolbars).
 */
export function Kbd({ children, className = "" }: KbdProps) {
  return (
    <kbd
      className={`inline-flex h-4 min-w-4 items-center justify-center rounded border border-border-subtle bg-surface-panel-hover px-1 font-mono text-[10px] leading-none text-content-tertiary ${className}`}
    >
      {children}
    </kbd>
  );
}
