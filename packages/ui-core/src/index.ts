/**
 * @graphite/ui-core
 *
 * Graphite's standalone design system: tokens (see `tokens.css`, imported
 * separately by consuming apps) and accessible React primitives. Every
 * primitive here is presentational + interaction-only — no engine, scene,
 * document, or Zustand imports. See ADR-013 §4 (migration in), ADR-014
 * (Floating UI as the sole floating-layer dependency through M3), and
 * ADR-015 (react-aria-components adopted at M4 for modal/tabs/listbox
 * semantics).
 */

export const UI_CORE_VERSION = "0.3.0" as const;

export { colorToHex, hexToColor } from "./color";
export { NumberField } from "./components/NumberField";
export { ColorField } from "./components/ColorField";
export { Tooltip } from "./components/Tooltip";
export { ContextMenu, useContextMenuState } from "./components/ContextMenu";
export type { MenuItem, MenuPosition } from "./components/ContextMenu";
export { ModalDialog } from "./components/Dialog";
export { Tabs, TabList, Tab, TabPanel } from "./components/Tabs";
export { EmptyState } from "./components/EmptyState";
export { Kbd } from "./components/Kbd";
export { SearchableListBox } from "./components/SearchableListBox";
export type { SearchableListSection } from "./components/SearchableListBox";
export { RadioGroup } from "./components/RadioGroup";
export type { RadioOption } from "./components/RadioGroup";
