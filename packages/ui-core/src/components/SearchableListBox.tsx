import { type ReactNode } from "react";
import {
  Autocomplete,
  Header,
  Input,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  SearchField,
} from "react-aria-components";

export interface SearchableListSection<T> {
  /** Stable section id — also the React key. */
  readonly id: string;
  /** Visible group heading, e.g. "Commands". */
  readonly title: string;
  readonly items: readonly T[];
}

interface SearchableListBoxProps<T> {
  /** Accessible name for the search input and its results list. */
  label: string;
  placeholder: string;
  /** Controlled query. Filtering/ranking happens in the consumer, not here. */
  query: string;
  onQueryChange: (query: string) => void;
  sections: readonly SearchableListSection<T>[];
  /** Stable unique key per item — also the value handed to `onAction`. */
  itemKey: (item: T) => string;
  /** Plain-text value for type-ahead and screen-reader announcements. */
  itemText: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** Invoked with the item's key on Enter or pointer activation. */
  onAction: (key: string) => void;
  /** Shown when every section is empty. */
  emptyState: ReactNode;
}

/**
 * Search-input-over-listbox — the interaction core of a command palette,
 * and ui-core's React Aria combobox adoption point (ADR-015). RAC's
 * `Autocomplete` wires the WAI-ARIA plumbing hand-rolls reliably get
 * wrong: virtual focus via `aria-activedescendant` (DOM focus never
 * leaves the input), ArrowUp/Down + Home/End navigation, autofocusing
 * the first result as the query changes, Enter-to-act, and announcements.
 *
 * Filtering is deliberately external: consumers rank, cap, and group with
 * their own scorer, so RAC's built-in substring filter is disabled with a
 * constant-true predicate and this component renders exactly the sections
 * it is given.
 */
export function SearchableListBox<T>({
  label,
  placeholder,
  query,
  onQueryChange,
  sections,
  itemKey,
  itemText,
  renderItem,
  onAction,
  emptyState,
}: SearchableListBoxProps<T>) {
  const visibleSections = sections.filter((section) => section.items.length > 0);

  return (
    <Autocomplete filter={() => true}>
      <SearchField
        value={query}
        onChange={onQueryChange}
        aria-label={label}
        className="flex border-b border-border-subtle px-3 py-2.5"
      >
        <Input
          autoFocus
          placeholder={placeholder}
          className="w-full bg-transparent font-mono text-[12px] text-content-primary outline-none placeholder:text-content-tertiary"
        />
      </SearchField>
      <ListBox
        aria-label={`${label} results`}
        selectionMode="none"
        onAction={(key) => {
          onAction(String(key));
        }}
        renderEmptyState={() => emptyState}
        className="max-h-80 overflow-y-auto p-1"
      >
        {visibleSections.map((section) => (
          <ListBoxSection key={section.id} id={section.id}>
            <Header className="px-2 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-wide text-content-tertiary">
              {section.title}
            </Header>
            {section.items.map((item) => (
              <ListBoxItem
                key={itemKey(item)}
                id={itemKey(item)}
                textValue={itemText(item)}
                className={({ isFocused }) =>
                  `flex h-7 cursor-pointer items-center gap-2 rounded px-2 font-mono text-[12px] ${
                    isFocused
                      ? "bg-surface-panel-hover text-content-primary"
                      : "text-content-secondary"
                  }`
                }
              >
                {renderItem(item)}
              </ListBoxItem>
            ))}
          </ListBoxSection>
        ))}
      </ListBox>
    </Autocomplete>
  );
}
