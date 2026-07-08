import type { ReactNode } from "react";

interface EmptyStateProps {
  /** One short sentence naming what is empty, e.g. "No document colors". */
  title: string;
  /** Optional second line telling the user how content gets here. */
  description?: string;
  /** Optional leading visual (typically a 16–20px lucide icon). */
  icon?: ReactNode;
}

/**
 * Standard empty state for panels, lists, and search results.
 *
 * Design-system rule (Blueprint §Design system): a surface with genuinely
 * no content shows *this*, never a bare region or placeholder text scatter
 * — one consistent voice for "nothing here yet, and here's how something
 * gets here". Purely presentational; the container decides when it is
 * empty.
 */
export function EmptyState({ title, description, icon }: EmptyStateProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-1.5 px-4 py-8 text-center font-mono"
    >
      {icon !== undefined && (
        <span aria-hidden className="text-content-tertiary">
          {icon}
        </span>
      )}
      <span className="text-[11px] text-content-secondary">{title}</span>
      {description !== undefined && (
        <span className="max-w-52 text-[10px] leading-relaxed text-content-tertiary">
          {description}
        </span>
      )}
    </div>
  );
}
