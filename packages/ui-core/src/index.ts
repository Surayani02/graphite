/**
 * @graphite/ui-core
 *
 * Graphite's standalone design system: tokens (see `tokens.css`, imported
 * separately by consuming apps) and accessible React primitives. Every
 * primitive here is presentational + interaction-only — no engine, scene,
 * document, or Zustand imports. See ADR-013 §4 (migration in) and ADR-014
 * (Floating UI as the sole floating-layer dependency).
 */

export const UI_CORE_VERSION = "0.2.0" as const;

export { colorToHex, hexToColor } from "./color";
export { NumberField } from "./components/NumberField";
export { ColorField } from "./components/ColorField";
export { Tooltip } from "./components/Tooltip";
export { ContextMenu, useContextMenuState } from "./components/ContextMenu";
export type { MenuItem, MenuPosition } from "./components/ContextMenu";
